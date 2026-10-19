#!/usr/bin/env node
// Seat ids must be unique and not built from the clock. Two (and twenty)
// joins in the same millisecond get different ids; approve/deny by id moves
// only that one seat; old stored ids still work; and if stored data already
// holds two seats with one id, approve/deny/remove refuse with a 409.
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
process.env.AIA_STORE_PATH = path.join(os.tmpdir(), "aia-seat-id-" + process.pid + "-" + Date.now() + ".json");
delete global.__aia;
delete global.__aiaHydrate;

function fail(msg) { console.error("FAIL " + msg); process.exitCode = 1; }
function pass(msg) { console.log("ok  " + msg); }
function check(ok, msg) { if (ok) pass(msg); else fail(msg); return ok; }

function mockRes() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    end(b) { if (b !== undefined && this.body == null) this.body = b; return this; }
  };
}
async function call(handler, headers, body, url) {
  const res = mockRes();
  await handler({ method: "POST", headers: headers || {}, body: body || {}, query: {}, url: url || "/api/auth" }, res);
  return res;
}

const realNow = Date.now;
const FIXED = realNow();
const timeBits = [String(FIXED), FIXED.toString(36)];
function freezeClock() { Date.now = () => FIXED; }
function thawClock() { Date.now = realNow; }
function timeFree(id) {
  const s = String(id || "");
  return !/\d{13,}/.test(s) && timeBits.every((t) => s.indexOf(t) < 0);
}

async function main() {
  const auth = require(path.join(root, "api/auth"));
  const admin = require(path.join(root, "api/admin"));
  const lib = require(path.join(root, "api/_lib"));
  await lib.ready();

  const slug = "seat-id-shop";
  const opened = await call(auth, { "x-workspace": slug }, { action: "open", slug, biz: "Seat Id Shop", name: "Owner", pin: "4821" });
  if (opened.statusCode !== 201) { fail("open desk: " + opened.statusCode + " " + JSON.stringify(opened.body)); return; }
  const token = opened.body && opened.body.session && opened.body.session.token;
  const owner = { "x-workspace": slug, "x-session": token };
  const row = () => lib.mem.workspaces.find((w) => w && w.slug === slug);
  const seat = (id) => (row().people || []).filter((p) => p && p.id === id);
  const statusOf = (id) => { const s = seat(id); return s.length === 1 ? s[0].status : "x" + s.length; };
  pass("opened a desk");

  async function join(name, pin) {
    const r = await call(auth, { "x-workspace": slug }, { action: "join", workspace: slug, name, pin, kind: "helper" });
    return r.body && r.body.person ? r.body.person.id : "";
  }

  // Two joins in the same millisecond.
  freezeClock();
  const a = await join("Ann", "1111");
  const b = await join("Bob", "2222");
  thawClock();
  check(a && b && a !== b, "two joins in the same ms get different seat ids (" + a + " vs " + b + ")");
  check(timeFree(a) && timeFree(b), "seat ids do not carry the time (" + a + ", " + b + ")");
  check(/^p_[a-z0-9]+$/.test(a) && /^p_[a-z0-9]+$/.test(b), "seat ids keep the p_ + lowercase base36 shape");

  let r = await call(auth, owner, { action: "deny", id: a });
  check(r.statusCode === 200, "deny Ann by id answers 200 (got " + r.statusCode + ")");
  check(statusOf(a) === "denied", "Ann is denied (got " + statusOf(a) + ")");
  check(statusOf(b) === "pending", "deny on Ann leaves Bob pending (got " + statusOf(b) + ")");
  r = await call(auth, owner, { action: "approve", id: b });
  check(r.statusCode === 200 && statusOf(b) === "approved", "approve Bob by id approves Bob (got " + r.statusCode + " " + statusOf(b) + ")");
  check(statusOf(a) === "denied", "approve on Bob leaves Ann denied (got " + statusOf(a) + ")");

  // Twenty joins in the same millisecond.
  freezeClock();
  const many = [];
  for (let i = 0; i < 20; i++) many.push(await join("Crew " + i, String(3000 + i)));
  thawClock();
  check(many.every(Boolean) && new Set(many).size === 20, "20 joins in the same ms get 20 different ids (" + new Set(many).size + " unique)");
  check(many.every(timeFree), "none of the 20 ids carry the time");
  r = await call(admin, owner, { action: "approve", id: many[7] }, "/api/admin");
  check(r.statusCode === 200, "admin approve one of 20 answers 200 (got " + r.statusCode + ")");
  const approved = many.filter((id) => statusOf(id) === "approved");
  check(approved.length === 1 && approved[0] === many[7], "approve on one of 20 approves only that one (" + approved.length + " approved)");
  r = await call(admin, owner, { action: "deny", id: many[3] }, "/api/admin");
  const denied = many.filter((id) => statusOf(id) === "denied");
  check(r.statusCode === 200 && denied.length === 1 && denied[0] === many[3], "deny on one of 20 denies only that one (" + denied.length + " denied)");

  // Collision check: force the random source to repeat once.
  const realRandom = crypto.randomBytes;
  let repeats = 2;
  crypto.randomBytes = function (n, cb) {
    if (n === 16 && !cb && repeats > 0) { repeats -= 1; return Buffer.alloc(16, 7); }
    return realRandom.apply(crypto, arguments);
  };
  freezeClock();
  const c1 = await join("Same Roll One", "4444");
  const c2 = await join("Same Roll Two", "5555");
  thawClock();
  crypto.randomBytes = realRandom;
  check(c1 && c2 && c1 !== c2 && seat(c1).length === 1 && seat(c2).length === 1, "a repeated random roll is re-rolled against seats on the desk (" + c1 + " vs " + c2 + ")");

  // Legacy stored ids still work.
  const legacyA = "p_" + (FIXED - 86400000).toString(36);
  const legacyB = "p_" + (FIXED - 86400001).toString(36);
  row().people.push(
    { id: legacyA, name: "Old Ann", role: "employee", kind: "helper", status: "pending", pin: lib.hashPin("6161"), createdAt: new Date().toISOString() },
    { id: legacyB, name: "Old Bob", role: "employee", kind: "helper", status: "pending", pin: lib.hashPin("6262"), createdAt: new Date().toISOString() }
  );
  r = await call(auth, owner, { action: "approve", id: legacyA });
  check(r.statusCode === 200 && statusOf(legacyA) === "approved" && statusOf(legacyB) === "pending", "legacy time id approves only that seat");
  r = await call(admin, owner, { action: "deny", id: legacyB }, "/api/admin");
  check(r.statusCode === 200 && statusOf(legacyB) === "denied" && statusOf(legacyA) === "approved", "legacy time id denies only that seat");

  // Stored data that already holds a duplicate id: refuse, change nothing.
  const dup = "p_" + (FIXED - 3600000).toString(36);
  row().people.push(
    { id: dup, name: "Dup One", role: "employee", kind: "helper", status: "pending", createdAt: new Date().toISOString() },
    { id: dup, name: "Dup Two", role: "employee", kind: "helper", status: "pending", createdAt: new Date().toISOString() }
  );
  const dupState = () => seat(dup).map((p) => p.status + ":" + p.kind).join(",");
  const before = dupState();
  const tries = [
    [auth, { action: "approve", id: dup }, "/api/auth", "auth approve"],
    [auth, { action: "deny", id: dup }, "/api/auth", "auth deny"],
    [admin, { action: "approve", id: dup }, "/api/admin", "admin approve"],
    [admin, { action: "deny", id: dup }, "/api/admin", "admin deny"],
    [admin, { action: "permit", id: dup, kind: "staff" }, "/api/admin", "admin permit"],
    [auth, { action: "remove", id: dup }, "/api/auth", "auth remove"],
    [admin, { action: "remove", id: dup }, "/api/admin", "admin remove"]
  ];
  for (const t of tries) {
    r = await call(t[0], owner, t[1], t[2]);
    const msg = String((r.body && r.body.error) || "");
    check(r.statusCode === 409 && /share that id/.test(msg), t[3] + " on a duplicate id answers 409 with a clear message (got " + r.statusCode + " " + msg + ")");
    check(seat(dup).length === 2 && dupState() === before, t[3] + " on a duplicate id changes neither seat");
  }

  // Source: no seat id is built from the clock.
  ["api/_account.js", "api/_world-people.js", "api/auth.js", "api/admin.js", "api/_lib.js"].forEach((rel) => {
    const src = fs.readFileSync(path.join(root, rel), "utf8");
    check(!/"p_"\s*\+\s*(String\()?Date\.now\(\)/.test(src) && !/"p_"\s*\+\s*new Date\(\)/.test(src), rel + " does not build a seat id from the clock");
  });
  // Shape and size: newSeatId is "p_" + 16 random bytes (128 bits) as a BigInt in base36,
  // so the random part is 1-25 lowercase base36 chars, no leading zero, value below 2^128.
  const account = require(path.join(root, "api/_account"));
  const MAX128 = BigInt(1) << BigInt(128);
  function seatValue(id) {
    const m = /^p_([1-9a-z][0-9a-z]{0,24})$/.exec(String(id || ""));
    if (!m) return null;
    let v = BigInt(0);
    for (const ch of m[1]) v = v * BigInt(36) + BigInt(parseInt(ch, 36));
    return v < MAX128 && v.toString(36) === m[1] ? v : null;
  }
  const joined = [a, b].concat(many, [c1, c2]);
  check(joined.every((id) => seatValue(id) !== null), "every joined seat id is p_ + a 128-bit base36 number (" + joined.filter((id) => seatValue(id) === null).join(",") + ")");
  if (typeof account.newSeatId !== "function") { fail("api/_account.js exports newSeatId"); return; }
  const fresh = [];
  for (let i = 0; i < 200; i++) fresh.push(account.newSeatId(row()));
  const bad = fresh.filter((id) => seatValue(id) === null);
  check(!bad.length, "200 new seat ids all match ^p_[1-9a-z][0-9a-z]{0,24}$ and decode below 2^128 (" + bad.slice(0, 3).join(",") + ")");
  check(new Set(fresh).size === 200, "200 new seat ids are all distinct (" + new Set(fresh).size + " unique)");
  const short = fresh.filter((id) => id.length - 2 < 18);
  check(!short.length, "every new seat id has at least 18 random base36 chars, so far over 64 bits (" + short.slice(0, 3).join(",") + ")");
  const top = fresh.reduce((m, id) => { const v = seatValue(id); return v !== null && v > m ? v : m; }, BigInt(0));
  check(top >= (BigInt(1) << BigInt(120)), "the 200 ids use the top bits of 128 (largest is " + top.toString(2).length + " bits)");
  const prefixes = new Map();
  let shared = "";
  for (const id of fresh) {
    const p8 = id.slice(2, 10);
    if (p8.length === 8 && prefixes.has(p8) && prefixes.get(p8) !== id) { shared = prefixes.get(p8) + " / " + id; break; }
    prefixes.set(p8, id);
  }
  check(!shared, "no two of the 200 ids share an 8-char prefix after p_ (" + shared + ")");

  const pkg = fs.readFileSync(path.join(root, "package.json"), "utf8");
  check(pkg.indexOf("scripts/check-seat-id-unique.js") >= 0, "package.json test runs this check");
}

main().then(() => {
  try { fs.unlinkSync(process.env.AIA_STORE_PATH); } catch (e) {}
  if (process.exitCode) console.error("check-seat-id-unique: FAILED");
  else console.log("check-seat-id-unique: all good");
}).catch((e) => { thawClock(); console.error("FAIL threw " + (e && e.stack || e)); process.exitCode = 1; });
