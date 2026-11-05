"use strict";
// Queue Q1a intentionally updates only the header CSS in desk.html. Keep one exact
// content pin for all former size/freeze checks, including squash-landed trees.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const BYTES = 35106;
const SHA256 = "f8a687c85b525e7c60aafdd9c8d5f632d803311815deb708acb8c328b9c6a5eb";
function check(root) {
  try {
    const b = fs.readFileSync(path.join(root, "desk.html"));
    return b.length === BYTES && crypto.createHash("sha256").update(b).digest("hex") === SHA256;
  } catch (e) { return false; }
}
module.exports = { BYTES, SHA256, check };
