const fs = require("fs");
const os = require("os");
const path = require("path");

const store = path.join(os.tmpdir(), "aia-desks-check-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;

delete global.__aia;
delete global.__aiaHydrate;
["../api/_lib", "../api/auth", "../api/_desks-http", "../api/_account-http"].forEach((mod) => {
  try { delete require.cache[require.resolve(mod)]; } catch (e) {}
});

const auth = require("../api/auth");
const desks = require("../api/_desks-http");
const account = require("../api/_account-http");
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

  const vercel = fs.readFileSync(path.join(__dirname, "..", "vercel.json"), "utf8");
  if (!/"\/api\/desks"/.test(vercel) || !vercel.includes("/api/auth?via=desks")) {
    fail("vercel.json must run /api/desks on the /api/auth function");
  } else pass("vercel.json runs /api/desks on the /api/auth function");
  if (fs.existsSync(path.join(__dirname, "..", "api/desks.js"))) {
    fail("api/desks.js must not be its own Lambda");
  } else pass("api/desks.js is folded into auth");

  const strangerPin = "2468";
  const onboarded = await call(auth, "POST", { "x-workspace": "rivera-resale", "x-pin": strangerPin }, {
    action: "account",
    name: "Pat",
    biz: "Rivera Resale",
    slug: "rivera-resale",
    workspace: "rivera-resale",
    kind: "owner",
    role: "owner",
    pin: strangerPin
  });
  const onboardTok = onboarded.body && onboarded.body.session && onboarded.body.session.token;
  if (onboarded.statusCode !== 201 || !onboarded.body.workspace || !onboardTok) {
    fail("Owner onboard via /api/auth should mint the desk and issue a session");
  } else pass("Owner onboard issues a session for Desk AIs leftover");

  const leftover = "deadbeefdeadbeefdeadbeefdeadbeef";
  const emptyPin = await call(auth, "GET", {
    "x-workspace": "rivera-resale",
    "x-session": leftover
  }, {}, { via: "desks" });
  if (emptyPin.statusCode !== 401 || !/Desk code required/.test((emptyPin.body && emptyPin.body.error) || "")) {
    fail("empty pin should still 401 GET /api/desks, got " + emptyPin.statusCode + " " + JSON.stringify(emptyPin.body));
  } else pass("empty pin stays 401 on GET /api/desks");

  const wrongPin = await call(auth, "GET", {
    "x-workspace": "rivera-resale",
    "x-session": leftover,
    "x-pin": "0000"
  }, {}, { via: "desks" });
  if (wrongPin.statusCode !== 401 || !/Desk code required/.test((wrongPin.body && wrongPin.body.error) || "")) {
    fail("wrong pin should still 401 GET /api/desks, got " + wrongPin.statusCode + " " + JSON.stringify(wrongPin.body));
  } else pass("wrong pin stays 401 on GET /api/desks");

  const dispatchedGet = await call(auth, "GET", {
    "x-workspace": "rivera-resale",
    "x-pin": strangerPin,
    "x-session": onboardTok
  }, {}, { via: "desks" });
  if (dispatchedGet.statusCode !== 200 || !dispatchedGet.body || !dispatchedGet.body.desk || dispatchedGet.body.desk.slug !== "rivera-resale") {
    fail("GET /api/desks via auth must see the onboard Owner desk " + dispatchedGet.statusCode + " " + JSON.stringify(dispatchedGet.body));
  } else pass("GET /api/desks via auth sees the onboard Owner desk");

  const leftoverGetPin = await call(auth, "GET", {
    "x-workspace": "rivera-resale",
    "x-session": leftover,
    "x-pin": strangerPin
  }, {}, { via: "desks" });
  if (leftoverGetPin.statusCode !== 200 || !leftoverGetPin.body || !leftoverGetPin.body.desk) {
    fail("leftover session + matching pin must GET /api/desks");
  } else pass("leftover session + pin GET opens the desk");

  const bookJs = fs.readFileSync(path.join(__dirname, "..", "desks-book.js"), "utf8");
  if (/if \(tok\) h\["X-Session"\] = tok; else if \(pin\)/.test(bookJs)) {
    fail("desks-book hdr must still send the open-desk pin when a session token is present");
  } else pass("desks-book hdr keeps X-Pin with X-Session");
  if (bookJs.indexOf('if (pin) h["X-Pin"] = pin') < 0) fail("desks-book hdr must send X-Pin");
  else pass("desks-book hdr sends X-Pin");
  const yesNo = fs.readFileSync(path.join(__dirname, "..", "ACCOUNT-YES-NO.md"), "utf8");
  const packMd = fs.readFileSync(path.join(__dirname, "..", "PACK.md"), "utf8");
  if (yesNo.indexOf("Desks book leftover") < 0) fail("ACCOUNT-YES-NO must name Desks book leftover");
  else pass("ACCOUNT-YES-NO names Desks book leftover");
  if (packMd.indexOf("Desks book leftover") < 0) fail("PACK.md must name Desks book leftover");
  else pass("PACK.md names Desks book leftover");

  const leftoverMine = await call(auth, "POST", {
    "x-workspace": "rivera-resale",
    "x-session": leftover
  }, { action: "mine" }, { via: "desks" });
  if (leftoverMine.statusCode !== 401) {
    fail("leftover session without pin must still 401 desks mine");
  } else pass("leftover session without pin stays 401 on desks mine");
  const leftoverMinePin = await call(auth, "POST", {
    "x-workspace": "rivera-resale",
    "x-session": leftover,
    "x-pin": strangerPin
  }, { action: "mine" }, { via: "desks" });
  if (leftoverMinePin.statusCode !== 200 || !leftoverMinePin.body || !leftoverMinePin.body.ok || !(leftoverMinePin.body.owned || leftoverMinePin.body.desks)) {
    fail("leftover session + matching pin must still mine desks " + leftoverMinePin.statusCode + " " + JSON.stringify(leftoverMinePin.body));
  } else pass("leftover session + pin mines the desks book");
  const wrongMine = await call(auth, "POST", {
    "x-workspace": "rivera-resale",
    "x-session": leftover,
    "x-pin": "0000"
  }, { action: "mine" }, { via: "desks" });
  if (wrongMine.statusCode !== 401) {
    fail("wrong pin should still 401 desks mine");
  } else pass("wrong pin stays 401 on desks mine");

  const saveAi = await call(auth, "POST", {
    "x-workspace": "rivera-resale",
    "x-pin": strangerPin,
    "x-session": onboardTok
  }, {
    action: "save-ai",
    name: "Project AI",
    role: "Worker",
    does: "Qualify cards on this desk",
    steps: "qualify, follow"
  }, { via: "desks" });
  if (saveAi.statusCode !== 200 || !saveAi.body || !saveAi.body.ok || !(saveAi.body.ais || []).some((a) => a && a.name === "Project AI")) {
    fail("save-ai via auth must bind on the onboard desk " + saveAi.statusCode + " " + JSON.stringify(saveAi.body));
  } else pass("save-ai via auth binds on the onboard desk");

  const afterSave = await call(auth, "GET", {
    "x-workspace": "rivera-resale",
    "x-pin": strangerPin,
    "x-session": leftover
  }, {}, { via: "desks" });
  const leftoverAis = (afterSave.body && afterSave.body.desk && afterSave.body.desk.ais) || [];
  if (afterSave.statusCode !== 200 || !leftoverAis.some((a) => a && a.name === "Project AI")) {
    fail("GET /api/desks after save-ai must still paint named AIs");
  } else pass("GET /api/desks after save-ai paints named AIs");

  const packsGet = await call(auth, "GET", {
    "x-workspace": "rivera-resale",
    "x-pin": strangerPin
  }, {}, { via: "desks", packs: "1" });
  if (packsGet.statusCode !== 200 || !packsGet.body || packsGet.body.ok === false) {
    fail("GET /api/desks?packs=1 via auth should share the onboard store " + packsGet.statusCode + " " + JSON.stringify(packsGet.body));
  } else pass("GET /api/desks?packs=1 via auth shares onboard store");

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
