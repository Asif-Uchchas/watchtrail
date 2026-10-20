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
// @version      1.3
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

  // ---- "Learn whole show": crawl this folder and every sub-folder, then send all real file names.
  // This runs in YOUR browser on the FTP site itself (same origin), which is the only place that can
  // reach BDIX servers; the Watchtrail server on Vercel cannot.
  var crawling = false;
  var crawlBtn = null;

  function crawlLabel(text) { if (crawlBtn) crawlBtn.textContent = text; }

  // Folders whose name says 1080p are read last, so their file names win when a season exists in
  // several qualities (a later link for the same episode replaces an earlier one).
  function qualityRank(url) {
    var d = url;
    try { d = decodeURIComponent(url); } catch (e) {}
    return /1080p/i.test(d) ? 2 : 1;
  }

  function dirPath(u) { return u.pathname.replace(/[^/]*$/, ""); }

  async function crawl() {
    if (crawling) return;
    if (!token) { setToken(); return; }
    crawling = true;
    var MAX_FOLDERS = 80, MAX_DEPTH = 3;
    var site = location.hostname.split(".").slice(-2).join(".");
    var start = new URL(location.href);
    start.hash = ""; start.search = "";
    var basePath = start.pathname.slice(-1) === "/" ? start.pathname : dirPath(start);
    var queue = [{ url: start.href, depth: 0 }];
    var seen = {}, found = {}, folders = 0;
    try {
      while (queue.length && folders < MAX_FOLDERS) {
        var item = queue.shift();
        if (seen[item.url]) continue;
        seen[item.url] = true;
        folders++;
        crawlLabel("Reading folder " + folders + "...");
        var doc = null;
        if (item.url === start.href) {
          doc = document;
        } else {
          try {
            var res = await fetch(item.url, { credentials: "same-origin" });
            doc = new DOMParser().parseFromString(await res.text(), "text/html");
          } catch (e) { continue; }
          // Be gentle with the server.
          await new Promise(function (r) { setTimeout(r, 150); });
        }
        var here = new URL(item.url);
        var anchors = doc.querySelectorAll("a[href]");
        for (var i = 0; i < anchors.length; i++) {
          var u;
          try { u = new URL(anchors[i].getAttribute("href"), item.url); } catch (e) { continue; }
          var decoded = u.pathname;
          try { decoded = decodeURIComponent(u.pathname); } catch (e) {}
          // Video files may live on another server of the same site (new.circleftp.net lists
          // files that are served from ftp12.circleftp.net), so accept any host of this site.
          if (VIDEO.test(decoded)) {
            if (u.hostname === site || u.hostname.slice(-(site.length + 1)) === "." + site) found[u.origin + u.pathname] = true;
            continue;
          }
          // Folders can only be fetched from the page's own server (other servers block it).
          if (u.origin !== location.origin) continue;
          if (
            u.pathname.slice(-1) === "/" && !u.search &&
            u.pathname.indexOf(basePath) === 0 && u.pathname !== here.pathname &&
            item.depth < MAX_DEPTH
          ) {
            queue.push({ url: u.origin + u.pathname, depth: item.depth + 1 });
          }
        }
      }
      var urls = Object.keys(found).sort(function (a, b) { return qualityRank(a) - qualityRank(b); });
      if (!urls.length) {
        crawlLabel("No files found");
        alert("Watchtrail found no video files in this folder tree. Open a season folder and try again.");
        return;
      }
      var learned = 0;
      for (var j = 0; j < urls.length; j += 400) {
        crawlLabel("Saving " + Math.min(j + 400, urls.length) + "/" + urls.length + "...");
        var r = await call("/api/ext/links", { urls: urls.slice(j, j + 400) });
        if (r.status === 401) { status("bad token", true); crawlLabel("Bad token"); return; }
        learned += (r.json && r.json.learned) || 0;
      }
      crawlLabel("Learned " + learned + " episodes");
      alert(
        "Watchtrail learned " + learned + " episode file names from " + folders + " folders (" + urls.length + " files found).\\n" +
        (learned < urls.length ? "Files of shows that are not in your Watchtrail library yet were skipped: add the show first, then run this again." : "")
      );
    } catch (e) {
      crawlLabel("Learn failed");
    } finally {
      crawling = false;
      setTimeout(function () { crawlLabel("Learn whole show"); }, 4000);
    }
  }
  GM_registerMenuCommand("Learn this folder and all sub-folders", crawl);

  // Show the button only on pages that have sub-folders (a show or season root).
  function maybeShowCrawlButton() {
    if (crawlBtn || !token) return;
    var path = location.pathname;
    var hasSub = Array.prototype.some.call(document.querySelectorAll("a[href]"), function (a) {
      return a.origin === location.origin && a.pathname.slice(-1) === "/" && a.pathname.length > path.length && a.pathname.indexOf(path) === 0;
    });
    // Pages like new.circleftp.net/content/ID list every season's files in one page, with no sub-folders.
    var hasVideo = Array.prototype.some.call(document.querySelectorAll("a[href]"), function (a) {
      var p = a.pathname;
      try { p = decodeURIComponent(p); } catch (e) {}
      return VIDEO.test(p);
    });
    if (!hasSub && !hasVideo) return;
    crawlBtn = document.createElement("button");
    crawlBtn.type = "button";
    crawlBtn.textContent = "Learn whole show";
    crawlBtn.title = "Read every sub-folder and teach Watchtrail the real file names";
    crawlBtn.style.cssText = "position:fixed;right:12px;bottom:48px;z-index:99999;padding:6px 12px;border-radius:999px;border:1px solid #f5b54488;background:#18181dee;color:#f5b544;font:600 12px system-ui;cursor:pointer";
    crawlBtn.onclick = crawl;
    document.body.appendChild(crawlBtn);
  }

  function schedule() { clearTimeout(timer); timer = setTimeout(function () { scan(); maybeShowCrawlButton(); }, 500); }
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  scan();
  maybeShowCrawlButton();
})();
`;
  return new Response(script, {
    headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" },
  });
}
