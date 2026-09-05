#!/usr/bin/env node
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

const drop = fs.readFileSync(path.join(root, "drop.html"), "utf8");
if (drop.indexOf("out.error") < 0) throw new Error("drop.html must show capture errors");

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

  console.log("check-drop-desk: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
