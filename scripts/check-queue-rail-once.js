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

// The HTML is the sole normal-path rail. JS has exactly one fallback creation.
const shells = desk.match(/id="queue-desk-rail"/g) || [];
assert(shells.length === 1, "desk.html must contain exactly one rail shell");
assert(desk.indexOf('id="queue-desk-rail"') > desk.indexOf('id="banner"'), "rail follows its banner mount");
assert(pin.check(root), "desk.html must match its byte/SHA pin");
assert((source.match(/rail\.id = "queue-desk-rail"/g) || []).length === 1, "one JS fallback creates the rail");
assert((source.match(/banner\.parentNode\.insertBefore\(rail, banner\.nextSibling\)/g) || []).length === 1, "one JS fallback inserts the rail");
const ensure = source.match(/  function ensureRail\(\) \{[\s\S]*?\n  \}/);
assert(ensure && ensure[0].includes("var rail = document.get" + "ElementById"), "ensureRail must reuse the HTML shell");
assert(ensure && !ensure[0].includes('document.documentElement.__aiaQueueUxBoot'), "ensureRail stays free of unrelated boot guards");
pass("one static shell and one guarded fallback; desk pin intact");

function fixture() {
  const ids = ["banner", "queue-desk-rail", "queue-desk-actions", "drop-go", "refresh", "queue"];
  const nodes = {};
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
  nodes.banner.nextSibling = null;
  nodes["drop-go"].parentNode = node("old-actions");
  nodes.refresh.parentNode = node("old-actions");
  const timers = [];
  let insertions = 0;
  nodes.banner.parentNode.insertBefore = function(child) {
    if (child.id === "queue-desk-rail") { insertions++; nodes["queue-desk-rail"] = child; }
    child.parentNode = this;
    this.children.push(child);
    return child;
  };
  const context = {
    console,
    document: {
      readyState: "complete", documentElement: node("html"), body: node("body"), head: node("head"),
      getElementById(id) { return nodes[id] || null; },
      createElement() { return node(); },
      querySelector(selector) { return selector.includes("button[onclick") ? nodes.refresh : null; },
      querySelectorAll() { return []; },
      addEventListener() {}
    },
    localStorage: { getItem() { return ""; } },
    setTimeout(fn) { timers.push(fn); }
  };
  context.window = context;
  return { context, nodes, timers, insertions: () => insertions, runTimers() { timers.splice(0).forEach(fn => fn()); } };
}

function exercise(src) {
  const f = fixture();
  vm.runInNewContext(src, f.context, { filename: "desk-queue-ux.js" });
  f.runTimers();
  f.runTimers();
  assert(f.nodes["queue-desk-rail"].id === "queue-desk-rail", "existing rail identity is retained");
  assert(f.insertions() === 0, "static rail must not be inserted again");
  assert(f.nodes["queue-desk-actions"].children.length === 2, "two boots move Drop and Refresh once");
  assert(f.nodes["queue-desk-actions"].children[0] === f.nodes["drop-go"], "Drop stays in the shared rail");
  assert(f.nodes["queue-desk-actions"].children[1] === f.nodes.refresh, "Refresh stays in the shared rail");
  return f;
}
exercise(source);
pass("repeated real-source boots reuse the same rail and actions");

if (process.argv.includes("--mutants")) {
  const cases = [
    ["double-insert fallback", source.replace(
      'if (banner && banner.parentNode) banner.parentNode.insertBefore(rail, banner.nextSibling);',
      'if (banner && banner.parentNode) { banner.parentNode.insertBefore(rail, banner.nextSibling); banner.parentNode.insertBefore(rail, banner.nextSibling); }'
    ), "one JS fallback inserts"],
    ["unconditional duplicate create", source.split("\n").map(function (line) {
      return line.trim().startsWith("var rail = document.get") ? "    var rail = null;" : line;
    }).join("\n"), "must reuse the HTML shell"],
    ["duplicate HTML shell", desk.replace(
      '<div id="queue-desk-rail">',
      '<div id="queue-desk-rail"></div><div id="queue-desk-rail">'
    ), "exactly one rail shell"],
    ["removed HTML shell", desk.replace(/\n    <div id="queue-desk-rail">.*<\/div><\/div>/, ""), "exactly one rail shell"],
    ["missing mount", source.replace('if (banner && banner.parentNode) banner.parentNode.insertBefore(rail, banner.nextSibling);', ''), "one JS fallback inserts"],
    ["stale desk pin", desk + " ", "byte/SHA pin"]
  ];
  cases.forEach(([name, src, expected], index) => {
    const original = name.includes("HTML") || name.includes("removed") || name === "stale desk pin" ? desk : source;
    assert(src !== original, name + " transformation must change its target");
    const mutantRoot = path.join("/tmp", "aia-rail-mutant-" + process.pid + "-" + index);
    fs.mkdirSync(path.join(mutantRoot, "scripts"), { recursive: true });
    try {
      fs.writeFileSync(path.join(mutantRoot, "desk-queue-ux.js"), name.includes("HTML") || name.includes("removed") ? source : src);
      fs.writeFileSync(path.join(mutantRoot, "desk.html"), name.includes("HTML") || name.includes("removed") || name === "stale desk pin" ? src : desk);
      fs.copyFileSync(path.join(root, "scripts/_desk-html-pin.js"), path.join(mutantRoot, "scripts/_desk-html-pin.js"));
      fs.copyFileSync(path.join(root, "scripts/_env-guard.js"), path.join(mutantRoot, "scripts/_env-guard.js"));
      fs.copyFileSync(__filename, path.join(mutantRoot, "scripts/check-queue-rail-once.js"));
      const run = spawnSync(process.execPath, [path.join(mutantRoot, "scripts/check-queue-rail-once.js")], { encoding: "utf8", env: process.env });
      assert(run.status !== 0, name + " unexpectedly passed: " + (run.stderr || run.stdout));
      assert((run.stderr || run.stdout).includes(expected), name + " failed for the wrong reason: " + (run.stderr || run.stdout));
      pass("mutant caught: " + name);
    } finally { fs.rmSync(mutantRoot, { recursive: true, force: true }); }
  });
}
console.log("check-queue-rail-once: ok (" + passed + " checks)");
