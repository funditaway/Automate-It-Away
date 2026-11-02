#!/usr/bin/env node
require("./_env-guard");
// Pack install drops one setup card on the installing account (pack:<packId>:<desk>).
// The same pack on the same desk reuses it. A second desk gets a second card.
// GET /api/jobs returns that account's own open, stopped, and done cards for the desk.
// A helper seat, a desk-code session, and a stranger get an empty list and no oracle.
// Collect stays HOLD. charged stays false. Nothing is bought.
// Usage: node scripts/check-setup-cards-desk.js
//        node scripts/check-setup-cards-desk.js --mutate
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
const MUTATE = process.argv.indexOf("--mutate") >= 0;
if (!MUTATE) {
  process.env.AIA_STORE_PATH = path.join(os.tmpdir(), "aia-setup-cards-desk-" + Date.now() + "-" + process.pid + ".json");
  delete global.__aia;
  delete global.__aiaHydrate;
}

let failed = 0;
let asserts = 0;
function fail(msg) { console.error("FAIL " + msg); failed += 1; process.exitCode = 1; }
function pass(msg) { console.log("ok  " + msg); }
function ok(cond, msg) { asserts += 1; if (cond) pass(msg); else fail(msg); }
function finish() {
  console.log("assertions " + asserts);
  if (failed) { console.error("check-setup-cards-desk: " + failed + " failed"); process.exit(1); }
  console.log("check-setup-cards-desk: ok");
  process.exit(0);
}

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
async function call(handler, method, headers, body, query, url) {
  const res = mockRes();
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  ["log", "error", "warn", "info"].forEach((k) => { console[k] = function () {}; });
  try {
    await handler({ method, headers: headers || {}, body: body == null ? {} : body, query: query || {}, url: url || "" }, res);
  } finally {
    Object.assign(console, orig);
  }
  return res;
}
function sig(r) { return r.statusCode + " " + JSON.stringify(r.body); }
function brief(r) { return r.statusCode + " " + JSON.stringify(r.body).slice(0, 280); }
function keysOf(body) { return Object.keys(body || {}).sort().join(","); }
function step(card, id) { return card && (card.steps || []).find((s) => s && s.id === id); }

async function main() {
  const auth = require(path.join(root, "api/auth"));
  const jobs = require(path.join(root, "api/jobs"));
  const packs = require(path.join(root, "api/_packs"));
  const lib = require(path.join(root, "api/_lib"));
  await lib.ready();
  const STORE = process.env.AIA_STORE_PATH;
  const A = "desk-a";
  const B = "desk-b";
  const PIN = "desk-pin";
  const BARE = "desk-bare";
  const CAP = "desk-cap";
  const FAIL = "desk-fail";
  const ANN = "acct_ann";
  const HAL = "acct_hal";
  const now = "2026-01-01T00:00:00.000Z";
  const pin = (n) => lib.hashPin(n);
  function person(id, name, role, kind, code, accountId) {
    return { id, name, role, kind, status: "approved", pin: pin(code), accountId: accountId || "", email: "", createdAt: now };
  }
  function desk(slug, accountId, people, code) {
    return { slug, biz: slug, name: slug, accountId: accountId || "", pin: pin(code), createdAt: now, people, rules: [], does: "" };
  }
  const ann = { id: ANN, name: "Ann Shop", ownerName: "Ann", email: "ann@setup.test", desks: [A, B, PIN], memberDesks: [], createdAt: now, kind: "human" };
  const hal = { id: HAL, name: "Hal", ownerName: "Hal", email: "hal@setup.test", desks: [], memberDesks: [A], createdAt: now, kind: "human" };
  const capAcc = { id: "acct_cap", name: "Cap", ownerName: "Cap", email: "", desks: [CAP], memberDesks: [], createdAt: now, kind: "human", setupCards: [] };
  const failAcc = { id: "acct_fail", name: "Fail", ownerName: "Fail", email: "", desks: [FAIL], memberDesks: [], createdAt: now, kind: "human" };
  const deskA = desk(A, ANN, [
    person("p_ann_a", "Ann", "owner", "owner", "1111", ANN),
    person("p_hal", "Hal", "employee", "helper", "5555", HAL)
  ], "1111");
  const deskB = desk(B, ANN, [person("p_ann_b", "Ann", "owner", "owner", "2222", ANN)], "2222");
  const deskPin = desk(PIN, ANN, [person("p_ann_pin", "Ann", "owner", "owner", "3333", ANN)], "3333");
  const deskBare = desk(BARE, "", [person("p_bare", "Bea", "owner", "owner", "4444", "")], "4444");
  const deskCap = desk(CAP, "acct_cap", [person("p_cap", "Cap", "owner", "owner", "6666", "acct_cap")], "6666");
  const deskFail = desk(FAIL, "acct_fail", [person("p_fail", "Fay", "owner", "owner", "7777", "acct_fail")], "7777");
  lib.mem.accounts = [ann, hal, capAcc, failAcc];
  lib.mem.workspaces = [deskA, deskB, deskPin, deskBare, deskCap, deskFail];
  lib.mem.jobs = [];
  lib.mem.money = [{ id: "m_hold", amount: 1, status: "hold", charged: false }];
  lib.mem.packs = [];
  lib.mem.audit = [];
  const money0 = JSON.stringify(lib.mem.money);
  const acc = (id) => lib.mem.accounts.find((a) => a && a.id === id);
  const annCards = () => acc(ANN).setupCards || [];
  const pw = lib.issueSession(deskA.people[0], deskA, ann, { headers: {} }, "password");
  const deskCode = lib.issueSession(deskA.people[0], deskA, ann, { headers: {} });
  const halPw = lib.issueSession(deskA.people[1], deskA, hal, { headers: {} }, "password");
  const H = (slug, extra) => Object.assign({ "x-workspace": slug }, extra || {});
  const pwH = (slug) => H(slug, { "x-session": pw.token });
  const codeH = (slug) => H(slug, { "x-session": deskCode.token });
  const pinH = (slug, code) => H(slug, { "x-pin": code });

  async function install(action, headers, body) {
    return call(packs, "POST", headers, Object.assign({ action }, body || {}), {}, "/api/packs");
  }
  async function stepTo(headers, cardId, stepId, extra) {
    return call(auth, "POST", headers, Object.assign({ action: "setup-step", cardId, stepId, do: "done" }, extra || {}), {}, "/api/account");
  }
  async function verb(headers, cardId, doName) {
    return call(auth, "POST", headers, { action: "setup-step", cardId, do: doName }, {}, "/api/account");
  }
  function aia(name, id, extra) {
    return { filename: id + ".aia", pack: Object.assign({ name, id, does: "Draft only." }, extra || {}) };
  }

  const accountsBeforeBare = lib.mem.accounts.length;
  const bare = await install("use-pack", pinH(BARE, "4444"), { id: "home" });
  ok(bare.statusCode === 200 && bare.body && bare.body.ok === true, "[bare] pin install with no account still installs (" + brief(bare) + ")");
  ok(bare.body && bare.body.setupCard === null && bare.body.setupCardCreated === false, "[bare] setupCard is null and setupCardCreated is false");
  ok(bare.body && bare.body.charged === false && bare.body.collectHold && bare.body.collectHold.hold === true && bare.body.collectHold.charged === false, "[bare] Collect stays HOLD, charged false");
  ok(lib.mem.accounts.length === accountsBeforeBare && !lib.mem.accounts.some((a) => (a.setupCards || []).length), "[bare] no account and no card were created");
  ok(deskBare.pack === "home", "[bare] the pack is on the desk");

  const origWrite = fs.writeFileSync;
  let writes = 0;
  fs.writeFileSync = function (p) {
    if (String(p) === STORE) writes += 1;
    return origWrite.apply(fs, arguments);
  };
  let first;
  try {
    writes = 0;
    first = await install("use-pack", pwH(A), { id: "home" });
  } finally {
    fs.writeFileSync = origWrite;
  }
  ok(writes === 1, "[install] one save for the install and the card (" + writes + ")");
  const cardA = first.body && first.body.setupCard;
  ok(first.statusCode === 200 && first.body && first.body.ok === true && first.body.setupCardCreated === true && cardA && cardA.id, "[install] use-pack creates a setup card (" + brief(first) + ")");
  ok(cardA && cardA.source && cardA.source.type === "pack" && cardA.source.preview === true && cardA.bought === false && cardA.charged === false, "[install] source pack, preview, bought false, charged false");
  ok(cardA && cardA.deskId === A && step(cardA, "card.desk") && step(cardA, "card.desk").state === "done", "[install] Pick a desk is already done for this desk");
  ok(cardA && !Object.prototype.hasOwnProperty.call(cardA, "key"), "[install] the reply card is the public shape");
  ok(cardA && Array.isArray(cardA.groups) && cardA.groups.length === 1 && !cardA.groups[0].service, "[install] a pack with no service is one group");
  ok(cardA && step(cardA, "g1.connect") && step(cardA, "g1.connect").state === "skipped" && step(cardA, "g1.secret") && step(cardA, "g1.secret").state === "skipped", "[install] connect and secret skip when the pack needs no service");
  const storedA = annCards().find((c) => c.id === cardA.id);
  ok(storedA && storedA.key === "pack:home:" + A && storedA.charged === false && storedA.bought === false, "[install] stored key is pack:home:" + A);
  ok(first.body.charged === false && first.body.collectHold && first.body.collectHold.charged === false && first.body.collectHold.hold === true, "[install] reply Collect stays HOLD");

  const againBuy = await install("buy-pack", pwH(A), { id: "home" });
  ok(againBuy.statusCode === 200 && againBuy.body && againBuy.body.setupCardCreated === false && againBuy.body.setupCard && againBuy.body.setupCard.id === cardA.id, "[reuse] buy-pack on the same desk returns the same card (" + brief(againBuy) + ")");
  ok(againBuy.body && againBuy.body.charged === false && againBuy.body.setupCard.charged === false && againBuy.body.setupCard.bought === false, "[reuse] buy-pack does not charge");
  const againInstall = await install("install-pack", pwH(A), { id: "home" });
  ok(againInstall.statusCode === 200 && againInstall.body && againInstall.body.setupCardCreated === false && againInstall.body.setupCard && againInstall.body.setupCard.id === cardA.id, "[reuse] install-pack on the same desk returns the same card");
  ok(annCards().filter((c) => c.key === "pack:home:" + A).length === 1, "[reuse] one stored card for this pack on this desk");

  const second = await install("use-pack", pwH(B), { id: "home" });
  const cardB = second.body && second.body.setupCard;
  ok(second.statusCode === 200 && second.body && second.body.setupCardCreated === true && cardB && cardB.id !== cardA.id && cardB.deskId === B, "[desk] a second desk gets a second card (" + brief(second) + ")");
  ok(annCards().filter((c) => c.key === "pack:home:" + A || c.key === "pack:home:" + B).length === 2, "[desk] the two cards keep the desk in the key");
  ok(cardB && cardB.charged === false && cardB.bought === false && cardB.source && cardB.source.preview === true, "[desk] the second card is still a preview");

  const shop = await install("install-aia", pwH(A), aia("Shop pack", "shop-pack", { services: ["Shopify"] }));
  const cardShop = shop.body && shop.body.setupCard;
  ok(shop.statusCode === 200 && shop.body && shop.body.setupCardCreated === true && cardShop && cardShop.source && cardShop.source.type === "pack", "[aia] install-aia creates a card (" + brief(shop) + ")");
  ok(cardShop && cardShop.groups && cardShop.groups.length === 1 && cardShop.groups[0].service === "Shopify", "[aia] a declared service is the one group");
  ok(cardShop && step(cardShop, "g1.connect") && step(cardShop, "g1.connect").state === "todo" && step(cardShop, "g1.secret").state === "todo", "[aia] connect and secret stay open when a service is declared");
  ok(cardShop && cardShop.charged === false && cardShop.bought === false && cardShop.source.preview === true && shop.body.charged === false, "[aia] nothing bought or charged");
  ok(annCards().some((c) => c.key === "pack:shop-pack:" + A), "[aia] key is pack:shop-pack:" + A);

  const mail = await install("import-pack", pwH(A), aia("Mail pack", "mail-pack", { connections: [{ service: "Gmail", name: "Mail" }] }));
  const cardMail = mail.body && mail.body.setupCard;
  ok(mail.statusCode === 200 && mail.body && mail.body.setupCardCreated === true && cardMail && cardMail.groups && cardMail.groups[0] && cardMail.groups[0].service === "Gmail", "[import] import-pack uses a declared connection (" + brief(mail) + ")");
  ok(cardMail && cardMail.charged === false && cardMail.bought === false, "[import] import stays uncharged");

  const filePack = await install("install-file", pwH(B), aia("File pack", "file-pack"));
  const cardFile = filePack.body && filePack.body.setupCard;
  ok(filePack.statusCode === 200 && filePack.body && filePack.body.setupCardCreated === true && cardFile && cardFile.deskId === B && !cardFile.groups[0].service, "[file] install-file creates one card with no service (" + brief(filePack) + ")");

  const byPin = await install("install-aia", pinH(PIN, "3333"), aia("Pin pack", "pin-pack"));
  ok(byPin.statusCode === 200 && byPin.body && byPin.body.setupCardCreated === true && byPin.body.setupCard && byPin.body.setupCard.deskId === PIN && byPin.body.setupCard.charged === false, "[pin] a desk code on an account still gets one card (" + brief(byPin) + ")");

  const approved = await stepTo(pwH(A), cardA.id, "g1.approve", { allow: {} });
  ok(approved.statusCode === 200 && approved.body && approved.body.card && approved.body.card.charged === false, "[step] the owner approves (" + brief(approved) + ")");
  const tested = await stepTo(pwH(A), cardA.id, "g1.test", {});
  ok(tested.statusCode === 200 && tested.body && tested.body.card && tested.body.card.status === "done" && tested.body.card.charged === false, "[step] the dry run finishes the card (" + brief(tested) + ")");
  const stopped = await verb(pwH(A), cardShop.id, "stop");
  ok(stopped.statusCode === 200 && stopped.body && stopped.body.ok === true && stopped.body.card && stopped.body.card.status === "stopped", "[stop] Stop answers 200 for the owning account (" + brief(stopped) + ")");

  const gone = await install("install-aia", pwH(A), aia("Gone pack", "gone-pack"));
  const cardGone = gone.body && gone.body.setupCard;
  ok(gone.statusCode === 200 && gone.body && gone.body.setupCardCreated === true && cardGone && cardGone.id, "[kill] a card to kill (" + brief(gone) + ")");

  function ids(list) { return (list || []).map((c) => c && c.id).sort(); }
  const one = await call(jobs, "GET", pwH(A), null, {}, "/api/jobs");
  const oneIds = ids(one.body && one.body.setupCards);
  ok(one.statusCode === 200 && Array.isArray(one.body && one.body.setupCards), "[jobs] owner GET has setupCards (" + one.statusCode + ")");
  ok(oneIds.indexOf(cardA.id) >= 0 && oneIds.indexOf(cardShop.id) >= 0 && oneIds.indexOf(cardMail.id) >= 0 && oneIds.indexOf(cardGone.id) >= 0, "[jobs] open, stopped, and done cards for this desk are included (" + oneIds.join(",") + ")");
  ok(oneIds.indexOf(cardB.id) < 0 && oneIds.indexOf(byPin.body.setupCard.id) < 0, "[jobs] other desks stay off this desk's list");
  const shown = (one.body.setupCards || []).filter((c) => [cardA.id, cardShop.id, cardMail.id, cardGone.id].indexOf(c.id) >= 0);
  ok(shown.every((c) => c.href === "/account#setup-" + c.id), "[jobs] each card links to /account#setup-<id>");
  ok(shown.every((c) => !Object.prototype.hasOwnProperty.call(c, "slug") && !Object.prototype.hasOwnProperty.call(c, "key")), "[jobs] a single-desk card has no slug and no key");
  ok(shown.every((c) => c.charged === false && c.bought === false), "[jobs] listed cards stay uncharged");
  const doneCard = (one.body.setupCards || []).find((c) => c.id === cardA.id);
  const stoppedCard = (one.body.setupCards || []).find((c) => c.id === cardShop.id);
  const openCard = (one.body.setupCards || []).find((c) => c.id === cardGone.id);
  ok(doneCard && doneCard.status === "done" && stoppedCard && stoppedCard.status === "stopped" && openCard && openCard.status === "open", "[jobs] done, stopped, and open are all returned");

  const ownerKeys = keysOf(one.body);
  const asPin = await call(jobs, "GET", pinH(A, "1111"), null, {}, "/api/jobs");
  const asHelper = await call(jobs, "GET", pinH(A, "5555"), null, {}, "/api/jobs");
  const asCode = await call(jobs, "GET", codeH(A), null, {}, "/api/jobs");
  const asHalPw = await call(jobs, "GET", H(A, { "x-session": halPw.token }), null, {}, "/api/jobs");
  [asPin, asHelper, asCode, asHalPw].forEach((r, i) => {
    const name = ["desk-code pin", "helper pin", "desk-code session", "helper password"][i];
    ok(r.statusCode === 200 && Array.isArray(r.body && r.body.setupCards) && r.body.setupCards.length === 0, "[hide] " + name + " gets setupCards [] (" + r.statusCode + " " + (r.body && r.body.setupCards && r.body.setupCards.length) + ")");
    ok(keysOf(r.body) === ownerKeys, "[hide] " + name + " has the same jobs shape");
    ok(r.body && r.body.count == null && JSON.stringify(r.body).indexOf(cardA.id) < 0 && JSON.stringify(r.body).indexOf(cardShop.id) < 0, "[hide] " + name + " leaks no count and no card");
  });
  ok(sig(asHelper) === sig(asCode) || (asHelper.body && asCode.body && keysOf(asHelper.body) === keysOf(asCode.body) && JSON.stringify(asHelper.body.setupCards) === JSON.stringify(asCode.body.setupCards)), "[hide] helper and desk-code agree on setup cards");

  const strangerA = await call(jobs, "GET", H(A), null, {}, "/api/jobs");
  const strangerBare = await call(jobs, "GET", H(BARE), null, {}, "/api/jobs");
  const wrongPin = await call(jobs, "GET", pinH(A, "0000"), null, {}, "/api/jobs");
  const strangerMissing = await call(jobs, "GET", H("no-such-desk"), null, {}, "/api/jobs");
  ok(sig(strangerA) === sig(strangerBare) && sig(strangerA) === sig(wrongPin) && sig(strangerA) === sig(strangerMissing), "[stranger] a desk with cards matches a desk without, a wrong code, and a missing desk (" + sig(strangerA) + ")");
  ok(JSON.stringify(strangerA.body).indexOf(cardA.id) < 0 && strangerA.body && strangerA.body.count == null && strangerA.body.setupCards == null, "[stranger] no card, no count, no setupCards field");

  const killed = await verb(pwH(A), cardGone.id, "kill");
  ok(killed.statusCode === 200 && killed.body && killed.body.ok === true && killed.body.card && killed.body.card.status === "killed", "[kill] Kill answers 200 for the owning account (" + brief(killed) + ")");
  const afterKill = await call(jobs, "GET", pwH(A), null, {}, "/api/jobs");
  const afterIds = ids(afterKill.body && afterKill.body.setupCards);
  ok(afterKill.statusCode === 200 && afterIds.indexOf(cardGone.id) < 0 && afterIds.indexOf(cardA.id) >= 0 && afterIds.indexOf(cardShop.id) >= 0, "[jobs] a killed card is left off and the others stay (" + afterIds.join(",") + ")");

  const revived = await install("install-aia", pwH(A), aia("Gone pack", "gone-pack"));
  ok(revived.statusCode === 200 && revived.body && revived.body.setupCardCreated === true && revived.body.setupCard && revived.body.setupCard.id !== cardGone.id && revived.body.setupCard.status === "open", "[reuse] a killed card does not block a new one (" + brief(revived) + ")");
  ok(annCards().filter((c) => c.key === "pack:gone-pack:" + A && c.status !== "killed").length === 1, "[reuse] one live card for that key");

  fs.writeFileSync = function (p) {
    if (String(p) === STORE) writes += 1;
    return origWrite.apply(fs, arguments);
  };
  const cardsSnap = JSON.stringify(lib.mem.accounts.map((a) => a.setupCards || []));
  let bytes0 = Buffer.from("");
  try { bytes0 = fs.readFileSync(STORE); } catch (e) { bytes0 = Buffer.from(""); }
  writes = 0;
  let all, viaQueue, pinAll, helperAll, strangerAll, halAll;
  try {
    all = await call(jobs, "GET", pwH(A), null, { desks: "all" }, "/api/jobs?desks=all");
    viaQueue = await call(jobs, "GET", pwH(A), null, { queue: "1" }, "/api/jobs?queue=1");
    pinAll = await call(jobs, "GET", codeH(A), null, { desks: "all" }, "/api/jobs?desks=all");
    helperAll = await call(jobs, "GET", pinH(A, "5555"), null, { desks: "all" }, "/api/jobs?desks=all");
    strangerAll = await call(jobs, "GET", H(A), null, { desks: "all" }, "/api/jobs?desks=all");
    halAll = await call(jobs, "GET", H(A, { "x-session": halPw.token }), null, { desks: "all" }, "/api/jobs?queue=1");
    await call(jobs, "GET", pwH(A), null, {}, "/api/jobs");
    await call(jobs, "GET", pinH(A, "1111"), null, {}, "/api/jobs");
    await call(jobs, "GET", pinH(A, "5555"), null, {}, "/api/jobs");
  } finally {
    fs.writeFileSync = origWrite;
  }
  ok(writes === 0, "[read] GET made zero store writes (" + writes + ")");
  let bytes1 = Buffer.from("");
  try { bytes1 = fs.readFileSync(STORE); } catch (e) { bytes1 = Buffer.from(""); }
  ok(Buffer.compare(bytes0, bytes1) === 0, "[read] store file unchanged");
  ok(JSON.stringify(lib.mem.accounts.map((a) => a.setupCards || [])) === cardsSnap, "[read] setup cards in memory unchanged");
  ok(JSON.stringify(lib.mem.money) === money0, "[read] Collect money rows unchanged");
  ok(all.statusCode === 200 && sig(all) === sig(viaQueue), "[all] ?queue=1 matches ?desks=all (" + all.statusCode + ")");
  const allCards = (all.body && all.body.setupCards) || [];
  const slugs = allCards.map((c) => c && c.slug).filter(Boolean);
  ok(allCards.length > 0 && allCards.every((c) => c && c.slug === c.deskId && c.href === "/account#setup-" + c.id), "[all] every card is tagged with its desk slug (" + slugs.join(",") + ")");
  ok(allCards.some((c) => c && c.slug === A && c.id === cardA.id) && allCards.some((c) => c && c.slug === B && c.id === cardB.id), "[all] both desks' cards are included");
  ok(!allCards.some((c) => c && c.id === cardGone.id), "[all] the killed card stays off");
  const returned = ((all.body && all.body.desks) || []).map((d) => d && d.slug);
  ok(allCards.every((c) => returned.indexOf(c.slug) >= 0), "[all] cards are only for desks the queue returned (" + returned.join(",") + ")");
  ok(sig(pinAll) === sig(helperAll) && sig(pinAll) === sig(strangerAll), "[all] desk-code, helper, and stranger share one refusal (" + sig(pinAll) + ")");
  ok(JSON.stringify(pinAll.body).indexOf(cardA.id) < 0 && pinAll.body && pinAll.body.count == null && pinAll.body.setupCards == null, "[all] the refusal has no cards and no count");
  ok(halAll.statusCode === 200 && Array.isArray(halAll.body && halAll.body.setupCards) && halAll.body.setupCards.length === 0 && JSON.stringify(halAll.body).indexOf(cardA.id) < 0, "[all] a helper account does not receive the owner's cards (" + halAll.statusCode + ")");

  const fakeId = "setup_no_such_card";
  const beforeOracle = JSON.stringify(annCards());
  const probes = [];
  probes.push(["helper pin real", await verb(pinH(A, "5555"), cardA.id, "stop")]);
  probes.push(["helper pin missing", await verb(pinH(A, "5555"), fakeId, "stop")]);
  probes.push(["helper password real", await verb(H(A, { "x-session": halPw.token }), cardA.id, "kill")]);
  probes.push(["helper password missing", await verb(H(A, { "x-session": halPw.token }), fakeId, "kill")]);
  probes.push(["desk-code real", await verb(codeH(A), cardA.id, "kill")]);
  probes.push(["desk-code missing", await verb(codeH(A), fakeId, "stop")]);
  probes.push(["stranger real", await verb(H(A), cardA.id, "stop")]);
  probes.push(["owner missing", await verb(pwH(A), fakeId, "stop")]);
  const oracleSig = sig(probes[0][1]);
  ok(probes.every((row) => sig(row[1]) === oracleSig), "[oracle] helper, desk-code, stranger, and a missing card share one reply (" + probes.map((row) => row[0] + "=" + row[1].statusCode).join(", ") + ")");
  ok(oracleSig.indexOf("404") === 0 && probes[0][1].body && probes[0][1].body.ok === false && probes[0][1].body.error === "No setup card like that." && Object.keys(probes[0][1].body).length === 2, "[oracle] the shared reply is a missing card");
  ok(JSON.stringify(annCards()) === beforeOracle, "[oracle] those calls change no card");
  const still = annCards().find((c) => c.id === cardA.id);
  ok(still && still.status === "done", "[oracle] the owner's card was not stopped or killed");

  const openB = await verb(pwH(B), cardB.id, "stop");
  ok(openB.statusCode === 200 && openB.body && openB.body.card && openB.body.card.status === "stopped", "[stop] Stop on the other desk is 200 (" + brief(openB) + ")");

  for (let i = capAcc.setupCards.length; i < 50; i++) {
    capAcc.setupCards.push({ id: "setup_pad_" + i, key: "pad:" + i, status: "open", deskId: "nowhere", bought: false, charged: false, steps: [], groups: [], source: { type: "pack", id: "pad", name: "Pad", preview: true } });
  }
  const capped = await install("install-aia", pinH(CAP, "6666"), aia("Cap pack", "cap-pack"));
  ok(capped.statusCode === 200 && capped.body && capped.body.ok === true && capped.body.setupCard === null && capped.body.setupCardCreated === false, "[cap] install still succeeds with setupCard null (" + brief(capped) + ")");
  ok(capped.body && typeof capped.body.hint === "string" && /setup card/i.test(capped.body.hint) && capped.body.charged === false, "[cap] the reply says no setup card was added (" + (capped.body && capped.body.hint) + ")");
  ok(capAcc.setupCards.length === 50 && !capAcc.setupCards.some((c) => c && c.key === "pack:cap-pack:" + CAP), "[cap] no card was stored");
  ok(deskCap.pack === "cap-pack", "[cap] the pack is on the desk");

  const failBefore = JSON.stringify(failAcc.setupCards || null);
  fs.writeFileSync = function () { throw new Error("disk full"); };
  let failedSave;
  try {
    failedSave = await install("use-pack", pinH(FAIL, "7777"), { id: "home" });
  } finally {
    fs.writeFileSync = origWrite;
  }
  ok(failedSave.statusCode === 200 && failedSave.body && failedSave.body.ok === true && failedSave.body.setupCard === null && failedSave.body.setupCardCreated === false, "[save] a failed save still answers the install and keeps no card (" + brief(failedSave) + ")");
  ok(JSON.stringify(failAcc.setupCards || null) === failBefore, "[save] memory has no half card");
  ok(failedSave.body && failedSave.body.charged === false, "[save] the failed install is not a charge");
  ok(lib.mem.accounts.every((a) => (a.setupCards || []).every((c) => c && c.charged === false && c.bought === false)), "[money] every setup card says charged false and bought false");
  ok(JSON.stringify(lib.mem.money) === money0, "[money] no money row was written");

  try { fs.rmSync(STORE, { force: true }); } catch (e) {}
}

const MUTANTS = [
  ["drop the owner-only filter", "api/jobs.js",
    "  const session = queueSession(req);\n  if (!session || !session.accountId) return null;\n  if (!shop || !shop.slug) return null;\n  return (mem.accounts || []).find((a) => a && a.id === session.accountId) || null;",
    "  const session = queueSession(req);\n  const accountId = (session && session.accountId) || (shop && shop.accountId) || \"\";\n  if (!accountId) return null;\n  if (!shop || !shop.slug) return null;\n  return (mem.accounts || []).find((a) => a && a.id === accountId) || null;"],
  ["drop the killed filter", "api/jobs.js",
    "    if (card.status !== \"open\" && card.status !== \"stopped\" && card.status !== \"done\") continue;\n",
    ""],
  ["drop the reuse-by-key", "api/_account-connect.js",
    "  const have = cardsOf(acc).find((c) => c && c.key === key && c.status !== \"killed\");\n  if (have) return { card: have, created: false, capped: false };\n",
    ""],
  ["wrong key (no desk in key)", "api/_account-connect.js",
    "  return \"pack:\" + id + \":\" + slug;",
    "  return \"pack:\" + id;"],
  ["drop slug tag on ?desks=all", "api/jobs.js",
    "    if (tag) pub.slug = deskSlug;\n",
    ""],
  ["let GET call save", "api/jobs.js",
    "async function setupCardsPayload(req, shop, tag) {\n  const acc = accountForSetupRead(req, shop);\n  return listSetupCards(acc, shop && shop.slug, tag);\n}",
    "async function setupCardsPayload(req, shop, tag) {\n  await save();\n  const acc = accountForSetupRead(req, shop);\n  return listSetupCards(acc, shop && shop.slug, tag);\n}"],
  ["leak a count/403 for helper or desk-code", "api/jobs.js",
    "async function setupCardsPayload(req, shop, tag) {\n  const acc = accountForSetupRead(req, shop);\n  return listSetupCards(acc, shop && shop.slug, tag);\n}",
    "async function setupCardsPayload(req, shop, tag) {\n  const acc = accountForSetupRead(req, shop);\n  if (!acc) {\n    const count = (mem.accounts || []).reduce(function (n, a) { return n + ((a && a.setupCards) || []).length; }, 0);\n    return { leak: true, status: 403, count: count };\n  }\n  return listSetupCards(acc, shop && shop.slug, tag);\n}"],
  ["setup-step oracle for a helper (404 vs other)", "api/_account-connect.js",
    "    const card = cardsOf(acc).find((c) => c.id === String(body.cardId || \"\"));\n    if (!card) return refuse(res, 404, \"No setup card like that.\");",
    "    const card = cardsOf(acc).find((c) => c.id === String(body.cardId || \"\"));\n    if (!card) {\n      const elsewhere = (lib.mem.accounts || []).some((a) => (a.setupCards || []).some((c) => c && c.id === String(body.cardId || \"\")));\n      return refuse(res, elsewhere ? 403 : 404, \"No setup card like that.\");\n    }"],
  ["charged true", "api/_account-connect.js",
    "    bought: false,\n    charged: false,",
    "    bought: false,\n    charged: true,"],
  ["Stop/Kill not 200", "api/_account-connect.js",
    "      return res.status(200).json(out);",
    "      return res.status(409).json(out);"]
];

function runMutants() {
  const { spawnSync } = require("child_process");
  const skip = new Set([".git", "node_modules"]);
  const copy = (src, dst) => {
    fs.mkdirSync(dst, { recursive: true });
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
      if (skip.has(e.name)) continue;
      const s = path.join(src, e.name);
      const d = path.join(dst, e.name);
      if (e.isDirectory()) copy(s, d);
      else if (e.isFile()) fs.copyFileSync(s, d);
    }
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aia-setup-mut-"));
  copy(root, dir);
  if (fs.existsSync(path.join(root, "node_modules"))) fs.symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"));
  const run = () => {
    const h = fs.mkdtempSync(path.join(os.tmpdir(), "aia-setup-home-"));
    return spawnSync(process.execPath, [path.join(dir, "scripts/check-setup-cards-desk.js")], {
      cwd: dir,
      env: { PATH: process.env.PATH || "", HOME: h, TMPDIR: h },
      encoding: "utf8",
      timeout: 120000
    });
  };
  const base = run();
  if (base.status !== 0) {
    console.error("unmutated check fails in the copy:\n" + (base.stdout + base.stderr).slice(-2500));
    process.exit(1);
  }
  let caught = 0;
  let total = 0;
  let bad = 0;
  for (const [name, file, find, repl] of MUTANTS) {
    const p = path.join(dir, file);
    const orig = fs.readFileSync(p, "utf8");
    if (orig.indexOf(find) < 0) { console.log(name + " | MISSED | ANCHOR GONE"); bad += 1; continue; }
    if (orig.indexOf(find) !== orig.lastIndexOf(find)) { console.log(name + " | MISSED | ANCHOR NOT UNIQUE"); bad += 1; continue; }
    fs.writeFileSync(p, orig.replace(find, repl));
    const r = run();
    fs.writeFileSync(p, orig);
    const first = ((r.stdout || "") + "\n" + (r.stderr || "")).split("\n").find((l) => l.indexOf("FAIL") === 0) || "";
    total += 1;
    if (r.status) { caught += 1; console.log(name + " | CAUGHT | " + first.slice(0, 180)); }
    else console.log(name + " | MISSED | SURVIVED");
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log("SCORE " + caught + "/" + total + " caught" + (bad ? " (" + bad + " anchors bad)" : ""));
  process.exit(caught === total && !bad ? 0 : 1);
}

if (MUTATE) runMutants();
else main().then(finish).catch((e) => { console.error("FAIL crash " + (e && e.stack || e)); process.exit(1); });
