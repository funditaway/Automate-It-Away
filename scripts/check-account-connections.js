#!/usr/bin/env node
require("./_env-guard");
// Proves My account connections and setup cards on POST /api/account (no network):
// any kind of account (human, ai, si) lists, connects, and disconnects its own
// services; "connect" only saves a masked secret or a hook address, status reads
// "Saved, not tested yet" and never "connected"; the secret call answers exactly
// { ok, name, set: true }; no secret value, length, or hint is in any reply,
// history, card, log, store file, or health; strangers, waiting / denied seats,
// Desk AI seats, other-desk sessions and other accounts get a plain 404 and 0 writes;
// an AI or SI helper seat gets the same scope as a human helper on the same seat;
// connecting or a preview Pack / bundle drops ONE setup card (no duplicate on
// repeat), a bundle gets one card with a checklist; steps go in order on the
// server (approve once cannot be skipped or replayed), every checked-off step
// writes a card history entry with who and whoKind; an AI or SI account cannot
// approve allowed actions that turn off its own pauses (403, step unchanged,
// recorded); the test run is a dry run (0 outside calls, 0 model calls), spend is
// held and charged:false, 0 money rows; Stop and Kill always answer 200 mid-setup;
// a failed save answers 503 and changes nothing; every request field takes only
// its exact type ({toString}, arrays, null, numbers: a plain 400, nothing saved).
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const https = require("https");

const root = path.join(__dirname, "..");
const helperPath = path.join(root, "api/_account-connect.js");
const pre = fs.existsSync(helperPath) ? fs.readFileSync(helperPath, "utf8") : "";
if (pre.indexOf("\"connection-secret\"") < 0 || pre.indexOf("\"setup-step\"") < 0) {
  console.error("FAIL check-account-connections: no connections or setup cards on this tree (api/_account-connect.js missing)");
  process.exit(1);
}

const store = path.join(os.tmpdir(), "aia-account-connections-" + process.pid + "-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;
process.env.AIA_TLD_PROBE = "0";
delete process.env.VERCEL_ENV;
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.AIA_ACCOUNT_SECRETS_KEY;
delete global.__aia;
delete global.__aiaHydrate;

// Count every outside call. None may happen.
let outside = 0;
global.fetch = async function () { outside++; throw new Error("no network in this check"); };
const realHttps = https.request, realHttp = http.request;
https.request = function () { outside++; return realHttps.apply(this, arguments); };
http.request = function () { outside++; return realHttp.apply(this, arguments); };

let failed = false;
function fail(msg) { console.error((failed ? "FAIL " : "FAIL check-account-connections: ") + msg); failed = true; process.exitCode = 1; }
function pass(msg) { if (!failed) console.log("ok  " + msg); }

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

const replies = [];
let handler;
async function call(method, headers, body, query) {
  const res = mockRes();
  const q = Object.assign({ via: "account" }, query || {});
  const qs = Object.keys(q).map((k) => k + "=" + encodeURIComponent(q[k])).join("&");
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  ["log", "error", "warn", "info"].forEach((k) => { console[k] = function () {}; });
  try {
    await handler({ method, headers: headers || {}, body: JSON.parse(JSON.stringify(body || {})), query: q, url: "/api/auth?" + qs }, res);
  } finally {
    Object.assign(console, orig);
  }
  replies.push(JSON.stringify(res.body));
  return res;
}
const post = (hd, body) => call("POST", hd, body);
function seat(slug, pin) { return { "x-workspace": slug, "x-pin": pin }; }

async function main() {
  const lib = require(path.join(root, "api/_lib"));
  handler = require(path.join(root, "api/auth"));
  await lib.ready();
  const now = new Date().toISOString();
  const H = (p) => lib.hashPin(p);
  lib.mem.accounts = [
    { id: "acct_A", name: "Own Shop", ownerName: "Ann", email: "ann@example.test", desks: ["own-desk"], memberDesks: [], createdAt: now },
    { id: "acct_I", name: "Ai Shop", ownerName: "Ivy", desks: ["ai-desk"], memberDesks: [], createdAt: now, kind: "ai" },
    { id: "acct_S", name: "Si Shop", ownerName: "Sol", desks: ["si-desk"], memberDesks: [], createdAt: now, kind: "si" },
    { id: "acct_C", name: "Other Shop", ownerName: "Cy", desks: ["other-desk"], memberDesks: [], createdAt: now, kind: "human" },
    { id: "acct_H", name: "Human Shop", ownerName: "Hana", desks: ["human-desk"], memberDesks: [], createdAt: now, kind: "human" },
    { id: "acct_X", name: "Xa", ownerName: "Xa", desks: [], memberDesks: ["human-desk"], createdAt: now, kind: "ai" },
    { id: "acct_HH", name: "Hu", ownerName: "Hu", desks: [], memberDesks: ["human-desk"], createdAt: now }
  ];
  const owner = (id, name, pin, acc) => ({ id, name, role: "owner", kind: "owner", status: "approved", pin: H(pin), accountId: acc });
  lib.mem.workspaces = [
    { slug: "own-desk", biz: "Own Shop", name: "Ann", accountId: "acct_A", pin: H("4821"), createdAt: now,
      people: [owner("p_ann", "Ann", "4821", "acct_A"),
        { id: "p_hal", name: "Hal", role: "employee", kind: "helper", status: "approved", pin: H("5555"), accountId: "" },
        { id: "p_bot", name: "Bot", role: "employee", kind: "agent", status: "approved", pin: H("8888"), accountId: "" },
        { id: "p_den", name: "Den", role: "employee", kind: "helper", status: "denied", pin: H("6161"), accountId: "acct_HH" },
        { id: "p_wait", name: "Wai", role: "employee", kind: "helper", status: "pending", pin: H("6262"), accountId: "acct_HH" }] },
    { slug: "ai-desk", biz: "Ai Shop", name: "Ivy", accountId: "acct_I", pin: H("3131"), createdAt: now, people: [owner("p_ivy", "Ivy", "3131", "acct_I")] },
    { slug: "si-desk", biz: "Si Shop", name: "Sol", accountId: "acct_S", pin: H("3232"), createdAt: now, people: [owner("p_sol", "Sol", "3232", "acct_S")] },
    { slug: "other-desk", biz: "Other Shop", name: "Cy", accountId: "acct_C", pin: H("1234"), createdAt: now, people: [owner("p_cy", "Cy", "1234", "acct_C")] },
    { slug: "human-desk", biz: "Human Shop", name: "Hana", accountId: "acct_H", pin: H("2222"), createdAt: now,
      people: [owner("p_hana", "Hana", "2222", "acct_H"),
        { id: "p_x", name: "Xa", role: "employee", kind: "helper", status: "approved", pin: H("7171"), accountId: "acct_X" },
        { id: "p_hh", name: "Hu", role: "employee", kind: "helper", status: "approved", pin: H("7373"), accountId: "acct_HH" }] }
  ];
  lib.mem.money = [{ id: "m1", amount: 5, status: "hold" }];
  const moneyBefore = JSON.stringify(lib.mem.money);
  const acc = (id) => lib.mem.accounts.find((a) => a.id === id);
  let saves = 0;
  const realSave = lib.save;
  lib.save = async function () { saves++; return realSave.apply(this, arguments); };
  const snapAll = () => JSON.stringify(lib.mem.accounts) + JSON.stringify(lib.mem.workspaces);

  const OWN = seat("own-desk", "4821"), AI = seat("ai-desk", "3131"), SI = seat("si-desk", "3232");
  const CY = seat("other-desk", "1234"), XS = seat("human-desk", "7171"), HHS = seat("human-desk", "7373");
  const SECRETS = ["shpat-live-value-ZZ9-never-shown-1", "hook-path-ZZ8-never-shown-2", "replaced-ZZ7-never-shown-3", "card-typed-ZZ6-never-shown-4", "ai-own-ZZ5-never-shown-5", "si-own-ZZ4-never-shown-6", "helper-ZZ3-never-shown-7"];
  const HOOK = "https://hooks.example.test/" + SECRETS[1];

  // 0. No server key: nothing can be saved. 409, 0 writes.
  let w0 = saves, s0 = snapAll();
  let r = await post(OWN, { action: "connect", service: "Shopify", secrets: { API_KEY: SECRETS[0] } });
  if (r.statusCode !== 409 || r.body.secretsReady !== false || !/Secrets are off/.test(r.body.error || "")) fail("no key: connect must be 409 secretsReady false: " + r.statusCode + " " + JSON.stringify(r.body));
  if (saves !== w0 || snapAll() !== s0) fail("no key: connect must write nothing");
  r = await post(OWN, { action: "connect", service: "Zapier", hook: HOOK });
  if (r.statusCode !== 409 || saves !== w0) fail("no key: a hook is sealed too, so 409 and nothing saved");
  pass("no server key: connect is 409, nothing saved");
  process.env.AIA_ACCOUNT_SECRETS_KEY = "test-only-key-0123456789abcdef0123456789abcdef";

  // 1. Each kind lists, connects, and disconnects its own.
  const CONN_KEYS = "createdAt,hookSet,id,label,secretNames,service,serviceId,status,statusText,updatedAt";
  const kinds = [["human", OWN, "acct_A", "own-desk", "Ann"], ["ai", AI, "acct_I", "ai-desk", "Ivy"], ["si", SI, "acct_S", "si-desk", "Sol"]];
  const firstConn = {};
  for (const [kind, hd, id, desk, who] of kinds) {
    r = await post(hd, { action: "connections" });
    if (r.statusCode !== 200 || !Array.isArray(r.body.connections) || r.body.connections.length !== 0) fail(kind + ": empty list first: " + r.statusCode + " " + JSON.stringify(r.body));
    r = await post(hd, { action: "connect", service: "Shopify", label: "Main", secrets: { API_KEY: kind === "human" ? SECRETS[0] : kind === "ai" ? SECRETS[4] : SECRETS[5] }, deskId: desk });
    const c = r.body && r.body.connection;
    if (r.statusCode !== 200 || !c || r.body.created !== true) { fail(kind + ": connect must be 200: " + r.statusCode + " " + JSON.stringify(r.body)); continue; }
    if (Object.keys(c).sort().join(",") !== CONN_KEYS) fail(kind + ": connection keys must be exactly " + CONN_KEYS + ": " + Object.keys(c).sort().join(","));
    if (c.status !== "saved" || c.statusText !== "Saved, not tested yet") fail(kind + ": status must be saved / Saved, not tested yet: " + JSON.stringify(c));
    if (JSON.stringify(c.secretNames) !== JSON.stringify([{ name: "API_KEY", set: true }]) || c.hookSet !== false) fail(kind + ": secretNames names and set only: " + JSON.stringify(c.secretNames));
    if (/connected/i.test(JSON.stringify(r.body))) fail(kind + ": no reply may say connected: " + JSON.stringify(r.body));
    if (!r.body.card || r.body.cardCreated !== true || r.body.card.deskId !== desk) fail(kind + ": first connect drops one setup card on " + desk + ": " + JSON.stringify(r.body.card));
    else {
      const st = r.body.card.steps;
      const want = { "card.desk": "done", "g1.connect": "done", "g1.secret": "done", "g1.approve": "todo", "g1.test": "todo" };
      Object.keys(want).forEach((k) => { const s = st.find((x) => x.id === k); if (!s || s.state !== want[k]) fail(kind + ": card step " + k + " must be " + want[k] + ": " + JSON.stringify(s)); });
      const e = r.body.card.history.find((x) => x.stepId === "card.desk");
      if (!e || e.who !== who || e.whoKind !== kind || e.from !== "todo" || e.to !== "done" || e.cardId !== r.body.card.id) fail(kind + ": desk entry needs who/whoKind/from/to/cardId: " + JSON.stringify(e));
    }
    const h = acc(id).history[0];
    if (!h || h.section !== "connections" || h.who !== who || h.whoKind !== kind || !/Saved, not tested yet/.test(h.what)) fail(kind + ": account history line with who and whoKind: " + JSON.stringify(h));
    firstConn[kind] = c.id;
    r = await post(hd, { action: "connections" });
    if (r.statusCode !== 200 || r.body.connections.length !== 1 || r.body.connections[0].id !== c.id) fail(kind + ": list shows its own connection");
    r = await post(hd, { action: "connect", service: "Zapier", hook: kind === "human" ? HOOK : "https://hooks.example.test/" + kind });
    if (r.statusCode !== 200 || r.body.connection.hookSet !== true || r.body.connection.secretNames.length !== 0 || r.body.connection.status !== "saved") fail(kind + ": hook-only connect: " + JSON.stringify(r.body));
    const zap = r.body.connection.id;
    r = await post(hd, { action: "disconnect", connectionId: zap });
    if (r.statusCode !== 200 || r.body.removed !== zap || r.body.connections.some((x) => x.id === zap)) fail(kind + ": disconnect own: " + r.statusCode + " " + JSON.stringify(r.body));
    const zc = acc(id).setupCards.find((x) => x.key === "connection:" + zap);
    const zs = zc && zc.steps.find((x) => x.id === "g1.connect");
    if (!zs || zs.state !== "blocked" || !/connection was removed/.test(zs.reason)) fail(kind + ": disconnect blocks the linked card step with a plain reason: " + JSON.stringify(zs));
    if (!zc || zc.history[0].whoKind !== kind || zc.history[0].to !== "blocked") fail(kind + ": disconnect writes a card history entry with whoKind");
  }
  pass("human, ai, and si accounts list, connect (saved, not tested yet), and disconnect their own");

  // 2. The secret call answers exactly { ok, name, set: true }; replacing too.
  r = await post(OWN, { action: "connection-secret", connectionId: firstConn.human, name: "API_SECRET", value: SECRETS[2] });
  if (r.statusCode !== 200 || JSON.stringify(r.body) !== JSON.stringify({ ok: true, name: "API_SECRET", set: true })) fail("secret reply must be exactly {ok,name,set}: " + JSON.stringify(r.body));
  r = await post(OWN, { action: "connection-secret", connectionId: firstConn.human, name: "API_SECRET", value: SECRETS[2] + "x" });
  if (r.statusCode !== 200 || JSON.stringify(r.body) !== JSON.stringify({ ok: true, name: "API_SECRET", set: true })) fail("replace reply must be exactly {ok,name,set}: " + JSON.stringify(r.body));
  r = await post(OWN, { action: "connection-secret", connectionId: firstConn.human, name: "BAD", value: "" });
  if (r.statusCode !== 400) fail("empty secret value is 400");
  r = await post(OWN, { action: "connection-secret", connectionId: firstConn.human, name: SECRETS[2], value: SECRETS[2] });
  if (r.statusCode !== 400 || JSON.stringify(r.body).indexOf(SECRETS[2]) >= 0) fail("a bad name never echoes into the error: " + JSON.stringify(r.body));
  pass("secret call reply is exactly { ok, name, set: true }; replace the same");

  // 3. Strangers, wrong code, Desk AI, denied and waiting seats, other-desk session, other accounts: 404, 0 writes.
  const A = acc("acct_A");
  const aCard = A.setupCards[0].id;
  const sess = lib.issueSession(lib.mem.workspaces[3].people[0], lib.mem.workspaces[3], acc("acct_C"), { headers: {} });
  const strangers = [
    ["stranger", {}, {}], ["wrong code", seat("own-desk", "0000"), {}], ["helper with no account", seat("own-desk", "5555"), {}],
    ["Desk AI seat", seat("own-desk", "8888"), {}], ["denied seat", seat("own-desk", "6161"), {}], ["waiting seat", seat("own-desk", "6262"), {}],
    ["other-desk session on own-desk", { "x-session": sess.token, "x-workspace": "own-desk" }, {}],
    ["other desk owner naming acct_A", CY, { accountId: "acct_A" }], ["other desk owner", CY, {}]
  ];
  const tryBodies = [
    { action: "connections" }, { action: "setup-cards" }, { action: "setup-cards", deskId: "own-desk" },
    { action: "connect", connectionId: firstConn.human, label: "Hijack" },
    { action: "connect", service: "Shopify", secrets: { API_KEY: "x-other-value-1" }, deskId: "own-desk" },
    { action: "connection-secret", connectionId: firstConn.human, name: "API_KEY", value: "x-other-value-2" },
    { action: "disconnect", connectionId: firstConn.human },
    { action: "setup-card", from: { type: "connection", connectionId: firstConn.human } },
    { action: "setup-card", from: { type: "pack", id: "p", name: "P" }, deskId: "own-desk" },
    { action: "setup-step", cardId: aCard, stepId: "g1.approve", do: "done", allow: {} },
    { action: "setup-step", cardId: aCard, do: "stop" }, { action: "setup-step", cardId: aCard, do: "kill" }
  ];
  for (const [label, hd, extra] of strangers) {
    for (const b of tryBodies) {
      const own = label === "other desk owner" && ["connections", "setup-cards"].indexOf(b.action) >= 0 && !b.deskId;
      const okNew = label === "other desk owner" && (b.action === "setup-card" && b.from.type === "pack");
      if (own || okNew) continue;
      w0 = saves; s0 = snapAll();
      r = await post(hd, Object.assign({}, b, extra));
      if (r.statusCode !== 404 || r.body.ok !== false) fail(label + " " + b.action + " must be 404 like a missing desk, got " + r.statusCode + " " + JSON.stringify(r.body));
      const ks = Object.keys(r.body || {}).filter((k) => k !== "ok" && k !== "error");
      if (ks.length) fail(label + " " + b.action + " leaked keys " + ks.join(","));
      if (saves !== w0 || snapAll() !== s0) fail(label + " " + b.action + " must write nothing");
    }
  }
  r = await post(CY, { action: "connections" });
  if (r.statusCode !== 200 || r.body.connections.length !== 0) fail("another account sees only its own (empty) list");
  r = await post(CY, { action: "setup-cards" });
  if (r.statusCode !== 200 || r.body.cards.length !== 0) fail("another account sees no setup cards of A");
  pass("strangers, wrong code, Desk AI, denied, waiting, other-desk session, other accounts: 404, 0 writes");

  // 4. Same seat, same scope: an AI helper and a human helper on human-desk get the same replies.
  const strip = (b) => JSON.stringify(b, (k, v) => (["id", "createdAt", "updatedAt", "at", "cardId", "connectionId", "who", "whoKind"].indexOf(k) >= 0 ? undefined : v)).replace(/(conn|setup)_[0-9a-f]{10}/g, "$1_*");
  const pairs = [
    { action: "connect", service: "Gmail", secrets: { TOKEN: SECRETS[6] }, deskId: "human-desk" },
    { action: "setup-card", from: { type: "pack", id: "lead", name: "Lead" }, deskId: "human-desk" },
    { action: "setup-cards", deskId: "human-desk" },
    { action: "setup-step", cardId: aCard, stepId: "g1.approve", do: "done", allow: {} },
    { action: "connect", service: "Gmail", secrets: { TOKEN: SECRETS[6] } }
  ];
  for (const b of pairs) {
    const hx = JSON.stringify(acc("acct_X")), hh = JSON.stringify(acc("acct_HH"));
    const a1 = await post(XS, b), a2 = await post(HHS, b);
    if (a1.statusCode !== a2.statusCode || strip(a1.body) !== strip(a2.body)) fail("ai and human helper must get the same reply for " + b.action + ": " + a1.statusCode + " " + strip(a1.body) + " vs " + a2.statusCode + " " + strip(a2.body));
    if (b.deskId || b.cardId) {
      if (a1.statusCode !== 404) fail("a desk or card the helper does not own is 404: " + b.action + " " + a1.statusCode);
      if (JSON.stringify(acc("acct_X")) !== hx || JSON.stringify(acc("acct_HH")) !== hh) fail("out-of-scope tries write nothing for " + b.action);
    }
  }
  const xc = acc("acct_X").setupCards[0], hc = acc("acct_HH").setupCards[0];
  for (const [hd, card] of [[XS, xc], [HHS, hc]]) {
    r = await post(hd, { action: "setup-step", cardId: card.id, stepId: "card.desk", do: "done", deskId: "human-desk" });
    if (r.statusCode !== 404) fail("helper seats cannot pick a desk they only sit on");
    r = await post(hd, { action: "setup-step", cardId: card.id, stepId: "g1.approve", do: "done", allow: {} });
    if (r.statusCode !== 409 || !/Pick a desk/.test(r.body.error || "")) fail("approve needs a desk first, same for both: " + JSON.stringify(r.body));
  }
  pass("ai helper and human helper on the same seat: same scope, same replies (404 off their own desks)");

  // 5. One card per source: repeat connect and repeat setup-card make no second card.
  let nCards = A.setupCards.length;
  r = await post(OWN, { action: "connect", service: "Shopify", label: "Main", secrets: { API_KEY: SECRETS[0] } });
  if (r.statusCode !== 200 || r.body.created !== false || r.body.cardCreated !== false || r.body.connection.id !== firstConn.human) fail("repeat connect updates in place, no second card: " + JSON.stringify(r.body));
  r = await post(OWN, { action: "setup-card", from: { type: "connection", connectionId: firstConn.human } });
  if (r.statusCode !== 200 || r.body.created !== false || r.body.card.id !== aCard) fail("setup-card for a connection that has one returns it");
  if (A.setupCards.length !== nCards || A.connections.filter((c) => c.serviceId === "shopify").length !== 1) fail("repeat must not duplicate cards or connections");
  const packFrom = { type: "pack", id: "lead-catcher", name: "Lead catcher", service: "Shopify", acts: ["read", "spend", "message-new"] };
  r = await post(OWN, { action: "setup-card", from: packFrom });
  const pCard = r.body.card;
  if (r.statusCode !== 200 || r.body.created !== true || !pCard || pCard.source.preview !== true || pCard.bought !== false || pCard.charged !== false || !/Nothing was bought or charged/.test(r.body.hint || "")) fail("preview pack card: " + JSON.stringify(r.body));
  r = await post(OWN, { action: "setup-card", from: packFrom });
  if (r.statusCode !== 200 || r.body.created !== false || r.body.card.id !== pCard.id || A.setupCards.length !== nCards + 1) fail("repeat pack makes no second card");
  pass("one setup card per source; repeat returns the same card");

  // 6. Steps in order, on the server. History has who + whoKind for each checked-off step.
  const step = (hd, card, stepId, extra) => post(hd, Object.assign({ action: "setup-step", cardId: card, stepId: stepId, do: "done" }, extra || {}));
  w0 = saves; s0 = snapAll();
  for (const [sid, extra] of [["g1.approve", { allow: {} }], ["g1.test", {}], ["g1.secret", { secret: { name: "API_KEY", value: SECRETS[3] } }]]) {
    r = await step(OWN, pCard.id, sid, extra);
    if (r.statusCode !== 409 || !/earlier steps|Approve allowed actions first/.test(r.body.error || "")) fail("out-of-order " + sid + " must be 409: " + r.statusCode + " " + JSON.stringify(r.body));
  }
  r = await post(OWN, { action: "setup-step", cardId: pCard.id, stepId: "g1.approve", do: "skip", reason: "later" });
  if (r.statusCode !== 409 && r.statusCode !== 400) fail("skipping approve out of order is refused");
  if (saves !== w0 || snapAll() !== s0) fail("refused steps write nothing");
  r = await step(OWN, pCard.id, "card.desk", { deskId: "other-desk" });
  if (r.statusCode !== 404) fail("picking someone else's desk is 404");
  r = await step(OWN, pCard.id, "card.desk", { deskId: "own-desk" });
  if (r.statusCode !== 200 || r.body.card.deskId !== "own-desk" || r.body.entry.who !== "Ann" || r.body.entry.whoKind !== "human" || r.body.entry.stepId !== "card.desk") fail("pick a desk: " + JSON.stringify(r.body));
  r = await step(OWN, pCard.id, "card.desk", { deskId: "own-desk" });
  if (r.statusCode !== 409) fail("a done step cannot be done again");
  r = await post(OWN, { action: "connect", service: "Gmail", secrets: { TOKEN: "gm-ZZ2-never-shown-8" } });
  const gm = r.body.connection.id;
  r = await step(OWN, pCard.id, "g1.connect", { connectionId: gm });
  if (r.statusCode !== 409) fail("a connection for another service cannot fill this step");
  r = await step(OWN, pCard.id, "g1.connect", { connectionId: firstConn.human });
  if (r.statusCode !== 200 || r.body.step.state !== "done" || r.body.entry.whoKind !== "human" || r.body.entry.from !== "todo" || r.body.entry.to !== "done") fail("connect step: " + JSON.stringify(r.body));
  r = await step(OWN, pCard.id, "g1.test");
  if (r.statusCode !== 409) fail("test before approve must be 409");
  r = await step(OWN, pCard.id, "g1.secret", { secret: { name: "API_KEY", value: SECRETS[3] } });
  if (r.statusCode !== 200 || r.body.step.state !== "done" || JSON.stringify(r.body.step.secretNames) !== JSON.stringify(["API_KEY", "API_SECRET"])) fail("secret step on the card: " + JSON.stringify(r.body));
  r = await post(OWN, { action: "setup-step", cardId: pCard.id, stepId: "g1.approve", do: "skip", reason: "skip it" });
  if (r.statusCode !== 400 || !/cannot be skipped/.test(r.body.error || "")) fail("approve cannot be skipped: " + JSON.stringify(r.body));
  r = await step(OWN, pCard.id, "g1.test");
  if (r.statusCode !== 409 || !/Approve allowed actions first/.test(r.body.error || "")) fail("replaying test cannot skip approve: " + JSON.stringify(r.body));
  r = await step(OWN, pCard.id, "g1.approve", { allow: { stop: false } });
  if (r.statusCode !== 400 || !/Stop and Kill always work/.test(r.body.error || "")) fail("Stop/Kill cannot be allowed off");
  r = await step(OWN, pCard.id, "g1.approve", { allow: { money: true } });
  if (r.statusCode !== 200 || r.body.step.allowed.money !== true || r.body.step.allowed.stopAndKill !== "always") fail("human may approve money once: " + JSON.stringify(r.body));
  r = await step(OWN, pCard.id, "g1.approve", { allow: {} });
  if (r.statusCode !== 409) fail("approve once: a second approve is 409");
  r = await step(OWN, pCard.id, "g1.test", { live: true });
  if (r.statusCode !== 409 || !/live test is not here yet/.test(r.body.error || "")) fail("live test is 409");
  r = await step(OWN, pCard.id, "g1.test", { try: ["delete"] });
  const res1 = r.body && r.body.step && r.body.step.result;
  if (r.statusCode !== 200 || !res1 || res1.dryRun !== true || res1.sent !== false || res1.outsideCalls !== 0 || res1.modelCalls !== 0 || res1.charged !== false) fail("test run is a dry run: " + JSON.stringify(r.body));
  else {
    const sp = res1.acts.find((x) => x.act === "spend");
    if (!sp || sp.held !== true || sp.charged !== false || sp.done !== false) fail("spend in a test run is held, charged false: " + JSON.stringify(sp));
    if (r.body.card.status !== "done" || !/dry run/.test(r.body.card.statusText)) fail("card done after the last step: " + r.body.card.status);
  }
  const shop = (await post(OWN, { action: "connections" })).body.connections.find((c) => c.id === firstConn.human);
  if (shop.status !== "saved" || shop.statusText !== "Saved, not tested yet") fail("a dry run does not mark tested: " + JSON.stringify(shop));
  const pc = A.setupCards.find((c) => c.id === pCard.id);
  const checked = pc.history.filter((e) => e.to === "done");
  if (checked.length !== 5 || checked.some((e) => !e.who || ["human", "ai", "si"].indexOf(e.whoKind) < 0 || !e.stepId || !e.at || e.cardId !== pc.id)) fail("every checked-off step has one history entry with who and whoKind: " + JSON.stringify(checked));
  pass("steps go in order on the server; approve once cannot be skipped or replayed; each check-off has who + whoKind; dry run keeps Saved, not tested yet");

  // 7. Bundle: one card, one step group per item.
  nCards = A.setupCards.length;
  const bundle = { type: "bundle", id: "starter-bundle", name: "Starter bundle", items: [
    { type: "automation", id: "lead", name: "Lead catcher", service: "Gmail", acts: ["read", "message-new"] },
    { type: "addon", id: "price", name: "Price add-on", acts: ["spend"] },
    { type: "pack", id: "shop", name: "Shop pack", service: "Shopify" }] };
  r = await post(OWN, { action: "setup-card", from: bundle, deskId: "own-desk" });
  const bc = r.body.card;
  if (r.statusCode !== 200 || !bc || bc.groups.length !== 3 || bc.steps.length !== 13 || A.setupCards.length !== nCards + 1) fail("bundle gets one card with 3 step groups: " + JSON.stringify(r.body).slice(0, 300));
  else {
    const g2 = bc.steps.filter((s) => s.group === "g2");
    if (g2.map((s) => s.kind + ":" + s.state).join(",") !== "connect:skipped,secret:skipped,approve:todo,test:todo") fail("an item with no service skips connect and secret: " + JSON.stringify(g2));
    if (bc.steps.find((s) => s.id === "card.desk").state !== "done") fail("deskId picks the desk at creation");
  }
  r = await post(OWN, { action: "setup-card", from: bundle });
  if (r.body.created !== false || A.setupCards.length !== nCards + 1) fail("repeat bundle makes no second card");
  r = await post(OWN, { action: "setup-card", from: { type: "bundle", id: "nested", name: "N", items: [{ type: "bundle", name: "inner" }] } });
  if (r.statusCode !== 400) fail("no nested bundles");
  r = await step(OWN, bc.id, "g2.approve", { allow: {} });
  if (r.statusCode !== 200) fail("g2 approve after skipped connect/secret");
  r = await step(OWN, bc.id, "g2.test");
  if (r.statusCode !== 200 || r.body.step.result.acts[0].held !== true || r.body.step.result.acts[0].charged !== false) fail("bundle add-on spend is held in the dry run");
  pass("a bundle gets one card with a checklist (one step group per item)");

  // 8. AI / SI cannot approve allowed actions that turn off their own pauses.
  const LOCK = "An AI or SI account can't change this itself. The human owner can.";
  for (const [kind, hd, id, flag] of [["ai", AI, "acct_I", "money"], ["si", SI, "acct_S", "messageNew"]]) {
    const a = acc(id);
    const card = a.setupCards.find((c) => c.key === "connection:" + firstConn[kind]);
    const before = JSON.stringify(card.steps);
    const nh = a.history.length, ch = card.history.length;
    r = await step(hd, card.id, "g1.approve", { allow: { [flag]: true } });
    if (r.statusCode !== 403 || r.body.error !== LOCK) fail(kind + ": approve that turns off a pause must be 403 with the same plain reason: " + r.statusCode + " " + JSON.stringify(r.body));
    if (JSON.stringify(card.steps) !== before) fail(kind + ": refused approve changes no step");
    if (card.history.length !== ch + 1 || card.history[0].kind !== "refused" || card.history[0].whoKind !== kind) fail(kind + ": refusal is a card history entry with whoKind: " + JSON.stringify(card.history[0]));
    if (a.history.length !== nh + 1 || !/tried to turn off its own stop before/.test(a.history[0].what) || a.history[0].whoKind !== kind) fail(kind + ": refusal is an account history line");
    r = await step(hd, card.id, "g1.test");
    if (r.statusCode !== 409) fail(kind + ": test still waits on approve");
    r = await step(hd, card.id, "g1.approve", { allow: { money: false, deletes: false, messageNew: false } });
    if (r.statusCode !== 200 || r.body.step.allowed.money !== false || r.body.entry.whoKind !== kind) fail(kind + ": approving with every pause kept on is allowed: " + JSON.stringify(r.body));
    r = await step(hd, card.id, "g1.test", { try: ["spend", "message-new"] });
    const acts = r.body && r.body.step && r.body.step.result && r.body.step.result.acts;
    const sp = acts && acts.find((x) => x.act === "spend"), mn = acts && acts.find((x) => x.act === "message-new");
    if (r.statusCode !== 200 || !sp || sp.paused !== true || sp.held !== true || sp.charged !== false || !mn || mn.paused !== true) fail(kind + ": dry run pauses spend and message-new for an " + kind + " account, nothing charged: " + JSON.stringify(acts));
  }
  pass("ai / si approve that turns off own pauses: 403 same reason, no change, recorded; keeping pauses on is allowed; dry run pauses and holds");

  // 9. Stop and Kill mid-setup, every kind.
  const connectSrc = fs.readFileSync(path.join(__dirname, "..", "api", "_account-connect.js"), "utf8");
  if (connectSrc.indexOf('"Stopped for good. Nothing more happens on") + " the setup card for "') < 0) fail("kill history text drifted");
  if (connectSrc.indexOf('"Stopped for good") + " here, but it did not save. Tap "') < 0) fail("kill unsaved hint drifted");
  if (connectSrc.indexOf("Killed this setup card") >= 0 || connectSrc.indexOf("This card was killed") >= 0 || connectSrc.indexOf('"Killed") + " here') >= 0 || connectSrc.indexOf('"Killed") + " the setup') >= 0) fail("old Killed history or hint text is back");
  for (const [kind, hd] of [["human", OWN], ["ai", AI], ["si", SI]]) {
    r = await post(hd, { action: "setup-card", from: { type: "automation", id: "mid-" + kind, name: "Mid " + kind, service: "Shopify" } });
    const id = r.body.card.id;
    r = await post(hd, { action: "setup-step", cardId: id, do: "stop" });
    if (r.statusCode !== 200 || r.body.card.status !== "stopped" || r.body.entry.kind !== "stop" || r.body.entry.whoKind !== kind) fail(kind + ": Stop mid-setup is 200: " + JSON.stringify(r.body));
    r = await post(hd, { action: "setup-step", cardId: id, stepId: "g1.connect", do: "skip", reason: "x" });
    if (r.statusCode !== 409 || !/stopped/.test(r.body.error || "")) fail(kind + ": steps wait while stopped");
    r = await post(hd, { action: "setup-step", cardId: id, do: "stop" });
    if (r.statusCode !== 200 || r.body.changed !== false) fail(kind + ": Stop again is 200");
    r = await post(hd, { action: "setup-step", cardId: id, do: "start" });
    if (r.statusCode !== 200 || r.body.card.status !== "open") fail(kind + ": start again");
    r = await post(hd, { action: "setup-step", cardId: id, do: "kill" });
    if (r.statusCode !== 200 || r.body.card.status !== "killed" || r.body.card.statusText !== "Stopped for good. Nothing more happens on this card." || r.body.entry.what !== "Stopped for good. Nothing more happens on this card." || r.body.card.steps.filter((s) => s.state === "todo").length !== 0 || !r.body.card.steps.some((s) => s.state === "blocked" && s.reason === "Stopped for good. Nothing more happens on this card.")) fail(kind + ": Kill mid-setup is 200 and blocks the rest: " + JSON.stringify(r.body).slice(0, 400));
    for (const v of ["kill", "stop"]) {
      r = await post(hd, { action: "setup-step", cardId: id, do: v });
      if (r.statusCode !== 200) fail(kind + ": " + v + " on a killed card still 200");
    }
    r = await post(hd, { action: "setup-step", cardId: id, do: "start" });
    if (r.statusCode !== 409 || (r.body && r.body.error) !== "Stopped for good. Nothing more happens on this card.") fail(kind + ": a killed card does not start again: " + JSON.stringify(r.body && r.body.error));
    r = await post(hd, { action: "setup-step", cardId: id, stepId: "card.desk", do: "done", deskId: kinds.find((k) => k[0] === kind)[3] });
    if (r.statusCode !== 409) fail(kind + ": nothing more on a killed card");
  }
  pass("Stop and Kill answer 200 mid-setup for human, ai, and si; killed is final");

  // 10. No money: no buy fields, no charges, no money rows, no outside or model calls.
  w0 = saves; s0 = snapAll();
  for (const f of [{ type: "pack", id: "x", name: "X", price: 9 }, { type: "pack", id: "x", name: "X", buy: true }, { type: "bundle", id: "b", name: "B", items: [{ type: "addon", name: "A", checkout: "now" }] }]) {
    r = await post(OWN, { action: "setup-card", from: f });
    if (r.statusCode !== 409 || !/Collect stays HOLD/.test(r.body.error || "")) fail("a buy field is 409 Collect HOLD: " + JSON.stringify(f));
  }
  if (saves !== w0 || snapAll() !== s0) fail("buy tries write nothing");
  if (JSON.stringify(lib.mem.money) !== moneyBefore) fail("money rows must not change");
  lib.mem.accounts.forEach((a) => (a.setupCards || []).forEach((c) => { if (c.charged !== false || c.bought !== false) fail("every card says charged false, bought false"); }));
  if (outside !== 0) fail("no outside or model calls during setup, counted " + outside);
  pass("bought / received is preview only: 0 charges, 0 money rows, 0 outside or model calls");

  // 11. A failed save answers 503 and changes nothing; Stop still answers 200 (saved:false).
  lib.save = async function () { saves++; return false; };
  s0 = snapAll();
  r = await post(OWN, { action: "connect", service: "Square", secrets: { KEY: "sq-ZZ1-never-shown-9" } });
  if (r.statusCode !== 503 || snapAll() !== s0) fail("failed save: 503 and memory put back: " + r.statusCode);
  r = await post(OWN, { action: "setup-card", from: { type: "addon", id: "nosave", name: "No save" } });
  if (r.statusCode !== 503 || snapAll() !== s0) fail("failed save on setup-card: 503 and nothing changed");
  r = await step(OWN, bc.id, "g1.connect", { connectionId: gm });
  if (r.statusCode !== 503 || snapAll() !== s0) fail("failed save on a step: 503 and nothing changed: " + r.statusCode);
  r = await post(OWN, { action: "setup-step", cardId: bc.id, do: "stop" });
  if (r.statusCode !== 200 || r.body.saved !== false || !/did not save/.test(r.body.hint || "")) fail("Stop still answers 200 when the save fails, saved:false");
  lib.save = async function () { saves++; return realSave.apply(this, arguments); };
  await post(OWN, { action: "setup-step", cardId: bc.id, do: "stop" });
  pass("a failed save answers 503 and changes nothing; Stop still answers 200");

  // 11b. Every request field takes only its exact type. {toString}, arrays, null, numbers
  //      and the like are a plain 400 that names the field; nothing is saved; nothing throws.
  {
    const rawPost = async (hd, body) => {
      const res = mockRes();
      const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
      ["log", "error", "warn", "info"].forEach((k) => { console[k] = function () {}; });
      try { await handler({ method: "POST", headers: hd, body: body, query: { via: "account" }, url: "/api/auth?via=account" }, res); } finally { Object.assign(console, orig); }
      return res;
    };
    const A0 = acc("acct_A");
    const connId = ((A0.connections || [])[0] || {}).id || "conn_none";
    const cardId = ((A0.setupCards || [])[0] || {}).id || "setup_none";
    const TS = { toString: "x" };
    const TF = { toString() { return "own-desk"; } };
    const notText = [TS, TF, ["x"], null, 7, true, {}];
    const notBool = ["true", 1, 0, null, {}, ["true"], TS];
    const notObj = [["x"], "x", null, 7, true, TS.toString, function () {}, new Date(0), Object.create({ money: true, name: "K5", value: "v-8-never" })];
    const notTextMap = [["x"], "x", null, 7, { KEY: TS }, { KEY: ["v"] }, { KEY: 7 }, { KEY: null }];
    const notTexts = ["read", null, 7, [TS], [7], [null], [["read"]], {}];
    const notObjs = ["x", null, 7, [7], ["x"], [null], [["a"]], {}];
    const notBoolOrText = [null, 1, {}, ["true"], TS];
    // [label, base body, field path, bad values]
    const T = [
      ["connect.service", { action: "connect", secrets: { K: "v-1-never" } }, ["service"], notText],
      ["connect.label", { action: "connect", service: "Typed", secrets: { K: "v-2-never" } }, ["label"], notText],
      ["connect.secrets", { action: "connect", service: "Typed" }, ["secrets"], notTextMap],
      ["connect.hook", { action: "connect", service: "Typed" }, ["hook"], notText],
      ["connect.connectionId", { action: "connect", secrets: { K: "v-3-never" } }, ["connectionId"], notText],
      ["connect.deskId", { action: "connect", service: "Typed", secrets: { K: "v-4-never" } }, ["deskId"], notText],
      ["connection-secret.connectionId", { action: "connection-secret", name: "K2", value: "v-5-never" }, ["connectionId"], notText],
      ["connection-secret.name", { action: "connection-secret", connectionId: connId, value: "v-6-never" }, ["name"], notText],
      ["connection-secret.value", { action: "connection-secret", connectionId: connId, name: "K3" }, ["value"], notText],
      ["disconnect.connectionId", { action: "disconnect" }, ["connectionId"], notText],
      ["setup-cards.deskId", { action: "setup-cards" }, ["deskId"], notText],
      ["setup-card.from", { action: "setup-card" }, ["from"], notObj],
      ["setup-card.deskId", { action: "setup-card", from: { type: "addon", id: "typed-a", name: "Typed A" } }, ["deskId"], notText],
      ["setup-card.from.type", { action: "setup-card", from: { id: "typed-b", name: "Typed B" } }, ["from", "type"], notText],
      ["setup-card.from.connectionId", { action: "setup-card", from: { type: "connection" } }, ["from", "connectionId"], notText],
      ["setup-card.from.id", { action: "setup-card", from: { type: "addon", name: "Typed C" } }, ["from", "id"], notText],
      ["setup-card.from.name", { action: "setup-card", from: { type: "addon", id: "typed-d" } }, ["from", "name"], notText],
      ["setup-card.from.service", { action: "setup-card", from: { type: "addon", id: "typed-e", name: "Typed E" } }, ["from", "service"], notText],
      ["setup-card.from.acts", { action: "setup-card", from: { type: "addon", id: "typed-f", name: "Typed F" } }, ["from", "acts"], notTexts],
      ["setup-card.from.items", { action: "setup-card", from: { type: "bundle", id: "typed-g", name: "Typed G" } }, ["from", "items"], notObjs],
      ["setup-card.from.items[].type", { action: "setup-card", from: { type: "bundle", id: "typed-h", name: "Typed H", items: [{ name: "I" }] } }, ["from", "items", 0, "type"], notText],
      ["setup-card.from.items[].id", { action: "setup-card", from: { type: "bundle", id: "typed-i", name: "Typed I", items: [{ type: "addon", name: "I" }] } }, ["from", "items", 0, "id"], notText],
      ["setup-card.from.items[].name", { action: "setup-card", from: { type: "bundle", id: "typed-j", name: "Typed J", items: [{ type: "addon", id: "i" }] } }, ["from", "items", 0, "name"], notText],
      ["setup-card.from.items[].service", { action: "setup-card", from: { type: "bundle", id: "typed-k", name: "Typed K", items: [{ type: "addon", name: "I" }] } }, ["from", "items", 0, "service"], notText],
      ["setup-card.from.items[].acts", { action: "setup-card", from: { type: "bundle", id: "typed-l", name: "Typed L", items: [{ type: "addon", name: "I" }] } }, ["from", "items", 0, "acts"], notTexts],
      ["setup-step.cardId", { action: "setup-step", do: "stop" }, ["cardId"], notText],
      ["setup-step.do", { action: "setup-step", cardId: cardId }, ["do"], notText],
      ["setup-step.stepId", { action: "setup-step", cardId: cardId, do: "done" }, ["stepId"], notText],
      ["setup-step.reason", { action: "setup-step", cardId: cardId, stepId: "g1.connect", do: "skip" }, ["reason"], notText],
      ["setup-step.deskId", { action: "setup-step", cardId: cardId, stepId: "card.desk", do: "done" }, ["deskId"], notText],
      ["setup-step.connectionId", { action: "setup-step", cardId: cardId, stepId: "g1.connect", do: "done" }, ["connectionId"], notText],
      ["setup-step.secret", { action: "setup-step", cardId: cardId, stepId: "g1.secret", do: "done" }, ["secret"], notObj],
      ["setup-step.secret.name", { action: "setup-step", cardId: cardId, stepId: "g1.secret", do: "done", secret: { value: "v-7-never" } }, ["secret", "name"], notText],
      ["setup-step.secret.value", { action: "setup-step", cardId: cardId, stepId: "g1.secret", do: "done", secret: { name: "K4" } }, ["secret", "value"], notText],
      ["setup-step.allow", { action: "setup-step", cardId: cardId, stepId: "g1.approve", do: "done" }, ["allow"], notObj],
      ["setup-step.allow.money", { action: "setup-step", cardId: cardId, stepId: "g1.approve", do: "done", allow: {} }, ["allow", "money"], notBool],
      ["setup-step.allow.deletes", { action: "setup-step", cardId: cardId, stepId: "g1.approve", do: "done", allow: {} }, ["allow", "deletes"], notBool],
      ["setup-step.allow.messageNew", { action: "setup-step", cardId: cardId, stepId: "g1.approve", do: "done", allow: {} }, ["allow", "messageNew"], notBool],
      ["setup-step.try", { action: "setup-step", cardId: cardId, stepId: "g1.test", do: "done" }, ["try"], notTexts],
      ["setup-step.live", { action: "setup-step", cardId: cardId, stepId: "g1.test", do: "done" }, ["live"], notBoolOrText]
    ];
    const clone = (v) => {
      if (Array.isArray(v)) return v.map(clone);
      if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) { const o = {}; Object.keys(v).forEach((k) => { o[k] = clone(v[k]); }); return o; }
      return v;
    };
    let bad = 0;
    for (const [label, base, pathTo, values] of T) {
      for (const v of values) {
        const body = clone(base);
        let at = body;
        for (let i = 0; i < pathTo.length - 1; i++) at = at[pathTo[i]];
        at[pathTo[pathTo.length - 1]] = v;
        const w0b = saves, s0b = snapAll();
        let r = null, threw = null;
        try { r = await rawPost(OWN, body); } catch (e) { threw = e; }
        const field = String(pathTo[pathTo.length - 1]);
        const shown = (() => { try { return JSON.stringify(v); } catch (e) { return "?"; } })() || String(typeof v);
        if (threw) { fail(label + " = " + shown + " must not throw: " + (threw && threw.message)); bad++; continue; }
        if (r.statusCode !== 400 || !r.body || r.body.ok !== false || !new RegExp("^Send (\\S+\\.)?" + field + " as [a-z ]+\\. Nothing was saved\\.$").test(r.body.error || "")) { fail(label + " = " + shown + " must be a plain 400 naming " + field + ": " + r.statusCode + " " + JSON.stringify(r.body)); bad++; }
        if (saves !== w0b || snapAll() !== s0b) { fail(label + " = " + shown + " must save and change nothing"); bad++; }
      }
    }
    // The request body itself must be a plain object (prototype Object.prototype or
    // null). A body whose prototype carries allow.money:true (or any field) is the
    // same plain 400, nothing saved, and allowed.money never becomes true.
    {
      let pr = await rawPost(OWN, { action: "setup-card", from: { type: "addon", id: "proto-money", name: "Proto money", acts: ["read"] }, deskId: "own-desk" });
      const pcard = pr.body && pr.body.card && pr.body.card.id;
      if (pr.statusCode !== 200 || !pcard) fail("proto-body: setup card made: " + pr.statusCode);
      const approvedMoney = () => (acc("acct_A").setupCards || []).filter((c) => c.id === pcard).some((c) => JSON.stringify(c).indexOf("\"money\":true") >= 0);
      const protoBodies = [
        ["prototype allow.money:true", Object.assign(Object.create({ allow: { money: true } }), { action: "setup-step", cardId: pcard, stepId: "g1.approve", do: "done" })],
        ["prototype carries every field", Object.create({ action: "setup-step", cardId: pcard, stepId: "g1.approve", do: "done", allow: { money: true } })],
        ["prototype connect secrets", Object.assign(Object.create({ secrets: { K: "v-9-never" } }), { action: "connect", service: "ProtoSvc" })],
        ["class instance body", Object.assign(new (class Body {})(), { action: "setup-step", cardId: pcard, stepId: "g1.approve", do: "done", allow: { money: true } })],
        ["prototype settings write", Object.assign(Object.create({ set: { theme: "dark" } }), { action: "settings", section: "look" })]
      ];
      for (const [label, pb] of protoBodies) {
        const w0p = saves, s0p = snapAll();
        let rp = null, threw = null;
        try { rp = await rawPost(OWN, pb); } catch (e) { threw = e; }
        if (threw) { fail("non-plain body (" + label + ") must not throw: " + threw.message); continue; }
        if (rp.statusCode !== 400 || !rp.body || rp.body.ok !== false || rp.body.error !== "Send the request as a plain object. Nothing was saved.") fail("non-plain body (" + label + ") must be the plain 400: " + rp.statusCode + " " + JSON.stringify(rp.body));
        if (saves !== w0p || snapAll() !== s0p) fail("non-plain body (" + label + ") must save and change nothing");
      }
      if (approvedMoney()) fail("a prototype allow.money:true must never store allowed.money:true");
      const np = Object.assign(Object.create(null), { action: "setup-step", cardId: pcard, stepId: "g1.approve", do: "done" });
      pr = await rawPost(OWN, np);
      if (pr.statusCode !== 200) fail("a null-prototype body still works: " + pr.statusCode + " " + JSON.stringify(pr.body));
      if (approvedMoney()) fail("approve {} after a refused prototype body keeps allowed.money false");
      pass("a non-plain request body (prototype carrying allow.money:true, class instance) is the plain 400, nothing saved, allowed.money stays false; a null-prototype body works");
    }
    // The right types still work.
    let r = await rawPost(OWN, { action: "setup-card", from: { type: "addon", id: "typed-ok", name: "Typed OK", acts: ["read"] }, deskId: "own-desk" });
    if (r.statusCode !== 200) fail("plain strings and string lists still work: " + r.statusCode + " " + JSON.stringify(r.body));
    r = await rawPost(OWN, { action: "setup-step", cardId: r.body.card && r.body.card.id, stepId: "g1.approve", do: "done", allow: { money: false } });
    if (r.statusCode !== 200) fail("allow with a boolean still works: " + r.statusCode + " " + JSON.stringify(r.body));
    if (!bad) pass("every connections / setup field takes only its exact type: {toString}, arrays, null, numbers are a plain 400 naming the field, nothing saved, never a throw");
  }

  // 12. No secret value anywhere it can be read back.
  try {
    const health = require(path.join(root, "api/health"));
    const hr = mockRes();
    const orig = console.log; console.log = function () {};
    try { await health({ method: "GET", headers: {}, query: {}, url: "/api/health" }, hr); } finally { console.log = orig; }
    replies.push(JSON.stringify(hr.body));
  } catch (e) { console.log("note: health did not run here (" + String(e && e.message).slice(0, 80) + "); store and replies are still scanned"); }
  await realSave();
  const disk = fs.existsSync(store) ? fs.readFileSync(store, "utf8") : "";
  if (!disk) fail("the local test store must exist to scan");
  const hay = [replies.join("\n"), disk, JSON.stringify(lib.mem.audit || []), JSON.stringify(lib.mem.accounts.map((a) => [a.history, a.setupCards]))];
  const vals = SECRETS.concat([HOOK, SECRETS[2] + "x", "gm-ZZ2-never-shown-8", "sq-ZZ1-never-shown-9"]);
  vals.forEach((v) => {
    const b64 = Buffer.from(v).toString("base64");
    hay.forEach((h, i) => { if (h.indexOf(v) >= 0 || h.indexOf(b64) >= 0 || h.indexOf(v.slice(0, 12)) >= 0) fail("a secret value shows in " + ["replies", "store", "log", "history/cards"][i]); });
  });
  if (/"value"|"length"|"hint":"[^"]*\d+ (chars|characters)/.test(replies.join("\n").replace(/"hint":"(Saved|Preview|Stopped|Killed)[^"]*"/g, ""))) fail("no reply carries a value, a length, or a value hint");
  lib.mem.accounts.forEach((a) => (a.connections || []).forEach((c) => {
    (c.secrets || []).forEach((s) => { if (!s.sealed || s.sealed.aia !== "aia-acct-secret-1") fail("connection secrets are sealed with the 336 account-secret seal"); });
  }));
  pass("no secret value in any reply, history, card, log, store file, or health");

  // 13. Source rules.
  const src = fs.readFileSync(helperPath, "utf8");
  if (/\bfetch\s*\(|require\(["'](https?|net|tls)["']\)|_grok|_engine|mem\.money/.test(src)) fail("the helper makes no outside, model, or money calls");
  if (/status:\s*["']connected["']/.test(src)) fail("no connected status");
  const fns = fs.readdirSync(path.join(root, "api")).filter((f) => /\.js$/.test(f) && f[0] !== "_");
  if (fns.length > 12) fail("Vercel function cap: " + fns.length + " api functions");
  if (fs.existsSync(path.join(root, "api/account.js"))) fail("api/account.js must not exist (function count)");
  const pkg = fs.readFileSync(path.join(root, "package.json"), "utf8");
  if (pkg.indexOf("node scripts/check-account-connections.js") < 0) fail("package.json test must run this check");
  pass("source: no outside / model / money calls, no connected status, function cap kept, wired into npm test");

  try { fs.unlinkSync(store); } catch (e) {}
  if (!failed) console.log("check-account-connections: ok");
}

main().catch((e) => { console.error("FAIL check-account-connections: " + (e && e.stack ? e.stack : e)); process.exit(1); });
