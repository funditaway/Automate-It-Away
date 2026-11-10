#!/usr/bin/env node
"use strict";
require("./_env-guard");
const os = require("os");
const path = require("path");
const fs = require("fs");

const store = path.join(os.tmpdir(), "aia-drop-desk-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;

const root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(root, "api/jobs.js"), "utf8");
const start = src.indexOf("if (action === \"capture\")");
const fn = src.slice(start, start + 400);
if (fn.indexOf("if (!shop)") < 0) throw new Error("jobs capture must reject a missing desk");
if (fn.indexOf("No desk with that name") < 0) throw new Error("jobs capture must say the desk is missing");

// 1ec1382 moved send() from drop.html / widget.html into drop-app.js.
// Capture errors still paint on #err: a non-2xx body uses
// showNote(err, out.error || "Could not send."), and a network reject
// uses showNote(err, "Could not reach the desk."). Success still
// paints #ok ("On the queue… You still tap Yes, then Start").
// HTTP 2xx is treated as success; out.ok is not consulted — that is
// pre-existing (same before the move), not a new requirement.
// Nothing in send() ships, starts, charges, or binds.

const drop = fs.readFileSync(path.join(root, "drop.html"), "utf8");
const widget = fs.readFileSync(path.join(root, "widget.html"), "utf8");
const app = fs.readFileSync(path.join(root, "drop-app.js"), "utf8");

function pass(msg) { console.log("ok  " + msg); }

if (drop.indexOf("drop-app.js") < 0) throw new Error("drop.html must load drop-app.js");
else pass("drop.html loads drop-app.js");
if (widget.indexOf("drop-app.js") < 0) throw new Error("widget.html must load drop-app.js");
else pass("widget.html loads drop-app.js");
if (drop.indexOf('id="err"') < 0 || drop.indexOf('id="ok"') < 0) {
  throw new Error("drop.html must still have visible ok and error slots");
} else pass("drop.html has ok and error slots");
if (widget.indexOf('id="err"') < 0 || widget.indexOf('id="ok"') < 0) {
  throw new Error("widget.html must still have visible ok and error slots");
} else pass("widget.html has ok and error slots");

function sendFn(srcText) {
  const at = srcText.indexOf("async function send()");
  if (at < 0) return "";
  const stop = srcText.indexOf("function copyDropShare", at);
  return srcText.slice(at, stop > at ? stop : at + 2800);
}

function dropCaptureErrorFaults(appSrc) {
  const bad = [];
  const send = sendFn(appSrc);
  if (!send) { bad.push("missing send()"); return bad; }

  const httpErr = /else\s*\{\s*showNote\(\s*err\s*,\s*out\.error\s*\|\|\s*"Could not send\."\s*\)/.test(send);
  const netErr = /catch\s*\(\s*\w+\s*\)\s*\{\s*showNote\(\s*err\s*,\s*"Could not reach the desk\."\s*\)/.test(send);
  const successOnFail = /if\s*\(\s*!\s*r\.ok\s*\)/.test(send) || /else\s*\{\s*showNote\(\s*ok\s*,/.test(send);
  if (successOnFail) bad.push("success shown on failure");
  if (!httpErr || !netErr) {
    if (!successOnFail) bad.push("error swallowed");
  }

  const finallyAt = send.indexOf("finally");
  const afterFinally = finallyAt >= 0 ? send.slice(finallyAt) : "";
  if (/err\.style\.display\s*=\s*['"]none['"]/.test(afterFinally) || /err\.textContent\s*=\s*['"]{2}/.test(afterFinally)) {
    bad.push("error painted then cleared");
  }

  const jobsAt = send.indexOf('fetch("/api/jobs"');
  const afterJobs = jobsAt >= 0 ? send.slice(jobsAt + 16) : "";
  const elseAt = afterJobs.search(/else\s*\{/);
  const catchAt = afterJobs.search(/catch\s*\(\s*\w+\s*\)\s*\{/);
  function bodyHasFetch(src, from) {
    if (from < 0) return false;
    const open = src.indexOf("{", from);
    if (open < 0) return false;
    let depth = 0;
    for (let i = open; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") {
        depth--;
        if (depth === 0) return src.slice(open, i).indexOf("fetch(") >= 0;
      }
    }
    return false;
  }
  if (bodyHasFetch(afterJobs, elseAt) || bodyHasFetch(afterJobs, catchAt)) {
    bad.push("extra fetch on failure");
  }

  if (!/showNote\(\s*ok\s*,\s*"On the queue"/.test(send)) {
    bad.push("success path no longer paints On the queue");
  }
  if (/action:\s*"start"|action:\s*"ship"|action:\s*"charge"|action:\s*"bind-ai"/.test(send)) {
    // only flag when the healthy success path is also doing this; the
    // extra-fetch mutant already reports its own reason from the else/catch.
    if (!bodyHasFetch(afterJobs, elseAt) && !bodyHasFetch(afterJobs, catchAt)) {
      bad.push("send() ships, starts, charges, or binds before Yes");
    }
  }
  return bad;
}

const liveFaults = dropCaptureErrorFaults(app);
if (liveFaults.length) {
  throw new Error("drop-app.js send() must paint capture errors and success: " + liveFaults.join("; "));
}
pass("send() paints a plain error on a failed capture and success on a real one, with no extra send");

function applyMutant(srcText, kind) {
  const send = sendFn(srcText);
  if (!send) return srcText;
  let next = send;
  if (kind === "error swallowed") {
    next = next.replace("} else { showNote(err, out.error || \"Could not send.\"); }", "} else { }");
    next = next.replace("catch (ex) { showNote(err, \"Could not reach the desk.\"); }", "catch (ex) { }");
  } else if (kind === "error painted then cleared") {
    next = next.replace(
      "finally { if (btn) { btn.disabled = false; btn.textContent = sendLabel(); } }",
      "finally { if (err) { err.style.display = \"none\"; err.textContent = \"\"; } if (btn) { btn.disabled = false; btn.textContent = sendLabel(); } }"
    );
  } else if (kind === "success shown on failure") {
    next = next.replace("if (r.ok) {", "if (!r.ok) {");
  } else if (kind === "extra fetch on failure") {
    next = next.replace(
      "} else { showNote(err, out.error || \"Could not send.\"); }",
      "} else { showNote(err, out.error || \"Could not send.\"); fetch(\"/api/jobs\", { method: \"POST\", headers: headers(), body: JSON.stringify({ action: \"start\" }) }); }"
    );
    next = next.replace(
      "catch (ex) { showNote(err, \"Could not reach the desk.\"); }",
      "catch (ex) { showNote(err, \"Could not reach the desk.\"); fetch(\"/api/jobs\", { method: \"POST\", headers: headers(), body: JSON.stringify({ action: \"charge\" }) }); }"
    );
  }
  const at = srcText.indexOf(send);
  return srcText.slice(0, at) + next + srcText.slice(at + send.length);
}

const mutants = [
  "error swallowed",
  "error painted then cleared",
  "success shown on failure",
  "extra fetch on failure"
];
let caught = 0;
mutants.forEach(function (kind) {
  const faults = dropCaptureErrorFaults(applyMutant(app, kind));
  const hit = faults.indexOf(kind) >= 0;
  if (!hit) {
    console.error("mutant missed: " + kind + " (got " + JSON.stringify(faults) + ")");
    process.exitCode = 1;
  } else {
    caught++;
    pass("mutant caught: " + kind + " (" + faults.filter(function (f) { return f === kind; })[0] + ")");
  }
});
if (caught !== mutants.length) {
  throw new Error("check-drop-desk mutants: " + caught + "/" + mutants.length + " caught");
}
console.log("ok  mutants: " + caught + "/" + mutants.length + " caught");
console.log("check-drop-desk mutants: " + caught + "/" + mutants.length + " caught");

delete require.cache[require.resolve("../api/_lib")];
const lib = require("../api/_lib");
const jobsHandler = require("../api/jobs");

function mockRes() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    end() { return this; }
  };
}
async function call(headers, body) {
  const res = mockRes();
  await jobsHandler({ method: "POST", headers: headers || {}, body: body || {}, query: {} }, res);
  return res;
}

async function main() {
  await lib.ready();

  const ghost = await call({ "x-workspace": "oddo-book" }, { action: "capture", title: "Porch lamp" });
  if (ghost.statusCode < 400 || ghost.body.ok) {
    throw new Error("unknown slug must 4xx, got " + ghost.statusCode);
  }
  if ((lib.mem.jobs || []).some((j) => j.workspace === "oddo-book")) {
    throw new Error("unknown slug must not keep a job");
  }
  if ((lib.mem.workspaces || []).some((w) => w && w.slug === "oddo-book")) {
    throw new Error("unknown slug must not invent a desk");
  }

  const empty = { slug: "springfield-desk", name: "Springfield desk", biz: "springfield-desk", people: [] };
  lib.ensurePeople(empty);
  lib.mem.workspaces.unshift(empty);
  const before = (lib.mem.jobs || []).filter((j) => j.workspace === "springfield-desk").length;
  const real = await call({ "x-workspace": "springfield-desk" }, { action: "capture", title: "Need a ride" });
  if (real.statusCode !== 201 || !real.body.ok) {
    throw new Error("empty real desk must still capture, got " + real.statusCode);
  }
  const after = (lib.mem.jobs || []).filter((j) => j.workspace === "springfield-desk");
  if (before !== 0 || after.length !== 1 || after[0].title !== "Need a ride") {
    throw new Error("empty real desk lost the card");
  }

  const told = await call({ "x-workspace": "springfield-desk" }, {
    action: "capture",
    kind: "note",
    title: "Name: Sam",
    from: "widget",
    contactName: "PROBE",
    notes: "Name: Sam\nPhone: 417-555-0100\nNeed a pickup Friday 3pm",
    tell: "Not shipped. Qualify first.",
    implement: "Name: Sam\nPhone: 417-555-0100\nNeed a pickup Friday 3pm",
    mode: "agent",
    droppedByKind: "helper",
    lane: "ops"
  });
  const tellJob = told.body && told.body.job;
  if (told.statusCode !== 201 || !tellJob) {
    throw new Error("Tell AIA Put must capture, got " + told.statusCode);
  }
  const tellRow = (tellJob.thread || []).find((t) => t && t.kind === "tell" && /Qualify first/.test(t.text || ""));
  if (!tellRow) throw new Error("Tell AIA Put must store kind tell, got " + JSON.stringify(tellJob.thread));
  if ((tellJob.thread || []).some((t) => t && t.kind === "note" && /Qualify first/.test(t.text || ""))) {
    throw new Error("Tell AIA text must not also store as note");
  }
  const noteOnly = await call({ "x-workspace": "springfield-desk" }, {
    action: "capture",
    title: "Grocery run",
    from: "widget",
    notes: "Milk and bread",
    droppedByKind: "family"
  });
  const noteJob = noteOnly.body && noteOnly.body.job;
  if (noteOnly.statusCode !== 201 || !noteJob) {
    throw new Error("desk note Put must capture, got " + noteOnly.statusCode);
  }
  if ((noteJob.thread || []).some((t) => t && t.kind === "tell")) {
    throw new Error("desk notes without Tell AIA must stay note, got " + JSON.stringify(noteJob.thread));
  }
  if (!(noteJob.thread || []).some((t) => t && t.kind === "note" && /Milk and bread/.test(t.text || ""))) {
    throw new Error("desk notes without Tell AIA must store kind note");
  }

  console.log("check-drop-desk: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
