const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "../account.html"), "utf8");

function fail(msg) {
  console.error("FAIL " + msg);
  process.exitCode = 1;
}
function pass(msg) { console.log("ok  " + msg); }

if (/fetch\("\/api\/auth".*action:"details"/s.test(html)) fail("profile save must not post details to /api/auth");
else pass("profile save does not post details to /api/auth");

if (/fetch\("\/api\/auth".*action:"password"/s.test(html)) fail("password save must not post password to /api/auth");
else pass("password save does not post password to /api/auth");

if (!/fetch\("\/api\/account".*action:"details"/s.test(html)) fail("profile save must post details to /api/account");
else pass("profile save posts details to /api/account");

if (!/fetch\("\/api\/account".*action:"password"/s.test(html)) fail("password save must post password to /api/account");
else pass("password save posts password to /api/account");

if (!/id="leave-phone"[\s\S]*fetch\("\/api\/account"[\s\S]*action:"logout"/.test(html)) fail("leave this phone must call logout");
else pass("leave this phone calls logout");

if (!/id="refresh-sessions"/.test(html) || !/action:"sessions"/.test(html)) fail("sessions UI/action missing");
else pass("sessions UI/action present");

if (!/id="export-book"/.test(html) || !/action:"export"/.test(html)) fail("export UI/action missing");
else pass("export UI/action present");

if (!/id="logout-all"/.test(html) || !/action:"logout-all"/.test(html)) fail("logout-all UI/action missing");
else pass("logout-all UI/action present");

if (!/id="mfa-on"/.test(html) || !/action:"mfa"/.test(html) || !/r\.status===409/.test(html)) fail("MFA HOLD UI/action missing");
else pass("MFA HOLD UI/action present");

if (!/<a href="\/people">People<\/a>/.test(html)) fail("People link must be /people");
else pass("People link is /people");

if (!/Ledger only\.\s*<code>charged:false<\/code>\.\s*No money move from this page\./.test(html)) fail("wallet ledger-only copy missing");
else pass("wallet ledger-only copy present");

if (process.exitCode) {
  console.error("check-account-page failed");
  process.exit(1);
}
console.log("check-account-page passed");
