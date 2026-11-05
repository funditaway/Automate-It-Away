#!/usr/bin/env node
"use strict";
require("./_env-guard");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { spawnSync } = require("child_process");
const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "desk-queue-ux.js"), "utf8");
const desk = fs.readFileSync(path.join(root, "desk.html"), "utf8");
const pin = require("./_desk-html-pin");
let passed = 0;
function fail(message) { throw new Error("check-queue-rail-once: " + message); }
function assert(value, message) { if (!value) fail(message); }
function pass(message) { passed++; console.log("ok  " + message); }

const ensure = source.match(/  function ensureRail\(\) \{[\s\S]*?\n  \}/);
assert(ensure, "ensureRail exists");
assert(!desk.includes('id="queue-desk-rail"'), "desk.html stays free of a static rail shell");
assert(pin.check(root), "desk.html byte/SHA pin unchanged");
assert((source.match(/rail\.id = "queue-desk-rail"/g) || []).length === 1, "only one create path assigns the rail ID");
assert((source.match(/banner\.parentNode\.insertBefore\(rail, banner\.nextSibling\)/g) || []).length === 1, "only one insertion call");
assert(ensure && /var rail = document\.getElementById\("queue-desk-rail"\);/.test(ensure[0]), "lookup reuses an existing rail");
assert(ensure && /if \(!rail\) \{[\s\S]*?document\.createElement\("div"\)/.test(ensure[0]), "create stays inside the missing-rail guard");
pass("one create path, one insertion, idempotent existing-rail lookup; HTML pin unchanged");

function fixture() {
  const ids = ["banner", "queue-desk-rail", "queue-desk-actions", "drop-go", "refresh", "queue"];
  const nodes = {};
  let creates = 0, inserts = 0;
  function node(id) {
    return {
      id: id || "", children: [], parentNode: null, innerHTML: "", hidden: false,
      style: {}, textContent: "", classList: { add() {}, remove() {}, toggle() {} },
      querySelectorAll() { return []; }, addEventListener() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null; }, closest() { return null; },
      appendChild(child) { child.parentNode = this; if (!this.children.includes(child)) this.children.push(child); return child; },
      insertBefore(child) { child.parentNode = this; this.children.push(child); return child; },
      querySelector(selector) {
        if (selector === "#queue-desk-actions") return nodes["queue-desk-actions"] || null;
        if (selector === ".q-metrics") return { innerHTML: "" };
        return null;
      }
    };
  }
  ids.forEach(id => { nodes[id] = node(id); });
  nodes.banner.parentNode = node("main");
  nodes.banner.parentNode.insertBefore = function (child) {
    if (child.id === "queue-desk-rail") { inserts++; nodes["queue-desk-rail"] = child; }
    child.parentNode = this; this.children.push(child); return child;
  };
  nodes["drop-go"].parentNode = node("old-actions");
  nodes.refresh.parentNode = node("old-actions");
  const timers = [];
  const context = {
    console,
    document: {
      readyState: "complete", documentElement: node("html"), body: node("body"), head: node("head"),
      getElementById(id) { return nodes[id] || null; },
      createElement() { creates++; return node(); },
      querySelector(selector) { return selector.includes("button[onclick") ? nodes.refresh : null; },
      querySelectorAll() { return []; }, addEventListener() {}
    },
    localStorage: { getItem() { return ""; } },
    setTimeout(fn) { timers.push(fn); }
  };
  context.window = context;
  return { context, nodes, timers, creates: () => creates, inserts: () => inserts, runTimers() { timers.splice(0).forEach(fn => fn()); } };
}
function exercise(src) {
  const f = fixture();
  const original = f.nodes["queue-desk-rail"];
  vm.runInNewContext(src, f.context, { filename: "desk-queue-ux.js" });
  f.runTimers(); f.runTimers();
  assert(f.nodes["queue-desk-rail"] === original, "repeated boots preserve the original rail identity");
  assert(f.inserts() === 0, "existing rail is never reinserted");
  assert(f.nodes["queue-desk-actions"].children.length === 2, "two boots move Drop and Refresh once");
  return f;
}
exercise(source);
pass("repeated real-source boots reuse the same rail and actions");

if (process.argv.includes("--mutants")) {
  const cases = [
    ["double-create", source.replace(/    if \(!rail\) \{/, "    {"), "create stays inside the missing-rail guard"],
    ["lost-reuse", source.split("\n").map(function (line) {
      return line.trim().startsWith("var rail = document.get") ? "    var rail = null;" : line;
    }).join("\n"), "lookup reuses"],
    ["double-insert", source.replace(
      "if (banner && banner.parentNode) banner.parentNode.insertBefore(rail, banner.nextSibling);",
      "if (banner && banner.parentNode) { banner.parentNode.insertBefore(rail, banner.nextSibling); banner.parentNode.insertBefore(rail, banner.nextSibling); }"
    ), "only one insertion call"],
    ["static-shell-returned", desk.replace('<div class="banner" id="banner">', '<div id="queue-desk-rail"></div><div class="banner" id="banner">'), "free of a static rail shell"],
    ["stale-desk-pin", desk + " ", "byte/SHA pin unchanged"]
  ];
  cases.forEach(([name, src, expected], index) => {
    const htmlMutant = name === "static-shell-returned" || name === "stale-desk-pin";
    const original = htmlMutant ? desk : source;
    assert(src !== original, name + " transformation must change its target");
    const mutantRoot = path.join("/tmp", "aia-rail-mutant-" + process.pid + "-" + index);
    fs.mkdirSync(path.join(mutantRoot, "scripts"), { recursive: true });
    try {
      fs.writeFileSync(path.join(mutantRoot, "desk-queue-ux.js"), htmlMutant ? source : src);
      fs.writeFileSync(path.join(mutantRoot, "desk.html"), htmlMutant ? src : desk);
      for (const file of ["_desk-html-pin.js", "_env-guard.js", "check-queue-rail-once.js"]) {
        fs.copyFileSync(path.join(root, "scripts", file), path.join(mutantRoot, "scripts", file));
      }
      const run = spawnSync(process.execPath, [path.join(mutantRoot, "scripts/check-queue-rail-once.js")], { encoding: "utf8", env: process.env });
      assert(run.status !== 0, name + " unexpectedly passed: " + (run.stderr || run.stdout));
      assert((run.stderr || run.stdout).includes(expected), name + " failed for wrong reason: " + (run.stderr || run.stdout));
      pass("mutant caught: " + name);
    } finally { fs.rmSync(mutantRoot, { recursive: true, force: true }); }
  });
}
console.log("check-queue-rail-once: ok (" + passed + " checks)");
