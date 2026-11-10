#!/usr/bin/env node
require("./_env-guard");
var fs = require("fs");
var path = require("path");
var root = path.resolve(__dirname, "..");
var src = fs.readFileSync(path.join(root, "theme.js"), "utf8");
var fails = [];
function ok(cond, msg) { if (!cond) fails.push(msg); }

ok(/function aiaPhoneCls\(\)/.test(src) && /matchMedia\("\(max-width: 860px\)"\)/.test(src),
  "early CLS path must be gated on matchMedia('(max-width: 860px)') at parse time");
ok(/if \(aiaPhoneCls\(\)\) \{\n    lockHeader\(\);\n    ensureFixCss\(\);/.test(src),
  "lockHeader and ensureFixCss may run before DOMContentLoaded only inside the ≤860px branch");
ok(/aiaPhoneCls\(\)\) \{[\s\S]*new MutationObserver[\s\S]*\} else if \(document\.readyState === "loading"\) document\.addEventListener\("DOMContentLoaded", mark\);/.test(src),
  "early site-nav paint (MutationObserver) must stay inside the ≤860px branch");
ok(/\} else if \(document\.readyState === "loading"\) document\.addEventListener\("DOMContentLoaded", mark\);\n  else mark\(\);/.test(src),
  "desktop (>860px) must keep main's DOMContentLoaded boot");
ok(/header, \.site-header\{display:grid!important;align-items:center!important;overflow:visible!important\}/.test(src),
  "desktop lockHeader base grid must stay the main rule (no unscoped brand-nav-tools areas)");
ok(!/grid-template-areas:\\"brand nav tools\\"/.test(src) && !/grid-template-areas:"brand nav tools"/.test(src),
  "the unscoped desktop grid must not use brand | nav | tools");
ok(/@media\(max-width:860px\)\{header,\.site-header\{grid-template-columns:minmax\(0,1fr\) auto!important;grid-template-areas:\\"brand tools\\" \\?"nav nav\\"!important\}/.test(src),
  "the final phone grid (brand tools / nav nav) belongs only in a max-width:860px query");
ok(/header \.desk-tabs a,\.desk-tabs a\{min-height:44px/.test(src),
  "desk-tab links must keep a 44px min-height in the ≤860px lock");

if (process.argv.indexOf("--mutants") >= 0 || !process.env.NO_MUTANTS) {
  var mutants = [
    {
      name: "early path not gated (always lockHeader before DCL)",
      find: "  if (aiaPhoneCls()) {\n    lockHeader();\n    ensureFixCss();",
      repl: "  if (true) {\n    lockHeader();\n    ensureFixCss();"
    },
    {
      name: "desktop loses DOMContentLoaded boot",
      find: "} else if (document.readyState === \"loading\") document.addEventListener(\"DOMContentLoaded\", mark);\n  else mark();",
      repl: "} else mark();"
    },
    {
      name: "phone grid missing from the 860px query",
      find: "grid-template-areas:\\\"brand tools\\\" \\\"nav nav\\\"",
      repl: "grid-template-columns:auto 1fr auto"
    },
    {
      name: "unscoped desktop brand-nav-tools grid",
      find: "header, .site-header{display:grid!important;align-items:center!important;overflow:visible!important}",
      repl: "header, .site-header{display:grid!important;grid-template-areas:\\\"brand nav tools\\\";align-items:center!important;overflow:visible!important}"
    }
  ];
  var caught = 0;
  mutants.forEach(function (m) {
    if (src.indexOf(m.find) < 0) {
      fails.push("mutant does not apply: " + m.name);
      return;
    }
    var next = src.split(m.find).join(m.repl);
    var bad = false;
    var why = [];
    if (/not gated/.test(m.name) && !/if \(aiaPhoneCls\(\)\) \{\n    lockHeader\(\);\n    ensureFixCss\(\);/.test(next)) { bad = true; why.push("gate gone"); }
    if (/DOMContentLoaded/.test(m.name) && !/\} else if \(document\.readyState === "loading"\) document\.addEventListener\("DOMContentLoaded", mark\);\n  else mark\(\);/.test(next)) { bad = true; why.push("desktop DCL gone"); }
    if (/860px query/.test(m.name) && !/grid-template-areas:\\"brand tools\\" \\?"nav nav\\"/.test(next)) { bad = true; why.push("phone grid gone"); }
    if (/unscoped desktop/.test(m.name) && (/grid-template-areas:\\"brand nav tools\\"/.test(next) || /grid-template-areas:"brand nav tools"/.test(next))) { bad = true; why.push("desktop grid leaked"); }
    if (bad) { caught++; console.log("ok  mutant caught: " + m.name + " (" + why.join(", ") + ")"); }
    else fails.push("mutant survived: " + m.name);
  });
  console.log("mutants caught " + caught + "/" + mutants.length);
  if (caught !== mutants.length) fails.push("expected " + mutants.length + " mutants caught, got " + caught);
}

if (fails.length) {
  fails.forEach(function (f) { console.log("FAIL " + f); });
  process.exit(1);
}
console.log("check-header-cls-early OK");
