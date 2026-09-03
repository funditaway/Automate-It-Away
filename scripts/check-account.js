const fs = require("fs");
const os = require("os");
const path = require("path");

const store = path.join(os.tmpdir(), "aia-account-check-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;

function resetModules() {
  delete global.__aia;
  delete global.__aiaHydrate;
  ["../api/_lib", "../api/_account", "../api/account", "../api/auth"].forEach((mod) => {
    try { delete require.cache[require.resolve(mod)]; } catch (e) {}
  });
}

function boot() {
  resetModules();
  return {
    lib: require("../api/_lib"),
    account: require("../api/account"),
    auth: require("../api/auth")
  };
}

function fail(msg) {
  console.error("FAIL " + msg);
  process.exitCode = 1;
}
function pass(msg) { console.log("ok  " + msg); }

function mockRes() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    end() { return this; }
  };
}

async function call(handler, method, headers, body, query) {
  const res = mockRes();
  await handler({ method, headers: headers || {}, body: body || {}, query: query || {} }, res);
  return res;
}

async function main() {
  let { lib, account, auth } = boot();
  await lib.ready();

  const ownerPin = "4821";
  const memberPin = "7390";
  const email = "owner@example.com";
  const password = "good-pass1";

  const opened = await call(auth, "POST", { "x-workspace": "oddo-books" }, {
    action: "open",
    slug: "oddo-books",
    biz: "Oddo Books",
    name: "James",
    email,
    pin: ownerPin
  });
  if (opened.statusCode !== 201 || !opened.body.account || !/^acct_[0-9a-z]+[0-9a-f]{8}$/.test(opened.body.account.id)) {
    fail("open should mint a unique acct_* id");
  } else pass("open mints a unique acct id");

  const pw = await call(account, "POST", { "x-workspace": "oddo-books", "x-pin": ownerPin }, {
    action: "password",
    email,
    password
  });
  const savedAcc = (lib.mem.accounts || [])[0] || null;
  if (pw.statusCode !== 200 || !savedAcc || savedAcc.password === password || !savedAcc.password) {
    fail("password action should hash and save the password");
  } else pass("password action stores only a hash");

  const login = await call(account, "POST", {}, { action: "login", email, password });
  const token = login.body && login.body.session && login.body.session.token;
  if (login.statusCode !== 200 || !token || !/aia_session=/.test(String(login.headers["Set-Cookie"] || ""))) {
    fail("email login should return a session token and cookie");
  } else pass("email login returns session token + cookie");

  const join = await call(auth, "POST", {}, { action: "join", workspace: "oddo-books", name: "Lee", kind: "helper", pin: memberPin, email: "lee@example.com" });
  if (join.statusCode !== 202 || !(lib.mem.approvals || []).length) fail("join should create a persisted approval row");
  else pass("join creates an approval row");

  await lib.save();
  let disk = JSON.parse(fs.readFileSync(store, "utf8"));
  if (!Array.isArray(disk.accounts) || !disk.accounts.length || !Array.isArray(disk.sessions) || !disk.sessions.length || !Array.isArray(disk.approvals) || !disk.approvals.length) {
    fail("store payload should persist accounts, sessions, and approvals");
  } else pass("store payload persists account state");

  ({ lib, account } = boot());
  await lib.ready();
  const cold = await call(account, "POST", {}, { action: "login", email, password });
  if (cold.statusCode !== 200 || !cold.body.session || !cold.body.account) fail("cold start should still allow email login");
  else pass("cold start keeps email login working");

  const sessionHeaders = { "x-workspace": "oddo-books", "x-session": cold.body.session.token };
  const sessions = await call(account, "POST", sessionHeaders, { action: "sessions" });
  const listed = sessions.body && sessions.body.sessions || [];
  if (sessions.statusCode !== 200 || !listed.length || !listed.some((row) => row.current)) fail("sessions action should list current phones");
  else pass("sessions action lists phones");

  const extraLogin = await call(account, "POST", {}, { action: "login", email, password });
  const extraToken = extraLogin.body && extraLogin.body.session && extraLogin.body.session.token;
  const oneOut = await call(account, "POST", { "x-session": extraToken }, { action: "logout" });
  if (oneOut.statusCode !== 200 || !/Max-Age=0/.test(String(oneOut.headers["Set-Cookie"] || ""))) fail("logout should clear one phone cookie");
  else pass("logout clears one phone");

  const relogin = await call(account, "POST", {}, { action: "login", email, password });
  const allToken = relogin.body && relogin.body.session && relogin.body.session.token;
  const allOut = await call(account, "POST", { "x-workspace": "oddo-books", "x-session": allToken }, { action: "logout-all" });
  if (allOut.statusCode !== 200 || (lib.listSessions({ accountId: ((lib.mem.accounts || [])[0] || {}).id }) || []).length) fail("logout-all should clear every phone");
  else pass("logout-all clears every phone");

  const relogin2 = await call(account, "POST", {}, { action: "login", email, password });
  const liveToken = relogin2.body && relogin2.body.session && relogin2.body.session.token;
  const liveHeaders = { "x-workspace": "oddo-books", "x-session": liveToken };

  const exported = await call(account, "POST", liveHeaders, { action: "export" });
  const pack = exported.body && exported.body.pack;
  const deskJson = JSON.stringify(pack || {});
  if (exported.statusCode !== 200 || !pack || (pack.account && pack.account.password) || /"pin"\s*:/.test(deskJson) || /"password"\s*:/.test(deskJson)) {
    fail("export should omit password hashes and raw pins");
  } else pass("export omits password hashes and raw pins");

  const mfa = await call(account, "POST", liveHeaders, { action: "mfa", on: true });
  if (mfa.statusCode !== 409 || !mfa.body.hold) fail("mfa on should 409 HOLD");
  else pass("mfa stays HOLD");

  let last = null;
  for (let i = 0; i < 8; i++) last = await call(account, "POST", {}, { action: "login", email, password: "wrong-pass" });
  if (!last || last.statusCode !== 429 || !last.body.locked || !lib.isLocked("email:" + email)) {
    fail("eighth bad email try should lock for 15 minutes");
  } else pass("eight bad email tries lock the door");

  await lib.save();
  disk = JSON.parse(fs.readFileSync(store, "utf8"));
  if (!Array.isArray(disk.locks) || !disk.locks.length) fail("store payload should persist locks too");
  else pass("store payload persists locks");

  if (process.exitCode) {
    console.error("check-account failed");
    process.exit(1);
  }
  console.log("check-account passed");
}

main().catch((err) => {
  fail(err && err.stack || String(err));
  console.error("check-account failed");
  process.exit(1);
});
