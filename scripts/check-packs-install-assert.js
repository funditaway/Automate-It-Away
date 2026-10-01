// Asserts for create-pack-install.js (loaded from scripts/check-packs.js)
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
function fail(msg) { console.error("FAIL " + msg); process.exitCode = 1; }
function pass(msg) { console.log("ok  " + msg); }
const root = path.join(__dirname, "..");
const installJsPath = path.join(root, "create-pack-install.js");
if (!fs.existsSync(installJsPath)) fail("create-pack-install.js missing for empty pack-list + Install .aia honesty");
else pass("create-pack-install.js present");
const installJs = fs.readFileSync(installJsPath, "utf8");
const synInstall = spawnSync(process.execPath, ["--check", installJsPath], { encoding: "utf8" });
if (synInstall.status !== 0) fail("create-pack-install.js must parse: " + (synInstall.stderr || synInstall.stdout || "").trim());
else pass("create-pack-install.js parses");
if (installJs.indexOf("PLACEHOLDER") >= 0) fail("create-pack-install.js must not be PLACEHOLDER");
else pass("create-pack-install.js real contents");
if (installJs.length < 400) fail("create-pack-install.js too small");
else pass("create-pack-install.js size ok");
if (installJs.indexOf("pack-list-empty") < 0) fail("create-pack-install must honest-empty pack-list");
else pass("pack empty-list honesty id");
if (installJs.indexOf("pack-install-honest") < 0) fail("create-pack-install must inject Install .aia honesty");
else pass("Install .aia honesty id");
if (installJs.indexOf("You still tap Yes, then Start") < 0) fail("create-pack-install must keep Yes, then Start");
else pass("install/empty Yes, then Start");
if (installJs.indexOf("Packs do not send money") < 0) fail("create-pack-install must say packs do not send money");
else pass("install/empty packs do not send money");
if (installJs.indexOf("Collect stays HOLD") < 0) fail("create-pack-install must keep Collect HOLD");
else pass("install/empty Collect HOLD");
const createHtml = fs.readFileSync(path.join(root, "create.html"), "utf8");
if (createHtml.indexOf("create-pack-install.js") < 0) fail("create.html must load create-pack-install.js");
else pass("create.html loads create-pack-install.js");
require("./check-packs-download-assert.js");
