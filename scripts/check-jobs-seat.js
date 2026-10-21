#!/usr/bin/env node
// Proves GET /api/jobs: a desk name alone returns no cards, a seated person
// still gets them, a waiting seat is refused, a real desk and a made-up desk
// look the same, and a pin is never taken from the URL.
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
const store = path.join(os.tmpdir(), "aia-jobs-seat-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;
delete global.__aia;
delete global.__aiaHydrate;

function fail(msg) {
  console.error("FAIL " + msg);
  process.exit(1);
}
function pass(msg) { console.log("ok  " + msg); }

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function mockRes() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    end(b) { if (b !== undefined && this.body == null) this.body = b; return this; }
  };
}

async function call(handler, method, headers, body, query, url) {
  const res = mockRes();
  await handler({
    method: method,
    headers: headers || {},
    body: body || {},
    query: query || {},
    url: url || "/api/jobs"
  }, res);
  return res;
}

function leaked(body, secret) {
  return JSON.stringify(body == null ? "" : body).indexOf(secret) >= 0;
}

function sameReply(a, b, label) {
  if (a.statusCode !== b.statusCode || JSON.stringify(a.body) !== JSON.stringify(b.body)) {
    fail(label + " — " + a.statusCode + " " + JSON.stringify(a.body) + " vs " + b.statusCode + " " + JSON.stringify(b.body));
  }
}

function noCards(res, secret, fileUrl, pin) {
  const blob = JSON.stringify(res.body == null ? "" : res.body);
  if (res.statusCode === 200) fail("stranger read must not be 200: " + blob);
  if (res.body && (res.body.jobs || res.body.cap || res.body.audit || res.body.money || res.body.inbox || res.body.files)) {
    fail("stranger read must not include cards or files: " + blob);
  }
  [secret, fileUrl, "Porch secret", "quiet.pdf", pin].forEach(function (bit) {
    if (bit && leaked(res.body, bit)) fail("stranger read leaked " + bit);
  });
}

function assertSources() {
  const jobs = read("api/jobs.js");
  if (jobs.indexOf("personOf") < 0) fail("GET /api/jobs must use personOf");
  if (jobs.indexOf("That seat is waiting on the owner.") < 0) fail("waiting seat message missing");
  if (jobs.indexOf("No desk with that name.") < 0) fail("hidden desk message missing");
  if (/query\.pin|query\[["']pin["']\]|searchParams\.get\(\s*["']pin["']/.test(jobs)) {
    fail("GET /api/jobs must not read a pin from the URL");
  }
  pass("jobs source gates the read and ignores a pin in the URL");

  const desk = read("desk.html");
  if (desk.indexOf('h["X-Workspace"] = ws') < 0 || desk.indexOf('h["X-Session"] = tok') < 0 || desk.indexOf('h["X-Pin"] = pin') < 0) {
    fail("desk.html must keep sending X-Workspace, X-Session, and X-Pin");
  }
  if (desk.indexOf('api("/api/jobs")') < 0) fail("desk.html must still load the queue with api(\"/api/jobs\")");
  pass("desk.html still sends the seat on the queue load");

  const view = read("desk-view.js");
  if (view.indexOf('h["X-Session"] = desk.token') < 0 || view.indexOf('h["X-Pin"] = desk.pin') < 0) {
    fail("desk-view must send a saved seat");
  }
  if (view.indexOf('fetch("/api/jobs", { headers: headersFor(d) })') < 0) fail("desk-view must GET /api/jobs with those headers");
  pass("desk-view sends the saved seat");

  const people = read("people.js");
  if (people.indexOf('h["X-Pin"] = pin') < 0 || people.indexOf('h["X-Session"] = ses') < 0) fail("people.js headers must send the seat");
  if (people.indexOf('h["X-Pin"] = desk.pin') < 0 || people.indexOf('h["X-Session"] = desk.token') < 0) {
    fail("people.js fetchDesk must send that desk's seat");
  }
  if (people.indexOf('fetch("/api/jobs", { headers: h })') < 0 || people.indexOf('api("/api/jobs")') < 0) {
    fail("people.js must still read jobs through the seat headers");
  }
  pass("people.js sends the seat");

  const card = read("desk-card.js");
  const ics = card.split("\n").find((line) => line.indexOf("/api/jobs?ics=") >= 0) || "";
  if (ics.indexOf("headers()") < 0) fail("calendar download must send headers()");
  if (/[?&]pin=/.test(ics)) fail("calendar URL must not carry the pin");
  pass("calendar download keeps the pin in the header");

  ["drop-app.js", "drop-custom.js", "support-talk.js"].forEach(function (file) {
    const src = read(file);
    const lines = src.split("\n");
    let hits = 0;
    lines.forEach(function (line, i) {
      if (line.indexOf("/api/jobs") < 0) return;
      hits += 1;
      const window = lines.slice(i, i + 6).join("\n");
      if (window.indexOf('method: "POST"') < 0 && window.indexOf("method:\"POST\"") < 0) {
        fail(file + " jobs call must stay a POST: " + line.trim());
      }
      if (/\/api\/jobs\?[^"'`\s]*pin=/i.test(window)) fail(file + " must not put a pin in the jobs URL");
    });
    if (!hits) fail(file + " should still POST /api/jobs");
  });
  const widget = read("widget.html");
  const drop = read("drop.html");
  if (widget.indexOf("/drop-app.js") < 0 || drop.indexOf("/drop-app.js") < 0) fail("widget and drop must keep using drop-app.js");
  if (widget.indexOf("/api/jobs") >= 0 || drop.indexOf("/api/jobs") >= 0) fail("widget and drop pages must not fetch jobs themselves");
  pass("drop, widget, and support still POST and do not read the queue");

  const history = read("history.html");
  if (history.indexOf("/api/jobs") >= 0) fail("history must not call /api/jobs");
  if (history.indexOf('h["X-Pin"]=pin') < 0 || history.indexOf('h["X-Session"]=tok') < 0) {
    fail("history must keep sending the seat to /api/desks");
  }
  pass("history reads /api/desks with a seat, not /api/jobs");

  ["plugins/automate-it-away/mcp/server.mjs", "plugins/aia-integration/mcp/server.mjs"].forEach(function (file) {
    const src = read(file);
    if (src.indexOf('headers["X-Pin"]') < 0 || src.indexOf('headers["X-Session"]') < 0) {
      fail(file + " must send pin and session as headers");
    }
    if (/searchParams\.set\(\s*["']pin["']/.test(src) || /\/api\/jobs\?[^"'`\n]*pin=/.test(src)) {
      fail(file + " must not put the pin on the jobs URL");
    }
  });
  pass("MCP list sends the seat as headers");

  const pkg = read("package.json");
  if (pkg.indexOf("scripts/check-jobs-seat.js") < 0) fail("package.json test must run this check");
  if (pkg.indexOf("scripts/check-upload-privacy.js") < 0 || pkg.indexOf("scripts/check-scripts-blocked.js") < 0) {
    fail("package.json test must keep the existing checks");
  }
  pass("package.json test keeps the old checks and adds this one");

  walkSources(root);
  pass("no jobs URL in the repo carries a pin");
}

function walkSources(dir) {
  fs.readdirSync(dir).forEach(function (name) {
    if (name === "node_modules" || name === ".git" || name === "runtime" || name === "queue") return;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) return walkSources(full);
    if (!/\.(js|mjs|cjs|html|md)$/.test(name)) return;
    const src = fs.readFileSync(full, "utf8");
    if (src.indexOf("/api/jobs") < 0) return;
    src.split("\n").forEach(function (line, i) {
      if (line.indexOf("/api/jobs") < 0) return;
      if (/\/api\/jobs\?[^"'`\s]*pin=/i.test(line) || /\/api\/jobs[^"'`\n]*[?&]pin=/i.test(line)) {
        fail(path.relative(root, full) + ":" + (i + 1) + " puts a pin on a jobs URL");
      }
    });
  });
}

async function main() {
  assertSources();
  const auth = require(path.join(root, "api/auth"));
  const jobs = require(path.join(root, "api/jobs"));
  const lib = require(path.join(root, "api/_lib"));
  await lib.ready();

  const slug = "jobs-seat-shop";
  const pin = "4821";
  const secret = "https://blob.example.test/secret-photo-9f3a.png";
  const fileUrl = "https://blob.example.test/secret-file-9f3a.pdf";
  const opened = await call(auth, "POST", { "x-workspace": slug }, {
    action: "open", slug: slug, biz: "Jobs Seat Shop", name: "James", pin: pin
  });
  if (opened.statusCode !== 201) fail("could not open a desk, got " + opened.statusCode + " " + JSON.stringify(opened.body));
  const token = opened.body && opened.body.session && opened.body.session.token;
  if (!token) fail("desk open should issue a session");
  lib.mem.jobs.unshift({
    id: "job_secretseat",
    workspace: slug,
    title: "Porch secret",
    photoUrl: secret,
    files: [{ name: "quiet.pdf", url: fileUrl }],
    status: "exception",
    step: "Qualify",
    createdAt: new Date().toISOString()
  });
  pass("opened a desk with a private card");

  const stranger = await call(jobs, "GET", { "x-workspace": slug }, null, {}, "/api/jobs");
  const missing = await call(jobs, "GET", { "x-workspace": "no-such-jobs-desk" }, null, {}, "/api/jobs");
  sameReply(stranger, missing, "real desk and made-up desk");
  noCards(stranger, secret, fileUrl, pin);
  noCards(missing, secret, fileUrl, pin);
  if (!stranger.body || stranger.body.error !== "No desk with that name.") {
    fail("stranger message should be plain: " + JSON.stringify(stranger.body));
  }
  pass("a desk name alone matches a made-up desk and returns no cards");

  const wrong = await call(jobs, "GET", { "x-workspace": slug, "x-pin": "0000" }, null, {}, "/api/jobs");
  sameReply(wrong, missing, "wrong code and made-up desk");
  pass("a wrong code looks like a missing desk");

  const views = [
    [{ audit: "1" }, "/api/jobs?audit=1"],
    [{ money: "1" }, "/api/jobs?money=1"],
    [{ inbox: "1" }, "/api/jobs?inbox=1"],
    [{ ics: "job_secretseat" }, "/api/jobs?ics=job_secretseat"]
  ];
  for (let i = 0; i < views.length; i++) {
    const hit = await call(jobs, "GET", { "x-workspace": slug }, null, views[i][0], views[i][1]);
    sameReply(hit, missing, views[i][1]);
    noCards(hit, secret, fileUrl, pin);
  }
  pass("audit, money, inbox, and calendar reads are closed too");

  const fromQuery = await call(
    jobs,
    "GET",
    { "x-workspace": slug },
    null,
    { pin: pin, workspace: slug },
    "/api/jobs?workspace=" + slug + "&pin=" + pin
  );
  sameReply(fromQuery, missing, "pin in the URL");
  noCards(fromQuery, secret, fileUrl, pin);
  if (leaked(fromQuery.body, pin)) fail("reply must not echo the pin");
  pass("a pin in the URL is ignored");

  const owner = await call(jobs, "GET", { "x-workspace": slug, "x-pin": pin }, null, {}, "/api/jobs");
  if (owner.statusCode !== 200 || !owner.body || !Array.isArray(owner.body.jobs)) fail("seated owner should get the queue");
  const seen = owner.body.jobs.find((j) => j && j.id === "job_secretseat");
  if (!seen || seen.photoUrl !== secret || !seen.files || seen.files[0].url !== fileUrl) {
    fail("seated owner should still see the card and its file links");
  }
  if (leaked(owner.body, pin)) fail("queue reply must not include the desk code");
  pass("a seated owner still gets the cards");

  const bySession = await call(jobs, "GET", { "x-workspace": slug, "x-session": token }, null, {}, "/api/jobs");
  const byCookie = await call(jobs, "GET", { "x-workspace": slug, cookie: "aia_session=" + encodeURIComponent(token) }, null, {}, "/api/jobs");
  if (bySession.statusCode !== 200 || byCookie.statusCode !== 200) {
    fail("X-Session and aia_session should open the queue, got " + bySession.statusCode + " / " + byCookie.statusCode);
  }
  pass("X-Session and the session cookie open the queue");

  const ics = await call(jobs, "GET", { "x-workspace": slug, "x-pin": pin }, null, { ics: "job_secretseat" }, "/api/jobs?ics=job_secretseat");
  if (ics.statusCode !== 200 || String(ics.body || "").indexOf("BEGIN:VCALENDAR") < 0) fail("a seated person should still download the calendar");
  if (String(ics.body || "").indexOf(pin) >= 0) fail("calendar body must not contain the pin");
  pass("calendar download still works for a seat");

  const joined = await call(auth, "POST", { "x-workspace": slug }, {
    action: "join", name: "Sam", pin: "9090", kind: "helper"
  });
  if (joined.statusCode !== 202 || !joined.body || !joined.body.pending || !joined.body.person || !joined.body.person.id) {
    fail("could not add a waiting seat, got " + joined.statusCode + " " + JSON.stringify(joined.body));
  }
  const waiting = await call(jobs, "GET", { "x-workspace": slug, "x-pin": "9090" }, null, {}, "/api/jobs");
  if (waiting.statusCode !== 403 || !waiting.body || waiting.body.error !== "That seat is waiting on the owner.") {
    fail("waiting seat should be refused in plain words, got " + waiting.statusCode + " " + JSON.stringify(waiting.body));
  }
  noCards(waiting, secret, fileUrl, "9090");
  pass("a waiting seat is refused");

  const approved = await call(auth, "POST", { "x-workspace": slug, "x-pin": pin }, {
    action: "approve", id: joined.body.person.id
  });
  if (approved.statusCode !== 200) fail("owner should approve the seat, got " + approved.statusCode + " " + JSON.stringify(approved.body));
  const helper = await call(jobs, "GET", { "x-workspace": slug, "x-pin": "9090" }, null, {}, "/api/jobs");
  if (helper.statusCode !== 200 || !(helper.body.jobs || []).some((j) => j && j.id === "job_secretseat")) {
    fail("an approved seat should see the queue");
  }
  pass("an approved seat sees the queue");

  const dropped = await call(jobs, "POST", { "x-workspace": slug }, { action: "capture", title: "Street drop" }, {}, "/api/jobs");
  if (dropped.statusCode !== 201 || !dropped.body || !dropped.body.job) fail("public drop must still POST a card with only the desk name");
  if (leaked(dropped.body, secret) || leaked(dropped.body, fileUrl) || leaked(dropped.body, "Porch secret")) {
    fail("public drop must not receive cards already on the desk");
  }
  const bare = await call(jobs, "POST", { "x-workspace": "no-such-jobs-desk" }, { action: "capture", title: "Nowhere" }, {}, "/api/jobs");
  if (bare.statusCode === 201) fail("a drop into a missing desk must not save a card");
  pass("public drop still posts, and does not read the queue");

  const none = await call(jobs, "GET", {}, null, {}, "/api/jobs");
  if (none.statusCode !== 400) fail("GET with no desk name should stay 400, got " + none.statusCode);
  pass("a missing desk name stays a plain 400");

  try { fs.rmSync(store, { force: true }); } catch (e) {}
  console.log("check-jobs-seat: ok");
}

main().catch(function (e) {
  console.error(e && e.stack || e);
  process.exit(1);
});
