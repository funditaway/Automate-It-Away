#!/usr/bin/env node
require("./_env-guard");
// Connections: a refused key save shows the server's plain note, never a code.
// api/connections.js refuses a save with { error: "keyLocked", reason: "needsConnectSecret",
// note: "This desk can't save a key yet. Nothing was saved." }. The page used to paint data.error,
// so a phone saw "keyLocked". Node only: saveAi() from connections.html runs in a vm with a fake
// fetch. The refused body is read from api/connections.js itself, so the page and server stay in step.
// - a refused save shows the server's note
// - no note: an existing plain line ("Could not connect."), never a code
// - a plain-words error the server already sends still shows
// - no raw code (keyLocked, needsConnectSecret, or any one-word code) reaches the page
// - textContent only
// Each rule runs on the real file, then against mutants that each must be caught.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
let failed = 0;
let passed = 0;
function fail(msg) { failed += 1; console.error("FAIL " + msg); }
function ok(cond, msg) { if (cond) { passed += 1; console.log("ok  " + msg); } else fail(msg); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const LOCK_NOTE = "This desk can't save a key yet. Nothing was saved.";
const FALLBACK = "Could not connect.";
const OWNER_ONLY = "Only the owner can connect this. Leftover email session or desk code.";
const CODES = ["keyLocked", "needsConnectSecret"];

function grabFn(src, name) {
  let i = src.indexOf("function " + name + "(");
  if (i < 0) return null;
  if (src.slice(i - 6, i) === "async ") i -= 6;
  let depth = 0;
  for (let j = src.indexOf("{", i); j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (!depth) return src.slice(i, j + 1); }
  }
  return null;
}

// The refused-save body exactly as api/connections.js sends it.
function serverRefusal() {
  const api = read("api/connections.js");
  const m = api.match(/if \(!keyPacked\) return refuse\(res, (\d+), "([^"]+)", (\{[^\n]*\})\);/);
  const r = api.match(/function refuse\(res, status, error, extra\) \{\s*return res\.status\(status\)\.json\(Object\.assign\(\{ ok: false, error: error \}, extra \|\| \{\}\)\);/);
  if (!m || !r) return null;
  const extra = vm.runInNewContext("(" + m[3] + ")", {});
  return { status: Number(m[1]), body: Object.assign({ ok: false, error: m[2] }, extra) };
}

function el(id) {
  const e = { id: id, _t: "", htmlWrites: 0, hidden: false, value: "" };
  Object.defineProperty(e, "textContent", { get() { return this._t; }, set(v) { this._t = String(v); } });
  Object.defineProperty(e, "innerHTML", { get() { return this._t; }, set(v) { this.htmlWrites += 1; this._t = String(v); } });
  return e;
}
async function run(src, status, body) {
  const fn = grabFn(src, "saveAi");
  if (!fn) throw new Error("connections.html is missing saveAi");
  const els = { "ai-flash": el("ai-flash"), "ai-key": el("ai-key"), "ai-box": el("ai-box") };
  els["ai-key"].value = "sk-test-not-a-real-key";
  let listed = 0;
  const calls = [];
  const ctx = {
    document: { getElementById: (id) => els[id] || null },
    headers: () => ({ "Content-Type": "application/json", "X-Workspace": "owner-key" }),
    listPipes: () => { listed += 1; },
    aiPick: "openai",
    fetch: (url, opts) => {
      calls.push({ url: url, opts: opts });
      return Promise.resolve({
        ok: status >= 200 && status < 300,
        status: status,
        json: () => (body === undefined ? Promise.reject(new Error("not json")) : Promise.resolve(body))
      });
    },
    Promise
  };
  vm.runInNewContext("var aiPick = this.aiPick;\n" + fn + "\nthis.go = saveAi;", ctx, { timeout: 1000 });
  await ctx.go();
  return { text: els["ai-flash"].textContent, html: els["ai-flash"].htmlWrites, hidden: els["ai-box"].hidden, listed: listed, calls: calls };
}
function noCode(text, body) {
  if (CODES.some((c) => text.indexOf(c) >= 0)) return false;
  const vals = Object.keys(body || {}).map((k) => body[k]).filter((v) => typeof v === "string" && !/\s/.test(v.trim()) && v.trim());
  if (vals.some((v) => text.indexOf(v) >= 0)) return false;
  return /\S\s+\S/.test(text);
}

async function suite(src, say) {
  const bad = [];
  const good = (c, m) => { if (!c) bad.push(m); else if (say) say(m); };
  const real = serverRefusal();
  good(!!real && real.body.note === LOCK_NOTE && real.body.error === "keyLocked", "api/connections.js still refuses with keyLocked + the plain note (read from the file)");
  if (!real) return bad;

  // 1. the real refused body
  let r = await run(src, real.status, real.body);
  good(r.calls.length === 1 && r.calls[0].url === "/api/connections", "save posts to /api/connections");
  good(r.text === LOCK_NOTE, "refused save shows the server note ('" + r.text + "')");
  good(noCode(r.text, real.body), "refused save shows no code ('" + r.text + "')");
  good(r.html === 0, "refused save: textContent only");
  good(r.hidden === false && r.listed === 0, "refused save keeps the key box open and does not reload the list");

  // 2. code with no note -> existing plain line
  const noNote = { ok: false, error: "keyLocked", reason: "needsConnectSecret" };
  r = await run(src, 409, noNote);
  good(r.text === FALLBACK, "refused with no note falls back to '" + FALLBACK + "' ('" + r.text + "')");
  good(noCode(r.text, noNote), "refused with no note shows no code");

  // 3. empty / code-shaped note -> existing plain line
  for (const note of ["", "   ", "needsConnectSecret", "keyLocked", 42, null]) {
    const b = { ok: false, error: "keyLocked", reason: "needsConnectSecret", note: note };
    r = await run(src, 409, b);
    good(r.text === FALLBACK && noCode(r.text, b), "note " + JSON.stringify(note) + " is not shown; falls back ('" + r.text + "')");
  }

  // 4. plain-words error the server already sends (no note) still shows
  const owner = { error: OWNER_ONLY };
  r = await run(src, 403, owner);
  good(r.text === OWNER_ONLY, "plain-words refusal still shows ('" + r.text + "')");

  // 5. note wins over a plain error too
  const both = { ok: false, error: "Some plain error words.", note: LOCK_NOTE };
  r = await run(src, 409, both);
  good(r.text === LOCK_NOTE, "note is shown before error ('" + r.text + "')");

  // 6. not JSON
  r = await run(src, 500, undefined);
  good(r.text === FALLBACK, "non-JSON refusal falls back ('" + r.text + "')");

  // 7. a saved key is unchanged
  r = await run(src, 200, { ok: true, next: "Connected. Drafts only." });
  good(r.text === "Connected. Drafts only." && r.hidden === true && r.listed === 1, "a saved key still shows next, hides the box, and reloads the list");
  r = await run(src, 200, { ok: true });
  good(r.text === "Connected.", "a saved key with no next still says Connected.");
  good(r.html === 0, "saved: textContent only");
  return bad;
}

function staticChecks(page) {
  const fn = grabFn(page, "saveAi") || "";
  ok(!!fn, "connections.html has saveAi");
  ok(!/innerHTML/.test(fn), "saveAi never writes innerHTML");
  ok(!/keyLocked|needsConnectSecret/.test(page), "connections.html names no refusal code");
  ok(/check-connections-save-note\.js/.test(read("scripts/check-pipes-switch.js")), "check-pipes-switch.js runs this check (npm test)");
}

const NEW_LINE = '(plain(data.note) || plain(data.error) || "Could not connect.")';
const MUTANTS = [
  ["Connections shows keyLocked (old line)", [[NEW_LINE, '(data.error || "Could not connect.")']]],
  ["Connections does not show the note", [["plain(data.note) || plain(data.error)", "plain(data.error)"]]],
  ["Connections shows the error before the note", [["plain(data.note) || plain(data.error)", "plain(data.error) || plain(data.note)"]]],
  ["a raw code leaks: error shown unfiltered", [["plain(data.error) || \"Could not connect.\"", "data.error || \"Could not connect.\""]]],
  ["a raw code leaks: reason shown", [["plain(data.note) || plain(data.error)", "plain(data.note) || data.reason || plain(data.error)"]]],
  ["a raw code leaks: any one-word note shown", [["/\\S\\s+\\S/.test(t.trim())", "t.trim()"]]],
  ["Connections paints the flash with innerHTML", [["if (flash) flash.textContent = r.ok ? (data.next", "if (flash) flash.innerHTML = r.ok ? (data.next"]]],
  ["a saved key stops showing next", [["r.ok ? (data.next || \"Connected.\")", "r.ok ? \"Connected.\""]]]
];
function mutate(src, reps) {
  let s = src;
  for (const [a, b] of reps) { if (s.indexOf(a) < 0) return null; s = s.split(a).join(b); }
  return s;
}

async function main() {
  const PAGE = read("connections.html");
  staticChecks(PAGE);
  const base = await suite(PAGE, (m) => ok(true, m));
  base.forEach((m) => fail(m));
  let caught = 0;
  for (const [name, reps] of MUTANTS) {
    const S = mutate(PAGE, reps);
    if (S === null) { fail("mutant does not apply: " + name); continue; }
    let bad;
    try { bad = await suite(S, null); } catch (e) { bad = ["threw " + e.message]; }
    if (bad.length) { caught += 1; console.log("ok  mutant caught: " + name + " (" + bad[0] + ")"); }
    else fail("mutant NOT caught: " + name);
  }
  console.log("mutants caught " + caught + "/" + MUTANTS.length);
  if (caught !== MUTANTS.length) fail("every mutant must be caught (" + caught + "/" + MUTANTS.length + ")");
  if (failed) { console.error("check-connections-save-note: " + passed + " ok, " + failed + " failed"); process.exit(1); }
  console.log("PASS check-connections-save-note: " + passed + " ok, 0 failed");
}
main().catch((e) => { console.error("FAIL " + (e && e.stack || e)); process.exit(1); });
