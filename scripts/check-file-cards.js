#!/usr/bin/env node
"use strict";
// File cards: a picture shows as a thumbnail, anything else (PDF, HEIC, a doc) shows as a link with its real name.
// 1. Renders cards through the real desk-html-view.js (card sheet) and desk-needs.js (queue card).
// 2. Runs the real upload code of drop-app.js and desk.html against a real api/upload.js handler and checks that
//    photoUrl is only saved for png / jpeg / gif / webp, while files[] keeps the name.
// No deps. DOM stub only.
// Usage: node scripts/check-file-cards.js [repoRoot]
//   UPLOAD_HANDLER_ROOTS=/path/a:/path/b  also drive the page upload code against those trees' api/upload.js.
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { spawnSync } = require("child_process");

const root = path.resolve(process.argv[2] && process.argv[2] !== "--child" ? process.argv[2] : path.join(__dirname, ".."));
let failures = 0;
function fail(msg) { failures += 1; console.error("check-file-cards: FAIL " + msg); }
function pass(msg) { console.log("check-file-cards: ok " + msg); }
function read(rel, base) { return fs.readFileSync(path.join(base || root, rel), "utf8"); }

// ---------- minimal DOM ----------
function makeEl(tag) {
  const el = {
    tagName: String(tag || "div").toUpperCase(), children: [], attrs: {}, style: {}, value: "", hidden: false, dataset: {}, files: null,
    _cls: new Set(), _text: "", _html: "",
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] == null ? null : this.attrs[k]; },
    hasAttribute(k) { return k in this.attrs; }, appendChild(c) { this.children.push(c); return c; },
    insertBefore(c) { return c; }, insertAdjacentElement(_, c) { return c; }, insertAdjacentHTML() {},
    addEventListener() {}, removeEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; }, focus() {}, reset() {}, contains() { return false; }, scrollIntoView() {},
    get textContent() { return this._text; }, set textContent(v) { this._text = String(v == null ? "" : v); },
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = String(v == null ? "" : v); },
    get parentNode() { return { insertBefore(c) { return c; }, appendChild(c) { return c; } }; }
  };
  el.classList = { add(c) { el._cls.add(c); }, remove(c) { el._cls.delete(c); }, contains(c) { return el._cls.has(c); }, toggle(c, on) { const w = on === undefined ? !el._cls.has(c) : !!on; if (w) el._cls.add(c); else el._cls.delete(c); return w; } };
  return el;
}
function world() {
  const els = {};
  const document = {
    readyState: "complete", body: makeEl("body"), head: makeEl("head"),
    getElementById(id) { if (!els[id]) els[id] = makeEl("div"); return els[id]; },
    querySelector() { return makeEl("div"); }, querySelectorAll() { return { forEach() {}, length: 0 }; },
    createElement(t) { return makeEl(t); }, createTextNode(t) { const e = makeEl("#text"); e._text = String(t); return e; },
    addEventListener() {}
  };
  const store = { aia_ws: "probe", aia_pin: "1234", aia_role: "owner" };
  const ctx = {
    document, console, URLSearchParams,
    localStorage: { getItem(k) { return store[k] || null; }, setItem(k, v) { store[k] = String(v); }, removeItem(k) { delete store[k]; } },
    sessionStorage: { getItem() { return null; }, setItem() {} },
    location: { search: "", hash: "", origin: "https://probe.test", href: "https://probe.test/" },
    history: { replaceState() {} }, navigator: {},
    setTimeout() { return 0; }, clearTimeout() {}, setInterval() { return 0; },
    MutationObserver: function () { this.observe = function () {}; this.disconnect = function () {}; },
    fetch: async function () { return { ok: true, status: 200, json: async function () { return {}; } }; }
  };
  ctx.window = ctx;
  ctx.addEventListener = function () {};
  ctx.JOBS = []; ctx.FIELDS = []; ctx.PEOPLE = []; ctx.role = "owner";
  ctx.labelStatus = function (s) { return String(s || ""); }; ctx.visitorLine = function (s) { return String(s || ""); };
  ctx.smsHref = function () { return "sms:"; }; ctx.mailHref = function () { return "mailto:"; };
  ctx.api = async function () { return { status: 200, data: {} }; };
  ctx.AIADesks = { list() { return []; }, current() { return null; }, switchTo() {}, shopOpen() { return true; }, find() { return null; } };
  return ctx;
}
function load(ctx, rel) { vm.runInNewContext(read(rel), ctx, { filename: rel }); }

// ---------- what a card shows ----------
function decode(s) { return String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&#96;/g, "`").replace(/&amp;/g, "&"); }
function filesBlock(html) {
  const i = html.indexOf('<div class="q-files">');
  if (i < 0) return "";
  const j = html.indexOf("</div>", i);
  return html.slice(i, j < 0 ? html.length : j + 6);
}
function shown(html) {
  const block = filesBlock(html);
  const imgs = [], links = [], tags = [];
  let m;
  const ti = /<\s*([a-zA-Z]+)/g; while ((m = ti.exec(block))) tags.push(m[1].toLowerCase());
  const ri = /<img class="thumb" src="([^"]*)"/g; while ((m = ri.exec(block))) imgs.push(decode(m[1]));
  const ra = /<a class="q-file edit" href="([^"]*)"[^>]*>([^<]*)<\/a>/g; while ((m = ra.exec(block))) links.push({ href: decode(m[1]), name: decode(m[2]) });
  return { imgs, links, tags, block };
}
function sheetRender(j) {
  const ctx = world();
  load(ctx, "escape-html.js");
  load(ctx, "desk-html-view.js");
  if (typeof ctx.filesHtml !== "function") throw new Error("desk-html-view.js must set window.filesHtml");
  return ctx.filesHtml(j);
}
function queueRender(j) {
  const ctx = world();
  ctx.JOBS = [j];
  load(ctx, "escape-html.js");
  load(ctx, "desk-needs.js");
  if (typeof ctx.card !== "function") throw new Error("desk-needs.js must set window.card");
  return ctx.card(j, false);
}

const U = (id) => "/api/upload?id=" + id;
const EVIL = "<img src=x onerror=alert(1)>.pdf";
const CASES = [
  { name: "png upload", job: { photoUrl: U("png1"), files: [{ id: "png1", name: "porch.png", type: "image/png", kind: "photo", url: U("png1") }] }, imgs: [U("png1")], links: [] },
  { name: "jpeg upload", job: { photoUrl: U("jpg1"), files: [{ id: "jpg1", name: "porch.jpg", type: "image/jpeg", kind: "photo", url: U("jpg1") }] }, imgs: [U("jpg1")], links: [] },
  { name: "PDF upload (octet-stream / document)", job: { files: [{ id: "pdf1", name: "invoice.pdf", type: "application/octet-stream", kind: "document", url: U("pdf1") }] }, imgs: [], links: [[U("pdf1"), "invoice.pdf"]] },
  { name: "PDF upload saved before the fix (photoUrl = the PDF)", job: { photoUrl: U("pdf2"), files: [{ id: "pdf2", name: "invoice.pdf", type: "application/octet-stream", kind: "document", url: U("pdf2") }] }, imgs: [], links: [[U("pdf2"), "invoice.pdf"]] },
  { name: "HEIC upload (octet-stream / photo kind)", job: { photoUrl: U("heic1"), files: [{ id: "heic1", name: "IMG_0042.HEIC", type: "application/octet-stream", kind: "photo", url: U("heic1") }] }, imgs: [], links: [[U("heic1"), "IMG_0042.HEIC"]] },
  { name: "HEIC stored by the old handler (image/heic)", job: { files: [{ id: "heic2", name: "IMG_7.heic", type: "image/heic", kind: "photo", url: U("heic2") }] }, imgs: [], links: [[U("heic2"), "IMG_7.heic"]] },
  { name: "legacy photoUrl-only png", job: { photoUrl: "https://store.public.blob.vercel-storage.com/desk/file_1.png" }, imgs: ["https://store.public.blob.vercel-storage.com/desk/file_1.png"], links: [] },
  { name: "legacy photoUrl-only upload id", job: { photoUrl: U("old1") }, imgs: [U("old1")], links: [] },
  { name: "legacy photoUrl-only .pdf", job: { photoUrl: "https://store.public.blob.vercel-storage.com/desk/file_2.pdf" }, imgs: [], links: [["https://store.public.blob.vercel-storage.com/desk/file_2.pdf", "file_2.pdf"]] },
  { name: "hook card with outside files[] urls", job: { files: [{ url: "https://example.com/docs/quote.pdf", name: "quote.pdf" }, { url: "https://example.com/pics/porch.jpg", name: "porch.jpg" }] }, imgs: ["https://example.com/pics/porch.jpg"], links: [["https://example.com/docs/quote.pdf", "quote.pdf"]] },
  { name: "hostile file name stays literal", job: { files: [{ id: "evil1", name: EVIL, type: "application/octet-stream", kind: "document", url: U("evil1") }] }, imgs: [], links: [[U("evil1"), EVIL]] },
  { name: "javascript: url is dropped", job: { files: [{ name: "x.pdf", url: "javascript:alert(1)" }] }, imgs: [], links: [], queueLinks: [["", "x.pdf"]] } // queue card keeps an inert name with an empty href (as on main); the sheet drops it
];

// Every extension that must show as a named link when it is all an old card has (a bare photoUrl).
["pdf", "heic", "heif", "mp4", "mov", "webm", "doc", "docx", "txt", "csv", "xls", "xlsx", "ppt", "pptx", "zip"].forEach(function (ext) {
  const url = "https://store.public.blob.vercel-storage.com/desk/old_" + ext + "." + ext.toUpperCase();
  CASES.push({ name: "legacy photoUrl-only ." + ext.toUpperCase(), job: { photoUrl: url }, imgs: [], links: [[url, "old_" + ext + "." + ext.toUpperCase()]] });
});
function judge(where, c, html) {
  const s = shown(html);
  const label = where + " · " + c.name;
  const wantImgs = JSON.stringify(c.imgs), gotImgs = JSON.stringify(s.imgs);
  const wantLinks = JSON.stringify(/queue card/.test(where) && c.queueLinks ? c.queueLinks : c.links), gotLinks = JSON.stringify(s.links.map((l) => [l.href, l.name]));
  const bad = s.tags.filter((t) => t !== "div" && t !== "img" && t !== "a");
  const extraImg = s.tags.filter((t) => t === "img").length !== c.imgs.length;
  if (gotImgs !== wantImgs) fail(label + ": thumbnails " + gotImgs + " want " + wantImgs);
  else if (gotLinks !== wantLinks) fail(label + ": links " + gotLinks + " want " + wantLinks);
  else if (bad.length || extraImg) fail(label + ": unexpected elements in the files block: " + s.tags.join(","));
  else if (/onerror|<script/i.test(s.block.replace(/&lt;img src=x onerror=alert\(1\)&gt;/g, ""))) fail(label + ": handler text leaked as markup");
  else pass(label + ": " + (c.imgs.length ? c.imgs.length + " thumbnail(s)" : "no thumbnail") + (c.links.length ? ", link(s) " + c.links.map((l) => JSON.stringify(l[1])).join(", ") : ""));
}

// ---------- page upload code against a real handler (child process: fresh store per handler tree) ----------
function pngBytes() { return Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4500000000049454e44ae426082", "hex"); }
function jpegBytes() { return Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xD9]); }
function pdfBytes() { return Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"); }
function heicBytes() { return Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic", "ascii"), Buffer.alloc(40)]); }
const FILES = [
  { name: "porch.png", type: "image/png", bytes: pngBytes, image: true },
  { name: "porch.jpg", type: "image/jpeg", bytes: jpegBytes, image: true },
  { name: "invoice.pdf", type: "application/pdf", bytes: pdfBytes, image: false },
  { name: "IMG_0042.HEIC", type: "image/heic", bytes: heicBytes, image: false }
];

function grab(src, startRe, endMarker) {
  const m = src.match(startRe);
  if (!m) return "";
  const end = src.indexOf(endMarker, m.index);
  return end < 0 ? "" : src.slice(m.index, end + endMarker.length);
}
async function child() {
  const pageRoot = process.env.FC_PAGE_ROOT, handlerRoot = process.env.FC_HANDLER_ROOT;
  const auth = require(path.join(handlerRoot, "api/auth"));
  const upload = require(path.join(handlerRoot, "api/upload"));
  const lib = require(path.join(handlerRoot, "api/_lib"));
  await lib.ready();
  const slug = "file-cards-desk";
  function mockRes() { return { headers: {}, statusCode: 200, body: null, setHeader(k, v) { this.headers[k] = v; }, getHeader(k) { return this.headers[k]; }, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; }, end(b) { if (b !== undefined && this.body == null) this.body = b; return this; } }; }
  const opened = mockRes();
  await auth({ method: "POST", headers: { "x-workspace": slug }, body: { action: "open", slug, biz: "File Cards", name: "Owner", pin: "4821" }, query: {} }, opened);
  if (opened.statusCode >= 400) throw new Error("could not open a desk: " + JSON.stringify(opened.body));
  async function callUpload(headers, body) {
    const res = mockRes();
    const h = {}; Object.keys(headers || {}).forEach((k) => { h[k.toLowerCase()] = headers[k]; });
    await upload({ method: "POST", headers: h, body: body, query: {} }, res);
    return res;
  }
  function FileReaderStub() { this.readAsDataURL = (f) => { this.result = "data:" + f.type + ";base64," + f._bytes.toString("base64"); setImmediate(() => this.onload && this.onload()); }; }
  function fileObj(f) { const b = f.bytes(); return { name: f.name, type: f.type, size: b.length, _bytes: b }; }
  const out = [];
  const dropSrc = fs.readFileSync(path.join(pageRoot, "drop-app.js"), "utf8");
  const attach = grab(dropSrc, /\n    async function attachFiles\(item, err\) \{/, "\n      return true;\n    }\n");
  const isPic = grab(dropSrc, /\n    function isPictureFile\(f\) \{/, "\n    }\n");
  const deskSrc = fs.readFileSync(path.join(pageRoot, "desk.html"), "utf8");
  const capture = grab(deskSrc, /\n    async function capture\(\) \{/, "\n      load();\n    }\n");
  for (const f of FILES) {
    // drop-app.js attachFiles (public Drop and widget)
    {
      const ctx = world();
      ctx.FileReader = FileReaderStub;
      const photo = makeEl("input"); photo.files = [fileObj(f)];
      const els = { photo, "drop-send": makeEl("button") };
      ctx.document.getElementById = (id) => els[id] || (els[id] = makeEl("div"));
      ctx.headers = () => ({ "Content-Type": "application/json", "X-Workspace": slug });
      ctx.showNote = (el, msg) => { ctx.__note = msg; };
      ctx.fetch = async (url, opts) => { const r = await callUpload(opts.headers, JSON.parse(opts.body)); return { ok: r.statusCode < 400, status: r.statusCode, json: async () => r.body }; };
      vm.runInNewContext((isPic || "") + attach + "\n;__run = async function () { const item = {}; const ok = await attachFiles(item, null); return { ok, item }; };", ctx, { filename: "drop-app.js" });
      const r = attach ? await ctx.__run() : { ok: false, item: {}, missing: true };
      out.push({ page: "drop-app.js", file: f.name, image: f.image, ok: r.ok, photoUrl: r.item.photoUrl || null, files: (r.item.files || []).map((x) => ({ name: x.name, type: x.type, url: x.url })), note: ctx.__note || "", missing: !!r.missing });
    }
    // desk.html capture() (signed-in Drop anything sheet)
    {
      const ctx = world();
      ctx.FileReader = FileReaderStub;
      const els = {};
      ctx.document.getElementById = (id) => els[id] || (els[id] = makeEl("div"));
      els["cap-title"] = makeEl("input"); els["cap-title"].value = "Sheet " + f.name;
      els["cap-file"] = makeEl("input"); els["cap-file"].files = [fileObj(f)];
      let item = null;
      ctx.load = () => {};
      ctx.api = async (p, opts) => {
        if (p === "/api/upload") { const r = await callUpload({ "Content-Type": "application/json", "X-Workspace": slug }, JSON.parse(opts.body)); return { status: r.statusCode, data: r.body }; }
        if (p === "/api/jobs") { item = JSON.parse(opts.body); return { status: 201, data: { jobs: [item] } }; }
        return { status: 200, data: {} };
      };
      vm.runInNewContext(capture + "\n;__run = capture;", ctx, { filename: "desk.html" });
      if (capture) await ctx.__run();
      const banner = ctx.document.getElementById("banner").textContent;
      out.push({ page: "desk.html", file: f.name, image: f.image, ok: !!item, photoUrl: (item && item.photoUrl) || null, files: ((item && item.files) || []).map((x) => ({ name: x.name, type: x.type, url: x.url })), note: item ? "" : banner, missing: !capture });
    }
  }
  process.stdout.write("@@" + JSON.stringify(out) + "@@");
}

function uploadRuns(handlerRoot) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aia-file-cards-"));
  const env = { PATH: process.env.PATH, HOME: process.env.HOME || tmp, AIA_STORE_PATH: path.join(tmp, "store.json"), AIA_UPLOAD_DIR: path.join(tmp, "files"), FC_PAGE_ROOT: root, FC_HANDLER_ROOT: handlerRoot };
  const r = spawnSync(process.execPath, [__filename, "--child"], { env, cwd: tmp, encoding: "utf8", timeout: 60000 });
  const m = /@@([\s\S]*)@@/.exec(r.stdout || "");
  if (!m) { fail("upload run against " + handlerRoot + " crashed: " + (r.stderr || r.stdout || "").slice(0, 400)); return; }
  const rows = JSON.parse(m[1]);
  const label = path.relative(path.dirname(root), handlerRoot) || handlerRoot;
  rows.forEach((row) => {
    const where = row.page + " + " + label + "/api/upload.js · " + row.file;
    if (row.missing) return fail(where + ": could not find the page's upload code");
    if (!row.ok) return fail(where + ": upload did not go through: " + row.note);
    const rec = row.files[0];
    if (row.image && !row.photoUrl) return fail(where + ": a picture must keep photoUrl");
    if (!row.image && row.photoUrl) return fail(where + ": photoUrl must not be saved for a non-picture (got " + row.photoUrl + ")");
    if (!rec || rec.name !== row.file) return fail(where + ": files[] must keep the real name, got " + JSON.stringify(row.files));
    if (row.image && row.photoUrl !== rec.url) return fail(where + ": photoUrl must be the url the server returned");
    pass(where + ": " + (row.photoUrl ? "photoUrl saved (picture)" : "no photoUrl") + ", files[] keeps " + JSON.stringify(rec.name) + " · " + rec.type);
  });
}

async function main() {
  for (const c of CASES) {
    try { judge("sheet (desk-html-view.js)", c, sheetRender(Object.assign({ id: "job_1", title: "t", status: "waiting" }, c.job))); } catch (e) { fail("sheet · " + c.name + ": threw " + e.message); }
    try { judge("queue card (desk-needs.js)", c, queueRender(Object.assign({ id: "job_1", title: "t", status: "waiting" }, c.job))); } catch (e) { fail("queue card · " + c.name + ": threw " + e.message); }
  }
  const roots = [root].concat(String(process.env.UPLOAD_HANDLER_ROOTS || "").split(":").filter(Boolean).map((p) => path.resolve(p)));
  roots.forEach(uploadRuns);
  if (failures) { console.error("check-file-cards: " + failures + " failure(s) in " + root); process.exit(1); }
  console.log("check-file-cards: pictures thumbnail, other files are named links, photoUrl only for pictures");
}

if (process.argv[2] === "--child") child().catch((e) => { console.error(e && e.stack); process.exit(1); });
else main().catch((e) => { console.error("check-file-cards: crashed " + (e && e.stack)); process.exit(1); });
