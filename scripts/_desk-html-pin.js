"use strict";
// Queue Q1a pins the current desk.html content (header + in-place picker shell) for
// all former size/freeze checks, including squash-landed trees.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const BYTES = 35478;
const SHA256 = "a5c2f3361070f927a2978f9ca9a8b0c19fdcc0474f3a6b75d3a1667cbbec79f1";
function check(root) {
  try {
    const b = fs.readFileSync(path.join(root, "desk.html"));
    return b.length === BYTES && crypto.createHash("sha256").update(b).digest("hex") === SHA256;
  } catch (e) { return false; }
}
module.exports = { BYTES, SHA256, check };
