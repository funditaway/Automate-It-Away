require("./_env-guard");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

function fail(msg) { console.error("FAIL " + msg); process.exitCode = 1; }
function pass(msg) { console.log("ok  " + msg); }

// Same steps as api/_aia-admin.js normalizeHandle, written here so a mutant
// of that file cannot move the oracle with it.
function oracleNormalize(value) {
  return String(value || "").trim().replace(/^@+/, "").replace(/\.aia$/i, "").toLowerCase().replace(/[^a-z0-9_-]+/g, "").slice(0, 40);
}

// Same decision as isPlatformAccount: id "aia", heldBy "admin", aiaReviewer
// strictly true, or the first of handle / xHandle / slug normalizing to "aia".
function oracle(acc) {
  if (!acc) return false;
  if (acc.id === "aia") return true;
  if (acc.heldBy === "admin") return true;
  if (acc.aiaReviewer === true) return true;
  return oracleNormalize(acc.handle || acc.xHandle || acc.slug) === "aia";
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hand-checked forms. True means the normalized handle is exactly "aia".
const KNOWN = [
  ["aia", true], ["AIA", true], ["Aia", true], ["aIa", true], ["aiA", true],
  ["aia.aia", true], ["AIA.aia", true], ["aia.AIA", true], ["@AIA", true], ["@aia", true],
  ["@@AIA", true], ["  aia  ", true], ["  @AIA", true], ["\t@AiA\n", true],
  ["a.i.a", true], ["A I A", true], ["aia!!!", true], ["\u200baia", true],
  ["@aia.aia", true], ["  @@aia.aia  ", true], ["aia\u0430", true],
  ["", false], [" ", false], ["@", false], [".aia", false], ["ai", false], ["a", false],
  ["aia2", false], ["aiaa", false], ["aaia", false], ["xaia", false], ["aia-shop", false],
  ["aia_", false], ["aia.aia.aia", false], ["zz-probe", false], ["q7-probe", false],
  ["q8-probe", false], ["springfield-shop", false], ["james", false], ["funditaway", false],
  ["not-aia", false], ["AIA2", false], ["aia.com", false], ["a_ia", false], ["a-ia", false],
  ["AIA.AIA.AIA", false], ["x.aia", false], ["@.aia", false], ["aia.aiax", false],
  ["\u0430ia", false], ["a".repeat(31), false], ["b".repeat(31), false],
  ["b".repeat(30), false], ["c".repeat(40), false], ["c".repeat(41), false],
  ["Q8-PROBE", false], ["q8-probe.aia", false], ["@q8-probe", false]
];

function buildCorpus() {
  const seen = {};
  const out = [];
  function add(h) {
    const s = String(h);
    if (Object.prototype.hasOwnProperty.call(seen, s)) return;
    seen[s] = true;
    out.push(s);
  }
  KNOWN.forEach(function (row) { add(row[0]); });
  const gap = ["", ".", " ", "!", "\u200b"];
  const letter = [["a", "A"], ["i", "I"], ["a", "A"]];
  for (let i = 0; i < letter[0].length; i++) {
    for (let j = 0; j < letter[1].length; j++) {
      for (let k = 0; k < letter[2].length; k++) {
        for (let w = 0; w < gap.length; w++) {
          for (let x = 0; x < gap.length; x++) {
            for (let y = 0; y < gap.length; y++) {
              for (let z = 0; z < gap.length; z++) {
                add(gap[w] + letter[0][i] + gap[x] + letter[1][j] + gap[y] + letter[2][k] + gap[z]);
              }
            }
          }
        }
      }
    }
  }
  ["", " ", "@", "@@", "  @"].forEach(function (pre) {
    ["", ".aia", ".AIA", ".aia.aia"].forEach(function (suf) {
      add(pre + "aia" + suf);
      add(pre + "AIA" + suf);
      add(pre + "q8-probe" + suf);
      add(pre + "b".repeat(31) + suf);
    });
  });
  const rnd = mulberry32(0xa1a);
  const chars = "aAiI@._- \t\n!#xz09\u00e9\u200b\u0430\uff21qQ8pb";
  for (let n = 0; n < 2500; n++) {
    const len = n % 48;
    let s = "";
    for (let i = 0; i < len; i++) s += chars.charAt(Math.floor(rnd() * chars.length));
    add(s);
  }
  add("q8-probe");
  add("b".repeat(31));
  add("AIA");
  return out;
}

function fuzz(admin) {
  const mismatches = [];
  KNOWN.forEach(function (row) {
    const got = oracleNormalize(row[0]) === "aia";
    if (got !== row[1]) mismatches.push("oracle spec " + JSON.stringify(row[0]) + " got " + got + " want " + row[1]);
  });
  const corpus = buildCorpus();
  const fields = ["handle", "xHandle", "slug"];
  const accepted = {};
  const expected = {};
  fields.forEach(function (field) { accepted[field] = []; expected[field] = []; });
  corpus.forEach(function (h) {
    const want = oracleNormalize(h) === "aia";
    fields.forEach(function (field) {
      const acc = {};
      acc[field] = h;
      const g = admin.isPlatformAccount(acc) === true;
      const w = oracle(acc) === true;
      if (g !== w) mismatches.push(field + " " + JSON.stringify(h) + " module " + g + " oracle " + w);
      if (g) accepted[field].push(h);
      if (w) expected[field].push(h);
    });
  });
  fields.forEach(function (field) {
    if (accepted[field].join("\n") !== expected[field].join("\n")) {
      mismatches.push(field + " accepting set is not exactly the forms that normalize to aia");
    }
  });
  if (accepted.handle.join("\n") !== accepted.xHandle.join("\n") || accepted.handle.join("\n") !== accepted.slug.join("\n")) {
    mismatches.push("handle, xHandle, and slug accepting sets differ");
  }
  const ids = [undefined, "", "aia", "AIA", "ai", "admin", "aia ", "q8-probe"];
  const held = [undefined, "", "admin", "Admin", "ADMIN", "owner", "aia"];
  const revs = [undefined, true, false, "true", 1, 0];
  const rnd = mulberry32(0x0dd0);
  const accounts = [];
  for (let i = 0; i < 2000; i++) {
    const acc = {};
    if (rnd() < 0.7) acc.handle = corpus[Math.floor(rnd() * corpus.length)];
    if (rnd() < 0.4) acc.xHandle = corpus[Math.floor(rnd() * corpus.length)];
    if (rnd() < 0.4) acc.slug = corpus[Math.floor(rnd() * corpus.length)];
    if (rnd() < 0.35) acc.id = ids[Math.floor(rnd() * ids.length)];
    if (rnd() < 0.35) acc.heldBy = held[Math.floor(rnd() * held.length)];
    if (rnd() < 0.35) acc.aiaReviewer = revs[Math.floor(rnd() * revs.length)];
    accounts.push(acc);
  }
  accounts.push(
    null, undefined, { id: "aia" }, { id: "AIA" }, { id: "aia", handle: "shop" },
    { heldBy: "admin" }, { heldBy: "Admin" }, { heldBy: "admin", handle: "nope" },
    { aiaReviewer: true }, { aiaReviewer: false }, { aiaReviewer: "true" }, { aiaReviewer: 1 },
    {}, { handle: "", xHandle: "aia" }, { handle: "shop", xHandle: "aia" },
    { handle: " ", xHandle: "aia" }, { slug: "aia" }, { xHandle: "@AIA" },
    { handle: "q8-probe" }, { handle: "b".repeat(31) }, { handle: "AIA" }
  );
  const accGot = [];
  const accWant = [];
  accounts.forEach(function (acc, i) {
    let g = false;
    let w = false;
    try { g = admin.isPlatformAccount(acc) === true; } catch (e) { mismatches.push("module threw on account " + i); return; }
    try { w = oracle(acc) === true; } catch (e) { mismatches.push("oracle threw on account " + i); return; }
    if (g !== w) mismatches.push("account " + i + " " + JSON.stringify(acc) + " module " + g + " oracle " + w);
    if (g) accGot.push(i);
    if (w) accWant.push(i);
  });
  if (accGot.join(",") !== accWant.join(",")) mismatches.push("account accepting set is not exactly the expected forms");
  return {
    ok: mismatches.length === 0 && corpus.length >= 3000 && accepted.handle.length > 0,
    mismatches: mismatches,
    corpus: corpus.length,
    accepted: accepted.handle.length
  };
}

const SOURCE = path.join(__dirname, "..", "api", "_aia-admin.js");
const MUTANTS = [
  ["accept q8-probe",
    '  return handle === "aia";',
    '  return handle === "aia" || handle === "q8-probe";'],
  ["length>30 accept",
    "  const handle = normalizeHandle(acc.handle || acc.xHandle || acc.slug);\n  return handle === \"aia\";",
    "  const handle = normalizeHandle(acc.handle || acc.xHandle || acc.slug);\n  if (handle.length > 30) return true;\n  return handle === \"aia\";"],
  ["case-folding",
    "return String(value || \"\").trim().replace(/^@+/, \"\").replace(/\\.aia$/i, \"\").toLowerCase().replace(/[^a-z0-9_-]+/g, \"\").slice(0, 40);",
    "return String(value || \"\").trim().replace(/^@+/, \"\").replace(/\\.aia$/i, \"\").replace(/[^a-z0-9_-]+/g, \"\").slice(0, 40);"]
];

function runModule(modulePath) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "aia-admin-home-"));
  const r = spawnSync(process.execPath, [__filename], {
    cwd: path.join(__dirname, ".."),
    env: {
      PATH: process.env.PATH || "",
      HOME: home,
      TMPDIR: home,
      AIA_ADMIN_MODULE: modulePath
    },
    encoding: "utf8",
    timeout: 120000
  });
  fs.rmSync(home, { recursive: true, force: true });
  return r;
}

function runMutants() {
  const orig = fs.readFileSync(SOURCE, "utf8");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aia-admin-mod-"));
  const copy = path.join(dir, "_aia-admin.js");
  let caught = 0;
  let total = 0;
  let bad = 0;
  try {
    fs.writeFileSync(copy, orig);
    const base = runModule(copy);
    if (base.status !== 0) {
      console.error("unmutated module copy failed the oracle:\n" + ((base.stdout || "") + (base.stderr || "")).slice(-2500));
      process.exitCode = 1;
      return;
    }
    pass("unmutated module copy matches the oracle");
    MUTANTS.forEach(function (row) {
      const name = row[0];
      const find = row[1];
      const repl = row[2];
      if (orig.indexOf(find) < 0) { console.error("FAIL " + name + " anchor gone"); bad += 1; process.exitCode = 1; return; }
      if (orig.indexOf(find) !== orig.lastIndexOf(find)) { console.error("FAIL " + name + " anchor not unique"); bad += 1; process.exitCode = 1; return; }
      const next = orig.replace(find, repl);
      if (next === orig) { console.error("FAIL " + name + " changed nothing"); bad += 1; process.exitCode = 1; return; }
      fs.writeFileSync(copy, next);
      const r = runModule(copy);
      fs.writeFileSync(copy, orig);
      const out = (r.stdout || "") + "\n" + (r.stderr || "");
      const first = out.split("\n").find(function (l) { return l.indexOf("FAIL") === 0; }) || "";
      total += 1;
      if (r.status && first.indexOf("FAIL") === 0) {
        caught += 1;
        console.log(name + " | CAUGHT | " + first.slice(0, 180));
      } else {
        console.error("FAIL " + name + " | SURVIVED");
        process.exitCode = 1;
      }
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log("SCORE " + caught + "/" + total + " caught" + (bad ? " (" + bad + " anchors bad)" : ""));
  if (caught !== total || bad) process.exitCode = 1;
}

function main() {
  const admin = require("../api/_aia-admin");
  if (admin.normalizeHandle("@AIA") !== "aia") fail("normalize @AIA");
  else pass("normalize @AIA -> aia");

  if (!admin.isReservedHandle("AIA") || !admin.isReservedHandle("@automateitaway") || !admin.isReservedHandle("ai")) fail("reserved handles");
  else pass("aia, ai, and automateitaway are reserved");

  if (admin.isReservedHandle("oddo-books")) fail("shop handle should not be reserved");
  else pass("shop handles stay free");

  const platform = admin.stampAdminAccount({ id: "aia", name: "Automate It Away", heldBy: "admin", ownerName: "James Oddo" });
  if (!admin.isPlatformAccount(platform) || !admin.isAiaReviewer(platform, null, null) || platform.handle !== "aia") fail("platform stamp");
  else pass("platform admin stamps handle aia + reviewer");

  const result = fuzz(admin);
  if (!result.ok) fail("platform oracle " + result.mismatches.slice(0, 8).join("; "));
  else pass("isPlatformAccount matches the oracle on " + result.corpus + " handles; accepting set is exactly the forms that normalize to aia (" + result.accepted + ")");

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
  runMutants();
  if (process.exitCode) {
    console.error("check-aia-admin failed");
    process.exit(1);
  }
  console.log("check-aia-admin passed");
}

if (process.env.AIA_ADMIN_MODULE) {
  const result = fuzz(require(process.env.AIA_ADMIN_MODULE));
  if (!result.ok) {
    console.error("FAIL oracle " + result.mismatches.slice(0, 4).join("; "));
    process.exit(1);
  }
  console.log("ok  oracle match " + result.corpus + " handles, " + result.accepted + " accepted");
  process.exit(0);
}

main();
