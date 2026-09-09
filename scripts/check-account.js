const fs = require("fs");
const os = require("os");
const path = require("path");

const store = path.join(os.tmpdir(), "aia-account-check-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;

function resetModules() {
  delete global.__aia;
  delete global.__aiaHydrate;
  ["../api/_lib", "../api/_account", "../api/_plans", "../api/_account-http", "../api/auth"].forEach((mod) => {
    try { delete require.cache[require.resolve(mod)]; } catch (e) {}
  });
}

function boot() {
  resetModules();
  return {
    lib: require("../api/_lib"),
    account: require("../api/_account-http"),
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

  const deskGet = await call(account, "GET", { "x-workspace": "oddo-books", "x-pin": ownerPin });
  if (deskGet.statusCode !== 200 || !deskGet.body || !deskGet.body.ok) {
    fail("open desk pin should GET /api/account");
  } else pass("open desk pin GETs account");

  const staleGet = await call(account, "GET", {
    "x-workspace": "oddo-books",
    "x-session": "deadbeefdeadbeefdeadbeefdeadbeef",
    "x-pin": ownerPin
  });
  if (staleGet.statusCode !== 200 || !staleGet.body || !staleGet.body.ok) {
    fail("stale session must not drop a matching open-desk pin on GET /api/account");
  } else pass("stale session still honors open-desk pin");

  const emptyLogin = await call(account, "POST", { "x-workspace": "oddo-books" }, {
    action: "login", slug: "oddo-books", pin: "", name: "oddo-books"
  });
  if (emptyLogin.statusCode !== 401 || !/Account name or code does not match/.test((emptyLogin.body && emptyLogin.body.error) || "")) {
    fail("empty Studio Open code should 401");
  } else pass("empty Studio Open code stays 401");

  const wrongLogin = await call(account, "POST", {}, {
    action: "login", slug: "oddo-books", pin: "0000", name: "oddo-books"
  });
  if (wrongLogin.statusCode !== 401 || !/Account name or code does not match/.test((wrongLogin.body && wrongLogin.body.error) || "")) {
    fail("wrong Studio Open code should 401");
  } else pass("wrong Studio Open code stays 401");

  const pinLogin = await call(account, "POST", {}, {
    action: "login", slug: "oddo-books", pin: ownerPin, name: "oddo-books"
  });
  if (pinLogin.statusCode !== 200 || !pinLogin.body || !pinLogin.body.ok) {
    fail("matching Studio Open code should open the account");
  } else pass("matching Studio Open code opens the account");

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
  if (onboarded.statusCode !== 201 || !onboarded.body.account || !onboardTok || !/aia_session=/.test(String(onboarded.headers["Set-Cookie"] || ""))) {
    fail("Owner onboard via /api/auth should mint the desk and issue a session");
  } else pass("Owner onboard issues a session for Studio leftover");

  const leftover = "deadbeefdeadbeefdeadbeefdeadbeef";
  const openLab = await call(account, "POST", {
    "x-workspace": "rivera-resale",
    "x-session": leftover,
    "x-pin": strangerPin
  }, {
    action: "login", slug: "rivera-resale", pin: strangerPin, name: "rivera-resale"
  });
  if (openLab.statusCode !== 200 || !openLab.body || !openLab.body.ok) {
    fail("Studio openLab must accept the Owner slug+pin auth just created");
  } else pass("Studio openLab accepts onboard Owner slug+pin");

  const openLabName = await call(account, "POST", {
    "x-workspace": "rivera-resale",
    "x-session": leftover,
    "x-pin": strangerPin
  }, {
    action: "login", slug: "Rivera Resale", pin: strangerPin, name: "Rivera Resale"
  });
  if (openLabName.statusCode !== 200 || !openLabName.body || !openLabName.body.ok) {
    fail("Studio openLab must accept the prefilled desk name + Owner code");
  } else pass("Studio openLab accepts prefilled desk name");

  const openLabSession = await call(account, "POST", {
    "x-workspace": "rivera-resale",
    "x-session": onboardTok,
    "x-pin": strangerPin
  }, {
    action: "login", slug: "rivera-resale", pin: strangerPin, name: "rivera-resale"
  });
  if (openLabSession.statusCode !== 200 || !openLabSession.body || !openLabSession.body.ok) {
    fail("Studio openLab must still honor leftover X-Session + matching X-Pin");
  } else pass("Studio openLab honors leftover session with matching pin");

  const wrongOnboard = await call(account, "POST", {
    "x-workspace": "rivera-resale",
    "x-session": leftover,
    "x-pin": "0000"
  }, {
    action: "login", slug: "rivera-resale", pin: "0000", name: "rivera-resale"
  });
  if (wrongOnboard.statusCode !== 401 || !/Account name or code does not match/.test((wrongOnboard.body && wrongOnboard.body.error) || "")) {
    fail("wrong onboard Owner code should still 401");
  } else pass("wrong onboard Owner code stays 401");

  const vercel = fs.readFileSync(path.join(__dirname, "..", "vercel.json"), "utf8");
  if (!/"\/api\/account"/.test(vercel) || !vercel.includes("/api/auth?via=account")) {
    fail("vercel.json must run /api/account on the /api/auth function");
  } else pass("vercel.json runs /api/account on the /api/auth function");
  if (fs.existsSync(path.join(__dirname, "..", "api/account.js"))) {
    fail("api/account.js must not be its own Lambda");
  } else pass("api/account.js is folded into auth");

  const dispatched = await call(auth, "POST", {
    "x-workspace": "rivera-resale",
    "x-pin": strangerPin
  }, {
    action: "login", slug: "rivera-resale", pin: strangerPin, name: "rivera-resale"
  }, { via: "account" });
  if (dispatched.statusCode !== 200 || !dispatched.body || !dispatched.body.ok) {
    fail("auth?via=account must open Studio on the same function as Owner onboard");
  } else pass("auth?via=account opens Studio on the onboard function");

  const dispatchedWrong = await call(auth, "POST", {
    "x-workspace": "rivera-resale",
    "x-pin": "0000"
  }, {
    action: "login", slug: "rivera-resale", pin: "0000", name: "rivera-resale"
  }, { via: "account" });
  if (dispatchedWrong.statusCode !== 401 || !/Account name or code does not match/.test((dispatchedWrong.body && dispatchedWrong.body.error) || "")) {
    fail("auth?via=account wrong pin should still 401");
  } else pass("auth?via=account wrong pin stays 401");

  const dispatchedOpen = await call(auth, "POST", {
    "x-workspace": "rivera-resale",
    "x-pin": strangerPin
  }, {
    action: "open", slug: "rivera-resale", pin: strangerPin, name: "rivera-resale"
  }, { via: "account" });
  if (dispatchedOpen.statusCode !== 200 || !dispatchedOpen.body || !dispatchedOpen.body.ok) {
    fail("auth?via=account open must accept the onboard Owner slug+pin");
  } else pass("auth?via=account open accepts onboard Owner slug+pin");

  const dispatchedGet = await call(auth, "GET", {
    "x-workspace": "rivera-resale",
    "x-pin": strangerPin,
    "x-session": onboardTok
  }, {}, { via: "account" });
  if (dispatchedGet.statusCode !== 200 || !dispatchedGet.body || !dispatchedGet.body.ok) {
    fail("GET /api/account via auth must accept onboard session + pin");
  } else pass("GET /api/account via auth accepts onboard session + pin");

  const leftoverGet = await call(account, "GET", {
    "x-workspace": "rivera-resale",
    "x-session": leftover
  }, {});
  if (leftoverGet.statusCode !== 401) {
    fail("leftover session without pin must still 401 GET /api/account");
  } else pass("leftover session without pin stays 401 on GET");
  const leftoverGetPin = await call(account, "GET", {
    "x-workspace": "rivera-resale",
    "x-session": leftover,
    "x-pin": strangerPin
  }, {});
  if (leftoverGetPin.statusCode !== 200 || !leftoverGetPin.body || !leftoverGetPin.body.ok) {
    fail("leftover session + matching pin must still GET /api/account");
  } else pass("leftover session + pin GET opens the account");

  const deskOnly = (lib.mem.accounts || []).find((a) => a && a.slug === "rivera-resale");
  const deskRow = (lib.mem.workspaces || []).find((w) => w && w.slug === "rivera-resale");
  if (deskOnly) {
    deskOnly.pin = "";
    deskOnly.slug = "other-home";
    deskOnly.name = "Other Home";
  }
  const viaDesk = await call(account, "POST", { "x-workspace": "rivera-resale", "x-pin": strangerPin }, {
    action: "login", slug: "rivera-resale", pin: strangerPin, name: "rivera-resale"
  });
  if (viaDesk.statusCode !== 200 || !viaDesk.body || !viaDesk.body.ok) {
    fail("open-desk pin must still open Studio when the account-store pin/slug drifted");
  } else pass("open-desk pin opens Studio when account store drifted");

  if (deskRow) deskRow.pin = "";
  if (deskOnly) {
    deskOnly.pin = "";
    deskOnly.slug = "other-home";
    deskOnly.name = "Other Home";
  }
  const viaOwner = await call(account, "POST", { "x-workspace": "rivera-resale", "x-pin": strangerPin }, {
    action: "login", slug: "rivera-resale", pin: strangerPin, name: "rivera-resale"
  });
  if (viaOwner.statusCode !== 200 || !viaOwner.body || !viaOwner.body.ok) {
    fail("owner seat pin must still open Studio when desk.pin and account.pin are empty");
  } else pass("owner seat pin opens Studio when other pins are empty");

  await lib.save();
  const diskSnap = JSON.parse(fs.readFileSync(store, "utf8"));
  lib.mem.workspaces = [];
  lib.mem.accounts = [];
  lib.mem.sessions = [];
  const staleInst = await call(account, "POST", {
    "x-workspace": "rivera-resale",
    "x-session": leftover,
    "x-pin": strangerPin
  }, {
    action: "login", slug: "rivera-resale", pin: strangerPin, name: "rivera-resale"
  });
  if (staleInst.statusCode !== 401) {
    fail("empty in-memory store should 401 until the shared store is applied");
  } else pass("stale instance without the open desk stays 401");
  if (typeof lib.applyStore !== "function") fail("applyStore should reload the shared auth/account store");
  else {
    lib.applyStore(diskSnap);
    const reloaded = await call(account, "POST", {
      "x-workspace": "rivera-resale",
      "x-session": leftover,
      "x-pin": strangerPin
    }, {
      action: "login", slug: "rivera-resale", pin: strangerPin, name: "rivera-resale"
    });
    if (reloaded.statusCode !== 200 || !reloaded.body || !reloaded.body.ok) {
      fail("applyStore must make the onboard Owner desk visible to /api/account login");
    } else pass("shared store reload lets /api/account see the auth-created Owner desk");
  }

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
  const oddoAcc = (lib.mem.accounts || []).find((a) => a && (a.slug === "oddo-books" || (a.desks || []).indexOf("oddo-books") >= 0));
  const allOut = await call(account, "POST", { "x-workspace": "oddo-books", "x-session": allToken }, { action: "logout-all" });
  if (allOut.statusCode !== 200 || (lib.listSessions({ accountId: (oddoAcc || {}).id }) || []).length) fail("logout-all should clear every phone");
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
