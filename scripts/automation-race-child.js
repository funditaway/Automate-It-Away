#!/usr/bin/env node
"use strict";
// One automation action in its own process, so locks are the store's claims.
global.fetch = async function () { throw new Error("outbound blocked"); };
const automation = require("../api/_automation");
const desks = require("../api/_desks-http");
const hook = require("../api/hook");
const lib = require("../api/_lib");

function mockRes() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
    end() { return this; }
  };
}

async function call(handler, method, headers, body) {
  const res = mockRes();
  await handler({ method: method, headers: headers || {}, body: body || null, query: {} }, res);
  return res;
}

async function main() {
  await lib.ready();
  const cmd = process.argv[2] || "tick";
  const ws = process.env.AIA_WS || "";
  const pin = process.env.AIA_PIN || "";
  const cardId = process.env.AIA_CARD || "";
  const aiId = process.env.AIA_AI || "";
  const owner = { "x-workspace": ws, "x-pin": pin };
  let res = null;
  if (cmd === "tick") {
    res = await call(desks, "POST", owner, { action: "run-tick", ws: ws, pin: pin, cardId: cardId });
  } else if (cmd === "start") {
    res = await call(desks, "POST", owner, { action: "run-start", ws: ws, pin: pin, cardId: cardId, aiId: aiId });
  } else if (cmd === "stop") {
    res = await call(desks, "POST", owner, { action: "run-stop", ws: ws, pin: pin, cardId: cardId });
  } else if (cmd === "kill") {
    res = await call(desks, "POST", owner, { action: "run-kill", ws: ws, pin: pin, cardId: cardId });
  } else if (cmd === "hook") {
    res = await call(hook, "POST", { "x-workspace": ws }, {
      event: "capture",
      workspace: ws,
      title: process.env.AIA_HOOK_TITLE || "Hooked card",
      notes: "from a pipe",
      email: "pipe@example.com"
    });
  } else if (cmd === "edit") {
    await automation.reloadMem();
    const job = (lib.mem.jobs || []).find((row) => row && row.id === cardId);
    if (job) job.title = process.env.AIA_TITLE || "Kept title";
    await lib.save();
    res = { statusCode: 200, body: { ok: true, title: job && job.title } };
  } else if (cmd === "read") {
    res = await call(desks, "POST", owner, { action: "run-read", ws: ws, pin: pin, cardId: cardId });
  }
  process.stdout.write(JSON.stringify({ status: res && res.statusCode, body: res && res.body }));
}

main().catch((err) => {
  process.stderr.write(String(err && err.stack || err));
  process.exit(1);
});
