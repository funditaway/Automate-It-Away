const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const adminSrc = fs.readFileSync(path.join(root, "api/admin.js"), "utf8");
const peopleHtml = fs.readFileSync(path.join(root, "people.html"), "utf8");
const peopleJs = fs.readFileSync(path.join(root, "people.js"), "utf8");
const historyHtml = fs.readFileSync(path.join(root, "history.html"), "utf8");
const pkg = fs.readFileSync(path.join(root, "package.json"), "utf8");

function fail(msg) {
  console.error("FAIL " + msg);
  process.exitCode = 1;
}
function pass(msg) { console.log("ok  " + msg); }

if (!/action === "person"/.test(adminSrc)) fail("admin action=person");
else pass("admin action=person");
if (!/function personBook/.test(adminSrc) && !/personBook\(/.test(adminSrc)) fail("admin personBook");
else pass("admin personBook");
if (!/function allowedSlugs/.test(adminSrc)) fail("admin allowedSlugs");
else pass("admin allowedSlugs");
if (/slugs: slugs.length \? slugs : null/.test(adminSrc)) fail("admin must not pass slugs null");
else pass("admin slugs stay locked");
if (/peopleAcross\(\)/.test(adminSrc) && /action === "person"[\s\S]{0,400}peopleAcross/.test(adminSrc)) fail("person action must not use peopleAcross");
else pass("person action avoids peopleAcross");

if (peopleHtml.indexOf("id=\"sheet\"") < 0) fail("people sheet markup");
else pass("people sheet markup");
if (peopleJs.indexOf("function groupPeople") < 0) fail("people groupPeople");
else pass("people groupPeople");
if (peopleJs.indexOf("function openSheet") < 0) fail("people openSheet");
else pass("people openSheet");
if (peopleJs.indexOf("action: \"person\"") < 0) fail("people POSTs person");
else pass("people POSTs person");
if (peopleJs.indexOf("/history?who=") < 0) fail("people history who link");
else pass("people history who link");
if (peopleJs.indexOf("openFromQuery") < 0) fail("people ?who= open");
else pass("people ?who= open");

if (historyHtml.indexOf("params.get(\"who\")") < 0) fail("history reads ?who=");
else pass("history reads ?who=");
if (historyHtml.indexOf("who-chip") < 0) fail("history who chip");
else pass("history who chip");
if (historyHtml.indexOf("/people?who=") < 0) fail("history back to people");
else pass("history back to people");

if (pkg.indexOf("node scripts/check-people.js") < 0) fail("npm test includes check-people");
else pass("npm test includes check-people");

async function apiCall(handler, req) {
  var done;
  var result = new Promise(function (resolve) { done = resolve; });
  var res = {
    code: 200,
    headers: {},
    setHeader: function (k, v) { this.headers[k] = v; },
    status: function (code) { this.code = code; return this; },
    json: function (body) { done({ status: this.code, body: body, headers: this.headers }); return this; },
    end: function () { done({ status: this.code, body: null, headers: this.headers }); return this; },
    send: function (body) { done({ status: this.code, body: body, headers: this.headers }); return this; }
  };
  var body = req.body || {};
  var mock = {
    method: req.method || "GET",
    headers: req.headers || {},
    query: req.query || {},
    body: body,
    on: function (event, fn) {
      if (event === "data") return;
      if (event === "end") fn();
    }
  };
  await handler(mock, res);
  return result;
}

(async function () {
  const lib = require(path.join(root, "api/_lib"));
  const admin = require(path.join(root, "api/admin"));
  const hash = lib.hashPin;
  lib.mem.workspaces = [
    {
      slug: "alpha",
      biz: "Alpha",
      pin: hash("1111"),
      people: [
        { id: "alpha_owner", name: "Alex Owner", role: "owner", kind: "owner", pin: hash("1111"), status: "approved", accountId: "acct_owner", createdAt: "2026-01-01T00:00:00Z" },
        { id: "p_taylor_a", name: "Taylor", role: "employee", kind: "helper", pin: hash("2222"), email: "taylor@example.com", accountId: "acct_taylor", status: "approved", createdAt: "2026-01-02T00:00:00Z" }
      ]
    },
    {
      slug: "beta",
      biz: "Beta",
      pin: hash("3333"),
      people: [
        { id: "beta_owner", name: "Alex Owner", role: "owner", kind: "owner", pin: hash("3333"), status: "approved", accountId: "acct_owner", createdAt: "2026-01-01T00:00:00Z" },
        { id: "p_taylor_b", name: "Taylor", role: "employee", kind: "helper", pin: hash("4444"), email: "taylor@example.com", accountId: "acct_taylor", status: "approved", createdAt: "2026-01-03T00:00:00Z" }
      ]
    },
    {
      slug: "gamma",
      biz: "Gamma",
      pin: hash("5555"),
      people: [
        { id: "gamma_owner", name: "Pending Pat", role: "owner", kind: "owner", pin: hash("5555"), status: "pending", accountId: "acct_gamma", createdAt: "2026-01-01T00:00:00Z" },
        { id: "p_taylor_g", name: "Taylor", role: "employee", kind: "helper", pin: hash("6666"), email: "taylor@example.com", accountId: "acct_taylor", status: "approved", createdAt: "2026-01-04T00:00:00Z" }
      ]
    }
  ];
  lib.mem.jobs = [
    { id: "job_alpha_open", workspace: "alpha", title: "Alpha open", assignee: "Taylor", status: "waiting", createdAt: "2026-01-05T00:00:00Z" },
    { id: "job_alpha_done", workspace: "alpha", title: "Alpha done", doneBy: "Taylor", status: "shipped", doneAt: "2026-01-06T00:00:00Z", custom: { personId: "p_taylor_a" } },
    { id: "job_beta_open", workspace: "beta", title: "Beta open", from: "Taylor", status: "waiting", createdAt: "2026-01-07T00:00:00Z" },
    { id: "job_beta_ext", workspace: "beta", title: "Beta ext", contactName: "Taylor", status: "out", offDesk: true, updatedAt: "2026-01-08T00:00:00Z" },
    { id: "job_other", workspace: "alpha", title: "Other", assignee: "Someone Else", status: "waiting", createdAt: "2026-01-01T00:00:00Z" }
  ];
  lib.mem.audit = [];
  lib.mem.money = [];
  lib.mem.tickets = [];
  lib.mem.approvals = [];
  lib.mem.accounts = [];

  var person = await apiCall(admin, {
    method: "POST",
    headers: { "x-workspace": "alpha", "x-pin": "1111" },
    body: {
      action: "person",
      email: "taylor@example.com",
      desks: [{ slug: "beta", pin: "3333" }, { slug: "gamma", pin: "5555" }, { slug: "nope", pin: "9999" }]
    }
  });
  if (person.status !== 200 || !person.body || !person.body.ok) fail("person action should return personBook");
  else pass("person action returns personBook");
  if (!Array.isArray(person.body.allowedSlugs) || person.body.allowedSlugs.join(",") !== "alpha,beta") fail("person action keeps allowedSlugs locked to verified desks");
  else pass("person action keeps allowedSlugs locked");
  if (!Array.isArray(person.body.seats) || person.body.seats.length !== 2) fail("person action returns seats across verified desks");
  else pass("person action returns verified seats");
  if ((JSON.stringify(person.body).indexOf("1111") >= 0) || (JSON.stringify(person.body).indexOf("2222") >= 0)) fail("person action must not leak pins");
  else pass("person action hides pins");
  if (!person.body.cards || person.body.cards.length < 3) fail("person action collects touched cards");
  else pass("person action collects touched cards");

  var getWho = await apiCall(admin, {
    method: "GET",
    headers: { "x-workspace": "alpha", "x-pin": "1111" },
    query: { who: "Taylor", desks: "beta" }
  });
  if (getWho.status !== 200 || !getWho.body || !getWho.body.ok) fail("GET who should return current-desk personBook");
  else pass("GET who returns current-desk personBook");
  if (!Array.isArray(getWho.body.allowedSlugs) || getWho.body.allowedSlugs.join(",") !== "alpha") fail("GET who must stay on the current desk");
  else pass("GET who stays on the current desk");

  if (process.exitCode) {
    console.error("check-people failed");
    process.exit(1);
  }
  console.log("check-people passed");
})().catch(function (err) {
  console.error(err && err.stack || err);
  process.exit(1);
});
