#!/usr/bin/env node
/**
 * Watchtrail PC bridge: tells Watchtrail where VLC is in a file, so the phone
 * (or another PC) can resume from the same place, and finished episodes get
 * logged on their own.
 *
 * One-time VLC setup (Windows/macOS/Linux):
 *   Tools > Preferences > (bottom left) Show settings: All
 *   Interface > Main interfaces > tick "Web"
 *   Interface > Main interfaces > Lua > HTTP password: pick one
 *   Restart VLC.
 *
 * Run (Node 18+):
 *   WATCHTRAIL_URL=https://watch-trail.vercel.app WATCHTRAIL_TOKEN=wt_... VLC_PASSWORD=yourpass node scripts/vlc-bridge.mjs
 *
 * Optional: VLC_PORT (default 8080), POLL_SECONDS (default 5), SAVE_EVERY (default 15).
 */

const base = (process.env.WATCHTRAIL_URL || "").replace(/\/+$/, "");
const token = process.env.WATCHTRAIL_TOKEN || "";
const vlcPort = process.env.VLC_PORT || "8080";
const vlcPassword = process.env.VLC_PASSWORD || "";
const pollMs = Math.max(2, Number(process.env.POLL_SECONDS) || 5) * 1000;
const saveEvery = Math.max(5, Number(process.env.SAVE_EVERY) || 15);

if (!base || !token || !vlcPassword) {
  console.error("Set WATCHTRAIL_URL, WATCHTRAIL_TOKEN and VLC_PASSWORD (see the comment at the top of this file).");
  process.exit(1);
}

const vlcHeaders = { authorization: "Basic " + Buffer.from(":" + vlcPassword).toString("base64") };
const vlc = (path) => fetch(`http://127.0.0.1:${vlcPort}/requests/${path}`, { headers: vlcHeaders, signal: AbortSignal.timeout(3000) });

async function currentUri(status) {
  const res = await vlc("playlist.json");
  if (!res.ok) return null;
  const tree = await res.json();
  let found = null;
  (function walk(node) {
    if (found || !node) return;
    if (node.id !== undefined && String(node.id) === String(status.currentplid) && node.uri) found = node.uri;
    (node.children || []).forEach(walk);
  })(tree);
  return found;
}

async function send(url, seconds, length) {
  const res = await fetch(base + "/api/ext/progress", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + token },
    body: JSON.stringify({ url, seconds, length }),
    signal: AbortSignal.timeout(10000),
  });
  const json = await res.json().catch(() => null);
  if (res.status === 401) throw new Error("Watchtrail rejected the token. Copy it again from Settings.");
  return json && json.match;
}

let last = { uri: null, sent: -999, time: 0, length: 0 };
let warned = false;

async function tick() {
  let status;
  try {
    const res = await vlc("status.json");
    if (res.status === 401) throw new Error("VLC rejected the password (VLC_PASSWORD).");
    status = await res.json();
  } catch (err) {
    if (!warned) console.log("Waiting for VLC's web interface on port " + vlcPort + "...", err.message || "");
    warned = true;
    return;
  }
  warned = false;

  if (status.state === "stopped") {
    // VLC closed or stopped the file: save the last place we saw.
    if (last.uri && last.time > 0) {
      const match = await send(last.uri, last.time, last.length).catch((e) => console.error(e.message));
      if (match) console.log("Saved " + match.title + (match.finished ? " (finished)" : " at " + Math.round(last.time) + "s"));
    }
    last = { uri: null, sent: -999, time: 0, length: 0 };
    return;
  }

  const uri = await currentUri(status);
  if (!uri || !/^(https?|ftp):/i.test(uri)) return; // only stream links are tracked
  const time = Number(status.time) || 0;
  const length = Number(status.length) || 0;
  if (uri !== last.uri) last = { uri, sent: -999, time, length };
  last.time = time;
  last.length = length;

  if (status.state === "playing" && time - last.sent >= saveEvery) {
    const match = await send(uri, time, length).catch((e) => console.error(e.message));
    last.sent = time;
    if (match) console.log("Tracking " + match.title + " at " + Math.round(time) + "s");
  }
}

console.log("Watchtrail bridge running. Leave this window open while you watch. Ctrl+C to stop.");
setInterval(() => tick().catch((e) => console.error(e.message)), pollMs);
void tick();
