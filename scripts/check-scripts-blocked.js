#!/usr/bin/env node
"use strict";

// scripts/ stays in git for this suite. .vercelignore keeps it out of the
// Vercel upload, so the site cannot serve those files. A routes 404 still
// returned the file body, and encoded paths bypassed it.
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const zlib = require("zlib");

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

const SCRIPT_PATTERNS = {
  scripts: 1,
  "/scripts": 1,
  "scripts/**": 1,
  "/scripts/**": 1,
  "scripts/*": 1,
  "/scripts/*": 1
};

function barePattern(line) {
  return line.trim().replace(/\/+$/, "");
}

function scriptsExcluded(text) {
  let excluded = false;
  text.split(/\r?\n/).forEach(function (line) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.charAt(0) === "#") return;
    if (trimmed.charAt(0) === "!") {
      const bare = barePattern(trimmed.slice(1));
      if (SCRIPT_PATTERNS[bare] || bare === "scripts" || bare.indexOf("scripts/") === 0 || bare.indexOf("/scripts/") === 0) {
        excluded = false;
      }
      return;
    }
    if (SCRIPT_PATTERNS[barePattern(trimmed)]) excluded = true;
  });
  return excluded;
}

const ignorePath = path.join(root, ".vercelignore");
if (!fs.existsSync(ignorePath)) fail(".vercelignore missing");
else {
  const ignore = fs.readFileSync(ignorePath, "utf8");
  const lines = ignore.split(/\r?\n/).map(function (line) { return line.trim(); }).filter(function (line) {
    return line && line.charAt(0) !== "#";
  });
  if (lines.indexOf("*") >= 0 || lines.indexOf("/*") >= 0 || lines.indexOf("**") >= 0) {
    fail(".vercelignore must not ignore the whole project");
  }
  if (!scriptsExcluded(ignore)) fail(".vercelignore must exclude scripts/");
  else pass(".vercelignore excludes scripts/");
}

let vercel;
try {
  vercel = JSON.parse(read("vercel.json"));
} catch (err) {
  fail("vercel.json must parse: " + (err && err.message ? err.message : err));
  vercel = null;
}
if (vercel && Object.prototype.hasOwnProperty.call(vercel, "routes")) {
  fail("vercel.json must not have a routes block");
} else if (vercel) pass("vercel.json has no routes block");

function scanJs(rel) {
  if (rel === "scripts" || rel.indexOf("scripts/") === 0) return false;
  if (rel === "api" || rel.indexOf("api/") === 0) return true;
  if (rel.indexOf("command/") === 0 && rel.indexOf("command/public/") !== 0) return false;
  if (rel.indexOf("runtime/") === 0 && rel.indexOf("runtime/public/") !== 0) return false;
  return true;
}

function walk(dir, rel, hits) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (ent) {
    if (ent.name === "node_modules" || ent.name === ".git") return;
    const childRel = rel ? rel + "/" + ent.name : ent.name;
    const child = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(child, childRel, hits);
      return;
    }
    const html = /\.html$/i.test(ent.name);
    const js = /\.js$/i.test(ent.name);
    if (!html && !js) return;
    if (js && !scanJs(childRel)) return;
    const lines = fs.readFileSync(child, "utf8").split("\n");
    lines.forEach(function (line, i) {
      if (line.indexOf("scripts/") !== -1) hits.push(childRel + ":" + (i + 1));
    });
  });
}

const refs = [];
walk(root, "", refs);
if (refs.length) fail("HTML, front-end JS, or api/ references a scripts/ path: " + refs.join(", "));
else pass("no HTML, front-end JS, or api/ references a scripts/ path");

function decodeBody(encoding, body) {
  const enc = String(encoding || "").toLowerCase().split(",")[0].trim();
  if (!enc || enc === "identity") return body;
  if (enc === "gzip") return zlib.gunzipSync(body);
  if (enc === "deflate") return zlib.inflateSync(body);
  if (enc === "br") return zlib.brotliDecompressSync(body);
  return body;
}

// Node's http.request does not follow redirects. The path is sent as given,
// so %73 and %2F are not decoded before they leave this process.
function requestExact(base, pathname) {
  const lib = base.protocol === "https:" ? https : http;
  const headers = {};
  if (process.env.CHECK_BYPASS) headers["x-vercel-protection-bypass"] = process.env.CHECK_BYPASS;
  return new Promise(function (resolve, reject) {
    const req = lib.request({
      hostname: base.hostname,
      port: base.port || undefined,
      method: "GET",
      path: pathname,
      headers: headers,
      timeout: 20000
    }, function (res) {
      const chunks = [];
      res.on("data", function (chunk) { chunks.push(chunk); });
      res.on("end", function () {
        try {
          resolve({
            status: res.statusCode || 0,
            body: decodeBody(res.headers["content-encoding"], Buffer.concat(chunks))
          });
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on("timeout", function () { req.destroy(new Error("timeout " + pathname)); });
    req.on("error", reject);
    req.end();
  });
}

async function live() {
  const host = process.env.CHECK_HOST;
  if (!host) {
    console.log("SKIP live scripts block (CHECK_HOST unset)");
    return;
  }
  let base;
  try {
    base = new URL(host);
  } catch (err) {
    try { base = new URL("https://" + host); }
    catch (err2) {
      fail("CHECK_HOST is not a url");
      return;
    }
  }
  if (base.protocol !== "http:" && base.protocol !== "https:") {
    fail("CHECK_HOST must be http or https");
    return;
  }
  const marker = fs.readFileSync(path.join(root, "scripts/check-header.js")).subarray(0, 200);
  if (marker.length < 200) {
    fail("scripts/check-header.js is shorter than 200 bytes");
    return;
  }
  const blocked = [
    "/scripts/check-header.js",
    "/scripts/",
    "/%73cripts/check-header.js",
    "/scripts%2Fcheck-header.js",
    "/Scripts/check-header.js"
  ];
  for (let i = 0; i < blocked.length; i++) {
    const pathname = blocked[i];
    let res;
    try {
      res = await requestExact(base, pathname);
    } catch (err) {
      fail(pathname + " request failed: " + (err && err.message ? err.message : err));
      continue;
    }
    const leaked = res.body.includes(marker);
    const okStatus = res.status < 200 || res.status >= 300;
    if (!okStatus) fail(pathname + " returned " + res.status);
    if (leaked) fail(pathname + " status " + res.status + " body contains scripts/check-header.js");
    if (okStatus && !leaked) pass(pathname + " status " + res.status + ", body has no file bytes");
  }
  const open = ["/", "/api/health"];
  for (let i = 0; i < open.length; i++) {
    const pathname = open[i];
    let res;
    try {
      res = await requestExact(base, pathname);
    } catch (err) {
      fail(pathname + " request failed: " + (err && err.message ? err.message : err));
      continue;
    }
    if (res.status !== 200) fail(pathname + " must return 200, got " + res.status);
    else pass(pathname + " status 200");
  }
}

live().then(function () {
  if (failed) {
    console.error(failed + " failed");
    process.exit(1);
  }
  console.log("check-scripts-blocked ok");
}).catch(function (err) {
  console.error("FAIL " + (err && err.stack ? err.stack : err));
  process.exit(1);
});
