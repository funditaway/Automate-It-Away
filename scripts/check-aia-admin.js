const admin = require("../api/_aia-admin");

function fail(msg) { console.error("FAIL " + msg); process.exitCode = 1; }
function pass(msg) { console.log("ok  " + msg); }

function main() {
  if (admin.normalizeHandle("@AIA") !== "aia") fail("normalize @AIA");
  else pass("normalize @AIA -> aia");

  if (!admin.isReservedHandle("AIA") || !admin.isReservedHandle("@automateitaway")) fail("reserved handles");
  else pass("aia and automateitaway are reserved");

  if (admin.isReservedHandle("oddo-books")) fail("shop handle should not be reserved");
  else pass("shop handles stay free");

  const platform = admin.stampAdminAccount({ id: "aia", name: "Automate It Away", heldBy: "admin", ownerName: "James Oddo" });
  if (!admin.isPlatformAccount(platform) || !admin.isAiaReviewer(platform, null, null) || platform.handle !== "aia") fail("platform stamp");
  else pass("platform admin stamps handle aia + reviewer");

  const shop = { id: "acct_demo", name: "Oddo Books", slug: "oddo-books" };
  const blocked = admin.setAccountHandle(shop, "@AIA");
  if (!blocked || blocked.ok || blocked.status !== 409) fail("shop cannot take @AIA");
  else pass("shop cannot take reserved @AIA");

  const live = { id: "acct_live", name: "AIA", slug: "aia" };
  const stamped = admin.setAccountHandle(live, "AIA", { allowReserved: true });
  if (!stamped.ok || stamped.handle !== "aia" || !stamped.aiaReviewer) fail("allowReserved stamp");
  else pass("existing AIA shop can be stamped reviewer");

  if (!admin.isAiaReviewer(null, { slug: "aia" }, null)) fail("desk slug aia is reviewer");
  else pass("desk slug aia is a reviewer desk");

  if (!admin.isAiaReviewer(null, { slug: "funditaway" }, null)) fail("funditaway desk reviewer");
  else pass("funditaway desk is a reviewer desk");

  if (admin.isAiaReviewer(shop, { slug: "oddo-books" }, { name: "Lee" })) fail("normal shop should not review packs");
  else pass("normal shop is not a pack reviewer");

  const named = admin.setAccountHandle({ id: "acct_james" }, "james.aia");
  if (!named.ok || named.handle !== "james" || named.aia !== "james.aia") fail("james.aia handle");
  else pass("account handle james.aia");
  const com = admin.setAccountHandle({ id: "acct_com" }, "springfield-shop.com");
  if (!com || com.ok) fail("account must reject .com TLD");
  else pass("account rejects other TLDs");

  if (process.exitCode) {
    console.error("check-aia-admin failed");
    process.exit(1);
  }
  console.log("check-aia-admin passed");
}

main();
