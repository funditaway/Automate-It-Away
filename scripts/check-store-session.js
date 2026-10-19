#!/usr/bin/env node
// store.js (Consign) sends the signed-in session as well as the desk code, so an owner
// signed in without a saved code stays seated once /api/jobs needs a seat.
// usage: node scripts/check-store-session.js [repoRoot]
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));
let failures = 0;
function ok(c, m) { if (!c) { failures++; console.error("check-store-session: FAIL " + m); } }
const src = fs.readFileSync(path.join(root, "store.js"), "utf8");
function headersWith(store) {
  const ctx = { localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem() {}, removeItem() {} }, console, Date, Math, JSON };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: "store.js" });
  return ctx.AIA.headers();
}
let h = headersWith({ aia_ws: "aia", aia_session: "tok1" });
ok(h["X-Workspace"] === "aia", "sends X-Workspace");
ok(h["X-Session"] === "tok1", "session-only owner sends X-Session");
ok(!("X-Pin" in h), "no X-Pin without a saved code");
h = headersWith({ aia_ws: "aia", aia_pin: "1234" });
ok(h["X-Pin"] === "1234" && !("X-Session" in h), "code-only owner sends X-Pin only");
h = headersWith({ aia_ws: "aia", aia_pin: "1234", aia_session: "tok1" });
ok(h["X-Pin"] === "1234" && h["X-Session"] === "tok1", "both sent when both saved");
h = headersWith({ aia_ws: "aia" });
ok(!("X-Pin" in h) && !("X-Session" in h), "signed out sends neither");
console.log("check-store-session: " + (failures ? failures + " fail" : "all pass"));
process.exit(failures ? 1 : 0);
