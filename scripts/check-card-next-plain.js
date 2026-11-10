#!/usr/bin/env node
require("./_env-guard");
// Card next-step after Yes, when the line does not already say HOLD or
// "nothing sent": the suffix is ". Nothing sent alone." with no bare "HOLD."
// One mutant puts "HOLD." back on that line and must be caught.
// Collect stays HOLD.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const realEngine = path.join(root, "api", "_engine.js");
const RULE = "After Yes, put the next card on the queue.";

if (!process.env.AIA_STORE_PATH) {
  process.env.AIA_STORE_PATH = path.join(os.tmpdir(), "aia-card-next-" + process.pid + ".json");
}
delete global.__aia;
delete global.__aiaHydrate;

function nextStepLine(src) {
  return String(src || "").split("\n").find(function (l) {
    return l.indexOf('next.next || "Next Then."') >= 0;
  }) || "";
}

function bareHold(text) {
  return /\bHOLD\./.test(String(text || ""));
}

function faults(enginePath) {
  const bad = [];
  const src = fs.readFileSync(enginePath, "utf8");
  const line = nextStepLine(src);
  if (!line) bad.push("card next-step line is missing");
  else {
    if (bareHold(line)) bad.push("card next-step line has bare HOLD.");
    if (line.indexOf("Nothing sent alone.") < 0) bad.push('card next-step line must say "Nothing sent alone."');
  }
  const engine = require(enginePath);
  const shop = {
    slug: "card-next-plain",
    rules: [{ text: RULE, when: "do", then: "queue" }],
    ais: [],
    people: []
  };
  const job = {
    id: "job_yes",
    title: "They clicked",
    notes: "from the lane",
    workspace: shop.slug,
    status: "waiting"
  };
  const spawned = engine.thenAfterYes(job, shop);
  const next = spawned && spawned.next;
  if (!spawned) bad.push("next card was not created");
  else {
    if (bareHold(next)) bad.push("card next-step line has bare HOLD.");
    if (String(next || "").indexOf("Nothing sent alone.") < 0) bad.push('card next-step line must say "Nothing sent alone."');
    if (spawned.charged) bad.push("next card charged");
    if (spawned.status !== "waiting") bad.push("next card left the queue");
  }
  return bad;
}

function once(enginePath) {
  const bad = faults(enginePath);
  bad.forEach(function (m) { console.error("FAIL " + m); });
  if (bad.length) process.exit(1);
  console.log("ok  card next-step line has no bare HOLD.");
  console.log('ok  card next-step line says "Nothing sent alone."');
}

function stage(src) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aia-card-next-"));
  const api = path.join(dir, "api");
  fs.mkdirSync(api);
  fs.readdirSync(path.join(root, "api")).forEach(function (name) {
    const from = path.join(root, "api", name);
    const to = path.join(api, name);
    if (name === "_engine.js") fs.writeFileSync(to, src);
    else fs.symlinkSync(from, to);
  });
  return { dir: dir, engine: path.join(api, "_engine.js") };
}

function mutantSrc(src) {
  const lines = src.split("\n");
  let n = 0;
  const next = lines.map(function (l) {
    if (l.indexOf('next.next || "Next Then."') < 0) return l;
    n += 1;
    return l.replace(' + ". Nothing sent alone.";', ' + ". HOLD. Nothing sent alone.";');
  });
  if (n !== 1) return null;
  if (next.join("\n") === src) return null;
  return next.join("\n");
}

if (process.argv.indexOf("--once") >= 0) {
  once(process.argv[process.argv.indexOf("--once") + 1] || realEngine);
} else {
  const src = fs.readFileSync(realEngine, "utf8");
  const live = faults(realEngine);
  if (live.length) {
    live.forEach(function (m) { console.error("FAIL " + m); });
    process.exit(1);
  }
  console.log("ok  card next-step line has no bare HOLD.");
  console.log('ok  card next-step line says "Nothing sent alone."');
  const mutated = mutantSrc(src);
  if (!mutated) {
    console.error("FAIL mutant does not apply");
    process.exit(1);
  }
  const staged = stage(mutated);
  const store = path.join(os.tmpdir(), "aia-card-next-mut-" + process.pid + ".json");
  const r = spawnSync(process.execPath, [__filename, "--once", staged.engine], {
    cwd: root,
    encoding: "utf8",
    env: Object.assign({}, process.env, { AIA_STORE_PATH: store })
  });
  try { fs.rmSync(staged.dir, { recursive: true, force: true }); } catch (e) {}
  try { if (fs.existsSync(store)) fs.unlinkSync(store); } catch (e) {}
  const out = (r.stdout || "") + (r.stderr || "");
  if (r.status === 0) {
    console.error("FAIL mutant survived (bare HOLD. put back)");
    process.exit(1);
  }
  if (out.indexOf("bare HOLD.") < 0 && out.indexOf("Nothing sent alone.") < 0) {
    console.error("FAIL mutant was not caught for the next-step line: " + out.slice(0, 240));
    process.exit(1);
  }
  console.log("ok  mutant caught: bare HOLD. put back");
  console.log("check-card-next-plain: ok (1 mutant caught)");
}
