#!/usr/bin/env node
require("./_env-guard");
// Mutants for scripts/check-card-thread-actor.js. The real tree is never written.
// Exit 1 if the unmutated check fails, a mutant survives, or its text is gone.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const MUTANTS = [
  ["missing actorKind on the helper", "api/_talk.js", [[
    "    actorKind: actorKind,\n    actorLabel: actorLabel,\n    input: input,",
    "    actorLabel: actorLabel,\n    input: input,"
  ]]],
  ["dropping the kind check", "api/_talk.js", [[
    "  if (knownKind(v)) return \"\";\n  return KIND_ERROR;",
    "  if (true) return \"\";\n  return KIND_ERROR;"
  ]]],
  ["rewriting stored legacy rows", "api/_talk.js", [[
    "  const actorKind = safeKind(entry);\n  let actorLabel = entry.actorLabel || entry.from || entry.who || \"\";\n",
    "  const actorKind = safeKind(entry);\n  entry.actorKind = actorKind;\n  let actorLabel = entry.actorLabel || entry.from || entry.who || \"\";\n"
  ]]],
  ["unknown kind passes raw", "api/_talk.js", [[
    "  const raw = normKind(entry && entry.actorKind);\n  if (ACTOR_KINDS.indexOf(raw) >= 0) return raw;\n  const guessed = inferActorKind(entry);\n  if (ACTOR_KINDS.indexOf(guessed) >= 0) return guessed;\n  return \"human\";",
    "  const raw = normKind(entry && entry.actorKind);\n  if (raw) return raw;\n  const guessed = inferActorKind(entry);\n  if (ACTOR_KINDS.indexOf(guessed) >= 0) return guessed;\n  return \"human\";"
  ]]],
  ["friend mapped to ext", "api/_talk.js", [[
    "  if (kind === \"friend\" || role === \"friend\") return { actorKind: \"human\", actorLabel: label };",
    "  if (kind === \"friend\" || role === \"friend\") return { actorKind: \"ext\", actorLabel: label };"
  ]]],
  ["ACTOR_KINDS widened", "api/_talk.js", [[
    "const ACTOR_KINDS = [\"si\", \"ai\", \"human\", \"helper\", \"family\", \"employee\", \"ext\"];",
    "const ACTOR_KINDS = [\"si\", \"ai\", \"human\", \"helper\", \"family\", \"employee\", \"ext\", \"robot\"];"
  ]]],
  ["names not redacted", "api/_talk.js", [[
    "  if (opts && opts.redact) actorLabel = redactedLabel(actorKind);\n",
    ""
  ]]],
  ["F2 droppedByKind trusted", "api/_fields.js", [[
    "\"Dropped by \" + job.droppedByKind + \".\", \"note\", who);",
    "\"Dropped by \" + job.droppedByKind + \".\", \"note\", { actorKind: job.droppedByKind, actorLabel: job.droppedByKind });"
  ]]],
  ["F4 capture refuse skipped", "api/jobs.js", [[
    "      const capActor = seatActor(person, shop, capBody);\n      if (refuseActor(res, body, capActor)) return;\n",
    "      const capActor = seatActor(person, shop, capBody);\n"
  ]]],
  ["O4 actorForDrop always human", "api/_talk.js", [[
    "  if (person) return actorForSeat(person, account);\n  return { actorKind: \"ext\", actorLabel: \"ext\" };",
    "  return { actorKind: \"human\", actorLabel: \"human\" };"
  ]]],
  ["O7 drop fallback uses client kind", "api/_talk.js", [[
    "  if (person) return actorForSeat(person, account);\n  return { actorKind: \"ext\", actorLabel: \"ext\" };",
    "  if (person) return actorForSeat(person, account);\n  const d = normKind(body && (body.droppedByKind || body.whoKind));\n  if (d) return { actorKind: d, actorLabel: d };\n  return { actorKind: \"ext\", actorLabel: \"ext\" };"
  ]]]
];

const hasUnshare = spawnSync("unshare", ["-rn", "true"]).status === 0;
function run(dir, home) {
  const argv = [process.execPath, path.join(dir, "scripts/check-card-thread-actor.js")];
  const opts = { cwd: dir, encoding: "utf8", env: { PATH: process.env.PATH, HOME: home }, timeout: 120000 };
  const p = hasUnshare ? spawnSync("unshare", ["-rn"].concat(argv), opts) : spawnSync(argv[0], argv.slice(1), opts);
  const out = (p.stdout || "") + (p.stderr || "");
  return { code: p.status == null ? 1 : p.status, first: (out.split("\n").find((l) => l.startsWith("FAIL")) || (p.error ? String(p.error.message) : "")).slice(0, 200) };
}

function main() {
  const only = process.argv[2] || "";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aia-thread-mut-"));
  const dir = path.join(tmp, "repo");
  const home = path.join(tmp, "home");
  fs.mkdirSync(home);
  fs.cpSync(root, dir, { recursive: true, filter: (s) => !/[\\/](\.git|node_modules)$/.test(s) });
  const files = Array.from(new Set(MUTANTS.map((m) => m[1])));
  const orig = {};
  files.forEach((f) => { orig[f] = fs.readFileSync(path.join(dir, f), "utf8"); });
  const restore = () => files.forEach((f) => fs.writeFileSync(path.join(dir, f), orig[f]));
  let bad = 0;
  let caught = 0;
  let total = 0;
  try {
    if (!hasUnshare) console.log("note: unshare -rn not available; running without a network namespace");
    const base = run(dir, home);
    console.log("UNMUTATED | " + (base.code === 0 ? "PASS" : "FAIL " + base.first));
    if (base.code !== 0) bad++;
    MUTANTS.forEach(([name, file, reps], i) => {
      const label = "T" + (i + 1) + " " + name;
      if (only && label.indexOf(only) < 0 && name.indexOf(only) < 0) return;
      total++;
      let txt = orig[file];
      const miss = reps.find(([find]) => txt.indexOf(find) < 0);
      if (miss) { bad++; console.log(label + " | NOOP | text not found in " + file); return; }
      reps.forEach(([find, repl]) => { txt = txt.split(find).join(repl); });
      fs.writeFileSync(path.join(dir, file), txt);
      const r = run(dir, home);
      restore();
      if (r.code !== 0) { caught++; console.log(label + " | CAUGHT | " + r.first); }
      else { bad++; console.log(label + " | SURVIVED |"); }
    });
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log("SCORE " + caught + "/" + total + " caught");
  process.exitCode = bad ? 1 : 0;
}

main();
