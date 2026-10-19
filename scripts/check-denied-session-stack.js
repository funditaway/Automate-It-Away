#!/usr/bin/env node
// Stack check for #343 + #347 + #348. It passes only with all three together and is not
// in the npm test line yet: it gets wired into npm test in the landing commit for that group.
// #343 alone stops a denied/removed helper's old session from resolving to a seat, but
// POST /api/jobs (#347) and suggest (#348) still need their own seat gates.
// Proves a helper's session made BEFORE the deny or the removal (pin login, a minted session,
// and the aia_session cookie form) gets, on POST /api/jobs say / kill / ship, the exact reply a
// missing desk gets, leaves the card unchanged and makes no outbound call; and on suggest
// gets the same 401 as a missing desk with 0 calls to api.x.ai.
// Runs the real handlers against a temp store. fetch is stubbed: no network.
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
const store = path.join(os.tmpdir(), "aia-denied-session-stack-" + process.pid + "-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;
Object.keys(process.env).forEach(function (k) {
  if (/BLOB|VERCEL|XAI|GROK|OPENAI|ANTHROPIC|AIA_CONNECT/.test(k)) delete process.env[k];
});
process.env.XAI_API_KEY = "test-only-not-a-real-key";
delete global.__aia;
delete global.__aiaHydrate;

const fetches = [];
global.fetch = async function (url) {
  fetches.push(String(url));
  return { status: 200, ok: true, json: async () => ({}), text: async () => "" };
};
const llmCalls = (from) => fetches.slice(from || 0).filter((u) => u.indexOf("api.x.ai") >= 0).length;

const STACK = "denied session still acts on cards: needs 347+348 with 343";
let failed = 0;
function fail(msg) { console.error("FAIL " + msg); failed += 1; process.exitCode = 1; }
function pass(msg) { console.log("ok  " + msg); }

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
async function call(handler, method, headers, body, url) {
  const res = mockRes();
  await handler({ method, headers: headers || {}, body: body || {}, query: {}, url: url || "/api/auth" }, res);
  return res;
}
const reply = (r) => r.statusCode + " " + JSON.stringify(r.body);

async function main() {
  const auth = require(path.join(root, "api/auth"));
  const jobs = require(path.join(root, "api/jobs"));
  const lib = require(path.join(root, "api/_lib"));
  await lib.ready();

  const D = "dss-desk";
  const open = await call(auth, "POST", { "x-workspace": D }, { action: "open", slug: D, biz: "dss desk", name: "Olive", pin: "4141", email: "olive@example.test" });
  const ownerTok = open.body && open.body.session && open.body.session.token;
  if (open.statusCode !== 201 || !ownerTok) { fail("could not open desk: " + open.statusCode + " " + JSON.stringify(open.body)); return; }
  const owner = { "x-session": ownerTok, "x-workspace": D };
  const ws = lib.mem.workspaces.find((w) => w && w.slug === D);
  const deskAcct = (lib.mem.accounts || []).find((a) => a && a.id === ws.accountId) || { id: ws.accountId, email: "olive@example.test" };
  const HOOK = "https://hooks.example.test/dss-pipe";
  lib.mem.connections.push({ id: "c_dss", workspace: D, provider: "webhook", label: "Zap", hook: HOOK, live: true });
  const card = (id) => lib.mem.jobs.find((j) => j && j.id === id);
  function seed(id) {
    lib.mem.jobs.unshift({ id, workspace: D, title: "Olive private card " + id, notes: "private notes", phone: "555-0101", amount: 20,
      status: "exception", step: "Qualify", createdAt: new Date().toISOString(), thread: [{ from: "Olive", text: "private line" }] });
  }
  seed("job_dss");

  const MISSING = { "x-workspace": "dss-no-such-desk" };
  const ACTS = [
    ["say", { action: "say", id: "job_dss", text: "old session note" }],
    ["kill", { action: "kill", id: "job_dss", confirm: true, killReason: "old session" }],
    ["ship", { action: "ship", id: "job_dss", provider: "webhook", confirm: true }]
  ];
  const SUGGEST = { action: "suggest", title: "Draft me", notes: "a lead", text: "a lead" };
  const missing = {};
  for (const [name, body] of ACTS) missing[name] = reply(await call(jobs, "POST", MISSING, body, "/api/jobs"));
  const fm = fetches.length;
  const missingSuggest = await call(jobs, "POST", MISSING, SUGGEST, "/api/jobs");
  missing.suggest = reply(missingSuggest);
  if (missingSuggest.statusCode !== 401) fail(STACK + " (missing desk suggest should be 401, got " + missing.suggest + ")");
  if (llmCalls(fm)) fail(STACK + " (missing desk suggest called api.x.ai)");
  pass("missing desk replies: " + JSON.stringify(missing));

  // Helpers sign in BEFORE the owner closes their seat: pin login, minted session, cookie form.
  async function helperSessions(name, pin) {
    await new Promise((r) => setTimeout(r, 3));
    const inv = await call(auth, "POST", owner, { action: "invite", name, pin, kind: "helper" });
    if (inv.statusCode !== 201 || !inv.body.person) { fail("owner could not add helper " + name + ": " + inv.statusCode); return null; }
    const login = async () => {
      const r = await call(auth, "POST", {}, { action: "login", workspace: D, pin });
      return r.body && r.body.session && r.body.session.token;
    };
    const pinTok = await login();
    const cookieTok = await login();
    const seat = (ws.people || []).find((p) => p && p.id === inv.body.person.id);
    const minted = lib.issueSession(seat, ws, deskAcct).token;
    if (!pinTok || !cookieTok || !minted) { fail("helper " + name + " sessions not issued"); return null; }
    const forms = [
      ["pin-login session", pinTok, { "x-session": pinTok, "x-workspace": D }],
      ["minted session", minted, { "x-session": minted, "x-workspace": D }],
      ["cookie session", cookieTok, { cookie: "aia_session=" + encodeURIComponent(cookieTok), "x-workspace": D }]
    ];
    for (const [label, tok, hdr] of forms) {
      const seen = lib.personOf({ headers: hdr }, D);
      if (!seen.person || seen.person.id !== inv.body.person.id) fail("setup: " + name + " " + label + " should open the helper seat before the close");
    }
    return { id: inv.body.person.id, forms };
  }
  const hank = await helperSessions("Hank", "5151");
  const rita = await helperSessions("Rita", "6161");
  if (!hank || !rita) return;
  if ((await call(auth, "POST", owner, { action: "deny", id: hank.id })).statusCode !== 200) fail("owner could not deny Hank");
  if ((await call(auth, "POST", owner, { action: "remove", id: rita.id })).statusCode !== 200) fail("owner could not remove Rita");

  for (const [when, h] of [["after deny", hank], ["after removal", rita]]) {
    for (const [label, tok, hdr] of h.forms) {
      const tag = when + ", " + label;
      if (!lib.findSession(tok, { slide: false })) { fail("setup: " + tag + " is gone from the store, so this would prove nothing"); continue; }
      for (const [name, body] of ACTS) {
        const before = JSON.stringify(card("job_dss"));
        const f0 = fetches.length;
        const got = reply(await call(jobs, "POST", hdr, body, "/api/jobs"));
        if (got !== missing[name]) fail(STACK + " (" + tag + ": " + name + " got " + got.slice(0, 160) + ", missing desk gets " + missing[name] + ")");
        else pass(tag + ": " + name + " = missing desk reply");
        if (JSON.stringify(card("job_dss")) !== before) fail(STACK + " (" + tag + ": " + name + " changed the card)");
        if (fetches.length !== f0) fail(STACK + " (" + tag + ": " + name + " made outbound call(s) " + JSON.stringify(fetches.slice(f0)) + ")");
      }
      const f1 = fetches.length;
      const sug = await call(jobs, "POST", hdr, SUGGEST, "/api/jobs");
      if (llmCalls(f1)) fail(STACK + " (" + tag + ": suggest made " + llmCalls(f1) + " call(s) to api.x.ai)");
      else pass(tag + ": suggest made 0 calls to api.x.ai");
      if (sug.statusCode !== 401 || reply(sug) !== missing.suggest) fail(STACK + " (" + tag + ": suggest got " + reply(sug).slice(0, 160) + ", missing desk gets " + missing.suggest + ")");
      else pass(tag + ": suggest = missing desk 401");
    }
  }

  // Not vacuous: the owner still works a card, ships through the pipe, and suggest reaches the Desk AI.
  seed("job_dss_owner");
  const say = await call(jobs, "POST", owner, { action: "say", id: "job_dss_owner", text: "owner note" }, "/api/jobs");
  if (say.statusCode !== 200) fail("owner say should still work: " + reply(say).slice(0, 160));
  else pass("owner say still 200");
  const f2 = fetches.length;
  const ship = await call(jobs, "POST", owner, { action: "ship", id: "job_dss_owner", provider: "webhook", confirm: true }, "/api/jobs");
  if (ship.statusCode !== 200 || fetches.slice(f2).filter((u) => u === HOOK).length !== 1) fail("owner ship should fire the pipe once: " + ship.statusCode + " " + JSON.stringify(fetches.slice(f2)));
  else pass("owner ship fires the pipe once");
  const f3 = fetches.length;
  const sug = await call(jobs, "POST", owner, SUGGEST, "/api/jobs");
  if (sug.statusCode !== 200 || llmCalls(f3) < 1) fail("owner suggest should ask the Desk AI: " + sug.statusCode + ", " + llmCalls(f3) + " api.x.ai call(s)");
  else pass("owner suggest reaches the Desk AI");
}

main().then(() => {
  try { fs.rmSync(store, { force: true }); } catch (e) {}
  if (failed) { console.error(failed + " check(s) failed"); process.exit(1); }
  console.log("check-denied-session-stack: all good");
}).catch((e) => { console.error("FAIL threw " + (e && e.stack || e)); process.exit(1); });
