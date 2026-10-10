#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { Readable } = require("stream");

const storeFile = path.join(os.tmpdir(), "aia-hook-too-big-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = storeFile;
process.env.AIA_TLD_PROBE = "0";
delete process.env.VERCEL_ENV;
delete process.env.XAI_API_KEY;
delete process.env.GROK_API_KEY;
delete process.env.AIA_GROK_KEY;

delete global.__aia;
delete global.__aiaHydrate;

const root = path.join(__dirname, "..");
const HOOK_MAX = 4000000;
const BODY_MAX = 1048576;
const HOOK_ERR = "That's too big to take in. Keep it under 4 MB.";
const MB_ERR = "That's too big to send. Keep it under 1 MB.";
const UPLOAD_ERR = "Each file must stay under 4 MB.";
const SLUG = "once-desk";
const OTHER = "other-desk";
const SECRET = "BODYSECRET";
const AUTO = "AUTO-STOP-SHOULD-NOT-RUN";

let failed = 0;
const leaks = [];
function fail(m) { failed += 1; console.error("FAIL " + m); }
function pass(m) { console.log("ok   " + m); }

["log", "info", "warn", "error", "debug"].forEach(function (name) {
  const orig = console[name].bind(console);
  console[name] = function () {
    const line = Array.prototype.map.call(arguments, function (arg) {
      if (typeof arg === "string") return arg;
      try { return JSON.stringify(arg); } catch (e) { return String(arg); }
    }).join(" ");
    if (line.indexOf(SECRET) >= 0) leaks.push(name);
    return orig.apply(console, arguments);
  };
});

const libSrc = fs.readFileSync(path.join(root, "api/_lib.js"), "utf8");
const hookSrc = fs.readFileSync(path.join(root, "api/hook.js"), "utf8");
const uploadSrc = fs.readFileSync(path.join(root, "api/upload.js"), "utf8");

if (libSrc.indexOf("1048576") < 0 || libSrc.indexOf(MB_ERR) < 0) fail("1 MB cap missing");
else pass("other routes still name the 1 MB cap");
if (libSrc.indexOf("4000000") < 0 || libSrc.indexOf(HOOK_ERR) < 0) fail("hook cap missing");
else pass("hook cap is 4,000,000");
if (uploadSrc.indexOf(UPLOAD_ERR) < 0 || !/const MAX = 4_000_000;/.test(uploadSrc)) fail("upload cap is not 4,000,000");
else pass("upload cap is 4,000,000");
if (hookSrc.indexOf("Too big to take in") < 0 || hookSrc.indexOf("more too-big posts this hour") < 0) {
  fail("hook card wording missing");
} else pass("hook card wording is present");

const { mem } = require("../api/_lib");
const hookHandler = require("../api/hook");
const packHandler = require("../api/_packs");
const jobsHandler = require("../api/jobs");
const uploadHandler = require("../api/upload");

function shop(slug) {
  return {
    slug: slug,
    name: slug,
    biz: slug,
    pin: "x",
    createdAt: "2026-01-01T00:00:00.000Z",
    people: [],
    rules: [{ id: "r_auto", when: "qualify", then: "stop", text: AUTO }],
    ais: []
  };
}

function boot(extra) {
  mem.workspaces = [shop(SLUG)];
  mem.jobs = [];
  mem.audit = [];
  mem.money = [];
  mem.inbox = [];
  mem.mail = [];
  mem.files = [];
  if (extra) extra();
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
    end(b) { if (b != null) this.body = b; return this; }
  };
}

function countingStream(chunks) {
  let i = 0;
  let sent = 0;
  const stream = new Readable({
    read: function () {
      if (i >= chunks.length) {
        this.push(null);
        return;
      }
      const chunk = chunks[i++];
      sent += chunk.length;
      this.push(chunk);
    }
  });
  stream.sent = function () { return sent; };
  return stream;
}

function jsonOfSize(size, fields) {
  const skeleton = Object.assign({}, fields, { pad: "" });
  const bare = JSON.stringify(skeleton);
  const need = size - Buffer.byteLength(bare);
  if (need < 0) throw new Error("skeleton is " + Buffer.byteLength(bare));
  skeleton.pad = "p".repeat(need);
  const raw = JSON.stringify(skeleton);
  if (Buffer.byteLength(raw) !== size) throw new Error("built " + Buffer.byteLength(raw));
  return raw;
}

function objectOfSize(size, fields) {
  return JSON.parse(jsonOfSize(size, fields));
}

function tooBig(slug) {
  return (mem.jobs || []).filter(function (job) {
    return job && job.title === "Too big to take in" && (!slug || job.workspace === slug);
  });
}

function storedBlob() {
  return JSON.stringify({
    jobs: mem.jobs,
    audit: mem.audit,
    inbox: mem.inbox,
    money: mem.money
  });
}

function assertClean(label) {
  if (storedBlob().indexOf(SECRET) >= 0) fail(label + " stored body content");
  else pass(label + " stores no body content");
  if (leaks.length) fail(label + " logged body content");
}

function assert413(res, message, label) {
  if (!res || res.statusCode !== 413 || !res.body || res.body.ok !== false || res.body.error !== message) {
    fail(label + " 413 mismatch " + (res && res.statusCode) + " " + JSON.stringify(res && res.body));
    return;
  }
  const keys = Object.keys(res.body);
  if (keys.length !== 2 || keys.indexOf("ok") < 0 || keys.indexOf("error") < 0) {
    fail(label + " response carried extra fields " + keys.join(","));
    return;
  }
  if (JSON.stringify(res.body).indexOf(SECRET) >= 0) fail(label + " response contained body content");
  else pass(label + " returns 413");
}

function assertHuman(job, label) {
  if (!job) { fail(label + " missing card"); return; }
  if (job.title !== "Too big to take in") fail(label + " title");
  if (job.charged !== false) fail(label + " charged");
  if (job.amount != null) fail(label + " amount");
  if (job.collect !== "HOLD") fail(label + " collect");
  if (job.status !== "waiting") fail(label + " status " + job.status);
  if (job.waitingOn !== "person") fail(label + " waitingOn " + job.waitingOn);
  if (String(job.why || "").indexOf("Collect HOLD") < 0) fail(label + " why missing Collect HOLD");
  if (job.draft || job.dispatch || job.assignee) fail(label + " auto action field");
  if (JSON.stringify(job).indexOf(AUTO) >= 0) fail(label + " rule ran");
  if ((mem.money || []).length) fail(label + " money row");
  else pass(label + " is a human card, Collect HOLD, no charge");
}

async function postStream(chunks, headers, query) {
  const req = countingStream(chunks);
  req.method = "POST";
  req.url = "/api/hook";
  req.headers = Object.assign({}, headers || {});
  req.query = query || {};
  const res = mockRes();
  await hookHandler(req, res);
  return { res: res, req: req };
}

async function postParsed(body, headers, query) {
  const req = {
    method: "POST",
    url: "/api/hook",
    headers: Object.assign({}, headers || {}),
    query: query || {},
    body: body
  };
  const res = mockRes();
  await hookHandler(req, res);
  return { res: res, req: req };
}

function wait(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

async function main() {
  boot();
  const fitRaw = jsonOfSize(3900000, { title: "Fits under", from: "ada@example.com", subject: "Porch quote" });
  const fit = await postStream([Buffer.from(fitRaw)], {
    "content-length": String(Buffer.byteLength(fitRaw)),
    "x-workspace": SLUG
  });
  if (fit.res.statusCode !== 201 || !fit.res.body || fit.res.body.ok !== true) {
    fail("3.9 MB stream must be accepted, got " + fit.res.statusCode + " " + JSON.stringify(fit.res.body && fit.res.body.error));
  } else if (tooBig().length) fail("3.9 MB stream filed a too-big card");
  else if (!fit.res.body.job || fit.res.body.job.title !== "Fits under") fail("3.9 MB stream did not capture");
  else pass("3.9 MB stream is accepted");

  boot();
  const exactRaw = jsonOfSize(HOOK_MAX, { title: "Exact four", from: "ada@example.com", subject: "Exact" });
  const exact = await postStream([Buffer.from(exactRaw)], {
    "content-length": String(HOOK_MAX),
    "x-workspace": SLUG
  });
  if (exact.res.statusCode !== 201 || tooBig().length) fail("exactly 4,000,000 must be accepted");
  else pass("exactly 4,000,000 is accepted");

  boot();
  const declared = await postStream([Buffer.from(SECRET + "-UNREAD")], {
    "content-length": String(HOOK_MAX + 1),
    "x-workspace": SLUG,
    from: "Ada <ada@example.com>",
    subject: "Need a quote"
  });
  assert413(declared.res, HOOK_ERR, "content-length 4000001");
  if (declared.req.sent() !== 0) fail("content-length over the cap was read, sent " + declared.req.sent());
  else pass("content-length over the cap is not read");
  if (tooBig().length !== 1) fail("content-length over the cap made " + tooBig().length + " cards");
  else pass("content-length over the cap makes one card");
  const declaredCard = tooBig()[0];
  assertHuman(declaredCard, "content-length card");
  if (declaredCard.custom.sender !== "Ada <ada@example.com>") fail("sender from header " + declaredCard.custom.sender);
  else pass("sender comes from the header");
  if (declaredCard.custom.subject !== "Need a quote") fail("subject from header " + declaredCard.custom.subject);
  else pass("subject comes from the header");
  if (!declaredCard.custom.sizes || declaredCard.custom.sizes[0] !== (HOOK_MAX + 1) + " bytes") {
    fail("size from content-length " + JSON.stringify(declaredCard.custom && declaredCard.custom.sizes));
  } else pass("size is the content-length");
  if (declaredCard.custom.count !== 1) fail("first count");
  assertClean("content-length card");

  boot();
  const head = Buffer.from(JSON.stringify({
    from: "ada@example.com",
    subject: "Porch quote",
    text: SECRET + "-FIELD",
    workspace: SLUG
  }));
  const mid = Buffer.alloc(HOOK_MAX, 0x62);
  const tail = Buffer.from(SECRET + "-TAIL");
  const chunked = await postStream([head, mid, tail], {});
  assert413(chunked.res, HOOK_ERR, "chunked over 4 MB");
  if (!(chunked.req.sent() < head.length + mid.length + tail.length)) fail("chunked reader kept going");
  else pass("chunked reader stops");
  if (chunked.req.sent() !== head.length + mid.length) fail("chunked sent " + chunked.req.sent());
  else pass("overflowing chunk is not followed by more reads");
  if (tooBig().length !== 1) fail("chunked card count " + tooBig().length);
  const chunkCard = tooBig()[0];
  assertHuman(chunkCard, "chunked card");
  if (!chunkCard || chunkCard.custom.sender !== "ada@example.com") fail("chunked sender " + (chunkCard && chunkCard.custom.sender));
  else pass("sender comes from a complete field in the kept prefix");
  if (!chunkCard || chunkCard.custom.subject !== "Porch quote") fail("chunked subject");
  else pass("subject comes from a complete field in the kept prefix");
  const atLeast = "at least " + HOOK_MAX + " bytes";
  if (!chunkCard || !chunkCard.custom.sizes || chunkCard.custom.sizes[0] !== atLeast) {
    fail("at least size " + JSON.stringify(chunkCard && chunkCard.custom && chunkCard.custom.sizes));
  } else pass("size is at least the bytes kept before the cut");
  assertClean("chunked card");

  boot();
  const cutHead = Buffer.from('{"from":"ada@example.com","subject":"Porch');
  const cut = await postStream([cutHead, Buffer.alloc(HOOK_MAX, 0x63), Buffer.from(SECRET + "-CUT")], {
    "x-workspace": SLUG
  });
  assert413(cut.res, HOOK_ERR, "cut subject");
  const cutCard = tooBig()[0];
  if (!cutCard || cutCard.custom.sender !== "ada@example.com") fail("cut-field sender");
  else pass("complete from field is kept");
  if (!cutCard || cutCard.custom.subject !== "unknown") fail("cut subject was invented: " + (cutCard && cutCard.custom.subject));
  else pass("a subject cut off at the cap is unknown");
  assertClean("cut subject");

  boot();
  const dropped = Buffer.alloc(HOOK_MAX + 120, 0x78);
  Buffer.from('{"from":"hidden@example.com","subject":"Hidden","text":"' + SECRET + '-CHUNK"}').copy(dropped, HOOK_MAX);
  const droppedRes = await postStream([dropped], { "x-workspace": SLUG });
  assert413(droppedRes.res, HOOK_ERR, "single chunk over the cap");
  const droppedCard = tooBig()[0];
  if (!droppedCard || droppedCard.custom.sender !== "unknown" || droppedCard.custom.subject !== "unknown") {
    fail("fields in the rejected chunk were used " + JSON.stringify(droppedCard && droppedCard.custom));
  } else pass("fields in the rejected chunk are unknown");
  if (!droppedCard || droppedCard.custom.sizes[0] !== "at least " + HOOK_MAX + " bytes") fail("rejected chunk size " + JSON.stringify(droppedCard && droppedCard.custom && droppedCard.custom.sizes));
  else pass("bytes past the cap are not kept");
  assertClean("rejected chunk");

  boot();
  const partial = await postStream([
    Buffer.from('{"workspace":"once-desk'),
    Buffer.alloc(HOOK_MAX, 0x7a),
    Buffer.from(SECRET + "-PARTIAL")
  ], {});
  assert413(partial.res, HOOK_ERR, "partial workspace");
  if (tooBig().length) fail("partial workspace filed a card");
  else pass("a cut-off workspace does not resolve a desk");
  const partialLogs = mem.audit.slice(0, 1);
  if (partialLogs.length !== 1) fail("partial workspace log count " + mem.audit.length);
  else pass("no desk writes one log line");
  if (storedBlob().indexOf(SECRET) >= 0) fail("no-desk log stored body content");
  else pass("no-desk log has no body content");

  boot();
  const none = await postStream([Buffer.from(SECRET + "-NODESK")], {
    "content-length": String(HOOK_MAX + 1)
  });
  assert413(none.res, HOOK_ERR, "no desk");
  if (tooBig().length) fail("missing desk filed a card");
  else if (mem.audit.length !== 1) fail("missing desk log count " + mem.audit.length);
  else pass("missing desk writes nothing but one log line");
  assertClean("missing desk");

  boot(function () {
    mem.mail = [{
      id: "mail_q",
      address: "queue@once-desk.aia",
      local: "queue",
      account: "once-desk",
      domain: "once-desk.aia",
      workspace: SLUG
    }];
  });
  const mailed = await postParsed({
    to: "queue@once-desk.aia",
    from: "ada@example.com",
    subject: "Via mail",
    text: SECRET + "-MAIL"
  }, { "content-length": String(HOOK_MAX + 1) });
  assert413(mailed.res, HOOK_ERR, "mail desk");
  if (tooBig().length !== 1 || tooBig()[0].workspace !== SLUG) fail("mail identity did not resolve the desk");
  else pass("desk resolves from the .aia to address");
  assertClean("mail desk");

  boot();
  const parsedLen = await postParsed({
    from: "ada@example.com",
    subject: "Parsed quote",
    text: SECRET + "-PARSED-LEN",
    pad: "p".repeat(50)
  }, { "content-length": String(HOOK_MAX + 1), "x-workspace": SLUG });
  assert413(parsedLen.res, HOOK_ERR, "pre-parsed with content-length");
  if (tooBig().length !== 1) fail("pre-parsed content-length card count");
  const parsedLenCard = tooBig()[0];
  assertHuman(parsedLenCard, "pre-parsed content-length");
  if (!parsedLenCard || parsedLenCard.custom.sender !== "ada@example.com" || parsedLenCard.custom.subject !== "Parsed quote") {
    fail("pre-parsed content-length fields " + JSON.stringify(parsedLenCard && parsedLenCard.custom));
  } else pass("pre-parsed content-length uses sender and subject from the object");
  if (!parsedLenCard || parsedLenCard.custom.sizes[0] !== (HOOK_MAX + 1) + " bytes") {
    fail("pre-parsed content-length size " + JSON.stringify(parsedLenCard && parsedLenCard.custom.sizes));
  } else pass("pre-parsed content-length uses the content-length");
  assertClean("pre-parsed content-length");

  boot();
  const parsedObj = objectOfSize(HOOK_MAX + 1, {
    from: "ada@example.com",
    subject: "Measured quote",
    workspace: SLUG,
    text: SECRET + "-PARSED-OBJ"
  });
  const measured = Buffer.byteLength(JSON.stringify(parsedObj));
  const parsedObjRes = await postParsed(parsedObj, {});
  assert413(parsedObjRes.res, HOOK_ERR, "pre-parsed without content-length");
  const parsedObjCard = tooBig()[0];
  assertHuman(parsedObjCard, "pre-parsed measured");
  if (!parsedObjCard || parsedObjCard.custom.sender !== "ada@example.com" || parsedObjCard.custom.subject !== "Measured quote") {
    fail("pre-parsed measured fields");
  } else pass("pre-parsed object without content-length uses sender and subject");
  if (!parsedObjCard || parsedObjCard.custom.sizes[0] !== measured + " bytes") {
    fail("measured size " + JSON.stringify(parsedObjCard && parsedObjCard.custom.sizes) + " wanted " + measured);
  } else pass("pre-parsed object without content-length uses JSON.stringify byte length");
  if (parsedObjCard && String(parsedObjCard.custom.sizes[0]).indexOf("at least") >= 0) fail("measured size was labeled at least");
  assertClean("pre-parsed measured object");

  boot();
  const parsedStr = jsonOfSize(HOOK_MAX + 1, {
    from: "ada@example.com",
    subject: "String quote",
    workspace: SLUG,
    text: SECRET + "-PARSED-STR"
  });
  const strBytes = Buffer.byteLength(parsedStr);
  const parsedStrRes = await postParsed(parsedStr, {});
  assert413(parsedStrRes.res, HOOK_ERR, "pre-parsed string");
  const parsedStrCard = tooBig()[0];
  if (!parsedStrCard || parsedStrCard.custom.sender !== "ada@example.com" || parsedStrCard.custom.subject !== "String quote") {
    fail("pre-parsed string fields " + JSON.stringify(parsedStrCard && parsedStrCard.custom));
  } else pass("pre-parsed string yields sender and subject");
  if (!parsedStrCard || parsedStrCard.custom.sizes[0] !== strBytes + " bytes") {
    fail("string byte length " + JSON.stringify(parsedStrCard && parsedStrCard.custom.sizes));
  } else pass("pre-parsed string without content-length uses Buffer.byteLength");
  assertClean("pre-parsed string");

  boot();
  const strLen = await postParsed(JSON.stringify({
    from: "body-sender@example.com",
    subject: "Body subject",
    text: SECRET + "-STR-LEN"
  }), {
    "content-length": String(HOOK_MAX + 1),
    "x-workspace": SLUG,
    from: "header-sender@example.com",
    subject: "Header subject"
  });
  assert413(strLen.res, HOOK_ERR, "string with content-length");
  const strLenCard = tooBig()[0];
  if (!strLenCard || strLenCard.custom.sender !== "header-sender@example.com" || strLenCard.custom.subject !== "Header subject") {
    fail("header did not win over the parsed string");
  } else pass("headers win over parsed fields when both are present");
  if (!strLenCard || strLenCard.custom.sizes[0] !== (HOOK_MAX + 1) + " bytes") fail("string content-length size");
  else pass("content-length wins over the string's own byte length");
  assertClean("string content-length");

  boot();
  const unknown = await postParsed({ text: SECRET + "-UNKNOWN", pad: "p".repeat(20) }, {
    "content-length": String(HOOK_MAX + 1),
    "x-workspace": SLUG
  });
  assert413(unknown.res, HOOK_ERR, "unknown parsed");
  const unknownCard = tooBig()[0];
  if (!unknownCard || unknownCard.custom.sender !== "unknown" || unknownCard.custom.subject !== "unknown") {
    fail("missing parsed fields were invented");
  } else pass("missing sender and subject are unknown");
  assertClean("unknown parsed");

  boot();
  const underObj = objectOfSize(3900000, {
    title: "Parsed fits",
    from: "ada@example.com",
    subject: "Fits",
    workspace: SLUG
  });
  const underRes = await postParsed(underObj, {});
  if (underRes.res.statusCode !== 201 || tooBig().length) fail("pre-parsed 3.9 MB object was rejected");
  else pass("pre-parsed 3.9 MB object is accepted");

  boot();
  const midObj = objectOfSize(BODY_MAX + 1, { title: "Over one", from: "ada@example.com", subject: "Mid" });
  const midRes = await postParsed(midObj, { "x-workspace": SLUG });
  if (midRes.res.statusCode === 413 || tooBig().length) fail("pre-parsed hook body just over 1 MB used the 1 MB cap");
  else if (midRes.res.statusCode !== 201) fail("pre-parsed hook body just over 1 MB status " + midRes.res.statusCode);
  else pass("pre-parsed hook body just over 1 MB is accepted");

  boot();
  const queryDesk = await postParsed({
    from: "ada@example.com",
    subject: "Query",
    text: SECRET + "-QUERY"
  }, { "content-length": String(HOOK_MAX + 1) }, { workspace: SLUG });
  assert413(queryDesk.res, HOOK_ERR, "query workspace");
  if (tooBig().length !== 1) fail("query workspace did not resolve");
  else pass("desk resolves from the query");

  boot();
  await postParsed({
    from: "ada@example.com",
    subject: "First",
    text: SECRET + "-FOLD1"
  }, { "content-length": "4000001", "x-workspace": SLUG });
  const first = tooBig()[0];
  const seenAt = first && first.custom && first.custom.lastSeen;
  await wait(15);
  const fold = await postParsed({
    from: "ada@example.com",
    subject: "Second subject",
    text: SECRET + "-FOLD2"
  }, { "content-length": "4500000", "x-workspace": SLUG });
  assert413(fold.res, HOOK_ERR, "fold");
  if (tooBig().length !== 1) fail("same sender created " + tooBig().length + " cards");
  else pass("same sender folds into the open card");
  if (!first || first.custom.count !== 2) fail("fold count " + (first && first.custom.count));
  else pass("fold bumps the count");
  if (!first || !(first.custom.lastSeen > seenAt) || first.lastSeen !== first.custom.lastSeen) fail("last-seen was not updated");
  else pass("fold updates last-seen");
  if (!first || first.custom.sizes.join("|") !== "4000001 bytes|4500000 bytes") {
    fail("sizes " + JSON.stringify(first && first.custom.sizes));
  } else pass("fold adds the new size");
  if (!first || first.custom.subject !== "First") fail("fold replaced the subject");
  else pass("fold keeps the first subject");
  assertClean("fold");

  boot();
  await postParsed({ text: SECRET + "-U1" }, { "content-length": "4000001", "x-workspace": SLUG });
  await postParsed({ text: SECRET + "-U2" }, { "content-length": "4000002", "x-workspace": SLUG });
  if (tooBig().length !== 1 || tooBig()[0].custom.count !== 2 || tooBig()[0].custom.sender !== "unknown") {
    fail("unknown senders did not fold");
  } else pass("unknown senders count as one sender");

  boot();
  await postParsed({ from: "ada@example.com", subject: "Open", text: SECRET + "-SHIP" }, {
    "content-length": "4000001",
    "x-workspace": SLUG
  });
  tooBig()[0].status = "shipped";
  await postParsed({ from: "ada@example.com", subject: "Again", text: SECRET + "-SHIP2" }, {
    "content-length": "4000002",
    "x-workspace": SLUG
  });
  if (tooBig().length !== 2) fail("shipped card still folded");
  else pass("a shipped card does not fold");

  boot(function () { mem.workspaces.push(shop(OTHER)); });
  await postParsed({ from: "ada@example.com", subject: "A", text: SECRET + "-D1" }, {
    "content-length": "4000001",
    "x-workspace": SLUG
  });
  await postParsed({ from: "ada@example.com", subject: "B", text: SECRET + "-D2" }, {
    "content-length": "4000001",
    "x-workspace": OTHER
  });
  if (tooBig(SLUG).length !== 1 || tooBig(OTHER).length !== 1) fail("same sender on two desks folded together");
  else pass("fold stays on one desk");

  boot(function () { mem.workspaces.push(shop(OTHER)); });
  const ids = [];
  for (let i = 1; i <= 5; i++) {
    const made = await postParsed({
      from: "sender-" + i + "@example.com",
      subject: "Subject " + i,
      text: SECRET + "-CAP" + i
    }, { "content-length": String(4000000 + i), "x-workspace": SLUG });
    assert413(made.res, HOOK_ERR, "new card " + i);
    ids.push(tooBig(SLUG)[0].id);
  }
  if (tooBig(SLUG).length !== 5) fail("hourly new cards " + tooBig(SLUG).length);
  else pass("five new too-big cards are allowed");
  const otherOk = await postParsed({
    from: "ada@example.com",
    subject: "Other desk",
    text: SECRET + "-OTHER"
  }, { "content-length": "4000001", "x-workspace": OTHER });
  assert413(otherOk.res, HOOK_ERR, "other desk under its own cap");
  if (tooBig(OTHER).length !== 1) fail("per-desk cap blocked another desk");
  else pass("the hourly cap is per desk");
  await wait(15);
  const again = await postParsed({
    from: "sender-1@example.com",
    subject: "Repeat",
    text: SECRET + "-REPEAT"
  }, { "content-length": "4600000", "x-workspace": SLUG });
  assert413(again.res, HOOK_ERR, "fold at the cap");
  const sender1 = tooBig(SLUG).find(function (job) { return job.custom.sender === "sender-1@example.com"; });
  if (tooBig(SLUG).length !== 5 || !sender1 || sender1.custom.count !== 2) fail("repeat at the cap did not fold");
  else pass("a repeat at the cap folds and does not open a sixth card");
  const host = (mem.jobs || []).find(function (job) { return job && job.id === ids[ids.length - 1]; });
  if (!host || host.custom.sender !== "sender-5@example.com") fail("newest card was not sender 5");
  for (let n = 1; n <= 3; n++) {
    const extra = await postParsed({
      from: "extra-" + n + "@example.com",
      subject: "Extra",
      text: SECRET + "-OVER" + n
    }, { "content-length": String(4700000 + n), "x-workspace": SLUG });
    assert413(extra.res, HOOK_ERR, "overflow " + n);
    if (tooBig(SLUG).length !== 5) fail("overflow created a card");
    if (!host || host.custom.overflow !== n) fail("overflow count " + (host && host.custom.overflow));
    const line = n + " more too-big posts this hour";
    if (!host || host.overflowNote !== line || host.next !== line || String(host.why || "").indexOf(line) < 0) {
      fail("overflow line " + JSON.stringify(host && { note: host.overflowNote, next: host.next, why: host.why }));
    }
  }
  if (host && host.custom.count === 1 && host.custom.sizes.length === 1) pass("overflow does not pretend to be a new seen size");
  else fail("overflow changed the host card's own count or sizes");
  if (host && host.overflowNote === "3 more too-big posts this hour") pass("overflow says 3 more too-big posts this hour");
  else fail("overflow text");
  assertClean("overflow");

  boot();
  for (let i = 1; i <= 5; i++) {
    await postParsed({
      from: "old-" + i + "@example.com",
      subject: "Old",
      text: SECRET + "-OLD"
    }, { "content-length": "4000001", "x-workspace": SLUG });
  }
  const oldAt = new Date(Date.now() - (2 * 60 * 60 * 1000)).toISOString();
  tooBig().forEach(function (job) { job.createdAt = oldAt; });
  await postParsed({
    from: "fresh@example.com",
    subject: "Fresh",
    text: SECRET + "-FRESH"
  }, { "content-length": "4000001", "x-workspace": SLUG });
  if (tooBig().length !== 6) fail("rolling hour did not allow a new card");
  else pass("cards older than an hour do not fill the cap");

  boot();
  const oldOpen = await postParsed({
    from: "ada@example.com",
    subject: "Old open",
    text: SECRET + "-OLDOPEN"
  }, { "content-length": "4000001", "x-workspace": SLUG });
  assert413(oldOpen.res, HOOK_ERR, "old open");
  tooBig()[0].createdAt = new Date(Date.now() - (2 * 60 * 60 * 1000)).toISOString();
  await postParsed({
    from: "ada@example.com",
    subject: "Still open",
    text: SECRET + "-STILL"
  }, { "content-length": "4000002", "x-workspace": SLUG });
  if (tooBig().length !== 1 || tooBig()[0].custom.count !== 2) fail("old open card did not fold");
  else pass("an open card from a previous hour still folds");

  boot();
  const packReq = {
    method: "POST",
    url: "/api/packs",
    headers: { "content-length": String(BODY_MAX + 1), "x-workspace": SLUG },
    query: {},
    body: { action: "packs", text: SECRET + "-PACK" }
  };
  const packRes = mockRes();
  await packHandler(packReq, packRes);
  assert413(packRes, MB_ERR, "pre-parsed packs");
  if (tooBig().length) fail("packs filed a too-big card");
  else pass("pre-parsed packs stays on the 1 MB cap");

  const packObj = objectOfSize(BODY_MAX + 1, { action: "packs", text: SECRET + "-PACK2" });
  const packRes2 = mockRes();
  await packHandler({
    method: "POST",
    url: "/api/packs",
    headers: { "x-workspace": SLUG },
    query: {},
    body: packObj
  }, packRes2);
  assert413(packRes2, MB_ERR, "measured packs");
  if (tooBig().length) fail("measured packs filed a card");
  else pass("packs without content-length still caps at 1 MB");

  const jobsRes = mockRes();
  await jobsHandler({
    method: "POST",
    url: "/api/jobs",
    headers: { "content-length": String(BODY_MAX + 1), "x-workspace": SLUG },
    query: {},
    body: { action: "capture", title: "Nope", text: SECRET + "-JOB" }
  }, jobsRes);
  assert413(jobsRes, MB_ERR, "pre-parsed jobs");
  if (tooBig().length) fail("jobs filed a too-big card");
  else pass("pre-parsed jobs stays on the 1 MB cap");

  const smallUp = mockRes();
  await uploadHandler({
    method: "POST",
    url: "/api/upload",
    headers: { "x-workspace": SLUG },
    query: {},
    body: { name: "note.txt", type: "text/plain", data: Buffer.from("hello").toString("base64") }
  }, smallUp);
  if (smallUp.statusCode !== 201 || !smallUp.body || smallUp.body.ok !== true) {
    fail("small parsed upload " + smallUp.statusCode + " " + JSON.stringify(smallUp.body));
  } else pass("small parsed upload still saves");

  const wideUp = mockRes();
  await uploadHandler({
    method: "POST",
    url: "/api/upload",
    headers: { "x-workspace": SLUG, "content-length": String(BODY_MAX + 50) },
    query: {},
    body: {
      name: "note.txt",
      type: "text/plain",
      data: Buffer.from("hello").toString("base64"),
      pad: "u".repeat(BODY_MAX)
    }
  }, wideUp);
  if (wideUp.statusCode === 413 && wideUp.body && wideUp.body.error === MB_ERR) fail("upload was caught by the 1 MB cap");
  else if (wideUp.statusCode !== 201) fail("upload over 1 MB failed " + wideUp.statusCode + " " + JSON.stringify(wideUp.body && wideUp.body.error));
  else pass("upload stays exempt from the 1 MB body cap");

  const bigUp = mockRes();
  await uploadHandler({
    method: "POST",
    url: "/api/upload",
    headers: { "x-workspace": SLUG },
    query: {},
    body: {
      name: "big.txt",
      type: "text/plain",
      data: Buffer.alloc(4000001, 0x61).toString("base64")
    }
  }, bigUp);
  if (bigUp.statusCode !== 413 || !bigUp.body || bigUp.body.error !== UPLOAD_ERR) {
    fail("upload 4,000,000 cap " + bigUp.statusCode + " " + JSON.stringify(bigUp.body && bigUp.body.error));
  } else pass("upload rejects a decoded file over 4,000,000 bytes");

  if (leaks.length) fail("console leaked body content");
  else pass("logs have no body content");

  if (failed) {
    console.error(failed + " failed");
    process.exit(1);
  }
  console.log("all checks passed");
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
