#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const store = path.join(os.tmpdir(), "aia-drop-fanout-check-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;

delete global.__aia;
delete global.__aiaHydrate;

const root = path.join(__dirname, "..");
const fields = require("../api/_fields");
const lib = require("../api/_lib");
const jobsHandler = require("../api/jobs");
const intakeHandler = require("../api/intake");
const { mem, hashPin, ensurePeople, ready } = lib;
const { needsOf } = require("../api/_history");

let failed = 0;
function fail(m) { failed += 1; console.error("FAIL " + m); }
function pass(m) { console.log("ok   " + m); }

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
async function call(handler, method, headers, body) {
  const res = mockRes();
  await handler({ method: method, headers: headers || {}, body: body || {}, query: {} }, res);
  return res;
}

const milk = fields.fanOutItems("milk\neggs\nbread", { kind: "list" });
if (milk.length !== 3 || milk[0] !== "milk" || milk[2] !== "bread") fail("newline list must split into 3, got " + JSON.stringify(milk));
else pass("newline list splits");

const bullets = fields.fanOutItems("- milk\n- eggs\n- bread", { kind: "task" });
if (bullets.length !== 3 || bullets[1] !== "eggs") fail("bullets must split, got " + JSON.stringify(bullets));
else pass("bullet list splits");

const commas = fields.fanOutItems("milk, eggs, bread", { kind: "list" });
if (commas.length !== 3) fail("comma list must split, got " + JSON.stringify(commas));
else pass("comma list splits");

const one = fields.fanOutItems("Need a ride Friday", { kind: "task" });
if (one.length !== 1) fail("single line must stay one card");
else pass("single line stays one");

const form = fields.fanOutItems("Name: Sam\nPhone: 417-555-0100\nNeed a pickup Friday 3pm", { kind: "note" });
if (form.length !== 1) fail("form paste must stay one card, got " + JSON.stringify(form));
else pass("form paste stays one");

const photoList = fields.fanOutItems("oak dresser\nscratches on the left", { kind: "list", photoUrl: "/api/upload?id=file_1" });
if (photoList.length !== 1) fail("photo+list must stay one card until OCR exists");
else pass("photo+list stays one (no fake OCR)");

["drop.html", "widget.html"].forEach(function (file) {
  const src = fs.readFileSync(path.join(root, file), "utf8");
  if (src.indexOf("out.jobs") < 0) fail(file + " send() must read out.jobs");
  else pass(file + " reads out.jobs");
  if (src.indexOf("A list becomes more than one card") < 0) fail(file + " must tell strangers a list fans out");
  else pass(file + " names list fan-out");
  if (src.indexOf("You still tap Yes or Stop") < 0) fail(file + " must keep Yes or Stop");
  else pass(file + " keeps Yes or Stop");
});

const dropMd = fs.readFileSync(path.join(root, "DROP.md"), "utf8");
if (dropMd.indexOf("Photo OCR is **not live**") < 0 && dropMd.indexOf("Photo OCR is not live") < 0) {
  fail("DROP.md must say photo OCR is not live");
} else pass("DROP.md names photo OCR follow-up");
if (/vision API|we read the photo|OCR extracted/i.test(dropMd) && /is live/i.test(dropMd)) {
  fail("DROP.md must not fake live OCR");
}
if (dropMd.indexOf("## Agents with AIA World users") >= 0) fail("DROP.md title still says Agents with AIA World users");
else pass("DROP.md title is not Agents with AIA World users");
if (dropMd.indexOf("## Desk AIs with AIA World users") < 0) fail("DROP.md must title Desk AIs with AIA World users");
else pass("DROP.md titles Desk AIs with AIA World users");
if (/World users drop\. Agents draft/.test(dropMd)) fail("DROP.md still says Agents draft");
else pass("DROP.md does not say Agents draft");
if (dropMd.indexOf("World users drop. Desk AIs draft") < 0) fail("DROP.md must say Desk AIs draft");
else pass("DROP.md says Desk AIs draft");
if (dropMd.indexOf("seat a crew agent") >= 0) fail("DROP.md Advanced still says seat a crew agent");
else pass("DROP.md Advanced does not say seat a crew agent");
if (dropMd.indexOf("seat a crew Desk AI") < 0) fail("DROP.md Advanced must say seat a crew Desk AI");
else pass("DROP.md Advanced says seat a crew Desk AI");
if (dropMd.indexOf("Advanced + agents") >= 0) fail("DROP.md files list still says Advanced + agents");
else pass("DROP.md files list does not say Advanced + agents");
if (dropMd.indexOf("Advanced + Desk AIs") < 0) fail("DROP.md files list must say Advanced + Desk AIs");
else pass("DROP.md files list says Advanced + Desk AIs");
if (dropMd.indexOf("AIA AI answers") >= 0) fail("DROP.md Talk still says AIA AI answers");
else pass("DROP.md Talk does not say AIA AI answers");
if (dropMd.indexOf("A Desk AI drafts the card") < 0) fail("DROP.md Talk must say A Desk AI drafts the card");
else pass("DROP.md Talk says A Desk AI drafts the card");

const yesNo = fs.readFileSync(path.join(root, "ACCOUNT-YES-NO.md"), "utf8");
const packMd = fs.readFileSync(path.join(root, "PACK.md"), "utf8");
if (yesNo.indexOf("Drop → many-cards leftover") < 0) fail("ACCOUNT-YES-NO must name Drop → many-cards leftover");
else pass("ACCOUNT-YES-NO names leftover");
if (packMd.indexOf("Drop → many-cards leftover") < 0) fail("PACK.md must name Drop → many-cards leftover");
else pass("PACK.md names leftover");
if (yesNo.indexOf("Desk AI copy leftover") < 0) fail("ACCOUNT-YES-NO must name Desk AI copy leftover");
else pass("ACCOUNT-YES-NO names Desk AI copy leftover");
if (packMd.indexOf("Desk AI copy leftover") < 0) fail("PACK.md must name Desk AI copy leftover");
else pass("PACK.md names Desk AI copy leftover");
if (yesNo.indexOf("DROP.md Advanced leftover") < 0) fail("ACCOUNT-YES-NO must name DROP.md Advanced leftover");
else pass("ACCOUNT-YES-NO names DROP.md Advanced leftover");
if (packMd.indexOf("DROP.md Advanced leftover") < 0) fail("PACK.md must name DROP.md Advanced leftover");
else pass("PACK.md names DROP.md Advanced leftover");
if (yesNo.indexOf("Drop Talk Desk AI leftover after that pass") < 0) fail("ACCOUNT-YES-NO must name Drop Talk Desk AI leftover");
else pass("ACCOUNT-YES-NO names Drop Talk Desk AI leftover");
if (packMd.indexOf("Drop Talk Desk AI leftover:") < 0) fail("PACK.md must name Drop Talk Desk AI leftover");
else pass("PACK.md names Drop Talk Desk AI leftover");
if (yesNo.indexOf("Drop preview Talk leftover after that pass") < 0) fail("ACCOUNT-YES-NO must name Drop preview Talk leftover");
else pass("ACCOUNT-YES-NO names Drop preview Talk leftover");
if (packMd.indexOf("Drop preview Talk leftover:") < 0) fail("PACK.md must name Drop preview Talk leftover");
else pass("PACK.md names Drop preview Talk leftover");
if (yesNo.indexOf("Drop Put data on leftover after that pass") < 0) fail("ACCOUNT-YES-NO must name Drop Put data on leftover");
else pass("ACCOUNT-YES-NO names Drop Put data on leftover");
if (packMd.indexOf("Drop Put data on leftover:") < 0) fail("PACK.md must name Drop Put data on leftover");
else pass("PACK.md names Drop Put data on leftover");
if (dropMd.indexOf("A Desk AI drafts the card. You still tap Yes or Stop. Draft only.") < 0) {
  fail("DROP.md Put data on must say A Desk AI drafts the card");
} else pass("DROP.md Put data on says A Desk AI drafts the card");
if (yesNo.indexOf("Drop Talk voice leftover after that pass") < 0) fail("ACCOUNT-YES-NO must name Drop Talk voice leftover");
else pass("ACCOUNT-YES-NO names Drop Talk voice leftover");
if (packMd.indexOf("Drop Talk voice leftover:") < 0) fail("PACK.md must name Drop Talk voice leftover");
else pass("PACK.md names Drop Talk voice leftover");
if (yesNo.indexOf("Drop preview ask leftover after that pass") < 0) fail("ACCOUNT-YES-NO must name Drop preview ask leftover");
else pass("ACCOUNT-YES-NO names Drop preview ask leftover");
if (packMd.indexOf("Drop preview ask leftover:") < 0) fail("PACK.md must name Drop preview ask leftover");
else pass("PACK.md names Drop preview ask leftover");
if (dropMd.indexOf("missing-field asks") < 0) fail("DROP.md preview must name missing-field asks");
else pass("DROP.md preview names missing-field asks");
if (yesNo.indexOf("Drop widget Tell leftover after that pass") < 0) fail("ACCOUNT-YES-NO must name Drop widget Tell leftover");
else pass("ACCOUNT-YES-NO names Drop widget Tell leftover");
if (packMd.indexOf("Drop widget Tell leftover:") < 0) fail("PACK.md must name Drop widget Tell leftover");
else pass("PACK.md names Drop widget Tell leftover");
if (dropMd.indexOf("One Tell the desk thread") < 0) fail("DROP.md must name one Tell the desk thread");
else pass("DROP.md names one Tell the desk thread");
if (yesNo.indexOf("Drop Tell click leftover after that pass") < 0) fail("ACCOUNT-YES-NO must name Drop Tell click leftover");
else pass("ACCOUNT-YES-NO names Drop Tell click leftover");
if (packMd.indexOf("Drop Tell click leftover:") < 0) fail("PACK.md must name Drop Tell click leftover");
else pass("PACK.md names Drop Tell click leftover");
if (dropMd.indexOf("does not paint two blank-chat prompts") < 0) fail("DROP.md must name one empty Tell on the one thread");
else pass("DROP.md names one empty Tell on the one thread");
const previewSrc = fs.readFileSync(path.join(root, "drop-preview.js"), "utf8");
const hookTypeAt = previewSrc.indexOf("function hookType");
const hookType = previewSrc.slice(hookTypeAt, previewSrc.indexOf("function hookSendAlias", hookTypeAt));
if (hookType.indexOf("if (window.AIADropChat) return") < 0) fail("drop-preview.js hookType must yield Tell to chat on the one #drop-thread");
else pass("drop-preview.js hookType yields Tell to chat on the one thread");
const chatSrc = fs.readFileSync(path.join(root, "drop-chat.js"), "utf8");
if (chatSrc.indexOf("if (last && /Type the work\\. A Desk AI drafts the card/") < 0) fail("drop-chat.js empty Tell must skip a second blank-chat prompt");
else pass("drop-chat.js empty Tell skips a second blank-chat prompt");
if (yesNo.indexOf("Drop Put data on Tell leftover after that pass") < 0) fail("ACCOUNT-YES-NO must name Drop Put data on Tell leftover");
else pass("ACCOUNT-YES-NO names Drop Put data on Tell leftover");
if (packMd.indexOf("Drop Put data on Tell leftover:") < 0) fail("PACK.md must name Drop Put data on Tell leftover");
else pass("PACK.md names Drop Put data on Tell leftover");
if (dropMd.indexOf("What should a Desk AI draft?") < 0) fail("DROP.md Put data on Tell must say What should a Desk AI draft");
else pass("DROP.md Put data on Tell says What should a Desk AI draft");
if (yesNo.indexOf("Drop Preferred outcome leftover after that pass") < 0) fail("ACCOUNT-YES-NO must name Drop Preferred outcome leftover");
else pass("ACCOUNT-YES-NO names Drop Preferred outcome leftover");
if (packMd.indexOf("Drop Preferred outcome leftover:") < 0) fail("PACK.md must name Drop Preferred outcome leftover");
else pass("PACK.md names Drop Preferred outcome leftover");
if (dropMd.indexOf("What a Desk AI should draft next") < 0) fail("DROP.md Preferred outcome must say What a Desk AI should draft next");
else pass("DROP.md Preferred outcome says What a Desk AI should draft next");
if (dropMd.indexOf("Not What the desk should do next") < 0) fail("DROP.md Preferred outcome must deny What the desk should do next");
else pass("DROP.md Preferred outcome denies What the desk should do next");
if (yesNo.indexOf("Drop widget This drop leftover after that pass") < 0) fail("ACCOUNT-YES-NO must name Drop widget This drop leftover");
else pass("ACCOUNT-YES-NO names Drop widget This drop leftover");
if (packMd.indexOf("Drop widget This drop leftover:") < 0) fail("PACK.md must name Drop widget This drop leftover");
else pass("PACK.md names Drop widget This drop leftover");
if (dropMd.indexOf("skip the This drop / Counter strip") < 0) fail("DROP.md preview must skip This drop / Counter on /widget");
else pass("DROP.md preview skips This drop / Counter on /widget");
if (previewSrc.indexOf("function widgetOn") < 0) fail("drop-preview.js must detect /widget path");
else pass("drop-preview.js detects /widget path");
if (previewSrc.indexOf("slim ? \"\"") < 0) fail("drop-preview.js must omit This drop strip when slim");
else pass("drop-preview.js omits This drop strip when slim");
if (hookType.indexOf("if (last && /Type the work\\. A Desk AI drafts the card/") < 0) fail("drop-preview.js empty Tell must skip a second blank-chat prompt");
else pass("drop-preview.js empty Tell skips a second blank-chat prompt");
if (yesNo.indexOf("Drop widget empty Tell leftover after that pass") < 0) fail("ACCOUNT-YES-NO must name Drop widget empty Tell leftover");
else pass("ACCOUNT-YES-NO names Drop widget empty Tell leftover");
if (packMd.indexOf("Drop widget empty Tell leftover:") < 0) fail("PACK.md must name Drop widget empty Tell leftover");
else pass("PACK.md names Drop widget empty Tell leftover");
if (dropMd.indexOf("Embed empty Tell skips a second blank-chat prompt") < 0) fail("DROP.md must name embed empty Tell skip");
else pass("DROP.md names embed empty Tell skip");

const pkg = fs.readFileSync(path.join(root, "package.json"), "utf8");
if (pkg.indexOf("check-drop-fanout.js") < 0) fail("package.json must run check-drop-fanout.js");
else pass("package.json runs check-drop-fanout");

async function capturePath() {
  await ready();
  const slug = "fan-desk";
  const pin = "4821";
  const desk = {
    slug: slug,
    name: "Fan desk",
    biz: slug,
    pin: hashPin(pin),
    createdAt: new Date().toISOString(),
    people: [],
    rules: []
  };
  ensurePeople(desk);
  mem.workspaces.unshift(desk);

  const cap = await call(jobsHandler, "POST", { "x-workspace": slug, "x-pin": pin }, {
    action: "capture",
    kind: "list",
    title: "Saturday errands",
    notes: "milk\neggs\nbread",
    from: "widget"
  });
  const jobs = cap.body && cap.body.jobs;
  const lead = cap.body && cap.body.job;
  if (cap.statusCode !== 201 || !jobs || jobs.length !== 3) {
    fail("list Drop must fan into 3 cards, got " + cap.statusCode + " " + JSON.stringify(cap.body && { fanOut: cap.body.fanOut, n: jobs && jobs.length, err: cap.body && cap.body.error }));
  } else pass("list Drop fans into 3 cards");
  if (!lead || lead.id !== jobs[0].id) fail("response.job must stay the first card");
  else pass("job stays backward compatible");
  if (cap.body.fanOut !== 3) fail("fanOut count must be 3");
  else pass("fanOut count is 3");

  const titles = (jobs || []).map(function (j) { return j && j.title; }).join(" | ");
  if (!/milk/.test(titles) || !/eggs/.test(titles) || !/bread/.test(titles)) fail("each item must be its own card title, got " + titles);
  else pass("each line is its own card");

  const ids = {};
  (jobs || []).forEach(function (j) {
    if (!j || !j.id) { fail("fanned card missing id"); return; }
    if (ids[j.id]) fail("fanned card ids collided: " + j.id);
    ids[j.id] = true;
    if (j.status === "shipped" || j.status === "killed") fail("fanned card must not auto-ship: " + j.title);
    if (j.charged) fail("fanned card must not charge: " + j.title);
    if (!j.draft) fail("fanned card must have a draft: " + j.title);
    if (j.kind === "list") fail("fanned grocery line must not stay kind=list (that asks for a photo)");
    const need = needsOf(j, { staff: false });
    if (need.missing && need.missing.indexOf("photo") >= 0) fail("fanned text card must not need a photo");
    if (!need.decide && j.status === "waiting") {
      // decide can be false if waitingOn blocks; still must not send
    }
    const onDesk = mem.jobs.filter(function (row) { return row && row.id === j.id; });
    if (!onDesk.length) fail("fanned card missing from desk jobs: " + j.id);
  });
  if (jobs && jobs.length === 3 && Object.keys(ids).length === 3) pass("fanned cards have unique ids and stay on the desk");

  if (jobs && jobs.some(function (j) { return /collect charge|payout|eth|mint|send money/i.test([j.draft, j.next, j.why].join(" ")); })) {
    fail("fanned drafts must not invent Collect / mint / send");
  } else pass("fanned drafts stay off Collect / mint / send");

  if (!/Yes or Stop/i.test(String((cap.body && cap.body.note) || ""))) fail("capture note must keep Yes or Stop");
  else pass("capture note keeps Yes or Stop human");

  const single = await call(jobsHandler, "POST", { "x-workspace": slug, "x-pin": pin }, {
    action: "capture",
    kind: "task",
    title: "Need a ride Friday",
    notes: "Need a ride Friday",
    from: "widget"
  });
  if (!single.body || !single.body.jobs || single.body.jobs.length !== 1) fail("single Drop must stay one card");
  else pass("single Drop stays one card");

  const pictured = await call(jobsHandler, "POST", { "x-workspace": slug, "x-pin": pin }, {
    action: "capture",
    kind: "list",
    title: "Oak dresser",
    notes: "oak dresser\nscratches on the left",
    photoUrl: "/api/upload?id=file_1",
    files: [{ id: "file_1", name: "dresser.jpg", type: "image/jpeg", kind: "photo", bytes: 12, url: "/api/upload?id=file_1" }],
    from: "widget"
  });
  if (!pictured.body || !pictured.body.jobs || pictured.body.jobs.length !== 1) {
    fail("photo+list Drop must stay one card until OCR, got " + (pictured.body && pictured.body.fanOut));
  } else pass("photo+list Drop stays one card");

  const talk = await call(intakeHandler, "POST", { "x-workspace": slug, "x-pin": pin }, {
    action: "do",
    text: "milk\neggs\nbread"
  });
  const talked = talk.body && talk.body.jobs;
  if (talk.statusCode !== 201 || !talked || talked.length !== 3) fail("Talk list must fan into 3 cards, got " + talk.statusCode + " n=" + (talked && talked.length));
  else pass("Talk list fans into 3 cards");
  if (talk.body && talk.body.job && talk.body.job.status === "shipped") fail("Talk fan-out must not ship");
  else pass("Talk fan-out stays on the queue");
}

capturePath().then(function () {
  try { if (fs.existsSync(store)) fs.unlinkSync(store); } catch (e) {}
  if (failed) {
    console.error(failed + " failed");
    process.exit(1);
  }
  console.log("check-drop-fanout ok");
}).catch(function (e) {
  console.error(e);
  process.exit(1);
});
