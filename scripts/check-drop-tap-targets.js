#!/usr/bin/env node
require("./_env-guard");
// D3: on /drop, the desk actions ("Add a saved desk", "Create a new desk", "Have a code") never overlap and each
// is a 44px tap target. Real headless Chrome at 390x844 (and 1280x900): document.elementFromPoint at each
// control's centre and just inside each edge must hit that control, never a neighbour, and its box is at
// least 44 x 44. The page runs from this repo over a local server; /api answers 401, so a signed-in visitor
// with no desk sees the desk picker. No Chrome, no page or no controls is a FAIL (fail closed), never a skip.
// Then CSS mutants that put the overlap back or shrink a control must each be caught.
// Usage: node scripts/check-drop-tap-targets.js   (CHROME=/path/to/chrome to pick a browser)
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn, execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
let failed = 0;
let passed = 0;
function ok(cond, msg) { if (cond) { passed += 1; console.log("ok   " + msg); } else { failed += 1; console.error("FAIL " + msg); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".ico": "image/x-icon" };
const LABELS = ["Add a saved desk", "Create a new desk", "Have a code"];
let overlay = {};

function findChrome() {
  const list = [process.env.CHROME, "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].filter(Boolean);
  for (const c of list) {
    try { execFileSync(c, ["--version"], { stdio: "ignore", timeout: 20000 }); return c; } catch (e) { /* next */ }
  }
  return null;
}

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p.startsWith("/api/")) { res.writeHead(401, { "content-type": "application/json" }); return res.end(JSON.stringify({ error: "Sign in again." })); }
      if (p === "/") p = "/index.html";
      let rel = p.slice(1);
      if (!path.extname(rel)) rel += ".html";
      if (Object.prototype.hasOwnProperty.call(overlay, rel)) { res.writeHead(200, { "content-type": TYPES[path.extname(rel)] || "text/plain", "cache-control": "no-store" }); return res.end(overlay[rel]); }
      const f = path.join(root, rel);
      if (!f.startsWith(root + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end("no"); }
      res.writeHead(200, { "content-type": TYPES[path.extname(rel)] || "application/octet-stream", "cache-control": "no-store" });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
}

async function browser(bin) {
  const port = 9600 + Math.floor(Math.random() * 300);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aia-tap-"));
  const proc = spawn(bin, ["--headless=new", "--remote-debugging-port=" + port, "--user-data-dir=" + dir, "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--no-sandbox", "about:blank"], { stdio: "ignore" });
  let page = null;
  for (let i = 0; i < 100 && !page; i++) {
    try { page = (await (await fetch("http://127.0.0.1:" + port + "/json")).json()).find((t) => t.type === "page"); } catch (e) { await sleep(150); }
  }
  if (!page) { proc.kill(); throw new Error("Chrome did not open a page"); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener("open", r); ws.addEventListener("error", j); });
  let id = 0; const wait = {};
  ws.addEventListener("message", (m) => { const d = JSON.parse(m.data); if (d.id && wait[d.id]) { wait[d.id](d); delete wait[d.id]; } });
  const send = (method, params) => new Promise((r) => { const i = ++id; wait[i] = r; ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const ev = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (!r.result || r.result.exceptionDetails) throw new Error("page script threw: " + JSON.stringify(r.result && r.result.exceptionDetails).slice(0, 200));
    return r.result.result.value;
  };
  await send("Page.enable");
  return { send, ev, close() { try { ws.close(); } catch (e) {} proc.kill(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} } };
}

// Runs in the page: scroll each control to the middle, then hit-test its centre and just inside each edge.
const PROBE = `(async () => {
  const want = ${JSON.stringify(LABELS)};
  const box = document.getElementById("desk-pick");
  const els = box ? [...box.querySelectorAll(".desk-actions > a, .desk-actions > button")] : [];
  const out = [];
  for (const label of want) {
    const el = els.find((e) => (e.textContent || "").trim() === label);
    if (!el) { out.push({ label, missing: true }); continue; }
    el.scrollIntoView({ block: "center" }); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const r = el.getBoundingClientRect();
    const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
    const pts = { centre: [cx, cy], top: [cx, r.top + 2], bottom: [cx, r.bottom - 2], left: [r.left + 2, cy], right: [r.right - 2, cy] };
    const hits = {};
    Object.keys(pts).forEach((k) => { const h = document.elementFromPoint(pts[k][0], pts[k][1]); const own = !!(h && (h === el || el.contains(h)));
      const other = h && !own ? els.find((e) => e === h || e.contains(h)) : null;
      hits[k] = own ? "self" : other ? "OTHER:" + other.textContent.trim() : "none:" + (h ? h.tagName + "." + h.className : "null"); });
    out.push({ label, w: r.width, h: r.height, hits, rect: [r.left, r.top + scrollY, r.right, r.bottom + scrollY] });
  }
  return out;
})()`;

async function measure(b, base, W, H) {
  await b.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: W < 1000 });
  await b.send("Page.navigate", { url: base + "/help" }); await sleep(600);
  await b.ev(`localStorage.clear(); localStorage.setItem("aia_session", "check-tap-fake-session"); true`);
  await b.send("Page.navigate", { url: base + "/drop" });
  for (let i = 0; i < 40; i++) { await sleep(150); if (await b.ev(`!!(document.getElementById("desk-pick") && document.querySelector("#desk-pick .desk-actions a") && document.readyState === "complete")`)) break; }
  await sleep(500);
  return b.ev(PROBE);
}

function judge(rows, W, tag, report) {
  const bad = [];
  if (!Array.isArray(rows) || rows.length !== LABELS.length) bad.push("no desk actions measured");
  (rows || []).forEach((r) => {
    if (r.missing) { bad.push(r.label + " is missing"); return; }
    if (!(r.w >= 44 && r.h >= 44)) bad.push("SIZE " + r.label + " is " + Math.round(r.w) + "x" + Math.round(r.h) + " (under 44px)");
    Object.keys(r.hits).forEach((k) => { if (r.hits[k] !== "self") bad.push("HIT " + r.label + " " + k + " -> " + r.hits[k]); });
  });
  for (let i = 0; i < (rows || []).length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i].rect, c = rows[j].rect; if (!a || !c) continue;
    if (a[0] < c[2] - 0.5 && c[0] < a[2] - 0.5 && a[1] < c[3] - 0.5 && c[1] < a[3] - 0.5) bad.push("OVERLAP " + rows[i].label + " and " + rows[j].label);
  }
  if (report) {
    (rows || []).forEach((r) => { if (!r.missing) console.log("     " + W + " " + r.label + " " + Math.round(r.w) + "x" + Math.round(r.h) + " y " + Math.round(r.rect[1]) + "-" + Math.round(r.rect[3]) + " hits " + Object.values(r.hits).join(",")); });
    ok(bad.length === 0, tag + " at " + W + ": desk actions do not overlap, each hit point lands on its own control, each is at least 44x44" + (bad.length ? " (" + bad.join("; ") + ")" : ""));
  }
  return bad;
}

const CSS = "drop-page.css";
const FIX = "body .desk-actions > a:not([class]) { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; min-height: 44px; min-width: 44px; margin-block: 0; padding-block: 10px; }";
const MUTANTS = [
  // [name, what kind of failure must catch it, edit to drop-page.css]
  ["fix removed (theme.css -11px pulls links together)", "HIT", (c) => c.replace(FIX, "")],
  ["fix keeps margin-block:-11px", "HIT", (c) => c.replace("margin-block: 0;", "margin-block: -11px;")],
  ["Have a code pulled up over Create a new desk", "HIT", (c) => c + "\nbody .desk-actions > a[href=\"/login\"]:not([class]) { margin-top: -20px; }"],
  ["Create a new desk drawn over by a raised Have a code", "HIT", (c) => c + "\nbody .desk-actions > a[href=\"/login\"]:not([class]) { position: relative; top: -12px; z-index: 2; }"],
  ["links shrink to 36px tall", "SIZE", (c) => c + "\nbody .desk-actions > a:not([class]) { min-height: 0; height: 36px; padding-block: 0; }"],
  ["Add a saved desk button shrinks to 40px", "SIZE", (c) => c + "\n#add-toggle { min-height: 0 !important; height: 40px !important; padding-block: 0 !important; }"],
  ["Have a code shrinks to 40px wide", "SIZE", (c) => c + "\n@media (max-width: 859px) { body .desk-actions > a[href=\"/login\"]:not([class]) { width: 40px !important; min-width: 0; padding: 0; overflow: hidden; } }"]
];

(async () => {
  const css = (() => { try { return fs.readFileSync(path.join(root, CSS), "utf8"); } catch (e) { return null; } })();
  ok(typeof css === "string", CSS + " is readable");
  ok(!!css && css.indexOf(FIX) >= 0, CSS + " keeps the desk-actions fix rule word for word");
  const bin = findChrome();
  ok(!!bin, "a headless Chrome is available (fail closed: no browser, no pass)");
  if (!bin || typeof css !== "string") return finish();
  const srv = await serve();
  const base = "http://127.0.0.1:" + srv.address().port;
  let b = null;
  try {
    b = await browser(bin);
    overlay = {};
    judge(await measure(b, base, 390, 844), 390, "real page", true);
    judge(await measure(b, base, 1280, 900), 1280, "real page", true);
    let caught = 0;
    for (const [name, kind, edit] of MUTANTS) {
      const m = edit(css);
      if (m === css) { ok(false, "mutant " + name + " did not change " + CSS); continue; }
      overlay = { [CSS]: m };
      const bad = judge(await measure(b, base, 390, 844), 390, name, false);
      const hit = bad.some((x) => x.indexOf(kind + " ") === 0 || (kind === "HIT" && x.indexOf("OVERLAP ") === 0));
      if (hit) caught += 1;
      ok(hit, "mutant " + name + " | " + kind + " | " + (hit ? "CAUGHT" : "SURVIVED") + (bad.length ? " (" + bad[0] + ")" : ""));
    }
    overlay = {};
    console.log("mutants caught " + caught + "/" + MUTANTS.length);
  } catch (e) {
    ok(false, "Chrome run finished (" + (e && e.message) + ")");
  } finally {
    if (b) b.close();
    srv.close();
  }
  finish();
})();
function finish() {
  if (failed) { console.error("check-drop-tap-targets: " + passed + " ok, " + failed + " failed"); process.exit(1); }
  console.log("check-drop-tap-targets: " + passed + " ok, 0 failed");
  process.exit(0);
}
