"use strict";
// Queue Q1a pins the current desk.html content (header + picker + single-rail shells) for
// all former size/freeze checks, including squash-landed trees.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const BYTES = 35598;
const SHA256 = "c3af6ab645233a3248dfe038f6823a80efa7522779af1496d484abe485c592f1";
function check(root) {
  try {
    const b = fs.readFileSync(path.join(root, "desk.html"));
    return b.length === BYTES && crypto.createHash("sha256").update(b).digest("hex") === SHA256;
  } catch (e) { return false; }
}
module.exports = { BYTES, SHA256, check };
