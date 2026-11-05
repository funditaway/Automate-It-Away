#!/usr/bin/env node
require("./_env-guard");
// GET /api/jobs masks people's names for a helper and for another non-owner
// seat. The owner still sees the names. actorKind and role tags stay.
// actorLabel is left as stored (the card-thread read path owns that label).
// The stored job is the same after the read.
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
const store = path.join(os.tmpdir(), "aia-jobs-mask-names-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;
delete global.__aia;
delete global.__aiaHydrate;

const SECRETS = ["Nia Quill", "Casey Brook", "Riley Moss", "Ada Family"];

function fail(msg) {
  console.error("FAIL " + msg);
  process.exit(1);
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
    end(b) { if (b !== undefined && this.body == null) this.body = b; return this; }
  };
}

async function call(handler, method, headers, body, query) {
  const res = mockRes();
  await handler({
    method: method,
    headers: headers || {},
    body: body || {},
    query: query || {},
    url: "/api/jobs"
  }, res);
  return res;
}

function leaks(node, key, hits) {
  if (key === "actorLabel" || key === "you" || key === "people") return;
  if (typeof node === "string") {
    const low = node.toLowerCase();
    SECRETS.forEach(function (name) {
      if (low.indexOf(name.toLowerCase()) >= 0) hits.push((key || "text") + " has " + name);
    });
    return;
  }
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach(function (item) { leaks(item, key, hits); });
    return;
  }
  Object.keys(node).forEach(function (k) { leaks(node[k], k, hits); });
}

function assertMasked(body, who) {
  const hits = [];
  leaks(body, "", hits);
  if (hits.length) fail(who + " still sees names: " + hits.slice(0, 6).join("; "));
}

function cardOf(body) {
  const rows = body && body.jobs || [];
  return rows.find(function (j) { return j && j.id === "job_masknames"; }) || null;
}

async function main() {
  const jobsSrc = fs.readFileSync(path.join(root, "api/jobs.js"), "utf8");
  if (jobsSrc.indexOf("jobMask.maskJob") < 0) fail("present path must call the shared mask");
  if (jobsSrc.indexOf("jobMask.maskJobsResponse") < 0) fail("jobs responses must call the shared mask");
  if (jobsSrc.indexOf("presentJob(j, found.person)") < 0) fail("queue read must keep presentJob");
  if (jobsSrc.indexOf("Collect is on HOLD") < 0) fail("Collect HOLD line is missing");
  const maskSrc = fs.readFileSync(path.join(root, "api/_job-mask.js"), "utf8");
  if (maskSrc.indexOf("actorLabel") < 0) fail("mask must leave actorLabel alone");
  pass("jobs read path uses the shared mask and leaves actorLabel");

  const pkg = fs.readFileSync(path.join(root, "package.json"), "utf8");
  if (pkg.indexOf("scripts/check-jobs-mask-names.js") < 0) fail("package.json test must run this check");
  if (pkg.indexOf("scripts/check-jobs-mask-names-mutants.js") < 0) fail("package.json test must run the mutants");
  if (pkg.indexOf("scripts/check-jobs-seat.js && node scripts/check-jobs-mask-names.js") < 0) {
    fail("package.json should run this check after the jobs seat check");
  }
  const testLine = JSON.parse(pkg).scripts.test || "";
  if (!/node scripts\/check-ux-errors\.js && node scripts\/check-aia-tld-mutants\.js && node scripts\/check-api-machine-values\.js && node scripts\/check-api-machine-values-mutants\.js && node scripts\/check-ready-reload\.js$/.test(testLine.trim())) {
    fail("npm test must keep the same ending as main");
  }
  pass("package.json keeps the old ending and adds this check");

  const auth = require(path.join(root, "api/auth"));
  const jobs = require(path.join(root, "api/jobs"));
  const lib = require(path.join(root, "api/_lib"));
  await lib.ready();

  const slug = "mask-names";
  const opened = await call(auth, "POST", { "x-workspace": slug }, {
    action: "open", slug: slug, biz: "Mask Names Shop", name: "Nia Quill", pin: "4821"
  });
  if (opened.statusCode !== 201) fail("could not open a desk, got " + opened.statusCode + " " + JSON.stringify(opened.body));
  const shop = (lib.mem.workspaces || []).find(function (w) { return w && w.slug === slug; });
  if (!shop) fail("desk missing after open");
  shop.people.push({
    id: "p_helper_mask",
    name: "Sam Phelps",
    role: "employee",
    kind: "helper",
    pin: lib.hashPin("9191"),
    status: "approved"
  });
  shop.people.push({
    id: "p_family_mask",
    name: "Ada Family",
    role: "employee",
    kind: "family",
    pin: lib.hashPin("9292"),
    status: "approved"
  });
  const stored = {
    id: "job_masknames",
    workspace: slug,
    title: "Porch lamp",
    status: "exception",
    step: "Qualify",
    from: "Nia Quill",
    contactName: "Casey Brook",
    whoTapped: "Nia Quill",
    assignee: "Riley Moss",
    doneBy: "Nia Quill",
    sentByAgent: "Riley Moss",
    priorityBy: "Nia Quill",
    next: "Waiting on Riley Moss.",
    notes: "Left the lamp.",
    draft: "Draft for the porch lamp. Nothing sent.",
    handedTo: { id: "p_family_mask", name: "Ada Family", kind: "family", role: "employee" },
    crew: { id: "human", label: "Riley Moss", kind: "member", does: "A person on this desk has it." },
    thread: [
      {
        at: "2026-01-01T00:00:00.000Z",
        from: "Nia Quill",
        text: "left a note",
        kind: "note",
        actorKind: "human",
        role: "owner",
        actorLabel: "Nia Quill"
      },
      {
        at: "2026-01-01T00:00:01.000Z",
        from: "widget",
        text: "dropped on the desk",
        kind: "note",
        actorKind: "ext"
      }
    ],
    replies: [
      { from: "Casey Brook", text: "can pick up", at: "2026-01-01T00:00:02.000Z", actorKind: "human", role: "friend" }
    ],
    createdAt: "2026-01-01T00:00:00.000Z"
  };
  lib.mem.jobs.unshift(stored);
  lib.mem.inbox.unshift({ id: "in_mask", workspace: slug, text: "mask-inbox Nia Quill", from: "Casey Brook", at: 1 });
  lib.mem.audit.unshift({ t: "2026-01-01T00:00:00.000Z", agent: "Desk", action: "mask-audit Nia Quill", result: "Waiting", workspace: slug });
  lib.mem.money.unshift({ at: "2026-01-01T00:00:00.000Z", workspace: slug, who: "Nia Quill", what: "mask-money Nia Quill", amt: "$1", held: false, charged: false, live: false });
  const before = JSON.stringify(stored);
  const peopleBefore = JSON.stringify(shop.people.map(function (p) { return p && p.name; }));
  const inboxBefore = JSON.stringify(lib.mem.inbox[0]);
  const auditBefore = JSON.stringify(lib.mem.audit[0]);
  const moneyBefore = JSON.stringify(lib.mem.money[0]);
  pass("seeded a card with names");

  const ownerH = { "x-workspace": slug, "x-pin": "4821" };
  const helperH = { "x-workspace": slug, "x-pin": "9191" };
  const familyH = { "x-workspace": slug, "x-pin": "9292" };

  const helper = await call(jobs, "GET", helperH, null, {});
  const family = await call(jobs, "GET", familyH, null, {});
  const owner = await call(jobs, "GET", ownerH, null, {});
  const helperIn = await call(jobs, "GET", helperH, null, { inbox: "1" });
  const helperAudit = await call(jobs, "GET", helperH, null, { audit: "1" });
  const helperMoney = await call(jobs, "GET", helperH, null, { money: "1" });
  const ownerIn = await call(jobs, "GET", ownerH, null, { inbox: "1" });
  const ownerAudit = await call(jobs, "GET", ownerH, null, { audit: "1" });
  const ownerMoney = await call(jobs, "GET", ownerH, null, { money: "1" });
  if (JSON.stringify(stored) !== before) fail("stored job changed on read");
  if (JSON.stringify(shop.people.map(function (p) { return p && p.name; })) !== peopleBefore) fail("stored seat names changed on read");
  if (JSON.stringify(lib.mem.inbox[0]) !== inboxBefore) fail("stored inbox changed on read");
  if (JSON.stringify(lib.mem.audit[0]) !== auditBefore) fail("stored audit changed on read");
  if (JSON.stringify(lib.mem.money[0]) !== moneyBefore) fail("stored money changed on read");
  if (stored.thread[0].actorKind !== "human" || stored.thread[0].actorLabel !== "Nia Quill" || stored.contactName !== "Casey Brook") {
    fail("stored row lost a name or actorKind");
  }
  pass("stored rows are unchanged after GET");

  if (helper.statusCode !== 200) fail("helper GET " + helper.statusCode + " " + JSON.stringify(helper.body).slice(0, 180));
  const helperCard = cardOf(helper.body);
  if (!helperCard) fail("helper did not get the card");
  assertMasked(helper.body, "helper");
  if (helperCard.thread[0].actorKind !== "human") fail("helper lost actorKind on the thread");
  if (helperCard.thread[0].role !== "owner") fail("helper lost the thread role");
  if (helperCard.thread[0].actorLabel !== "Nia Quill") fail("helper actorLabel should stay for the card-thread path");
  if (helperCard.thread[0].from) fail("helper still sees thread from");
  if (helperCard.thread[1].from !== "widget") fail("helper lost the widget channel tag");
  if (helperCard.thread[1].actorKind !== "ext") fail("helper lost ext actorKind");
  if (helperCard.replies[0].actorKind !== "human" || helperCard.replies[0].role !== "friend") fail("helper lost reply role tags");
  if (helperCard.handedTo.kind !== "family" || helperCard.handedTo.role !== "employee") fail("helper lost handed-to kind");
  if (helperCard.handedTo.name) fail("helper still sees handed-to name");
  if (helperCard.crew.kind !== "member") fail("helper lost crew kind");
  if (helperCard.contactName || helperCard.assignee || helperCard.whoTapped || helperCard.from) fail("helper still sees a name field");
  if (helperCard.draft !== "Draft for the porch lamp. Nothing sent.") fail("helper lost the draft text");
  if (helperCard.title !== "Porch lamp") fail("helper lost the title");
  if (!helper.body.you || helper.body.you.name !== "Sam Phelps") fail("helper should still see their own seat on you");
  const helperPeople = helper.body.people || [];
  if (!helperPeople.length) fail("helper should still get the seat list");
  if (!helperPeople.some(function (p) { return p && p.name === "Nia Quill" && p.role === "owner"; })) fail("helper seat list should keep name and role");
  if (!helperPeople.some(function (p) { return p && p.kind === "helper" && p.role === "employee" && p.name === "Sam Phelps"; })) fail("helper seat list lost the helper kind");
  if (!helperPeople.some(function (p) { return p && p.kind === "family" && p.name === "Ada Family"; })) fail("helper seat list lost the family kind");
  pass("helper GET hides names and keeps kind tags");

  if (family.statusCode !== 200) fail("family GET " + family.statusCode);
  const familyCard = cardOf(family.body);
  if (!familyCard) fail("family did not get the card");
  assertMasked(family.body, "family");
  if (familyCard.thread[0].actorKind !== "human" || familyCard.thread[0].actorLabel !== "Nia Quill") fail("family lost actorKind or actorLabel");
  if (!family.body.you || family.body.you.name !== "Ada Family" || family.body.you.kind !== "family") fail("family should still see their own seat on you");
  pass("family GET hides names and keeps kind tags");

  if (owner.statusCode !== 200) fail("owner GET " + owner.statusCode);
  const ownerCard = cardOf(owner.body);
  if (!ownerCard) fail("owner did not get the card");
  if (ownerCard.contactName !== "Casey Brook" || ownerCard.from !== "Nia Quill" || ownerCard.assignee !== "Riley Moss" || ownerCard.whoTapped !== "Nia Quill") {
    fail("owner lost a name field");
  }
  if (ownerCard.thread[0].from !== "Nia Quill" || ownerCard.thread[0].actorKind !== "human" || ownerCard.thread[0].actorLabel !== "Nia Quill") {
    fail("owner lost the thread name or actorKind");
  }
  if (ownerCard.handedTo.name !== "Ada Family") fail("owner lost the handed-to name");
  if (String(ownerCard.next || ownerCard.needLine || "").indexOf("Riley Moss") < 0) fail("owner lost the name on the next line");
  const ownerPeople = owner.body.people || [];
  ["Nia Quill", "Sam Phelps", "Ada Family"].forEach(function (name) {
    if (!ownerPeople.some(function (p) { return p && p.name === name; })) fail("owner seat list lost " + name);
  });
  if (!owner.body.you || owner.body.you.name !== "Nia Quill") fail("owner you.name changed");
  pass("owner GET still sees names");

  assertMasked(helperIn.body, "helper inbox");
  assertMasked(helperAudit.body, "helper audit");
  assertMasked(helperMoney.body, "helper money");
  const inRow = (helperIn.body.inbox || []).find(function (row) { return row && row.id === "in_mask"; });
  if (!inRow || String(inRow.text).indexOf("mask-inbox") < 0 || inRow.from) fail("helper inbox should keep the marker and drop the name");
  const auditRow = (helperAudit.body.audit || []).find(function (row) { return row && String(row.action || "").indexOf("mask-audit") >= 0; });
  if (!auditRow) fail("helper audit lost the marker");
  const moneyRow = (helperMoney.body.money || []).find(function (row) { return row && String(row.what || "").indexOf("mask-money") >= 0; });
  if (!moneyRow || moneyRow.who) fail("helper money should drop who");
  const ownerInboxRow = (ownerIn.body.inbox || []).find(function (row) { return row && row.id === "in_mask"; });
  if (!ownerInboxRow || ownerInboxRow.from !== "Casey Brook" || String(ownerInboxRow.text).indexOf("Nia Quill") < 0) fail("owner inbox lost names");
  const ownerAuditRow = (ownerAudit.body.audit || []).find(function (row) { return row && String(row.action || "").indexOf("Nia Quill") >= 0; });
  if (!ownerAuditRow) fail("owner audit lost the name");
  const ownerMoneyRow = (ownerMoney.body.money || []).find(function (row) { return row && row.who === "Nia Quill"; });
  if (!ownerMoneyRow) fail("owner money lost who");
  pass("inbox, audit, and money follow the same seat rule");

  const said = await call(jobs, "POST", helperH, { action: "say", id: "job_masknames", text: "helper note" });
  if (said.statusCode !== 200 || !said.body || !said.body.job) fail("helper say failed " + said.statusCode);
  assertMasked(said.body, "helper say");
  if (said.body.job.status !== "exception") fail("helper say changed the status it showed");
  if (stored.contactName !== "Casey Brook" || stored.thread[0].from !== "Nia Quill" || stored.thread[0].actorKind !== "human") {
    fail("helper say rewrote the stored names");
  }
  if (!(stored.thread || []).some(function (line) { return line && line.text === "helper note" && line.from === "Sam Phelps"; })) {
    fail("helper say did not store the seat name on the row");
  }
  pass("helper say echoes a masked card and leaves the stored row named");

  try { fs.rmSync(store, { force: true }); } catch (e) {}
  console.log("check-jobs-mask-names: ok");
}

main().catch(function (e) {
  console.error(e && e.stack || e);
  process.exit(1);
});
