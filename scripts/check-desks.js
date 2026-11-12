require("./_env-guard");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

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
    pin: ownerPin
  });
  if (opened.statusCode !== 201) fail("desk open failed");
  // No email at open: the desk code's one first claim sets email + password together (#370).

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
  const deskAisSrc = fs.readFileSync(path.join(__dirname, "..", "desk-ais.js"), "utf8");

  function pinHdr(h) { return h && (h["X-Pin"] || h["x-pin"] || ""); }
  function sessionHdrVal(h) { return h && (h["X-Session"] || h["x-session"] || ""); }
  function runBlock(block, bag, assign) {
    const reads = [];
    const ctx = {
      localStorage: {
        getItem: function (k) {
          reads.push(k);
          return Object.prototype.hasOwnProperty.call(bag, k) ? bag[k] : null;
        }
      }
    };
    vm.runInNewContext(block + "\n" + assign, ctx);
    return { headers: ctx.__h, reads: reads };
  }
  function runBook(src, bag, slug, pin) {
    const from = src.indexOf("function sessionHdr");
    const to = src.indexOf("function atOf", from + 1);
    const block = from >= 0 && to > from ? src.slice(from, to) : "";
    if (!block) throw new Error("desks-book.js missing sessionHdr");
    const args = pin === undefined ? "this.__h = sessionHdr(" + JSON.stringify(slug) + ");"
      : "this.__h = sessionHdr(" + JSON.stringify(slug) + ", " + JSON.stringify(pin) + ");";
    return runBlock(block, bag, args);
  }
  function runAis(src, bag) {
    const from = src.indexOf("function headers()");
    const to = src.indexOf("function esc(", from + 1);
    const block = from >= 0 && to > from ? src.slice(from, to) : "";
    if (!block) throw new Error("desk-ais.js missing headers()");
    return runBlock(block, bag, "this.__h = headers();");
  }
  function runPack(src, bag) {
    const from = src.indexOf("function hdr()");
    const to = src.indexOf("function deskOpen(", from + 1);
    const block = from >= 0 && to > from ? src.slice(from, to) : "";
    if (!block) throw new Error("pack-desk-ais.js missing hdr()");
    const reads = [];
    const ctx = {
      slugify: function (s) {
        return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
      },
      localStorage: {
        getItem: function (k) {
          reads.push(k);
          return Object.prototype.hasOwnProperty.call(bag, k) ? bag[k] : null;
        }
      }
    };
    require("vm").runInNewContext(block + "\nthis.__h = hdr();", ctx);
    return { headers: ctx.__h, reads: reads };
  }
  function leftoverFaults(run, label) {
    const bad = [];
    let leftover;
    try { leftover = run({ aia_ws: "rivera-resale", aia_session: "sess-live", aia_pin: "4821" }); }
    catch (e) { return [label + " failed to run: " + (e && e.message || e)]; }
    if (sessionHdrVal(leftover.headers) !== "sess-live") bad.push(label + " session is not sent when a session is present");
    if (pinHdr(leftover.headers)) bad.push(label + " leftover pin is sent when a session is present");
    if (leftover.reads.indexOf("aia_pin") >= 0) bad.push(label + " leftover pin is read when a session is present");
    const pinOnly = run({ aia_ws: "rivera-resale", aia_pin: "4821" });
    if (pinHdr(pinOnly.headers) !== "4821" || sessionHdrVal(pinOnly.headers)) {
      bad.push(label + " session-less leftover pin is no longer sent as X-Pin");
    }
    return bad;
  }
  function bookFaults(src) {
    return leftoverFaults(function (bag) { return runBook(src, bag, bag.aia_ws); }, "desks-book");
  }
  function aisFaults(src) {
    return leftoverFaults(function (bag) { return runAis(src, bag); }, "desk-ais");
  }
  const packDeskAisSrc = fs.readFileSync(path.join(__dirname, "..", "pack-desk-ais.js"), "utf8");
  function packFaults(src) {
    return leftoverFaults(function (bag) { return runPack(src, bag); }, "pack-desk-ais");
  }

  const liveBook = bookFaults(bookJs);
  if (liveBook.length) fail("desks-book.js sessionHdr() faults: " + liveBook.join("; "));
  else pass("desks-book.js sessionHdr() is session-based; leftover pin is not read or sent");
  const otherDesk = runBook(bookJs, { aia_ws: "rivera-resale", aia_session: "sess-live", aia_pin: "4821" }, "other-desk", "9999");
  if (pinHdr(otherDesk.headers) !== "9999" || sessionHdrVal(otherDesk.headers)) {
    fail("desks-book apiDesk must still send a saved pin for another desk, not the current session");
  } else pass("desks-book still sends a saved pin for another desk");

  const liveAis = aisFaults(deskAisSrc);
  if (liveAis.length) fail("desk-ais.js headers() faults: " + liveAis.join("; "));
  else pass("desk-ais.js headers() is session-based; leftover pin is not read or sent");
  const livePack = packFaults(packDeskAisSrc);
  if (livePack.length) fail("pack-desk-ais.js hdr() faults: " + livePack.join("; "));
  else pass("pack-desk-ais.js hdr() is session-based; leftover pin is not read or sent");

  function applyBookMutant(src, kind) {
    const live = "  if (tok && (!slug || slug === current)) {\n    h[\"X-Session\"] = tok;\n    return h;\n  }\n  if (!tok && (pin == null || pin === \"\")) pin = localStorage.getItem(\"aia_pin\") || \"\";\n  if (pin) h[\"X-Pin\"] = pin;\n";
    if (kind === "desks-book leftover pin is sent when a session is present") {
      return src.replace(live, "  var pin2 = localStorage.getItem(\"aia_pin\") || pin;\n  if (tok) h[\"X-Session\"] = tok;\n  if (pin2) h[\"X-Pin\"] = pin2;\n");
    }
    if (kind === "desks-book leftover pin is read when a session is present") {
      return src.replace(live, "  var leftover = localStorage.getItem(\"aia_pin\") || \"\";\n  if (tok && (!slug || slug === current)) {\n    h[\"X-Session\"] = tok;\n    return h;\n  }\n  if (!tok && (pin == null || pin === \"\")) pin = leftover;\n  if (pin) h[\"X-Pin\"] = pin;\n");
    }
    if (kind === "desks-book session is not sent when a session is present") {
      return src.replace(live, "  if (tok && (!slug || slug === current)) {\n    return h;\n  }\n  if (!tok && (pin == null || pin === \"\")) pin = localStorage.getItem(\"aia_pin\") || \"\";\n  if (pin) h[\"X-Pin\"] = pin;\n");
    }
    if (kind === "desks-book session-less leftover pin is no longer sent as X-Pin") {
      return src.replace(live, "  if (tok && (!slug || slug === current)) {\n    h[\"X-Session\"] = tok;\n    return h;\n  }\n");
    }
    return src;
  }
  function applyPackMutant(src, kind) {
    const live = "    if (tok) h[\"X-Session\"] = tok;\n    else {\n      var pin = localStorage.getItem(\"aia_pin\") || \"\";\n      if (pin) h[\"X-Pin\"] = pin;\n    }\n";
    if (kind === "pack-desk-ais leftover pin is sent when a session is present") {
      return src.replace(live, "    var pin = localStorage.getItem(\"aia_pin\") || \"\";\n    if (tok) h[\"X-Session\"] = tok;\n    if (pin) h[\"X-Pin\"] = pin;\n");
    }
    if (kind === "pack-desk-ais leftover pin is read when a session is present") {
      return src.replace(live, "    var pin = localStorage.getItem(\"aia_pin\") || \"\";\n    if (tok) h[\"X-Session\"] = tok;\n    else if (pin) h[\"X-Pin\"] = pin;\n");
    }
    if (kind === "pack-desk-ais session is not sent when a session is present") {
      return src.replace(live, "    if (tok) {\n    } else {\n      var pin = localStorage.getItem(\"aia_pin\") || \"\";\n      if (pin) h[\"X-Pin\"] = pin;\n    }\n");
    }
    if (kind === "pack-desk-ais session-less leftover pin is no longer sent as X-Pin") {
      return src.replace(live, "    if (tok) h[\"X-Session\"] = tok;\n");
    }
    return src;
  }
  function applyAisMutant(src, kind) {
    const live = "    if (tok) h[\"X-Session\"] = tok;\n    else {\n      var pin = localStorage.getItem(\"aia_pin\") || \"\";\n      if (pin) h[\"X-Pin\"] = pin;\n    }\n";
    if (kind === "desk-ais leftover pin is sent when a session is present") {
      return src.replace(live, "    var pin = localStorage.getItem(\"aia_pin\") || \"\";\n    if (tok) h[\"X-Session\"] = tok;\n    if (pin) h[\"X-Pin\"] = pin;\n");
    }
    if (kind === "desk-ais leftover pin is read when a session is present") {
      return src.replace(live, "    var pin = localStorage.getItem(\"aia_pin\") || \"\";\n    if (tok) h[\"X-Session\"] = tok;\n    else if (pin) h[\"X-Pin\"] = pin;\n");
    }
    if (kind === "desk-ais session is not sent when a session is present") {
      return src.replace(live, "    if (tok) {\n    } else {\n      var pin = localStorage.getItem(\"aia_pin\") || \"\";\n      if (pin) h[\"X-Pin\"] = pin;\n    }\n");
    }
    if (kind === "desk-ais session-less leftover pin is no longer sent as X-Pin") {
      return src.replace(live, "    if (tok) h[\"X-Session\"] = tok;\n");
    }
    return src;
  }
  const headerMutants = [
    ["desks-book leftover pin is sent when a session is present", "book"],
    ["desks-book leftover pin is read when a session is present", "book"],
    ["desks-book session is not sent when a session is present", "book"],
    ["desks-book session-less leftover pin is no longer sent as X-Pin", "book"],
    ["desk-ais leftover pin is sent when a session is present", "ais"],
    ["desk-ais leftover pin is read when a session is present", "ais"],
    ["desk-ais session is not sent when a session is present", "ais"],
    ["desk-ais session-less leftover pin is no longer sent as X-Pin", "ais"],
    ["pack-desk-ais leftover pin is sent when a session is present", "pack"],
    ["pack-desk-ais leftover pin is read when a session is present", "pack"],
    ["pack-desk-ais session is not sent when a session is present", "pack"],
    ["pack-desk-ais session-less leftover pin is no longer sent as X-Pin", "pack"]
  ];
  let headerCaught = 0;
  headerMutants.forEach(function (row) {
    const kind = row[0];
    const which = row[1];
    const base = which === "book" ? bookJs : which === "pack" ? packDeskAisSrc : deskAisSrc;
    const next = which === "book" ? applyBookMutant(base, kind) : which === "pack" ? applyPackMutant(base, kind) : applyAisMutant(base, kind);
    if (next === base) { fail("header mutant does not apply: " + kind); return; }
    const faults = which === "book" ? bookFaults(next) : which === "pack" ? packFaults(next) : aisFaults(next);
    if (faults.indexOf(kind) < 0) fail("header mutant survived: " + kind + " (got " + JSON.stringify(faults) + ")");
    else { headerCaught += 1; pass("header mutant caught: " + kind); }
  });
  if (headerCaught !== headerMutants.length) fail("header mutants: " + headerCaught + "/" + headerMutants.length + " caught");
  else pass("header mutants: " + headerCaught + "/" + headerMutants.length + " caught");
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

  const memberPin = "1357";
  const invited = await call(auth, "POST", {
    "x-workspace": "rivera-resale",
    "x-pin": strangerPin,
    "x-session": onboardTok
  }, {
    action: "invite",
    name: "Jordan",
    kind: "member",
    pin: memberPin,
    instructions: "Run the morning queue. Drop school forms. Hand money cards to me."
  });
  if (invited.statusCode !== 201 && invited.statusCode !== 200) {
    fail("owner invite member should work " + invited.statusCode + " " + JSON.stringify(invited.body));
  } else pass("owner invites a member seat");

  const instructed = await call(desks, "POST", {
    "x-workspace": "rivera-resale",
    "x-pin": strangerPin,
    "x-session": onboardTok
  }, {
    action: "update",
    instructions: "Run the morning queue. Drop school forms. Hand money cards to me."
  });
  if (instructed.statusCode !== 200 || !instructed.body || !instructed.body.desk ||
      instructed.body.desk.instructions.indexOf("morning queue") < 0) {
    fail("owner should save member instructions " + instructed.statusCode + " " + JSON.stringify(instructed.body));
  } else pass("owner saves member instructions on the desk");

  const memberLogin = await call(auth, "POST", { "x-workspace": "rivera-resale" }, {
    action: "login",
    slug: "rivera-resale",
    pin: memberPin
  });
  const memberTok = memberLogin.body && memberLogin.body.session && memberLogin.body.session.token;
  if (memberLogin.statusCode !== 200 || !memberLogin.body || !memberLogin.body.you) {
    fail("member login should open the desk " + memberLogin.statusCode + " " + JSON.stringify(memberLogin.body));
  } else pass("member login opens the desk");

  const memberMine = await call(desks, "POST", {
    "x-workspace": "rivera-resale",
    "x-pin": memberPin,
    "x-session": memberTok || ""
  }, { action: "mine" });
  const sit = ((memberMine.body && memberMine.body.member) || []).find((d) => d && d.slug === "rivera-resale");
  if (memberMine.statusCode !== 200 || !sit || sit.kind !== "member" || String(sit.instructions || "").indexOf("morning queue") < 0) {
    fail("member mine should show instructions " + memberMine.statusCode + " " + JSON.stringify(memberMine.body));
  } else pass("member mine shows owner instructions");

  const asked = await call(desks, "POST", {
    "x-workspace": "rivera-resale",
    "x-pin": memberPin,
    "x-session": memberTok || ""
  }, { action: "ask", kind: "helper" });
  if (asked.statusCode !== 202 || !asked.body || !asked.body.pending) {
    fail("member ask should queue for owner " + asked.statusCode + " " + JSON.stringify(asked.body));
  } else pass("member ask queues for owner");

  const left = await call(desks, "POST", {
    "x-workspace": "rivera-resale",
    "x-pin": memberPin,
    "x-session": memberTok || ""
  }, { action: "leave" });
  if (left.statusCode !== 200 || !left.body || left.body.left !== "rivera-resale") {
    fail("member leave should drop the seat " + left.statusCode + " " + JSON.stringify(left.body));
  } else pass("member leave drops the seat");

  const ownerLeave = await call(desks, "POST", {
    "x-workspace": "rivera-resale",
    "x-pin": strangerPin,
    "x-session": onboardTok
  }, { action: "leave" });
  if (ownerLeave.statusCode !== 409) {
    fail("last owner leave should 409 " + ownerLeave.statusCode + " " + JSON.stringify(ownerLeave.body));
  } else pass("last owner cannot leave");

  if (bookJs.indexOf("save-instruct") < 0 || bookJs.indexOf("Owner instructions") < 0) {
    fail("desks-book must paint owner instructions and save");
  } else pass("desks-book paints and saves owner instructions");
  if (bookJs.indexOf('action: "leave"') < 0 && bookJs.indexOf('"leave"') < 0) {
    fail("desks-book must still call leave");
  } else pass("desks-book still calls leave");

  if (yesNo.indexOf("Member desk leftover") < 0) fail("ACCOUNT-YES-NO must name Member desk leftover");
  else pass("ACCOUNT-YES-NO names Member desk leftover");
  if (packMd.indexOf("Member desk leftover") < 0) fail("PACK.md must name Member desk leftover");
  else pass("PACK.md names Member desk leftover");

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
