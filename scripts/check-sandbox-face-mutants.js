#!/usr/bin/env node
require("./_env-guard");
// Mutants for scripts/check-sandbox-face.js: each escape route must be caught. Real tree never written.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const file = path.join(root, "desk-html-view.js");
const src = fs.readFileSync(file, "utf8");
const MUTANTS = [
  [
    "parent DOM: allow-same-origin",
    "var SBX = \"allow-scripts\";",
    "var SBX = \"allow-scripts allow-same-origin\";"
  ],
  [
    "cookies: same-origin on mounted frame",
    "fr.setAttribute(\"sandbox\", SBX);",
    "fr.setAttribute(\"sandbox\", SBX + \" allow-same-origin\");"
  ],
  [
    "top nav escape",
    "var SBX = \"allow-scripts\";",
    "var SBX = \"allow-scripts allow-top-navigation\";"
  ],
  [
    "network: connect-src open",
    "font-src data:; connect-src 'none'",
    "font-src data:; connect-src *"
  ],
  [
    "network: default-src open",
    "default-src 'none'",
    "default-src *"
  ],
  [
    "network: remote images",
    "img-src data: blob:",
    "img-src https: data: blob:"
  ],
  [
    "CSP meta dropped",
    "return \"<meta http-equiv=\\\"Content-Security-Policy\\\" content=\\\"\" + CSP + \"\\\">\" + String(text || \"\");",
    "return String(text || \"\");"
  ],
  [
    "src instead of srcdoc",
    "fr.srcdoc = srcdocOf(text);",
    "fr.srcdoc = srcdocOf(text); fr.setAttribute(\"src\", \"/api/upload\");"
  ],
  [
    "other cards: owner gate off",
    "if (r !== \"owner\") return false;",
    "if (false) return false;"
  ],
  [
    "other cards: own-card check off at mount",
    "if (!ownCard(box) || typeof fetch !== \"function\") {",
    "if (typeof fetch !== \"function\") {"
  ],
  [
    "author tag dropped",
    "if (by) by.textContent = \"by \" + tag;",
    ""
  ],
  [
    "Stop chrome removed",
    "\"<button type=\\\"button\\\" class=\\\"q-sbx-stop\\\" data-sbx-stop=\\\"1\\\">Stop</button>\" +",
    ""
  ],
  [
    "Kill chrome removed",
    "\"<button type=\\\"button\\\" class=\\\"q-sbx-kill\\\" data-sbx-kill=\\\"1\\\">Kill</button>\" +",
    ""
  ],
  [
    "Stop leaves face",
    "if (slot) slot.textContent = \"Stopped.\";",
    ""
  ],
  [
    "parent message channel",
    "  scan();\n",
    "  scan();\n  window.addEventListener(\"message\", function () {});\n"
  ],
  [
    "navigate-away not stopped",
    "if (++loads > 1) stop(box);",
    "++loads;"
  ],
  [
    "permissions granted",
    "fr.setAttribute(\"allow\", \"\");",
    "fr.setAttribute(\"allow\", \"camera\");"
  ],
  [
    "float-right Stop restored",
    ".q-sbx-stop,.q-sbx-kill{min-height:44px;min-width:44px;padding:10px 16px;flex:1 1 120px;margin:0}",
    ".q-sbx-stop{float:right;margin:-2px 0 6px}.q-sbx-kill{min-height:44px;min-width:44px}"
  ],
  [
    "44px touch removed",
    ".q-sbx-stop,.q-sbx-kill{min-height:44px;min-width:44px;padding:10px 16px;flex:1 1 120px;margin:0}",
    ".q-sbx-stop,.q-sbx-kill{padding:4px 8px;margin:0}"
  ],
  [
    "height cap removed",
    ".q-sbx .q-html-frame{max-height:min(36vh,280px)}",
    ".q-sbx .q-html-frame{max-height:42vh}"
  ]
];
function run(f) {
  const env = Object.assign({}, process.env); if (f) env.AIA_SBX_FILE = f; else delete env.AIA_SBX_FILE;
  return spawnSync(process.execPath, [path.join(__dirname, "check-sandbox-face.js")], { env: env, encoding: "utf8" });
}
if (run().status !== 0) { console.error("check-sandbox-face-mutants: unmutated check fails"); process.exit(1); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sbx-mut-"));
let bad = 0;
MUTANTS.forEach(function (m, i) {
  if (src.indexOf(m[1]) < 0) { console.error("text gone for mutant: " + m[0]); bad++; return; }
  const f = path.join(dir, "m" + i + ".js");
  fs.writeFileSync(f, src.replace(m[1], m[2]));
  const r = run(f);
  if (r.status === 0) { console.error("SURVIVED: " + m[0]); bad++; }
  else console.log("caught: " + m[0] + " -> " + (r.stderr.trim().split("\n")[0] || "").slice(0, 140));
});
fs.rmSync(dir, { recursive: true, force: true });
if (bad) { console.error("check-sandbox-face-mutants: " + bad + " problem(s)"); process.exit(1); }
console.log("check-sandbox-face-mutants: ok (" + MUTANTS.length + " caught)");
