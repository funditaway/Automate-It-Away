// Every check requires this first, before any api module. With production settings in the environment
// (VERCEL_ENV=production, or any BLOB_* variable) the api modules talk to the real Blob store even when
// AIA_STORE_PATH names a temp file. So a check refuses to run there: exit 1, nothing loaded, nothing written.
// Only variable names are printed, never values.
// A check's own child process, spawned with fake Blob settings, passes: it carries AIA_CHECK_PARENT equal to
// its parent's pid and every BLOB_* value is a fake (contains "fake").
"use strict";
const env = process.env;
const blob = Object.keys(env).filter((k) => /^BLOB_/.test(k));
const prod = String(env.VERCEL_ENV || "").trim().toLowerCase() === "production";
if (prod || blob.length) {
  const child = !!env.AIA_CHECK_PARENT && env.AIA_CHECK_PARENT === String(process.ppid) && blob.every((k) => /fake/i.test(String(env[k])));
  if (!child) {
    const name = (require.main && require.main.filename ? require("path").basename(require.main.filename) : "check");
    const why = [prod ? "VERCEL_ENV=production" : "", blob.length ? "BLOB_* set (" + blob.join(", ") + ")" : ""].filter(Boolean).join(" and ");
    process.stderr.write("REFUSED " + name + ": " + why + ". Checks never run with production settings; run them with env -i and fake keys.\n");
    process.exit(1);
  }
}
