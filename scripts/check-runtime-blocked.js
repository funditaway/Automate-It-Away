#!/usr/bin/env node
"use strict";

// runtime/ stays in git. .vercelignore keeps it off the main site upload.
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

const RUNTIME_PATTERNS = {
  runtime: 1,
  "/runtime": 1,
  "runtime/**": 1,
  "/runtime/**": 1,
  "runtime/*": 1,
  "/runtime/*": 1
};

function barePattern(line) {
  return line.trim().replace(/\/+$/, "");
}

function runtimeExcluded(text) {
  let excluded = false;
  text.split(/\r?\n/).forEach(function (line) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.charAt(0) === "#") return;
    if (trimmed.charAt(0) === "!") {
      const bare = barePattern(trimmed.slice(1));
      if (RUNTIME_PATTERNS[bare] || bare.indexOf("runtime/") === 0 || bare.indexOf("/runtime/") === 0) {
        excluded = false;
      }
      return;
    }
    if (RUNTIME_PATTERNS[barePattern(trimmed)]) excluded = true;
  });
  return excluded;
}

const ignorePath = path.join(root, ".vercelignore");
if (!fs.existsSync(ignorePath)) fail(".vercelignore missing");
else if (!runtimeExcluded(fs.readFileSync(ignorePath, "utf8"))) fail(".vercelignore must exclude runtime/");
else pass(".vercelignore excludes runtime/");

function decodeBody(encoding, body) {
  const enc = String(encoding || "").toLowerCase().split(",")[0].trim();
  if (!enc || enc === "identity") return body;
  if (enc === "gzip") return zlib.gunzipSync(body);
  if (enc === "deflate") return zlib.inflateSync(body);
  if (enc === "br") return zlib.brotliDecompressSync(body);
  return body;
}

// http.request does not follow redirects. The path is sent unchanged.
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

function marker(rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  if (buf.length < 200) {
    fail(rel + " is shorter than 200 bytes");
    return buf;
  }
  return buf.subarray(0, 200);
}

async function live() {
  const host = process.env.CHECK_HOST;
  if (!host) {
    console.log("SKIP live runtime block (CHECK_HOST unset)");
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
  const publicMarker = marker("runtime/public/index.html");
  const serverMarker = marker("runtime/src/server.ts");
  const cases = [
    { path: "/runtime/public", file: publicMarker },
    { path: "/%72untime/public", file: publicMarker },
    { path: "/runtime%2Fpublic", file: publicMarker },
    { path: "/Runtime/public", file: publicMarker },
    { path: "/runtime/src/server.js", file: serverMarker },
    { path: "/%72untime/src/server.js", file: serverMarker },
    { path: "/runtime%2Fsrc/server.js", file: serverMarker },
    { path: "/Runtime/src/server.js", file: serverMarker }
  ];
  for (let i = 0; i < cases.length; i++) {
    const item = cases[i];
    let res;
    try {
      res = await requestExact(base, item.path);
    } catch (err) {
      fail(item.path + " request failed: " + (err && err.message ? err.message : err));
      continue;
    }
    const leaked = item.file.length > 0 && res.body.includes(item.file);
    if (res.status !== 404) fail(item.path + " must return 404, got " + res.status);
    else if (leaked) fail(item.path + " 404 body still contains the runtime file");
    else pass(item.path + " 404, no file body");
  }
}

live().then(function () {
  if (failed) {
    console.error(failed + " failed");
    process.exit(1);
  }
  console.log("check-runtime-blocked ok");
}).catch(function (err) {
  console.error("FAIL " + (err && err.stack ? err.stack : err));
  process.exit(1);
});
