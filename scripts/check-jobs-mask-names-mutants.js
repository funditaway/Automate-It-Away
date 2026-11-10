#!/usr/bin/env node
require("./_env-guard");
// Mutants for scripts/check-jobs-mask-names.js.
// Copies the repo (no .git, no node_modules) and applies one edit at a time.
// The real tree is never written.
//   M1 forgets to mask for a seated helper
//   M2 strips actorKind while masking
//   M3 mutates the stored row on read
//   O11 maskNeeds is a no-op, so a needs-action label keeps the name
//   O7 replaceNames keeps only the longest name
//   O3 maskJobsResponse restores other people's names on you and the seat list
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const FILE = "api/_job-mask.js";
const MUTANTS = [
  ["M1", "forgets to mask for helpers", [
    ["  if (!person) return true;\n  return isOwner(person);", "  return !!person;"]
  ]],
  ["M2", "strips actorKind when masking", [
    ["    if (k === \"actorKind\" || k === \"role\" || k === \"kind\" || k === \"whoKind\") return;",
      "    if (k === \"actorKind\") { delete node[k]; return; }\n    if (k === \"role\" || k === \"kind\" || k === \"whoKind\") return;"]
  ]],
  ["M3", "mutates the stored row on read", [
    ["  return JSON.parse(JSON.stringify(value));", "  return value;"]
  ]],
  ["O11", "maskNeeds is a no-op", [
    ["  const names = namesFor(job, people);\n  return actions.map(function (action) {",
      "  const names = namesFor(job, people);\n  return actions;\n  return actions.map(function (action) {"]
  ]],
  ["O7", "strips only the longest name", [
    ["  for (let i = 0; i < names.length; i++) {",
      "  for (let i = 0; i < 1 && i < names.length; i++) {"]
  ]],
  ["O3", "restores other people's names", [
    ["  if (hadYou) copy.you = maskYouBlock(body.you, person);\n  if (hadPeople) copy.people = maskSeatList(body.people, person);",
      "  if (hadYou) copy.you = body.you;\n  if (hadPeople) copy.people = body.people;"]
  ]]
];

function run(dir, home) {
  const p = spawnSync(process.execPath, ["scripts/check-jobs-mask-names.js"], {
    cwd: dir,
    env: { PATH: process.env.PATH || "/usr/bin:/bin", HOME: home, TMPDIR: os.tmpdir() },
    encoding: "utf8",
    timeout: 180000
  });
  const out = (p.stdout || "") + (p.stderr || "");
  const first = (out.split("\n").find(function (line) { return line.indexOf("FAIL") === 0; }) || (p.error ? String(p.error.message) : "")).slice(0, 180);
  return { code: p.status == null ? 1 : p.status, first: first };
}

function main() {
  const only = process.argv[2] || "";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aia-mask-mut-"));
  const dir = path.join(tmp, "repo");
  const home = path.join(tmp, "home");
  fs.mkdirSync(home);
  fs.cpSync(root, dir, { recursive: true, filter: function (src) { return !/[\\/](\.git|node_modules)$/.test(src); } });
  const filePath = path.join(dir, FILE);
  const orig = fs.readFileSync(filePath, "utf8");
  let bad = 0;
  let caught = 0;
  let total = 0;
  try {
    const base = run(dir, home);
    console.log("UNMUTATED | " + (base.code === 0 ? "PASS" : "FAIL " + base.first));
    if (base.code !== 0) bad += 1;
    MUTANTS.forEach(function (row) {
      const id = row[0];
      const desc = row[1];
      const reps = row[2];
      if (only && id.indexOf(only) < 0 && desc.indexOf(only) < 0) return;
      total += 1;
      let text = orig;
      for (let i = 0; i < reps.length; i++) {
        const find = reps[i][0];
        const repl = reps[i][1];
        if (text.indexOf(find) < 0) {
          bad += 1;
          console.log(id + " | NOOP | text not found");
          text = null;
          break;
        }
        text = text.replace(find, repl);
      }
      if (text == null) return;
      if (text === orig) {
        bad += 1;
        console.log(id + " | NOOP | changed nothing");
        return;
      }
      fs.writeFileSync(filePath, text);
      const result = run(dir, home);
      fs.writeFileSync(filePath, orig);
      if (result.code !== 0) {
        caught += 1;
        console.log(id + " | CAUGHT | " + result.first);
      } else {
        bad += 1;
        console.log(id + " | SURVIVED | " + desc);
      }
    });
  } finally {
    try { fs.writeFileSync(filePath, orig); } catch (e) {}
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log("SCORE " + caught + "/" + total + " caught");
  process.exitCode = bad || caught !== total ? 1 : 0;
}

main();
