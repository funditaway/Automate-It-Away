// Every check requires this first, before any api module. With production settings in the environment
// (VERCEL_ENV=production, any BLOB_* variable, AIA_BLOB_TOKEN, or VERCEL_OIDC_TOKEN) the api modules
// can talk to the real Blob store even when AIA_STORE_PATH names a temp file. So a check refuses to
// run there: exit 1, nothing loaded, nothing written. Only variable names are printed, never values.
// AIA_BLOB_TOKEN and VERCEL_OIDC_TOKEN are refused whenever they are set, including on a child.
// A check's own child process, spawned with fake Blob settings, passes only when all of these hold:
// it carries AIA_CHECK_PARENT equal to its parent's pid, at least one BLOB_* is set, and every
// BLOB_* value is a fake (contains "fake").
"use strict";
const env = process.env;
const blob = Object.keys(env).filter((k) => /^BLOB_/.test(k));
const named = ["AIA_BLOB_TOKEN", "VERCEL_OIDC_TOKEN"].filter((k) => Object.prototype.hasOwnProperty.call(env, k));
const prod = String(env.VERCEL_ENV || "").trim().toLowerCase() === "production";
const fake = (k) => /fake/i.test(String(env[k]));
if (prod || blob.length || named.length) {
  const child = !named.length && !!env.AIA_CHECK_PARENT && env.AIA_CHECK_PARENT === String(process.ppid) && blob.length >= 1 && blob.every(fake);
  if (!child) {
    const name = (require.main && require.main.filename ? require("path").basename(require.main.filename) : "check");
    const why = [
      prod ? "VERCEL_ENV=production" : "",
      blob.length ? "BLOB_* set (" + blob.join(", ") + ")" : "",
      named.length ? named.join(", ") + " set" : ""
    ].filter(Boolean).join(" and ");
    process.stderr.write("REFUSED " + name + ": " + why + ". Checks never run with production settings; run them with env -i and fake keys.\n");
    process.exit(1);
  }
}
