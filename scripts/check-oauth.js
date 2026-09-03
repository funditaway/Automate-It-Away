const oauth = require("../api/_oauth");

function fail(msg) {
  console.error("FAIL " + msg);
  process.exitCode = 1;
}
function pass(msg) { console.log("ok  " + msg); }

const rows = oauth.publicProviders();
const ids = rows.map((p) => p.id);
[
  "google", "github", "apple", "microsoft", "x", "amazon", "facebook",
  "grok", "chatgpt", "claude", "linkedin", "discord", "vercel", "yahoo",
  "passkey", "other"
].forEach((id) => {
  if (ids.indexOf(id) < 0) fail("missing door " + id);
});
if (!process.exitCode) pass("catalog lists every named door");

if (JSON.stringify(rows).toLowerCase().indexOf("vita") >= 0) fail("catalog must never say Vita");
else pass("catalog never says Vita");

const google = oauth.startOAuth("google");
if (!google || google.ok || google.status !== 409 || !google.hold) fail("google without keys should 409 hold");
else pass("google start without keys is Hold");

const grok = oauth.startOAuth("grok");
if (!grok || grok.ok || grok.status !== 409 || !grok.ask) fail("grok should 409 ask");
else pass("grok start is Ask");

const other = oauth.askOther("example.com");
if (!other || other.ok || other.status !== 409 || !other.ask) fail("another site should 409 ask");
else pass("another site is Ask");

if (!oauth.isRelayEmail("x@privaterelay.appleid.com") || oauth.emailLinkable("x@privaterelay.appleid.com")) {
  fail("Apple relay must not suggest-link");
} else pass("Apple relay is not linkable");

const acc = { password: "", pin: "", identities: [] };
const linked = oauth.rememberIdentity(acc, { provider: "google", subject: "sub_1", email: "a@example.com", name: "A" });
if (!linked.ok || acc.identities.length !== 1) fail("rememberIdentity should attach");
else pass("rememberIdentity attaches");

const last = oauth.dropIdentity(acc, "google");
if (!last || last.ok || last.status !== 409) fail("cannot drop last door");
else pass("cannot drop last door");

acc.password = "hashed";
const dropped = oauth.dropIdentity(acc, "google");
if (!dropped.ok || acc.identities.length !== 0) fail("drop allowed when password remains");
else pass("drop allowed when another door remains");

if (oauth.finishOAuth("github").ok) fail("finish without keys must hold");
else pass("finish without keys holds");

if (process.exitCode) {
  console.error("check-oauth failed");
  process.exit(1);
}
console.log("check-oauth passed");
