"use strict";
// Queue Q1a intentionally updates only the header CSS in desk.html. Keep one exact
// content pin for all former size/freeze checks, including squash-landed trees.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const BYTES = 35112;
const SHA256 = "1ae6797d7720caf31c16931806ed013963719b9b4c3b4c555fc1a4bafa7fe87e";
function check(root) {
  try {
    const b = fs.readFileSync(path.join(root, "desk.html"));
    return b.length === BYTES && crypto.createHash("sha256").update(b).digest("hex") === SHA256;
  } catch (e) { return false; }
}
module.exports = { BYTES, SHA256, check };
