#!/usr/bin/env node
// Proves seat ids stay unique on a desk even when many invites land in the same millisecond.
// Seat ids are "p_" + base36 time + 12 hex chars from crypto.randomBytes(6). A clash with any seat
// already on the desk re-rolls. Stored seats (p_owner, old time-only ids) are never rewritten.
// Runs the real handlers against a temp store with Date.now stubbed. No network.
const os = require("os");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
process.env.AIA_STORE_PATH = path.join(os.tmpdir(), "aia-seat-id-unique-" + Date.now() + "-" + process.pid + ".json");
delete global.__aia;
delete global.__aiaHydrate;

let failed = 0;
let asserts = 0;
function fail(msg) { console.error("FAIL " + msg); failed += 1; process.exitCode = 1; }
function pass(msg) { console.log("ok  " + msg); }
function ok(cond, msg) { asserts += 1; if (cond) pass(msg); else fail(msg); }

function mockRes() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    getHeader(k) { return this.headers[String(k).toLowerCase()]; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    end(b) { if (b !== undefined && this.body == null) this.body = b; return this; }
  };
}
async function call(handler, method, headers, body) {
  const res = mockRes();
  await handler({ method, headers: headers || {}, body: body || {}, query: {}, url: "/api/admin" }, res);
  return res;
}

// New ids: p_ + base36 ms (8-9 chars today) + exactly 12 lowercase hex chars.
const NEW_ID = /^p_[0-9a-z]{8,9}[0-9a-f]{12}$/;
// Any seat id the desk accepts: new ids, old time-only ids, p_owner.
const ANY_ID = /^p_[0-9a-z]+$/;

async function main() {
  const auth = require(path.join(root, "api/auth"));
  const admin = require(path.join(root, "api/admin"));
  const lib = require(path.join(root, "api/_lib"));
  const account = require(path.join(root, "api/_account"));
  await lib.ready();

  const S = "siu-desk";
  const opened = await call(auth, "POST", { "x-workspace": S }, { action: "open", slug: S, biz: S, name: "Ola", pin: "1111", email: "ola@x.test" });
  const tok = opened.body && opened.body.session && opened.body.session.token;
  ok(opened.statusCode === 201 && !!tok, "[setup] owner Ola opens her desk");
  const ws = lib.mem.workspaces.find((w) => w && w.slug === S);
  const ownerHdr = { "x-workspace": S, "x-pin": "1111" };

  // Two stored seats from before this change: an old time-only id and a hand-made p_owner twin check.
  const FROZEN = 1790000000000; // fixed ms for every stub below
  const oldId = "p_" + FROZEN.toString(36);
  ws.people.push({ id: oldId, name: "Old Otto", role: "employee", kind: "helper", pin: lib.hashPin("7070"), status: "approved", createdAt: "2026-01-01T00:00:00.000Z" });
  const ownerSeat = ws.people.find((p) => lib.isOwner(p));
  ok(!!ownerSeat && ANY_ID.test(ownerSeat.id), "[setup] owner seat keeps its stored id (" + (ownerSeat && ownerSeat.id) + ")");
  const before = JSON.stringify(ws.people);
  const beforeIds = ws.people.map((p) => p.id);
  const beforeRefs = ws.people.slice();

  // 1. Many invites through the real admin door, all in the same millisecond.
  const realNow = Date.now;
  Date.now = () => FROZEN;
  const made = [];
  try {
    for (let i = 0; i < 40; i += 1) {
      const r = await call(admin, "POST", ownerHdr, { action: "invite", name: "Helper " + i, pin: String(2000 + i), kind: "helper" });
      made.push(r);
    }
  } finally { Date.now = realNow; }
  ok(made.every((r) => r.statusCode === 201 && r.body && r.body.ok), "[same-ms] 40 owner invites in one ms all answer 201");
  const newIds = made.map((r) => r.body && r.body.person && r.body.person.id);
  ok(new Set(newIds).size === 40, "[same-ms] 40 invites in one ms get 40 distinct seat ids (got " + new Set(newIds).size + ")");
  const allIds = ws.people.map((p) => p.id);
  ok(new Set(allIds).size === allIds.length, "[same-ms] every seat id on the desk is distinct (" + allIds.length + " seats)");
  ok(newIds.every((id) => !beforeIds.includes(id)), "[same-ms] no new id reuses a stored id (old time-only id or owner seat)");
  ok(newIds.every((id) => typeof id === "string" && NEW_ID.test(id)), "[format] every new id matches " + NEW_ID);
  ok(newIds.every((id) => id.startsWith("p_" + FROZEN.toString(36))), "[format] new ids keep p_ + base36 time first");
  ok(allIds.every((id) => ANY_ID.test(id)), "[format] every seat id on the desk keeps the p_ shape");

  // 2. Existing seats unchanged, and old ids still work by exact id.
  ok(JSON.stringify(ws.people.slice(0, beforeIds.length)) === before, "[existing] stored seats are byte-identical after 40 invites");
  ok(beforeRefs.every((p, i) => ws.people[i] === p), "[existing] stored seats are the same objects, in place (not copied or rewritten)");
  const deny = await call(admin, "POST", ownerHdr, { action: "deny", id: oldId });
  ok(deny.statusCode === 200 && deny.body && deny.body.person && deny.body.person.id === oldId, "[existing] an old time-only id still resolves (deny " + oldId + ")");
  const hit = ws.people.filter((p) => p.id === oldId);
  ok(hit.length === 1 && hit[0].status === "denied" && hit[0].name === "Old Otto", "[existing] only that old seat changed");

  // 3. Unit: newSeatId with Date.now frozen, 500 mints on a growing desk, all unique.
  ok(typeof account.newSeatId === "function", "[unit] _account exports newSeatId");
  const row = { slug: "siu-unit", people: [{ id: "p_owner", role: "owner" }] };
  Date.now = () => FROZEN;
  try {
    for (let i = 0; i < 500; i += 1) row.people.push({ id: account.newSeatId(row) });
  } finally { Date.now = realNow; }
  const uIds = row.people.map((p) => p.id);
  ok(new Set(uIds).size === 501, "[unit] 500 mints in one ms on one desk: all distinct, none is p_owner");
  ok(uIds.slice(1).every((id) => NEW_ID.test(id)), "[unit] 500 mints all match " + NEW_ID);

  // 4. Forced RNG collision: randomBytes hands back a suffix already on the desk; the mint re-rolls.
  const realRB = crypto.randomBytes;
  const A6 = Buffer.from("aaaaaaaaaaaa", "hex");
  const B6 = Buffer.from("bbbbbbbbbbbb", "hex");
  const taken = "p_" + FROZEN.toString(36) + "aaaaaaaaaaaa";
  const crow = { slug: "siu-coll", people: [{ id: "p_owner", role: "owner" }, { id: taken }] };
  let rolls = 0;
  let got = "";
  Date.now = () => FROZEN;
  crypto.randomBytes = function (n, cb) {
    if (n !== 6 || cb) return realRB.apply(crypto, arguments);
    rolls += 1;
    return rolls <= 3 ? Buffer.from(A6) : Buffer.from(B6);
  };
  try { got = account.newSeatId(crow); } catch (e) { got = "THREW " + e.message; } finally { crypto.randomBytes = realRB; Date.now = realNow; }
  ok(got === "p_" + FROZEN.toString(36) + "bbbbbbbbbbbb", "[collision] a clash with a seat on the desk re-rolls (got " + got + ")");
  ok(rolls === 4, "[collision] it rolled until free: 3 clashes + 1 fresh (rolls=" + rolls + ")");
  ok(crow.people.length === 2 && crow.people[1].id === taken, "[collision] the clashing seat is left alone");

  // Same through the real admin door: RNG returns the suffix of a seat already on the desk.
  const clashId = newIds[0];
  const clashHex = Buffer.from(clashId.slice(-12), "hex");
  let drolls = 0;
  Date.now = () => FROZEN;
  crypto.randomBytes = function (n, cb) {
    if (n !== 6 || cb) return realRB.apply(crypto, arguments);
    drolls += 1;
    return drolls === 1 ? Buffer.from(clashHex) : realRB.call(crypto, 6);
  };
  let r2;
  try { r2 = await call(admin, "POST", ownerHdr, { action: "invite", name: "Clash Cy", pin: "3131", kind: "helper" }); } finally { crypto.randomBytes = realRB; Date.now = realNow; }
  const cyId = r2 && r2.body && r2.body.person && r2.body.person.id;
  ok(r2 && r2.statusCode === 201 && cyId && cyId !== clashId && NEW_ID.test(cyId), "[collision] admin invite whose first roll clashes gets a fresh id (" + cyId + ")");
  ok(ws.people.filter((p) => p.id === clashId).length === 1, "[collision] the clashed id is still on exactly one seat");

  // 5. Same-desk scope: a seat on another desk does not block an id (ids are per desk).
  const other = { slug: "siu-other", people: [{ id: "p_owner" }] };
  ok(NEW_ID.test(account.newSeatId(other)), "[unit] a mint on a fresh desk still matches the format");

  // 6. No other seat-id minting left on the old time-only shape.
  const files = ["api/_account.js", "api/_world-people.js"];
  const oldMint = /["']p_["']\s*\+\s*Date\.now\(\)\.toString\(36\)\s*[,}\n]/;
  files.forEach((f) => {
    const src = fs.readFileSync(path.join(root, f), "utf8");
    ok(!oldMint.test(src), "[source] " + f + " mints no time-only p_ seat id");
  });
  const wp = fs.readFileSync(path.join(root, "api/_world-people.js"), "utf8");
  ok(/id:\s*account\.newSeatId\(row\)/.test(wp), "[source] world invite fallback seat uses newSeatId(row)");

  console.log((failed ? "FAIL" : "PASS") + " check-seat-id-unique: " + (asserts - failed) + "/" + asserts + " asserts");
  try { fs.unlinkSync(process.env.AIA_STORE_PATH); } catch (e) {}
}

main().catch((e) => { console.error("FAIL crashed: " + (e && e.stack || e)); process.exitCode = 1; });
