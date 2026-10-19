#!/usr/bin/env node
// Proves POST /api/hook: a caller with no seat still posts and gets ok, the job id,
// and the card status. The reply does not include the card or blob file links
// (mem.files[].url / remoteUrl, jobs[].photoUrl, jobs[].files[]).
// A valid seat (X-Pin, X-Session, or the aia_session cookie) still gets the card.
// Removing the strip makes this check fail.
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
const store = path.join(os.tmpdir(), "aia-hook-echo-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;
delete global.__aia;
delete global.__aiaHydrate;

function fail(msg) {
  console.error("FAIL " + msg);
  try { fs.rmSync(store, { force: true }); } catch (e) {}
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
    url: url || "/api/hook"
  }, res);
  return res;
}

function leaked(body, secret) {
  return JSON.stringify(body == null ? "" : body).indexOf(secret) >= 0;
}

function plain(res, code, event, secrets) {
  if (res.statusCode !== code) fail("expected " + code + " got " + res.statusCode + " " + JSON.stringify(res.body));
  const body = res.body || {};
  const keys = Object.keys(body).sort().join(",");
  if (keys !== "event,id,ok,status") fail("plain confirmation keys were " + keys + " " + JSON.stringify(body));
  if (body.ok !== true) fail("plain confirmation ok was not true");
  if (body.event !== event) fail("plain confirmation event was " + body.event);
  if (!body.id || String(body.id).indexOf("job_") !== 0) fail("plain confirmation missing job id: " + JSON.stringify(body));
  if (!body.status) fail("plain confirmation missing status");
  if (Object.prototype.hasOwnProperty.call(body, "job")) fail("plain confirmation echoed the card");
  secrets.forEach(function (bit) {
    if (bit && leaked(body, bit)) fail("plain confirmation leaked " + bit);
  });
  return body;
}

function walk(dir, hit, out) {
  fs.readdirSync(dir).forEach(function (name) {
    if (name === "node_modules" || name === ".git") return;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) return walk(full, hit, out);
    if (!/\.(js|mjs|cjs|html|md)$/.test(name)) return;
    const src = fs.readFileSync(full, "utf8");
    if (hit(src)) out.push(path.relative(root, full));
  });
}

function assertCallers() {
  const fetchers = [];
  walk(root, function (src) {
    return /fetch\(\s*[`"']\/api\/hook/.test(src);
  }, fetchers);
  fetchers.sort();
  if (fetchers.join(",") !== "aia-mail.js") fail("browser POST /api/hook callers: " + fetchers.join(", "));
  pass("only aia-mail.js posts to /api/hook from a page");

  const mail = read("aia-mail.js");
  if (mail.indexOf("photoUrl") >= 0 || mail.indexOf("remoteUrl") >= 0 || mail.indexOf(".files") >= 0) {
    fail("aia-mail.js must not read file links off the hook reply");
  }
  if (mail.indexOf("d.id") < 0 || mail.indexOf("d.job") < 0) fail("aia-mail.js should still show the job id");
  pass("aia-mail.js uses the job id and does not read file links");

  ["pipes.html", "connections.html"].forEach(function (file) {
    const src = read(file);
    if (src.indexOf("/api/hook") < 0) fail(file + " should still show the hook address");
    if (/fetch\(\s*[`"']\/api\/hook/.test(src)) fail(file + " must not post to /api/hook");
  });
  pass("pipes and connections show the hook address and do not post to it");

  [
    "desk.html",
    "desk-view.js",
    "desk-card.js",
    "people.js",
    "drop.html",
    "widget.html",
    "drop-app.js",
    "support-talk.js",
    "plugins/automate-it-away/mcp/server.mjs",
    "plugins/aia-integration/mcp/server.mjs"
  ].forEach(function (file) {
    const src = read(file);
    if (src.indexOf("/api/hook") >= 0) fail(file + " must not call /api/hook");
  });
  pass("desk, drop, widget, support, and MCP do not call /api/hook");

  ["command", "runtime"].forEach(function (dir) {
    const hits = [];
    walk(path.join(root, dir), function (src) { return src.indexOf("/api/hook") >= 0; }, hits);
    if (hits.length) fail(dir + " must not call /api/hook: " + hits.join(", "));
  });
  pass("command and runtime do not call /api/hook");

  ["scripts/check-money-pipe.js", "scripts/check-aia-mail.js", "scripts/check-then-bind-hold.js"].forEach(function (file) {
    const src = read(file);
    if (src.indexOf("photoUrl") >= 0 || src.indexOf("remoteUrl") >= 0) {
      fail(file + " must not depend on hook file links");
    }
  });
  pass("hook checks do not depend on echoed file links");

  const jobs = read("api/jobs.js");
  if (jobs.indexOf("function refuseJobRead") < 0) fail("jobs gate helper missing");
  if (jobs.indexOf("if (!shop || !person) return refuseJobRead(res, found);") < 0) fail("jobs read gate changed");
  if (jobs.indexOf("That seat is waiting on the owner.") < 0) fail("waiting seat message missing");
  if (jobs.indexOf("No desk with that name.") < 0) fail("hidden desk message missing");
  if (jobs.indexOf("deskSeat") < 0 || jobs.indexOf("personOf") < 0) fail("jobs must keep the shared seat helper");
  if (/query\.pin|query\[["']pin["']\]|searchParams\.get\(\s*["']pin["']/.test(jobs)) {
    fail("jobs must not read a pin from the URL");
  }
  pass("jobs read gate is unchanged aside from the shared seat helper");

  const hook = read("api/hook.js");
  if (hook.indexOf("deskSeat") < 0 || hook.indexOf("function hasSeat") < 0) fail("hook must use the shared seat helper");
  if (hook.indexOf('if (hasSeat(req, workspace)) return res.status(code).json({ ok: true, event: event, job: job });') < 0) {
    fail("hook must keep the seated card reply");
  }
  if (/stripe|paymentIntent|\.charge\(/.test(hook)) fail("hook must not charge");
  const pkg = read("package.json");
  if (pkg.indexOf("scripts/check-hook-echo.js") < 0) fail("package.json test must run this check");
  if (pkg.indexOf("scripts/check-jobs-seat.js") < 0) fail("package.json test must keep the jobs seat check");
  pass("hook shares the seat helper and does not charge");
}

async function main() {
  assertCallers();
  const auth = require(path.join(root, "api/auth"));
  const hook = require(path.join(root, "api/hook"));
  const jobs = require(path.join(root, "api/jobs"));
  const lib = require(path.join(root, "api/_lib"));
  await lib.ready();

  const slug = "hook-echo-shop";
  const pin = "4821";
  const photo = "https://blob.example.test/job-photo-hook.png";
  const fileUrl = "https://blob.example.test/job-file-hook.pdf";
  const jobRemote = "https://blob.example.test/job-remote-hook.pdf";
  const memUrl = "https://blob.example.test/mem-file-hook.pdf";
  const memRemote = "https://blob.example.test/mem-remote-hook.pdf";
  const secrets = [photo, fileUrl, jobRemote, memUrl, memRemote, "Porch secret", pin];

  const opened = await call(auth, "POST", { "x-workspace": slug }, {
    action: "open", slug: slug, biz: "Hook Echo Shop", name: "James", pin: pin
  }, {}, "/api/auth");
  if (opened.statusCode !== 201) fail("could not open a desk, got " + opened.statusCode + " " + JSON.stringify(opened.body));
  const token = opened.body && opened.body.session && opened.body.session.token;
  if (!token) fail("desk open should issue a session");

  if (!Array.isArray(lib.mem.files)) lib.mem.files = [];
  lib.mem.files.unshift({
    id: "file_hookecho",
    workspace: slug,
    name: "ledger.pdf",
    url: memUrl,
    remoteUrl: memRemote
  });
  lib.mem.jobs.unshift({
    id: "job_hookecho",
    workspace: slug,
    title: "Porch secret",
    photoUrl: photo,
    files: [{ name: "quiet.pdf", url: fileUrl, remoteUrl: jobRemote }],
    status: "exception",
    step: "Qualify",
    createdAt: new Date().toISOString()
  });
  pass("opened a desk with a private card and a file book");

  const seated = await call(hook, "POST", { "x-workspace": slug, "x-pin": pin }, {
    id: "job_hookecho",
    event: "update",
    notes: "Owner looked"
  });
  if (seated.statusCode !== 200 || !seated.body || !seated.body.job) fail("seated hook should still return the card");
  const card = seated.body.job;
  if (card.photoUrl !== photo || !card.files || card.files[0].url !== fileUrl || card.files[0].remoteUrl !== jobRemote) {
    fail("seated caller should still get the card file links");
  }
  if (leaked(seated.body, memUrl) || leaked(seated.body, memRemote) || leaked(seated.body, pin)) {
    fail("seated hook reply leaked the file book or the pin");
  }
  pass("a seated owner still gets the card");

  const bySession = await call(hook, "POST", { "x-workspace": slug, "x-session": token }, {
    event: "capture",
    title: "Session drop",
    photoUrl: photo,
    files: [{ name: "quiet.pdf", url: fileUrl }]
  });
  if (bySession.statusCode !== 201 || !bySession.body || !bySession.body.job || bySession.body.job.photoUrl !== photo) {
    fail("X-Session should still get the card");
  }
  const byCookie = await call(hook, "POST", { "x-workspace": slug, cookie: "aia_session=" + encodeURIComponent(token) }, {
    event: "capture",
    title: "Cookie drop",
    photoUrl: photo,
    files: [{ name: "quiet.pdf", url: fileUrl }]
  });
  if (byCookie.statusCode !== 201 || !byCookie.body || !byCookie.body.job || byCookie.body.job.files[0].url !== fileUrl) {
    fail("aia_session cookie should still get the card");
  }
  pass("X-Session and the session cookie still get the card");

  const moneyBefore = (lib.mem.money || []).length;
  const dropped = await call(hook, "POST", { "x-workspace": slug }, {
    event: "capture",
    title: "Street pipe",
    notes: "Hello from a hook.",
    provider: "webhook",
    photoUrl: photo,
    files: [{ name: "quiet.pdf", url: fileUrl, remoteUrl: jobRemote }]
  });
  const dropBody = plain(dropped, 201, "capture", secrets);
  const storedDrop = lib.mem.jobs.find(function (j) { return j && j.id === dropBody.id; });
  if (!storedDrop || storedDrop.photoUrl !== photo || !storedDrop.files || storedDrop.files[0].url !== fileUrl) {
    fail("the card should still keep its file links in the desk");
  }
  if (dropBody.status !== storedDrop.status || dropBody.id !== storedDrop.id) fail("confirmation id or status did not match the card");
  if ((lib.mem.money || []).length !== moneyBefore) fail("a pipe capture charged");
  pass("a pipe with no seat posts and gets ok, the job id, and the status");

  const fromQuery = await call(hook, "POST", { "x-workspace": slug }, {
    event: "capture",
    title: "Pinned in the URL",
    photoUrl: photo,
    files: [{ name: "quiet.pdf", url: fileUrl }]
  }, { pin: pin, workspace: slug });
  plain(fromQuery, 201, "capture", secrets);
  pass("a pin in the URL does not open the card");

  const fromBody = await call(hook, "POST", { "x-workspace": slug }, {
    event: "capture",
    title: "Pinned in the body",
    pin: pin,
    photoUrl: photo
  });
  plain(fromBody, 201, "capture", secrets);
  pass("a pin in the body does not open the card");

  const wrong = await call(hook, "POST", { "x-workspace": slug, "x-pin": "0000" }, {
    event: "capture",
    title: "Wrong code",
    photoUrl: photo,
    files: [{ name: "quiet.pdf", url: fileUrl }]
  });
  plain(wrong, 201, "capture", secrets);
  pass("a wrong code still posts and does not get the card");

  const joined = await call(auth, "POST", { "x-workspace": slug }, {
    action: "join", name: "Sam", pin: "9090", kind: "helper"
  }, {}, "/api/auth");
  if (joined.statusCode !== 202 || !joined.body || !joined.body.pending) {
    fail("could not add a waiting seat, got " + joined.statusCode + " " + JSON.stringify(joined.body));
  }
  const waiting = await call(hook, "POST", { "x-workspace": slug, "x-pin": "9090" }, {
    event: "capture",
    title: "Waiting seat drop",
    photoUrl: photo,
    files: [{ name: "quiet.pdf", url: fileUrl }]
  });
  plain(waiting, 201, "capture", secrets.concat(["9090"]));
  pass("a waiting seat can post and does not get the card");

  const events = [
    [{ event: "update", notes: "Pipe update" }, "update"],
    [{ event: "needs a hand", notes: "Needs a hand." }, "hand"],
    [{ event: "done", notes: "Finished off the pipe." }, "done"],
    [{ event: "paid", notes: "Paid.", amount: 40 }, "collect"],
    [{ event: "kill", notes: "Stop." }, "kill"]
  ];
  // A seatless sender may not change a card that is already on the desk (401, no echo).
  // A sender with this desk's hook secret may, and still gets the short reply.
  const hookTestSecret = "hook-echo-test-secret";
  const echoShop = lib.mem.workspaces.find(function (w) { return w && w.slug === slug; });
  for (let i = 0; i < events.length; i++) {
    const before = JSON.stringify(lib.mem.jobs.find(function (j) { return j && j.id === "job_hookecho"; }));
    const locked = await call(hook, "POST", { "x-workspace": slug }, Object.assign({ id: "job_hookecho" }, events[i][0]));
    if (locked.statusCode !== 401 || !locked.body || locked.body.ok !== false || locked.body.job || locked.body.id) {
      fail("seatless " + events[i][1] + " on an existing card should be 401, got " + locked.statusCode + " " + JSON.stringify(locked.body));
    }
    if (secrets.some(function (s) { return leaked(locked.body, s); })) fail("seatless " + events[i][1] + " 401 leaked");
    if (JSON.stringify(lib.mem.jobs.find(function (j) { return j && j.id === "job_hookecho"; })) !== before) fail("seatless " + events[i][1] + " changed the card");
  }
  pass("seatless update, hand, done, collect, and stop on an existing card get 401 and change nothing");
  echoShop.hookSecretHash = require("crypto").createHash("sha256").update(hookTestSecret).digest("hex");
  for (let i = 0; i < events.length; i++) {
    const name = events[i][1];
    const hit = await call(hook, "POST", { "x-workspace": slug, "x-hook-secret": hookTestSecret }, Object.assign({ id: "job_hookecho" }, events[i][0]));
    const body = plain(hit, 200, name, secrets.concat([hookTestSecret, echoShop.hookSecretHash]));
    const stored = lib.mem.jobs.find(function (j) { return j && j.id === "job_hookecho"; });
    if (!stored || stored.photoUrl !== photo || !stored.files || stored.files[0].url !== fileUrl || stored.files[0].remoteUrl !== jobRemote) {
      fail(name + " must leave the card file links stored");
    }
    if (body.id !== stored.id || body.status !== stored.status) fail(name + " confirmation did not match the card");
    if (stored.charged) fail(name + " charged the card");
  }
  const collectRow = (lib.mem.money || [])[0];
  if (!collectRow || collectRow.what !== "Pipe collect" || collectRow.held !== false || collectRow.charged) {
    fail("collect write-back changed: " + JSON.stringify(collectRow));
  }
  delete echoShop.hookSecretHash;
  pass("update, hand, done, collect, and stop with the desk hook secret do not echo the card");

  const book = (lib.mem.files || []).find(function (f) { return f && f.id === "file_hookecho"; });
  if (!book || book.url !== memUrl || book.remoteUrl !== memRemote) fail("the file book was changed");
  pass("the file book stays put and stays out of the reply");

  const missing = await call(hook, "POST", { "x-workspace": "no-such-hook-desk" }, {
    title: "Ghost",
    photoUrl: photo
  });
  if (missing.statusCode !== 400 || !missing.body || missing.body.ok !== false) fail("missing desk should stay 400");
  secrets.forEach(function (bit) {
    if (bit && leaked(missing.body, bit)) fail("missing desk leaked " + bit);
  });
  pass("a missing desk still gets a plain 400");

  const info = await call(hook, "GET", {}, null);
  if (info.statusCode !== 200 || !info.body || info.body.ok !== true || info.body.use !== "POST") fail("GET /api/hook changed");
  if (info.body.job || leaked(info.body, photo) || leaked(info.body, memRemote)) fail("GET /api/hook leaked a card");
  pass("GET /api/hook stays the short instructions");

  const stranger = await call(jobs, "GET", { "x-workspace": slug }, null, {}, "/api/jobs");
  const madeUp = await call(jobs, "GET", { "x-workspace": "no-such-hook-desk" }, null, {}, "/api/jobs");
  if (stranger.statusCode !== madeUp.statusCode || JSON.stringify(stranger.body) !== JSON.stringify(madeUp.body)) {
    fail("jobs gate no longer hides a real desk");
  }
  if (!stranger.body || stranger.body.error !== "No desk with that name.") fail("jobs stranger message changed");
  secrets.forEach(function (bit) {
    if (bit && leaked(stranger.body, bit)) fail("jobs stranger leaked " + bit);
  });
  const waitingRead = await call(jobs, "GET", { "x-workspace": slug, "x-pin": "9090" }, null, {}, "/api/jobs");
  if (waitingRead.statusCode !== 403 || !waitingRead.body || waitingRead.body.error !== "That seat is waiting on the owner.") {
    fail("jobs waiting seat gate changed");
  }
  const owner = await call(jobs, "GET", { "x-workspace": slug, "x-pin": pin }, null, {}, "/api/jobs");
  if (owner.statusCode !== 200 || !(owner.body.jobs || []).some(function (j) { return j && j.id === "job_hookecho" && j.photoUrl === photo; })) {
    fail("a seated jobs read should still return the card");
  }
  pass("the jobs read gate still hides cards and still opens for a seat");

  try { fs.rmSync(store, { force: true }); } catch (e) {}
  console.log("check-hook-echo: ok");
}

main().catch(function (err) {
  console.error(err && err.stack ? err.stack : err);
  try { fs.rmSync(store, { force: true }); } catch (e) {}
  process.exit(1);
});
