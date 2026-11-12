#!/usr/bin/env node
require("./_env-guard");
// Account-level pack ownership: install-pack with the owner's confirm: "Yes" records
// the pack on that desk's account. Later reads return owned:true for any desk on that
// account, and false for a stranger or a desk on a different account. Owning never
// auto-activates another desk; that desk still needs its own Yes. buy-pack does not
// record ownership and its reply matches main for the same input. charged stays false.
// Collect stays HOLD. No purchase or money fields. Fails on main (owned is hardcoded false).
// Usage: node scripts/check-pack-owned-account.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
process.env.AIA_STORE_PATH = path.join(os.tmpdir(), "aia-pack-owned-" + Date.now() + "-" + process.pid + ".json");
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
async function call(handler, method, headers, body, query) {
  const res = mockRes();
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  ["log", "error", "warn", "info"].forEach((k) => { console[k] = function () {}; });
  try {
    await handler({ method, headers: headers || {}, body: body == null ? {} : body, query: query || {}, url: "" }, res);
  } finally {
    Object.assign(console, orig);
  }
  return res;
}

const MONEY_KEYS = ["price", "ask", "charged", "purchase", "purchases", "receipt", "paid", "amount", "cost", "payout", "fee"];
function moneyBits(obj, prefix) {
  const hits = [];
  const walk = (v, p) => {
    if (!v || typeof v !== "object") return;
    Object.keys(v).forEach((k) => {
      const pathK = p ? p + "." + k : k;
      const low = k.toLowerCase();
      if (MONEY_KEYS.indexOf(low) >= 0) hits.push(pathK + "=" + JSON.stringify(v[k]));
      if (v[k] && typeof v[k] === "object") walk(v[k], pathK);
    });
  };
  walk(obj, prefix || "");
  return hits;
}
function packOf(res, id) {
  const body = res && res.body;
  if (!body) return null;
  if (body.pack && (!id || body.pack.id === id || body.pack.packId === id)) return body.pack;
  const rows = body.packs || [];
  return rows.find((p) => p && (p.id === id || p.packId === id)) || null;
}
function normalizeBuy(body) {
  return JSON.stringify(body == null ? null : body)
    .replace(/setup_[a-f0-9]+/gi, "setup_X")
    .replace(/\d{4}-\d{2}-\d{2}T[0-9:.Z+-]+/g, "TS");
}
function loadMainPacks() {
  let src;
  try {
    src = execFileSync("git", ["show", "origin/main:api/_packs.js"], { cwd: root, encoding: "utf8" });
  } catch (e) {
    try { src = execFileSync("git", ["show", "844bd125e9a88c41e36e0927f3a1863cd15ceb40:api/_packs.js"], { cwd: root, encoding: "utf8" }); }
    catch (e2) { return null; }
  }
  const absApi = path.join(root, "api").split(path.sep).join("/");
  const absRoot = root.split(path.sep).join("/");
  const rewritten = src
    .replace(/require\("\.\//g, "require(\"" + absApi + "/")
    .replace(/require\("\.\.\//g, "require(\"" + absRoot + "/");
  const tmp = path.join(os.tmpdir(), "aia-packs-main-" + process.pid + ".js");
  fs.writeFileSync(tmp, rewritten);
  delete require.cache[require.resolve(tmp) === tmp ? tmp : tmp];
  try { delete require.cache[tmp]; } catch (e) {}
  return require(tmp);
}

async function main() {
  const packs = require(path.join(root, "api/_packs"));
  const lib = require(path.join(root, "api/_lib"));
  await lib.ready();
  const A = "own-a";
  const B = "own-b";
  const C = "own-c";
  const D = "own-d";
  const ANN = "acct_ann_own";
  const HAL = "acct_hal_own";
  const BUY = "acct_buy_own";
  const now = "2026-01-01T00:00:00.000Z";
  const pin = (n) => lib.hashPin(n);
  function person(id, name, role, kind, code, accountId) {
    return { id, name, role, kind, status: "approved", pin: pin(code), accountId: accountId || "", email: "", createdAt: now };
  }
  function desk(slug, accountId, people, code) {
    return { slug, biz: slug, name: slug, accountId: accountId || "", pin: pin(code), createdAt: now, people, rules: [], does: "" };
  }
  const ann = { id: ANN, name: "Ann Shop", ownerName: "Ann", email: "ann@owned.test", desks: [A, B], memberDesks: [], createdAt: now, kind: "human" };
  const hal = { id: HAL, name: "Hal", ownerName: "Hal", email: "hal@owned.test", desks: [C], memberDesks: [], createdAt: now, kind: "human" };
  const buyAcc = { id: BUY, name: "Buyer", ownerName: "Bea", email: "bea@owned.test", desks: [D], memberDesks: [], createdAt: now, kind: "human" };
  const helperAcc = { id: "acct_hel_own", name: "Hel", ownerName: "Hel", email: "hel@owned.test", desks: [], memberDesks: [A], createdAt: now, kind: "human" };
  const deskA = desk(A, ANN, [
    person("p_ann_a", "Ann", "owner", "owner", "1111", ANN),
    person("p_hel", "Hel", "employee", "helper", "5555", "acct_hel_own")
  ], "1111");
  const deskB = desk(B, ANN, [person("p_ann_b", "Ann", "owner", "owner", "2222", ANN)], "2222");
  const deskC = desk(C, HAL, [person("p_hal_c", "Hal", "owner", "owner", "3333", HAL)], "3333");
  const deskD = desk(D, BUY, [person("p_bea_d", "Bea", "owner", "owner", "4444", BUY)], "4444");
  lib.mem.accounts = [ann, hal, buyAcc, helperAcc];
  lib.mem.workspaces = [deskA, deskB, deskC, deskD];
  lib.mem.jobs = [];
  lib.mem.money = [{ id: "m_hold", amount: 1, status: "hold", charged: false }];
  lib.mem.packs = [];
  lib.mem.audit = [];
  const money0 = JSON.stringify(lib.mem.money);
  const accOf = (id) => lib.mem.accounts.find((a) => a && a.id === id);
  const ownedRows = (id) => { const a = accOf(id); return (a && Array.isArray(a.packsOwned)) ? a.packsOwned : []; };
  const pwAnn = lib.issueSession(deskA.people[0], deskA, ann, { headers: {} }, "password");
  const pwHal = lib.issueSession(deskC.people[0], deskC, hal, { headers: {} }, "password");
  const pwBea = lib.issueSession(deskD.people[0], deskD, buyAcc, { headers: {} }, "password");
  const pwHel = lib.issueSession(deskA.people[1], deskA, helperAcc, { headers: {} }, "password");
  const H = (slug, extra) => Object.assign({ "x-workspace": slug }, extra || {});
  const annH = (slug) => H(slug, { "x-session": pwAnn.token });
  const halH = H(C, { "x-session": pwHal.token });
  const beaH = H(D, { "x-session": pwBea.token });
  const helH = H(A, { "x-session": pwHel.token });

  async function install(headers, body) {
    return call(packs, "POST", headers, Object.assign({ action: "install-pack" }, body || {}));
  }
  async function buy(handler, headers, body) {
    return call(handler, "POST", headers, Object.assign({ action: "buy-pack" }, body || {}));
  }
  async function readPack(headers, id) {
    return call(packs, "GET", headers, {}, { id: id });
  }
  async function listPacks(headers) {
    return call(packs, "GET", headers, {}, {});
  }

  const PACK = "home";

  // 1. Before install, owned is false.
  const before = await readPack(annH(A), PACK);
  const beforeRow = packOf(before, PACK);
  ok(before.statusCode === 200 && beforeRow && beforeRow.owned === false, "[before] owned is false before any install (" + (beforeRow && beforeRow.owned) + ")");
  ok(!accOf(ANN).packsOwned || accOf(ANN).packsOwned.length === 0, "[before] account has no packsOwned record");

  // 2. Install without Yes: install may still land (existing path) but ownership is refused — nothing is recorded.
  const noYes = await install(annH(A), { id: PACK });
  ok(noYes.statusCode === 200 && noYes.body && noYes.body.ok === true, "[no-yes] install without Yes is not a new error (existing install still lands)");
  ok(noYes.body && noYes.body.charged === false, "[no-yes] charged is false");
  const noYesRead = await readPack(annH(A), PACK);
  const noYesPack = packOf(noYesRead, PACK) || packOf(noYes, PACK);
  ok(noYesPack && noYesPack.owned === false, "[no-yes] owned stays false — ownership is refused without Yes");
  ok(!accOf(ANN).packsOwned || accOf(ANN).packsOwned.length === 0, "[no-yes] records nothing on the account");
  ok(deskA.pack === PACK, "[no-yes] existing install path still puts the pack on this desk");

  // 3. Install with Yes -> owned:true on that desk, record written.
  const withYes = await install(annH(A), { id: PACK, confirm: "Yes" });
  ok(withYes.statusCode === 200 && withYes.body && withYes.body.ok === true, "[yes] install with Yes succeeds");
  ok(withYes.body && withYes.body.charged === false && withYes.body.collectHold && withYes.body.collectHold.hold === true && withYes.body.collectHold.charged === false, "[yes] charged false, Collect HOLD");
  ok(withYes.body && withYes.body.pack && withYes.body.pack.owned === true, "[yes] install reply pack.owned is true");
  const afterYes = await readPack(annH(A), PACK);
  const afterPack = packOf(afterYes, PACK);
  ok(afterPack && afterPack.owned === true, "[yes] GET on that desk returns owned:true");
  const listed = await listPacks(annH(A));
  const listedRow = packOf(listed, PACK);
  ok(listedRow && listedRow.owned === true, "[yes] pack list on that desk returns owned:true");
  const rows = accOf(ANN).packsOwned;
  ok(Array.isArray(rows) && rows.length === 1, "[yes] one packsOwned row (" + JSON.stringify(rows) + ")");
  ok(rows && rows[0] && rows[0].id === PACK && rows[0].desk === A && typeof rows[0].at === "string" && rows[0].at, "[yes] row shape is {id, at, desk}");
  const moneyOnRow = moneyBits(rows && rows[0], "packsOwned[0]");
  ok(moneyOnRow.length === 0, "[yes] record has no money fields (" + moneyOnRow.join(",") + ")");
  ok(!Object.prototype.hasOwnProperty.call(accOf(ANN), "purchases") && !Object.prototype.hasOwnProperty.call(accOf(ANN), "purchase") && !Object.prototype.hasOwnProperty.call(accOf(ANN), "receipts"), "[yes] account has no purchase or receipt record");
  ok(JSON.stringify(lib.mem.money) === money0, "[yes] mem.money is unchanged");
  ok(deskA.pack === PACK, "[yes] pack is active on the installing desk");

  // Dedup: a second Yes does not add another row.
  const again = await install(annH(A), { id: PACK, confirm: "Yes" });
  ok(again.statusCode === 200 && ownedRows(ANN).length === 1, "[dedup] a second Yes does not add another packsOwned row");

  // 4. Second desk on the same account: owned true, pack NOT active until its own Yes.
  ok(deskB.pack !== PACK && !deskB.pack, "[desk-b] owning does not auto-activate the other desk (pack=" + deskB.pack + ")");
  const readB = await readPack(annH(B), PACK);
  const packB = packOf(readB, PACK);
  ok(packB && packB.owned === true, "[desk-b] same-account desk reads owned:true");
  ok(ownedRows(ANN).length === 1, "[desk-b] still one record");

  // 5. Activating with Yes on desk B works.
  const actB = await install(annH(B), { id: PACK, confirm: "Yes" });
  ok(actB.statusCode === 200 && actB.body && actB.body.ok === true && actB.body.charged === false, "[desk-b] activating with Yes succeeds, charged false");
  ok(deskB.pack === PACK, "[desk-b] pack is active after its own Yes");
  ok(actB.body && actB.body.pack && actB.body.pack.owned === true, "[desk-b] activate reply owned is true");
  ok(ownedRows(ANN).length === 1, "[desk-b] activating does not duplicate the record");

  // 6. Desk on a different account: owned false, not active, cannot activate via Ann's ownership.
  ok(deskC.pack !== PACK && !deskC.pack, "[other] other-account desk is not auto-activated");
  const readC = await readPack(halH, PACK);
  const packC = packOf(readC, PACK);
  ok(packC && packC.owned === false, "[other] different account reads owned:false");
  ok(!accOf(HAL).packsOwned || accOf(HAL).packsOwned.length === 0, "[other] other account has no record");
  // A stranger (no session) also sees false.
  const stranger = await readPack({ "x-workspace": A }, PACK);
  const strangerPack = packOf(stranger, PACK);
  ok(strangerPack && strangerPack.owned === false, "[stranger] no session reads owned:false");

  // 7. Helper / non-owner cannot install or activate.
  const helBefore = JSON.stringify(ownedRows(ANN));
  const helNo = await install(helH, { id: "consign", confirm: "Yes" });
  ok(helNo.statusCode === 403, "[helper] helper cannot install (" + helNo.statusCode + ")");
  const helYes = await install(helH, { id: PACK, confirm: "Yes" });
  ok(helYes.statusCode === 403, "[helper] helper cannot activate (" + helYes.statusCode + ")");
  ok(JSON.stringify(ownedRows(ANN)) === helBefore, "[helper] helper install writes no record");
  ok(deskA.people[1] && deskA.pack === PACK, "[helper] helper did not change the desk pack beyond the owner's install");

  // 8. charged:false everywhere on the Yes path, already asserted; also body has no purchase.
  const purchaseHits = moneyBits({ pack: withYes.body && withYes.body.pack, charged: withYes.body && withYes.body.charged, collectHold: withYes.body && withYes.body.collectHold }, "yes-reply")
    .filter((h) => /purchase|receipt|paid=true|charged=true/.test(h));
  ok(purchaseHits.length === 0, "[money] install-with-Yes reply has no purchase and no charged:true (" + purchaseHits.join(",") + ")");
  ok(withYes.body && withYes.body.charged === false, "[money] top-level charged is false");

  // 9. buy-pack response unchanged vs main for the same input, and it does not record ownership.
  const mainPacks = loadMainPacks();
  ok(!!mainPacks, "[buy] loaded main's pack handler for comparison");
  // Fresh desk D, pack consign, same input on both handlers. Snapshot mem, run main, restore, run tip.
  function snapMem() {
    return JSON.stringify({
      accounts: lib.mem.accounts,
      workspaces: lib.mem.workspaces,
      jobs: lib.mem.jobs,
      money: lib.mem.money,
      packs: lib.mem.packs,
      audit: lib.mem.audit,
      sessions: lib.mem.sessions
    });
  }
  function restoreMem(raw) {
    const s = JSON.parse(raw);
    Object.keys(s).forEach((k) => { lib.mem[k] = s[k]; });
    // Re-bind local desk aliases if they were replaced — we compare via slugs.
  }
  const beforeBuy = snapMem();
  const buyBody = { id: "consign" };
  let mainBuy = { statusCode: 0, body: null };
  if (mainPacks) {
    mainBuy = await buy(mainPacks, beaH, buyBody);
  }
  const mainMem = snapMem();
  const mainOwned = (JSON.parse(mainMem).accounts.find((a) => a && a.id === BUY) || {}).packsOwned;
  restoreMem(beforeBuy);
  const tipBuy = await buy(packs, beaH, buyBody);
  const tipOwned = accOf(BUY).packsOwned;
  ok(tipBuy.statusCode === 200 && tipBuy.body && tipBuy.body.ok === true && tipBuy.body.charged === false, "[buy] tip buy-pack succeeds, charged false");
  ok((!tipOwned || tipOwned.length === 0) && (!mainOwned || mainOwned.length === 0), "[buy] buy-pack records no ownership on tip or main (" + JSON.stringify(tipOwned) + ")");
  ok(tipBuy.body && tipBuy.body.pack && tipBuy.body.pack.owned === false, "[buy] tip buy-pack pack.owned is false");
  if (mainPacks) {
    ok(mainBuy.statusCode === tipBuy.statusCode, "[buy] status matches main (" + mainBuy.statusCode + " vs " + tipBuy.statusCode + ")");
    const mainN = normalizeBuy(mainBuy.body);
    const tipN = normalizeBuy(tipBuy.body);
    ok(mainN === tipN, "[buy] buy-pack reply is byte-identical to main for the same input" + (mainN === tipN ? "" : ("\n  main " + mainN.slice(0, 400) + "\n  tip  " + tipN.slice(0, 400))));
    // A buy-pack that also sends Yes still must not record (branch is by action, not by confirm).
    restoreMem(beforeBuy);
    const tipBuyYes = await buy(packs, beaH, { id: "consign", confirm: "Yes" });
    ok(tipBuyYes.statusCode === 200 && (!accOf(BUY).packsOwned || accOf(BUY).packsOwned.length === 0), "[buy] buy-pack with confirm Yes still records nothing");
    ok(tipBuyYes.body && tipBuyYes.body.pack && tipBuyYes.body.pack.owned === false && tipBuyYes.body.charged === false, "[buy] buy-pack with Yes stays owned:false, charged:false");
    restoreMem(beforeBuy);
    const mainBuyYes = await buy(mainPacks, beaH, { id: "consign", confirm: "Yes" });
    restoreMem(beforeBuy);
    const tipBuyYes2 = await buy(packs, beaH, { id: "consign", confirm: "Yes" });
    ok(normalizeBuy(mainBuyYes.body) === normalizeBuy(tipBuyYes2.body), "[buy] buy-pack+Yes reply is byte-identical to main");
  }

  // Cross-account cannot activate via Ann's record: Hal's consign/home still off, and Ann's record is not copied.
  ok((!accOf(HAL).packsOwned || accOf(HAL).packsOwned.length === 0) && deskC.pack !== PACK, "[other] Ann's ownership does not activate or record on Hal's desk");

  console.log("assertions " + asserts);
  if (failed) { console.error("check-pack-owned-account: " + failed + " failed"); process.exit(1); }
  console.log("check-pack-owned-account: ok");
  process.exit(0);
}

main().catch((e) => { console.error("FAIL threw " + (e && e.stack || e)); process.exit(1); });
