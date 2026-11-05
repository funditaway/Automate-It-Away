#!/usr/bin/env node
require("./_env-guard");
// Card thread: every new talk line carries actorKind, actorLabel, input, output, at.
// si, ai, human, helper, family, employee, and ext can post when the seat matches.
// An unknown kind is refused. A legacy line with no actorKind still reads as a
// kind inferred from from / role / who, and the stored row is not rewritten.
// Collect stays HOLD.
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
process.env.AIA_STORE_PATH = path.join(os.tmpdir(), "aia-card-thread-" + Date.now() + "-" + process.pid + ".json");
delete process.env.XAI_API_KEY;
delete process.env.GROK_API_KEY;
delete process.env.AIA_GROK_KEY;
delete process.env.VERCEL_ENV;
delete global.__aia;
delete global.__aiaHydrate;

let failed = 0;
let asserts = 0;
function fail(msg) { console.error("FAIL " + msg); failed += 1; process.exitCode = 1; }
function pass(msg) { console.log("ok  " + msg); }
function ok(cond, msg) { asserts += 1; if (cond) pass(msg); else fail(msg); }

function mockRes() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    end(b) { if (b !== undefined && this.body == null) this.body = b; return this; }
  };
}
async function call(handler, method, headers, body, query) {
  const res = mockRes();
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  ["log", "error", "warn", "info"].forEach((k) => { console[k] = function () {}; });
  try {
    await handler({ method, headers: headers || {}, body: body == null ? {} : body, query: query || {}, url: "/api/jobs" }, res);
  } finally {
    Object.assign(console, orig);
  }
  return res;
}
function seat(slug, pin) { return { "x-workspace": slug, "x-pin": pin }; }
function lineWith(job, text) {
  const rows = (job && job.thread) || [];
  const hit = rows.filter((t) => t && String(t.text || "").indexOf(text) >= 0);
  return hit.length ? hit[hit.length - 1] : null;
}
function shaped(entry, kind, side) {
  if (!entry) return false;
  if (entry.actorKind !== kind) return false;
  if (!entry.actorLabel || !entry.at) return false;
  if (typeof entry.input !== "string" || typeof entry.output !== "string") return false;
  if (side === "out") return entry.output.length > 0 && entry.input === "";
  if (side === "in") return entry.input.length > 0 && entry.output === "";
  return true;
}

async function main() {
  const jobs = require(path.join(root, "api/jobs"));
  const hook = require(path.join(root, "api/hook"));
  const health = require(path.join(root, "api/health"));
  const history = require(path.join(root, "api/_history"));
  const lib = require(path.join(root, "api/_lib"));
  await lib.ready();
  const now = "2026-01-01T00:00:00.000Z";
  const pin = (n) => lib.hashPin(n);
  function person(id, name, role, kind, code, extra) {
    return Object.assign({ id, name, role, kind, status: "approved", pin: pin(code), accountId: "", email: "", createdAt: now }, extra || {});
  }
  const ANN = "acct_ann";
  const SOL = "acct_sol";
  const ann = { id: ANN, name: "Ann Shop", ownerName: "Ann", email: "", desks: ["desk-a"], memberDesks: [], createdAt: now, kind: "human" };
  const sol = { id: SOL, name: "Sol Shop", ownerName: "Sol", email: "", desks: ["si-desk"], memberDesks: [], createdAt: now, kind: "si" };
  const deskA = {
    slug: "desk-a", biz: "Ann Shop", name: "Ann", accountId: ANN, pin: pin("1111"), createdAt: now, rules: [], does: "",
    people: [
      person("p_ann", "Ann", "owner", "owner", "1111", { accountId: ANN }),
      person("p_hal", "Hal", "employee", "helper", "2222"),
      person("p_fay", "Fay", "employee", "family", "3333"),
      person("p_ed", "Ed", "employee", "employee", "4444"),
      person("p_bot", "Doer", "agent", "agent", "5555", { deskAi: true })
    ]
  };
  const deskS = {
    slug: "si-desk", biz: "Sol Shop", name: "Sol", accountId: SOL, pin: pin("6666"), createdAt: now, rules: [], does: "",
    people: [person("p_sol", "Sol", "owner", "owner", "6666", { accountId: SOL })]
  };
  lib.mem.accounts = [ann, sol];
  lib.mem.workspaces = [deskA, deskS];
  lib.mem.jobs = [];
  lib.mem.money = [{ id: "m_hold", amount: 1, status: "hold", charged: false }];
  lib.mem.connections = [];
  const money0 = JSON.stringify(lib.mem.money);
  const H = {
    ann: seat("desk-a", "1111"),
    hal: seat("desk-a", "2222"),
    fay: seat("desk-a", "3333"),
    ed: seat("desk-a", "4444"),
    bot: seat("desk-a", "5555"),
    sol: seat("si-desk", "6666")
  };
  function bare(slug) {
    return {
      id: "job_" + slug + "_" + Math.random().toString(16).slice(2),
      workspace: slug, title: "Card " + slug, status: "waiting", step: "Qualify",
      createdAt: now, thread: [], log: [], charged: false
    };
  }
  const cardA = bare("desk-a");
  const cardS = bare("si-desk");
  lib.mem.jobs.push(cardA, cardS);

  const kinds = [
    ["human", H.ann, cardA.id, "desk-a", "Ann", "in"],
    ["helper", H.hal, cardA.id, "desk-a", "Hal", "in"],
    ["family", H.fay, cardA.id, "desk-a", "Fay", "in"],
    ["employee", H.ed, cardA.id, "desk-a", "Ed", "in"],
    ["ai", H.bot, cardA.id, "desk-a", "Doer", "out"],
    ["si", H.sol, cardS.id, "si-desk", "Sol", "in"]
  ];
  for (let i = 0; i < kinds.length; i++) {
    const [kind, headers, id, slug, label, side] = kinds[i];
    const before = (lib.mem.jobs.find((j) => j.id === id).thread || []).length;
    const text = "Note from " + kind;
    const r = await call(jobs, "POST", headers, { action: "say", id: id, text: text, actorKind: kind });
    const job = r.body && r.body.job;
    const hit = lineWith(job, text);
    ok(r.statusCode === 200 && shaped(hit, kind, side) && hit.actorLabel === label, kind + " posts and reads back (" + r.statusCode + " " + (hit && hit.actorKind) + ")");
    ok((lib.mem.jobs.find((j) => j.id === id).thread || []).length === before + 1, kind + " writes one line");
    const stored = lineWith(lib.mem.jobs.find((j) => j.id === id), text);
    ok(stored && stored.actorKind === kind, kind + " is stored on the card");
    const got = await call(jobs, "GET", headers, null, { workspace: slug });
    const listed = ((got.body && got.body.jobs) || []).find((j) => j.id === id);
    const read = lineWith(listed, text);
    ok(got.statusCode === 200 && read && read.actorKind === kind && read !== stored, kind + " GET reads the same kind");
  }

  const ext = await call(jobs, "POST", { "x-workspace": "desk-a" }, { action: "capture", title: "Outside", notes: "Outside note", actorKind: "ext" });
  const extJob = ext.body && ext.body.job;
  const extLine = lineWith(extJob, "Outside note");
  const deskLine = extJob && (extJob.thread || [])[(extJob.thread || []).length - 1];
  ok(ext.statusCode === 201 && shaped(extLine, "ext", "in") && extLine.actorLabel, "ext capture posts and reads back (" + ext.statusCode + ")");
  ok(deskLine && deskLine.actorKind === "ai" && deskLine.output && deskLine.input === "", "desk rec on capture is ai output");
  ok(extJob && extJob.charged === false, "capture stays uncharged");

  const annJob = lib.mem.jobs.find((j) => j.id === cardA.id);
  const n0 = annJob.thread.length;
  const bad = await call(jobs, "POST", H.ann, { action: "say", id: cardA.id, text: "Nope", actorKind: "robot" });
  ok(bad.statusCode === 400 && /si, ai, human, helper, family, employee, or ext/.test((bad.body && bad.body.error) || ""), "unknown kind is refused (" + bad.statusCode + " " + ((bad.body && bad.body.error) || "") + ")");
  ok(annJob.thread.length === n0, "unknown kind writes nothing");
  const mismatch = await call(jobs, "POST", H.hal, { action: "say", id: cardA.id, text: "Pretend owner", actorKind: "human" });
  ok(mismatch.statusCode === 403 && annJob.thread.length === n0, "a helper cannot post as human (" + mismatch.statusCode + ")");

  const reply = await call(jobs, "POST", H.hal, { action: "reply", id: cardA.id, text: "Hal replies" });
  const replyLine = lineWith(reply.body && reply.body.job, "Hal replies");
  const replyRow = reply.body && reply.body.job && (reply.body.job.replies || [])[(reply.body.job.replies || []).length - 1];
  ok(reply.statusCode === 200 && shaped(replyLine, "helper", "in") && replyRow && replyRow.actorKind === "helper", "reply sets actorKind on the thread and the reply row");

  const handed = await call(jobs, "POST", H.ann, { action: "assign", id: cardA.id, name: "Hal" });
  const handLine = lineWith(handed.body && handed.body.job, "Handed to Hal");
  ok(handed.statusCode === 200 && shaped(handLine, "human", "in"), "assign sets the owner's kind (" + handed.statusCode + ")");

  const asked = await call(jobs, "POST", H.fay, { action: "hand", id: cardA.id, text: "Fay needs a hand" });
  const askLine = lineWith(asked.body && asked.body.job, "Fay needs a hand");
  ok(asked.statusCode === 200 && shaped(askLine, "family", "in"), "hand sets the family kind");

  const told = await call(jobs, "POST", H.ann, { action: "capture", title: "Told", tell: "Ann told this", notes: "Ann note beside it" });
  const tellLine = lineWith(told.body && told.body.job, "Ann told this");
  const noteLine = lineWith(told.body && told.body.job, "Ann note beside it");
  ok(told.statusCode === 201 && shaped(tellLine, "human", "in") && shaped(noteLine, "human", "in"), "capture tell and note keep the seat kind");
  ok(!(told.body && told.body.job && /Ann told this[\s\S]{400,}/.test(JSON.stringify(told.body.job.notes || ""))), "the card notes stay the short capture text");

  const piped = await call(hook, "POST", { "x-workspace": "desk-a" }, { event: "update", id: cardA.id, notes: "Pipe wrote this", provider: "webhook" });
  const pipeLine = lineWith(lib.mem.jobs.find((j) => j.id === cardA.id), "Pipe wrote this");
  ok(piped.statusCode === 200 && shaped(pipeLine, "ext", "in"), "hook update is ext (" + piped.statusCode + ")");

  const legacy = { at: "2020-01-01T00:00:00.000Z", from: "grok", kind: "rec", text: "Old draft" };
  const legacyRows = [
    legacy,
    { at: "2020-01-01T00:00:01.000Z", from: "Ann", role: "owner", kind: "note", text: "Old human" },
    { at: "2020-01-01T00:00:02.000Z", from: "Hal", role: "helper", kind: "note", text: "Old helper" },
    { at: "2020-01-01T00:00:03.000Z", from: "Fay", whoKind: "family", kind: "note", text: "Old family" },
    { at: "2020-01-01T00:00:04.000Z", from: "Ed", role: "employee", kind: "note", text: "Old employee" },
    { at: "2020-01-01T00:00:05.000Z", from: "Sol", whoKind: "si", kind: "note", text: "Old si" },
    { at: "2020-01-01T00:00:06.000Z", from: "pipe", kind: "note", text: "Old pipe" }
  ];
  const old = bare("desk-a");
  old.thread = legacyRows;
  lib.mem.jobs.push(old);
  const hist = history.historyItem(old, deskA);
  const want = ["ai", "human", "helper", "family", "employee", "si", "ext"];
  const gotKinds = (hist.thread || []).map((t) => t.actorKind);
  ok(JSON.stringify(gotKinds) === JSON.stringify(want), "history read infers legacy kinds (" + gotKinds.join(",") + ")");
  legacyRows.forEach((row) => ok(!Object.prototype.hasOwnProperty.call(row, "actorKind"), "stored legacy row has no actorKind (" + row.text + ")"));
  const listed = await call(jobs, "GET", H.ann, null, { workspace: "desk-a" });
  const viewed = ((listed.body && listed.body.jobs) || []).find((j) => j.id === old.id);
  const viewedLegacy = lineWith(viewed, "Old draft");
  ok(listed.statusCode === 200 && viewedLegacy && viewedLegacy.actorKind === "ai", "GET infers ai for an old grok line");
  ok(!Object.prototype.hasOwnProperty.call(legacy, "actorKind") && lib.mem.jobs.find((j) => j.id === old.id).thread[0] === legacy, "GET does not rewrite the stored legacy row");

  const healthy = await call(health, "GET", {}, null, {});
  ok(healthy.body && (healthy.body.collect === "hold" || (healthy.body.money && healthy.body.money.collect === "hold") || JSON.stringify(healthy.body).indexOf("\"collect\":\"hold\"") >= 0 || JSON.stringify(healthy.body).indexOf("\"collect\": \"hold\"") >= 0), "Collect stays HOLD");
  ok(JSON.stringify(lib.mem.money) === money0, "money rows unchanged");
  ok(!lib.mem.jobs.some((j) => j && j.charged === true), "no card was charged");

  console.log("assertions " + asserts);
  if (failed) { console.error("check-card-thread-actor: " + failed + " failed"); process.exit(1); }
  console.log("check-card-thread-actor: ok");
  process.exit(0);
}

main().catch((e) => { console.error("FAIL " + (e && e.stack || e)); process.exit(1); });
