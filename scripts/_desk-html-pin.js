"use strict";
// Queue Q1a pins the current desk.html content (header + in-place picker shell) for
// all former size/freeze checks, including squash-landed trees.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const BYTES = 35485;
const SHA256 = "d84ad086270c2abf2e20e101488976b1db7abf82db0bef5d14747c83a749f8db";
function check(root) {
  try {
    const b = fs.readFileSync(path.join(root, "desk.html"));
    return b.length === BYTES && crypto.createHash("sha256").update(b).digest("hex") === SHA256;
  } catch (e) { return false; }
}
module.exports = { BYTES, SHA256, check };
