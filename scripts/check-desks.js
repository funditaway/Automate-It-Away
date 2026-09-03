const os = require("os");
const path = require("path");

const store = path.join(os.tmpdir(), "aia-desks-check-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;

delete global.__aia;
delete global.__aiaHydrate;
["../api/_lib", "../api/auth", "../api/desks", "../api/account"].forEach((mod) => {
  try { delete require.cache[require.resolve(mod)]; } catch (e) {}
});

const auth = require("../api/auth");
const desks = require("../api/desks");
const account = require("../api/account");
const lib = require("../api/_lib");

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
  await lib.ready();
  const ownerPin = "4821";
  const email = "owner@example.com";
  const password = "good-pass1";

  const opened = await call(auth, "POST", { "x-workspace": "session-desk" }, {
    action: "open",
    slug: "session-desk",
    biz: "Session Desk",
    name: "James",
    email,
    pin: ownerPin
  });
  if (opened.statusCode !== 201) fail("desk open failed");

  const pw = await call(account, "POST", { "x-workspace": "session-desk", "x-pin": ownerPin }, {
    action: "password",
    email,
    password
  });
  if (pw.statusCode !== 200) fail("password setup failed");

  const login = await call(account, "POST", {}, { action: "login", email, password });
  const token = login.body && login.body.session && login.body.session.token;
  if (login.statusCode !== 200 || !token) fail("session login failed");
  else pass("session login works");

  const byHeader = await call(desks, "GET", { "x-workspace": "session-desk", "x-session": token }, {}, {});
  if (byHeader.statusCode !== 200 || !byHeader.body || !byHeader.body.desk) fail("desks GET should accept X-Session");
  else pass("desks GET accepts X-Session");

  const byCookie = await call(desks, "GET", { "x-workspace": "session-desk", cookie: "aia_session=" + encodeURIComponent(token) }, {}, {});
  if (byCookie.statusCode !== 200 || !byCookie.body || !byCookie.body.desk) fail("desks GET should accept aia_session cookie");
  else pass("desks GET accepts aia_session cookie");

  const edited = await call(desks, "POST", { "x-workspace": "session-desk", "x-session": token }, { action: "update", biz: "Session Desk Two" });
  if (edited.statusCode !== 200 || !edited.body || !edited.body.desk || edited.body.desk.name !== "Session Desk Two") fail("desks POST update should keep the session seat");
  else pass("desks POST update accepts session auth");

  const exported = await call(desks, "POST", { "x-workspace": "session-desk", "x-session": token }, { action: "export" });
  if (exported.statusCode !== 200 || !exported.body || !exported.body.pack) fail("desks export should accept session auth");
  else pass("desks export accepts session auth");

  if (process.exitCode) {
    console.error("check-desks failed");
    process.exit(1);
  }
  console.log("check-desks passed");
}

main().catch((err) => {
  fail(err && err.stack || String(err));
  console.error("check-desks failed");
  process.exit(1);
});
