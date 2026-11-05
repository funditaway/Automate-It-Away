#!/usr/bin/env node
require("./_env-guard");
// Mutants for scripts/check-owner-key-only.js. Copies the repo (no node_modules,
// no .git) and applies each regression. The check must fail. An unmodified
// copy must pass. The real tree is never written.
//   pickDrafter env fallback restored
//   connectSecret fallbacks restored in both copies
//   save allowed without AIA_CONNECT_SECRET
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const SECRET_NOW = [
  "function connectSecret() {",
  "  const s = process.env.AIA_CONNECT_SECRET;",
  "  if (!s) return null;",
  "  return crypto.createHash(\"sha256\").update(String(s)).digest();",
  "}"
].join("\n");
const SECRET_OLD = [
  "function connectSecret() {",
  "  const s = process.env.AIA_CONNECT_SECRET || process.env.BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN || process.env.XAI_API_KEY || \"aia-draft-pilot\";",
  "  return crypto.createHash(\"sha256\").update(String(s)).digest();",
  "}"
].join("\n");
const DRAFT_NOW = [
  "        source: \"desk\"",
  "      };",
  "    }",
  "  }",
  "  return null;",
  "}"
].join("\n");
const DRAFT_OLD = [
  "        source: \"desk\"",
  "      };",
  "    }",
  "  }",
  "  if (grokKey()) {",
  "    return { provider: \"grok\", vendor: \"xAI\", model: grokModel(), key: grokKey(), source: \"included\" };",
  "  }",
  "  return null;",
  "}"
].join("\n");
const SAVE_NOW = "      const keyPacked = wrapSecret(key);\n      if (!keyPacked) return refuse(res, 409, \"keyLocked\", { reason: \"needsConnectSecret\" });\n";
const SAVE_OLD = "      const keyPacked = wrapSecret(key);\n";

const MUTANTS = [
  ["pickDrafter-env-fallback", [
    ["api/_grok.js", DRAFT_NOW, DRAFT_OLD]
  ]],
  ["connectSecret-fallbacks", [
    ["api/_grok.js", SECRET_NOW, SECRET_OLD],
    ["api/connections.js", SECRET_NOW, SECRET_OLD]
  ]],
  ["save-without-connect-secret", [
    ["api/connections.js", SAVE_NOW, SAVE_OLD]
  ]]
];

function runCheck(dir, home) {
  const p = spawnSync(process.execPath, ["scripts/check-owner-key-only.js"], {
    cwd: dir,
    env: { PATH: process.env.PATH || "/usr/bin:/bin", HOME: home, TMPDIR: os.tmpdir() },
    encoding: "utf8",
    timeout: 120000
  });
  const out = (p.stdout || "") + (p.stderr || "");
  const first = (out.split("\n").find(function (l) { return l.indexOf("FAIL") === 0; }) || (p.error ? String(p.error.message) : "")).slice(0, 200);
  return { code: p.status == null ? 1 : p.status, first: first };
}

function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aia-owner-key-mut-"));
  const dir = path.join(tmp, "repo");
  const home = path.join(tmp, "home");
  fs.mkdirSync(home);
  fs.cpSync(root, dir, {
    recursive: true,
    filter: function (src) { return !/[\\/]node_modules$/.test(src) && !/[\\/]\.git$/.test(src); }
  });
  const orig = {};
  ["api/_grok.js", "api/connections.js"].forEach(function (rel) {
    orig[rel] = fs.readFileSync(path.join(dir, rel), "utf8");
  });
  function restore() {
    Object.keys(orig).forEach(function (rel) {
      fs.writeFileSync(path.join(dir, rel), orig[rel]);
    });
  }

  let bad = 0;
  let caught = 0;
  try {
    const base = runCheck(dir, home);
    const controlOk = base.code === 0;
    console.log("CONTROL | " + (controlOk ? "PASS" : "FAIL") + (controlOk ? "" : " | " + base.first));
    if (!controlOk) bad += 1;

    MUTANTS.forEach(function (row) {
      const id = row[0];
      const edits = row[1];
      restore();
      let noop = "";
      edits.forEach(function (edit) {
        const rel = edit[0];
        const find = edit[1];
        const repl = edit[2];
        const text = fs.readFileSync(path.join(dir, rel), "utf8");
        const hits = text.split(find).length - 1;
        if (hits !== 1) noop = rel + " found " + hits;
        else fs.writeFileSync(path.join(dir, rel), text.replace(find, repl));
      });
      if (noop) {
        bad += 1;
        console.log(id + " | NOOP | " + noop);
        return;
      }
      const r = runCheck(dir, home);
      if (r.code !== 0) {
        caught += 1;
        console.log(id + " | CAUGHT | " + r.first);
      } else {
        bad += 1;
        console.log(id + " | SURVIVED");
      }
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log("SCORE " + caught + "/" + MUTANTS.length + " caught");
  const control = bad === 0 && caught === MUTANTS.length ? "PASS" : "FAIL";
  console.log("CONTROL " + control);
  process.exitCode = control === "PASS" ? 0 : 1;
}

main();
