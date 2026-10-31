require("./_env-guard");
const admin = require("../api/_aia-admin");

function fail(msg) { console.error("FAIL " + msg); process.exitCode = 1; }
function pass(msg) { console.log("ok  " + msg); }

function main() {
  if (admin.normalizeHandle("@AIA") !== "aia") fail("normalize @AIA");
  else pass("normalize @AIA -> aia");

  if (!admin.isReservedHandle("AIA") || !admin.isReservedHandle("@automateitaway") || !admin.isReservedHandle("ai")) fail("reserved handles");
  else pass("aia, ai, and automateitaway are reserved");

  if (admin.isReservedHandle("oddo-books")) fail("shop handle should not be reserved");
  else pass("shop handles stay free");

  const platform = admin.stampAdminAccount({ id: "aia", name: "Automate It Away", heldBy: "admin", ownerName: "James Oddo" });
  if (!admin.isPlatformAccount(platform) || !admin.isAiaReviewer(platform, null, null) || platform.handle !== "aia") fail("platform stamp");
  else pass("platform admin stamps handle aia + reviewer");

  const byHandle = { handle: "aia" };
  if (!admin.isPlatformAccount(byHandle) || !admin.isAiaReviewer(byHandle, null, null)) fail("only the real platform handle is admin");
  else pass("only the real platform handle is admin");
  if (!admin.isPlatformAccount({ handle: "AIA" }) || !admin.isPlatformAccount({ handle: "aia.aia" }) || !admin.isPlatformAccount({ xHandle: "@AIA" })) fail("real platform handle normalizes to admin");
  else pass("real platform handle normalizes to admin");
  ["springfield-shop", "aia-shop", "aia2", "james", "funditaway"].forEach(function (h) {
    const look = { handle: h };
    if (admin.isPlatformAccount(look) || admin.isAiaReviewer(look, null, null)) fail("lookalike handle is not platform admin: " + h);
    else pass("lookalike " + h + " is not platform admin");
  });

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

const MUTANTS = [
  ["platform handle swapped", "api/_aia-admin.js",
    '  const handle = normalizeHandle(acc.handle || acc.xHandle || acc.slug);\n  return handle === "aia";',
    '  const handle = normalizeHandle(acc.handle || acc.xHandle || acc.slug);\n  return handle === "springfield-shop";']
];

function mutate() {
  const fs = require("fs");
  const os = require("os");
  const path = require("path");
  const { spawnSync } = require("child_process");
  const root = path.join(__dirname, "..");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aia-admin-mut-"));
  fs.cpSync(root, dir, { recursive: true, filter: function (src) { return !/[\\/](\.git|node_modules)$/.test(src); } });
  const run = function () {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "aia-admin-home-"));
    return spawnSync(process.execPath, [path.join(dir, "scripts/check-aia-admin.js")], {
      cwd: dir,
      env: { PATH: process.env.PATH || "", HOME: home, TMPDIR: home },
      encoding: "utf8",
      timeout: 120000
    });
  };
  let caught = 0;
  let total = 0;
  let bad = 0;
  try {
    const base = run();
    if (base.status !== 0) {
      console.error("unmutated check fails in the copy:\n" + ((base.stdout || "") + (base.stderr || "")).slice(-2500));
      process.exit(1);
    }
    console.log("UNMUTATED | PASS");
    MUTANTS.forEach(function (row) {
      const name = row[0];
      const file = row[1];
      const find = row[2];
      const repl = row[3];
      const p = path.join(dir, file);
      const orig = fs.readFileSync(p, "utf8");
      if (orig.indexOf(find) < 0) { console.log(name + " | ANCHOR GONE"); bad += 1; return; }
      if (orig.indexOf(find) !== orig.lastIndexOf(find)) { console.log(name + " | ANCHOR NOT UNIQUE"); bad += 1; return; }
      fs.writeFileSync(p, orig.replace(find, repl));
      const r = run();
      fs.writeFileSync(p, orig);
      const first = ((r.stdout || "") + "\n" + (r.stderr || "")).split("\n").find(function (l) { return l.indexOf("FAIL") === 0; }) || "";
      total += 1;
      if (r.status) { caught += 1; console.log(name + " | CAUGHT | " + first.slice(0, 180)); }
      else console.log(name + " | SURVIVED");
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log("SCORE " + caught + "/" + total + " caught" + (bad ? " (" + bad + " anchors bad)" : ""));
  process.exit(caught === total && !bad ? 0 : 1);
}

if (process.argv.indexOf("--mutate") >= 0) mutate();
else main();
