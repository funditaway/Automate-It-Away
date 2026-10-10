#!/usr/bin/env node
"use strict";

// Public /scripts and /scripts/* must 404. The files stay on disk for api/
// and for this suite. A rewrite would lose to the filesystem, so the block
// is a routes rule (evaluated before the file is served).
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
let failed = 0;

function fail(msg) {
  failed += 1;
  console.error("FAIL " + msg);
}
function pass(msg) {
  console.log("ok  " + msg);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

let vercel;
try {
  vercel = JSON.parse(read("vercel.json"));
} catch (err) {
  fail("vercel.json must parse: " + (err && err.message ? err.message : err));
  process.exit(1);
}
pass("vercel.json parses");

function ruleStatus(rule) {
  if (rule.status != null) return Number(rule.status);
  if (rule.statusCode != null) return Number(rule.statusCode);
  return null;
}

function patternOf(rule) {
  if (typeof rule.src === "string") return rule.src;
  if (typeof rule.source === "string") return rule.source;
  return "";
}

function compilePattern(pattern) {
  var body = pattern;
  if (body.charAt(0) === "^") {
    if (body.charAt(body.length - 1) !== "$") body += "$";
    return new RegExp(body);
  }
  var converted = body.replace(/:([A-Za-z_][A-Za-z0-9_]*)([*+?])?/g, function (_m, _name, mod) {
    if (mod === "*") return "(.*)";
    if (mod === "+") return "(.+)";
    if (mod === "?") return "([^/]*)";
    return "([^/]+)";
  });
  return new RegExp("^" + converted + "$");
}

function patternMatches(pattern, pathname) {
  try {
    return compilePattern(pattern).test(pathname);
  } catch (err) {
    return false;
  }
}

function firstTerminal(phase, rules, pathname) {
  var list = rules || [];
  for (var i = 0; i < list.length; i++) {
    var rule = list[i];
    if (!rule || rule.handle) continue;
    var pattern = patternOf(rule);
    if (!pattern || !patternMatches(pattern, pathname)) continue;
    if (rule.continue === true) continue;
    return { phase: phase, pattern: pattern, status: ruleStatus(rule), rule: rule };
  }
  return null;
}

function servedByFilesystem(pathname) {
  var rel = String(pathname || "").replace(/^\/+/, "");
  if (!rel || rel.indexOf("..") >= 0) return false;
  var abs = path.join(root, rel);
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return true;
  if (fs.existsSync(abs + ".html") && fs.statSync(abs + ".html").isFile()) return true;
  var indexHtml = path.join(abs, "index.html");
  if (fs.existsSync(indexHtml) && fs.statSync(indexHtml).isFile()) return true;
  return false;
}

// routes and redirects run before the filesystem. rewrites run after, so a
// rewrite 404 cannot hide a file that is still in the deploy bundle.
function resolve404(pathname) {
  var routeHit = firstTerminal("routes", vercel.routes, pathname);
  if (routeHit) return routeHit.status === 404 ? routeHit : null;
  var redirectHit = firstTerminal("redirects", vercel.redirects, pathname);
  if (redirectHit) return redirectHit.status === 404 ? redirectHit : null;
  var headerHit = firstTerminal("headers", vercel.headers, pathname);
  if (headerHit) return headerHit.status === 404 ? headerHit : null;
  if (servedByFilesystem(pathname)) return null;
  var rewriteHit = firstTerminal("rewrites", vercel.rewrites, pathname);
  if (rewriteHit && rewriteHit.status === 404) return rewriteHit;
  return null;
}

function expect404(pathname) {
  var hit = resolve404(pathname);
  if (!hit) {
    fail(pathname + " must resolve to a 404 rule");
    return;
  }
  pass(pathname + " → 404 via " + hit.phase + " " + hit.pattern);
}

function expectNot404(pathname) {
  var hit = resolve404(pathname);
  if (hit) fail(pathname + " must stay off the scripts 404 rule (hit " + hit.pattern + ")");
  else pass(pathname + " is not a scripts 404");
}

["/scripts", "/scripts/", "/scripts/anything", "/scripts/check-api-contract.js"].forEach(expect404);
expectNot404("/check-approve-start.js");
expectNot404("/");
expectNot404("/desk");
expectNot404("/queue");
expectNot404("/api/health");

if (!fs.existsSync(path.join(root, "scripts/check-api-contract.js"))) {
  fail("scripts/check-api-contract.js must stay in the repo");
} else pass("scripts/check-api-contract.js stays on disk");

var routes = vercel.routes || [];
var blocked = routes.filter(function (rule) {
  return ruleStatus(rule) === 404 && (patternOf(rule) === "/scripts" || patternOf(rule) === "/scripts/(.*)");
});
if (blocked.length !== 2) {
  fail("vercel.json routes must 404 /scripts and /scripts/(.*)");
} else pass("routes 404 /scripts and /scripts/(.*)");

var expectedRedirects = [
  { source: "/dashboard", destination: "/desk", permanent: true },
  { source: "/dashboard.html", destination: "/desk.html", permanent: true },
  { source: "/queue", destination: "/desk", permanent: true },
  { source: "/queue.html", destination: "/desk.html", permanent: true },
  { source: "/dev", destination: "/developer", permanent: false },
  { source: "/studio", destination: "/developer", permanent: false },
  { source: "/lab", destination: "/developer", permanent: false }
];
if (JSON.stringify(vercel.redirects) !== JSON.stringify(expectedRedirects)) {
  fail("vercel.json redirects must stay in place and in order");
} else pass("redirects unchanged");

var expectedRewrites = [
  { source: "/setup", destination: "/setup.html" },
  { source: "/how", destination: "/how.html" },
  { source: "/help", destination: "/help.html" },
  { source: "/examples", destination: "/examples.html" },
  { source: "/people", destination: "/people.html" },
  { source: "/desk", destination: "/desk.html" },
  { source: "/queue", destination: "/desk.html" },
  { source: "/rules", destination: "/rules.html" },
  { source: "/more", destination: "/more.html" },
  { source: "/drop", destination: "/drop.html" },
  { source: "/pipes", destination: "/pipes.html" },
  { source: "/create", destination: "/create.html" },
  { source: "/creator", destination: "/create.html" },
  { source: "/studio", destination: "/developer.html" },
  { source: "/creators", destination: "/creators.html" },
  { source: "/desk-ais", destination: "/desk-ais.html" },
  { source: "/packs-you-own", destination: "/packs-you-own.html" },
  { source: "/market", destination: "/market.html" },
  { source: "/shop", destination: "/market.html" },
  { source: "/packs", destination: "/market.html" },
  { source: "/pack", destination: "/market.html" },
  { source: "/dev", destination: "/developer.html" },
  { source: "/developer", destination: "/developer.html" },
  { source: "/lab", destination: "/developer.html" },
  { source: "/onboard", destination: "/onboard.html" },
  { source: "/widget", destination: "/drop.html" },
  { source: "/connections", destination: "/pipes.html" },
  { source: "/chat", destination: "/chat.html" },
  { source: "/admin", destination: "/admin.html" },
  { source: "/account", destination: "/account.html" },
  { source: "/desks", destination: "/desks.html" },
  { source: "/history", destination: "/history.html" },
  { source: "/api/desks", destination: "/api/auth?via=desks" },
  { source: "/api/jobs", destination: "/api/jobs" },
  { source: "/api/connections", destination: "/api/connections" },
  { source: "/api/health", destination: "/api/health" },
  { source: "/api/status", destination: "/api/health?view=status" },
  { source: "/api/auth", destination: "/api/auth" },
  { source: "/api/worker", destination: "/api/worker" },
  { source: "/api/upload", destination: "/api/upload" },
  { source: "/api/admin", destination: "/api/admin" },
  { source: "/api/account", destination: "/api/auth?via=account" },
  { source: "/api/intake", destination: "/api/intake" },
  { source: "/api/hook", destination: "/api/hook" },
  { source: "/api/rules", destination: "/api/rules" }
];
if (JSON.stringify(vercel.rewrites) !== JSON.stringify(expectedRewrites)) {
  fail("vercel.json rewrites must stay in place and in order");
} else pass("rewrites unchanged");

if (vercel.cleanUrls !== true) fail("cleanUrls must stay true");
else pass("cleanUrls stays true");
if (vercel.trailingSlash !== false) fail("trailingSlash must stay false");
else pass("trailingSlash stays false");
if (vercel.headers) fail("headers must stay unset");
else pass("headers stay unset");

var skipDir = { node_modules: 1, ".git": 1 };
function walk(dir, rel) {
  var hits = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (ent) {
    if (skipDir[ent.name]) return;
    var childRel = rel ? rel + "/" + ent.name : ent.name;
    var child = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      hits = hits.concat(walk(child, childRel));
      return;
    }
    var isHtml = /\.html$/i.test(ent.name);
    var isJs = /\.js$/i.test(ent.name);
    if (!isHtml && !isJs) return;
    if (isJs && !isFrontEndJs(childRel)) return;
    var text = fs.readFileSync(child, "utf8");
    var lines = text.split("\n");
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf("scripts/") >= 0) hits.push(childRel + ":" + (i + 1));
    }
  });
  return hits;
}

function isFrontEndJs(relPath) {
  if (relPath === "scripts" || relPath.indexOf("scripts/") === 0) return false;
  if (relPath === "api" || relPath.indexOf("api/") === 0) return false;
  if (relPath.indexOf("command/") === 0 && relPath.indexOf("command/public/") !== 0) return false;
  if (relPath.indexOf("runtime/") === 0 && relPath.indexOf("runtime/public/") !== 0) return false;
  return true;
}

var refs = walk(root, "");
if (refs.length) fail("HTML or front-end JS references a scripts/ path: " + refs.join(", "));
else pass("no HTML or front-end JS references a scripts/ path");

var pkg = read("package.json");
if (pkg.indexOf("check-scripts-blocked.js") < 0) fail("package.json must run check-scripts-blocked");
else pass("package.json runs check-scripts-blocked");

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("check-scripts-blocked ok");
