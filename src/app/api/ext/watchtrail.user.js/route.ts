export const dynamic = "force-dynamic";

/**
 * Userscript for Tampermonkey / Violentmonkey (desktop, or Kiwi / Firefox on Android).
 * It adds a ✓ next to watched videos in an FTP file listing and a "Log" button
 * on the rest, using the personal token from Settings.
 */
export function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const script = `// ==UserScript==
// @name         Watchtrail for FTP listings
// @namespace    ${origin}
// @version      1.2
// @description  Shows what you have watched in FTP/h5ai file listings and logs episodes with one click.
// @match        *://*.circleftp.net/*
// @match        *://circleftp.net/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      ${url.hostname}
// @run-at       document-idle
// ==/UserScript==
// Other servers: add more "// @match *://your-server/*" lines above.

(function () {
  "use strict";
  var BASE = ${JSON.stringify(origin)};
  var VIDEO = /\\.(mkv|mp4|avi|mov|wmv|flv|webm|m4v|ts|mpg|mpeg)$/i;
  var token = GM_getValue("token", "");
  var timer = null;
  var pill = null;

  function call(path, body) {
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: "POST",
        url: BASE + path,
        headers: { "content-type": "application/json", authorization: "Bearer " + token },
        data: JSON.stringify(body),
        onload: function (r) {
          var json = null;
          try { json = JSON.parse(r.responseText); } catch (e) {}
          resolve({ status: r.status, json: json });
        },
        onerror: reject,
        ontimeout: reject,
        timeout: 15000,
      });
    });
  }

  function setToken() {
    var t = prompt("Paste your Watchtrail token (Watchtrail > Settings):", token);
    if (t && t.trim()) {
      token = t.trim();
      GM_setValue("token", token);
      document.querySelectorAll("[data-wt]").forEach(function (el) { el.removeAttribute("data-wt"); });
      document.querySelectorAll(".wt-badge").forEach(function (el) { el.remove(); });
      scan();
    }
  }
  GM_registerMenuCommand("Set Watchtrail token", setToken);

  function status(text, bad) {
    if (!pill) {
      pill = document.createElement("button");
      pill.type = "button";
      pill.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:99999;padding:6px 12px;border-radius:999px;border:1px solid #f5b54488;background:#18181dee;color:#f5b544;font:600 12px system-ui;cursor:pointer";
      pill.onclick = setToken;
      document.body.appendChild(pill);
    }
    var label = "Watchtrail: " + text;
    if (pill.textContent !== label) pill.textContent = label;
    pill.style.color = bad ? "#ff8a80" : "#f5b544";
  }

  function clock(s) {
    s = Math.round(s);
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ":" + (m < 10 ? "0" : "") + m : m) + ":" + (x < 10 ? "0" : "") + x;
  }

  function badge(a, watched, message, resume) {
    var old = a.parentNode.querySelector(".wt-badge[data-for='" + a.dataset.wt + "']");
    if (old) old.remove();
    var b = document.createElement("button");
    b.type = "button";
    b.className = "wt-badge";
    b.dataset.for = a.dataset.wt;
    b.style.cssText = "margin-left:8px;padding:1px 8px;border-radius:999px;border:1px solid " + (watched ? "#4ade8066" : "#f5b54488") + ";background:" + (watched ? "#4ade8022" : "#f5b54422") + ";color:" + (watched ? "#4ade80" : "#f5b544") + ";font:600 11px system-ui;cursor:pointer";
    b.textContent = resume ? "\\u25B6 stopped at " + clock(resume) : watched ? "\\u2713 watched" : "+ log";
    b.title = message || (watched ? "Already in Watchtrail" : "Mark as watched in Watchtrail");
    if (!watched) {
      b.onclick = function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        b.textContent = "...";
        call("/api/ext/log", { url: a.href }).then(function (r) {
          if (r.json && r.json.ok) badge(a, true, "Logged: " + r.json.message);
          else { b.textContent = "failed"; b.title = (r.json && r.json.message) || "Could not log"; }
        }, function () { b.textContent = "offline"; });
      };
    }
    a.parentNode.insertBefore(b, a.nextSibling);
  }

  function scan() {
    if (!token) { status("set token", true); return; }
    var links = Array.prototype.filter.call(document.querySelectorAll("a[href]"), function (a) {
      if (a.dataset.wt) return false;
      var path = "";
      try { path = decodeURIComponent(a.pathname); } catch (e) { path = a.pathname; }
      return VIDEO.test(path);
    });
    if (!links.length) { status("connected"); return; }
    links.forEach(function (a, i) { a.dataset.wt = String(i) + "-" + Date.now(); });
    call("/api/ext/state", { urls: links.map(function (a) { return a.href; }) }).then(function (r) {
      if (r.status === 401) { status("bad token", true); links.forEach(function (a) { a.removeAttribute("data-wt"); }); return; }
      var seen = {};
      ((r.json && r.json.watched) || []).forEach(function (u) { seen[u] = true; });
      var resume = (r.json && r.json.resume) || {};
      links.forEach(function (a) { badge(a, Boolean(seen[a.href]), null, resume[a.href]); });
      status("connected");
      // Tell Watchtrail the real file names, so Play never has to guess them.
      call("/api/ext/links", { urls: links.map(function (a) { return a.href; }).slice(0, 400) });
    }, function () { status("offline", true); links.forEach(function (a) { a.removeAttribute("data-wt"); }); });
  }

  function schedule() { clearTimeout(timer); timer = setTimeout(scan, 500); }
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  scan();
})();
`;
  return new Response(script, {
    headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" },
  });
}
