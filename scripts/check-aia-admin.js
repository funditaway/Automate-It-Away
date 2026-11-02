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

// Platform/reviewer handles: after NFKC, any non-ASCII is refused, and a
// string NFKC rewrites (fullwidth, NBSP) is refused. Then the ASCII
// normalize above must be exactly "aia". Written here, not imported.
function oracleHasNonAscii(value) {
  const raw = String(value || "");
  const nfkc = raw.normalize("NFKC");
  if (/[^\u0000-\u007F]/.test(nfkc)) return true;
  if (nfkc !== raw) return true;
  return false;
}
function oraclePlatformHandle(value) {
  if (oracleHasNonAscii(value)) return "";
  return oracleNormalize(String(value || "").normalize("NFKC"));
}

// Same decision as isPlatformAccount: id "aia", heldBy "admin", aiaReviewer
// strictly true, or the first of handle / xHandle / slug that is an ASCII
// platform handle. Explicit flags are not lookalikes.
function oracle(acc) {
  if (!acc) return false;
  if (acc.id === "aia") return true;
  if (acc.heldBy === "admin") return true;
  if (acc.aiaReviewer === true) return true;
  return oraclePlatformHandle(acc.handle || acc.xHandle || acc.slug) === "aia";
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

// Hand-checked forms. True means an ASCII platform handle, exactly "aia"
// after the existing normalize. Lookalikes are false.
function lookalikeSamples() {
  const out = [];
  function push(s) { out.push(s); }
  const marks = [];
  for (let cp = 0x0300; cp <= 0x036F; cp++) marks.push(String.fromCharCode(cp));
  marks.forEach(function (m) {
    push("a" + m + "ia");
    push("ai" + m + "a");
    push("aia" + m);
    push(m + "aia");
    push("funditaway" + m);
  });
  ["\u00C4", "\u00E4", "\u00C1", "\u00E1", "\u00C0", "\u00E0", "\u00C2", "\u00E2", "\u00C3", "\u00E3", "\u00C5", "\u00E5", "\u00C9", "\u00E9"].forEach(function (ch) {
    push(ch + "IA");
    push(ch + "ia");
    push("aia" + ch);
    push(ch + "utomateitaway");
  });
  ["\uFF21\uFF29\uFF21", "\uFF41\uFF49\uFF41", "\uFF21IA", "\uFF41ia", "\uFF26unditaway"].forEach(push);
  ["\u0430ia", "a\u0456a", "ai\u0430", "aia\u0430", "\u0391IA", "\u03B1ia", "\u03BFi\u03B1", "\u0430utomateitaway"].forEach(push);
  ["\u200B", "\u200C", "\u200D", "\uFEFF", "\u00A0", "\u2060"].forEach(function (z) {
    push(z + "aia");
    push("a" + z + "ia");
    push("aia" + z);
    push("@AIA" + z);
    push("funditaway" + z);
  });
  return out;
}

// Every non-ASCII scalar, in front of, inside, and after "aia" and "AIA".
// isAiaReviewer(account, desk) runs isPlatformAccount on the handle and
// isReviewerDesk on the slug and the name, so one call covers all three.
// Lone surrogates are skipped. One call per form. The sweep measures about
// 2 seconds (1.8s on this checker).
function assertEveryNonAscii(admin) {
  const acc = { handle: "" };
  const row = { slug: "", name: "" };
  for (let cp = 0x80; cp <= 0x10FFFF; cp++) {
    if (cp >= 0xD800 && cp <= 0xDFFF) continue;
    const ch = String.fromCodePoint(cp);
    const forms = [ch + "aia", "a" + ch + "ia", "aia" + ch, ch + "AIA", "A" + ch + "IA", "AIA" + ch];
    for (let i = 0; i < 6; i++) {
      const s = forms[i];
      acc.handle = s;
      row.slug = s;
      row.name = s;
      // isPlatformAccount(handle), then isReviewerDesk(slug and name).
      if (admin.isAiaReviewer(acc, row, null) === true) {
        return "U+" + cp.toString(16).toUpperCase() + " form " + i + " counts";
      }
    }
  }
  return "";
}
const KNOWN = [
  ["aia", true], ["AIA", true], ["Aia", true], ["aIa", true], ["aiA", true],
  ["aia.aia", true], ["AIA.aia", true], ["aia.AIA", true], ["@AIA", true], ["@aia", true],
  ["@@AIA", true], ["  aia  ", true], ["  @AIA", true], ["\t@AiA\n", true],
  ["a.i.a", true], ["A I A", true],   ["aia!!!", true],
  ["@aia.aia", true], ["  @@aia.aia  ", true],
  ["", false], [" ", false], ["@", false], [".aia", false], ["ai", false], ["a", false],
  ["aia2", false], ["aiaa", false], ["aaia", false], ["xaia", false], ["aia-shop", false],
  ["aia_", false], ["aia.aia.aia", false], ["zz-probe", false], ["q7-probe", false],
  ["q8-probe", false], ["springfield-shop", false], ["james", false], ["funditaway", false],
  ["not-aia", false], ["AIA2", false], ["aia.com", false], ["a_ia", false], ["a-ia", false],
  ["AIA.AIA.AIA", false], ["x.aia", false], ["@.aia", false], ["aia.aiax", false],
  ["\u0430ia", false], ["\uFF21IA", false], ["\uFF41\uFF49\uFF41", false],
  ["\uFF21\uFF29\uFF21", false], ["a\u0301ia", false], ["ai\u0301a", false], ["aia\u0301", false],
  ["\u200baia", false], ["aia\u0430", false], ["\u00C4IA", false], ["\u00E4ia", false],
  ["\u00A0aia", false], ["aia\u00A0", false], ["\u0391IA", false], ["\u03B1ia", false],
  ["a".repeat(31), false], ["b".repeat(31), false],
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
  lookalikeSamples().forEach(add);
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
    const got = oraclePlatformHandle(row[0]) === "aia";
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
      const rev = admin.isAiaReviewer(acc, null, null) === true;
      const w = oracle(acc) === true;
      if (g !== w) mismatches.push(field + " " + JSON.stringify(h) + " module " + g + " oracle " + w);
      if (rev !== w) mismatches.push("reviewer " + field + " " + JSON.stringify(h) + " module " + rev + " oracle " + w);
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
    let rev = false;
    try { g = admin.isPlatformAccount(acc) === true; } catch (e) { mismatches.push("module threw on account " + i); return; }
    try { rev = admin.isAiaReviewer(acc, null, null) === true; } catch (e) { mismatches.push("reviewer threw on account " + i); return; }
    try { w = oracle(acc) === true; } catch (e) { mismatches.push("oracle threw on account " + i); return; }
    if (g !== w) mismatches.push("account " + i + " " + JSON.stringify(acc) + " module " + g + " oracle " + w);
    if (rev !== w) mismatches.push("reviewer account " + i + " " + JSON.stringify(acc) + " module " + rev + " oracle " + w);
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
    "  const handle = normalizeHandle(String(value || \"\").normalize(\"NFKC\"));\n  return handle === \"aia\";",
    "  const handle = normalizeHandle(String(value || \"\").normalize(\"NFKC\"));\n  if (handle.length > 30) return true;\n  return handle === \"aia\";"],
  ["case-folding",
    "return String(value || \"\").trim().replace(/^@+/, \"\").replace(/\\.aia$/i, \"\").toLowerCase().replace(/[^a-z0-9_-]+/g, \"\").slice(0, 40);",
    "return String(value || \"\").trim().replace(/^@+/, \"\").replace(/\\.aia$/i, \"\").replace(/[^a-z0-9_-]+/g, \"\").slice(0, 40);"],
  ["isAiaReviewer zz-probe",
    "  if (isPlatformAccount(acc)) return true;\n  if (isReviewerDesk(row)) return true;",
    "  if (isPlatformAccount(acc)) return true;\n  if (acc && normalizeHandle(acc.handle) === \"zz-probe\") return true;\n  if (isReviewerDesk(row)) return true;"],
  ["drop lookalike reject",
    "  if (/[^\\u0000-\\u007F]/.test(nfkc)) return true;\n  if (nfkc !== raw) return true;\n",
    "  return false;\n"],
  ["drop nfkc non-ascii test",
    "  if (/[^\\u0000-\\u007F]/.test(nfkc)) return true;\n",
    ""],
  ["drop nfkc fold test",
    "  if (nfkc !== raw) return true;\n",
    ""],
  ["drop platform guard",
    "  if (hasNonAsciiHandle(value)) return false;\n",
    ""],
  ["min handle length 1",
    "if (handle.length < 2)",
    "if (handle.length < 1)"],
  ["strip all bidi",
    'const raw = String(value || "");',
    'const raw = String(value || "").replace(/[\\u061C\\u200E\\u200F\\u202A-\\u202E\\u2066-\\u2069]/g, "");'],
  ["strip lrm rlm",
    'const raw = String(value || "");',
    'const raw = String(value || "").replace(/[\\u200E\\u200F]/g, "");'],
  ["strip bidi embeddings",
    'const raw = String(value || "");',
    'const raw = String(value || "").replace(/[\\u202A-\\u202E]/g, "");'],
  ["strip wide spaces",
    'const raw = String(value || "");',
    'const raw = String(value || "").replace(/[\\u2000-\\u200A\\u3000]/g, "");'],
  ["strip variation selectors",
    'const raw = String(value || "");',
    'const raw = String(value || "").replace(/[\\uFE00-\\uFE0F]/g, "").replace(/[\\u{E0100}-\\u{E01EF}]/gu, "");'],
  ["strip soft hyphen",
    'const raw = String(value || "");',
    'const raw = String(value || "").replace(/\\u00AD/g, "");'],
  ["strip mongolian and invisibles",
    'const raw = String(value || "");',
    'const raw = String(value || "").replace(/[\\u180E\\u2061-\\u2064]/g, "");']
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

function stageAdmin(text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aia-admin-mod-"));
  const apiDir = path.join(dir, "api");
  fs.mkdirSync(apiDir);
  const realApi = path.join(__dirname, "..", "api");
  fs.readdirSync(realApi).forEach(function (name) {
    if (name === "_aia-admin.js") return;
    fs.symlinkSync(path.join(realApi, name), path.join(apiDir, name));
  });
  const copy = path.join(apiDir, "_aia-admin.js");
  fs.writeFileSync(copy, text);
  return { dir: dir, copy: copy };
}

function assertHandleLength(admin) {
  const one = admin.setAccountHandle({ id: "acct_len1" }, "q");
  if (!one || one.ok !== false || one.status !== 400) return "one-letter handle was accepted";
  const two = admin.setAccountHandle({ id: "acct_len2" }, "qq");
  if (!two || two.ok !== true || two.handle !== "qq") return "two-letter handle was rejected";
  return "";
}

function assertLookalikes(admin) {
  const bad = [];
  lookalikeSamples().forEach(function (h) {
    const acc = { handle: h };
    if (admin.isPlatformAccount(acc) === true) bad.push("admin " + JSON.stringify(h));
    if (admin.isAiaReviewer(acc, null, null) === true) bad.push("reviewer " + JSON.stringify(h));
    if (admin.isAiaReviewer(null, { slug: h }, null) === true) bad.push("slug " + JSON.stringify(h));
    if (admin.isAiaReviewer(null, { biz: h }, null) === true) bad.push("biz " + JSON.stringify(h));
    if (admin.isAiaReviewer(null, { name: h }, null) === true) bad.push("name " + JSON.stringify(h));
    if (admin.isAiaReviewer(null, null, { handle: h }) === true) bad.push("person " + JSON.stringify(h));
    if (oracle(acc) === true) bad.push("oracle " + JSON.stringify(h));
  });
  if (admin.isPlatformAccount({ handle: "aia" }) !== true) bad.push("ascii aia");
  if (admin.isPlatformAccount({ handle: "AIA" }) !== true) bad.push("ascii AIA");
  if (admin.isPlatformAccount({ handle: "aia.aia" }) !== true) bad.push("aia.aia");
  if (admin.isPlatformAccount({ xHandle: "@AIA" }) !== true) bad.push("@AIA");
  if (admin.isAiaReviewer(null, { slug: "aia" }, null) !== true) bad.push("desk aia");
  if (admin.isAiaReviewer(null, { slug: "funditaway" }, null) !== true) bad.push("desk funditaway");
  if (admin.isAiaReviewer(null, { name: "Fund It Away" }, null) !== true) bad.push("ascii fund it away");
  return bad;
}

function runMutants() {
  const raw = fs.readFileSync(SOURCE, "utf8");
  const orig = raw.replace(/\r\n/g, "\n");
  const staged = stageAdmin(orig);
  const dir = staged.dir;
  const copy = staged.copy;
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
  else pass("isPlatformAccount and isAiaReviewer match the oracle on " + result.corpus + " handles; accepting set is exactly the ASCII forms that normalize to aia (" + result.accepted + ")");

  const sweep = assertEveryNonAscii(admin);
  if (sweep) fail("non-ascii sweep " + sweep);
  else pass("every non-ASCII scalar in, before, or after aia/AIA is not admin or reviewer");

  const look = assertLookalikes(admin);
  if (look.length) fail("lookalike " + look.slice(0, 6).join("; "));
  else pass("combining marks, accents, fullwidth, homoglyphs, zero-width, and NBSP are not admin or reviewer");

  const lenMsg = assertHandleLength(admin);
  if (lenMsg) fail(lenMsg);
  else pass("handle minimum stays two letters");

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
  const admin = require(process.env.AIA_ADMIN_MODULE);
  const sweep = assertEveryNonAscii(admin);
  if (sweep) {
    console.error("FAIL non-ascii sweep " + sweep);
    process.exit(1);
  }
  const look = assertLookalikes(admin);
  if (look.length) {
    console.error("FAIL lookalike " + look.slice(0, 4).join("; "));
    process.exit(1);
  }
  const lenMsg = assertHandleLength(admin);
  if (lenMsg) {
    console.error("FAIL " + lenMsg);
    process.exit(1);
  }
  const result = fuzz(admin);
  if (!result.ok) {
    console.error("FAIL oracle " + result.mismatches.slice(0, 4).join("; "));
    process.exit(1);
  }
  console.log("ok  oracle match " + result.corpus + " handles, " + result.accepted + " accepted");
  process.exit(0);
}

main();
