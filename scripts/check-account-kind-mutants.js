#!/usr/bin/env node
require("./_env-guard");
// Mutant runner for scripts/check-account-kind.js (not in the npm test line).
// Copies the repo (no .git, no node_modules) to a temp dir, applies each mutant
// below to the api/ files there, runs check-account-kind.js with a stripped env
// (PATH and a temp HOME only; no keys, no network), and reports caught/total.
// The real tree is never written. Exit 1 if any mutant survives or no longer
// applies (its text is gone), or if the unmutated check fails.
// Usage: node scripts/check-account-kind-mutants.js [name-filter]
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
// [name, [[file, find, replace], ...]]. find must occur in file; first hit is replaced.
const MUTANTS = [
  ["M1 self-lock ai only (SI free)", [
    ["api/_account-settings.js", "return kindOf(acc) !== \"human\";", "return kindOf(acc) === \"ai\";"]]],
  ["M2 forSeat skips isOwner", [
    ["api/_account-settings.js", "if (!lib.isOwner(seat.person) || kindOf(seat.account) !== \"human\") return no;", "if (kindOf(seat.account) !== \"human\") return no;"]]],
  ["M3 forSeat skips human-owner kind", [
    ["api/_account-settings.js", "if (!lib.isOwner(seat.person) || kindOf(seat.account) !== \"human\") return no;", "if (!lib.isOwner(seat.person)) return no;"]]],
  ["M4 forSeat pause-off on desks owner doesn't own", [
    ["api/_account-settings.js", "madeF = lib.slugify(str(setF.desk)) !== seat.row.slug || !ownerDesk.length ?", "madeF = false ?"],
    ["api/_account-settings.js", "applyAutomation(tgt.account, setF, { byHumanOwner: true, desks: ownerDesk })", "applyAutomation(tgt.account, setF, { byHumanOwner: true, desks: lib.mem.workspaces })"]]],
  ["M5 drop refusal history line", [
    ["api/_account-settings.js", "    addHistory(acc, person, sec, made.record, whoKind);\n", ""]]],
  ["M6 case-sensitive lock", [
    ["api/_account-settings.js", "if (wantKind && wantKind !== kindOf(acc) && selfLocked(acc) && !(opts && opts.byHumanOwner)) {", "if (ACCOUNT_KINDS.indexOf(set.kind) >= 0 && wantKind !== kindOf(acc) && selfLocked(acc) && !(opts && opts.byHumanOwner)) {"]]],
  ["M7 re-widen AI scope", [
    ["api/_account-settings.js", "function ownedDesks(acc) {\n  const slugs = acc.desks || [];", "function ownedDesks(acc) {\n  const slugs = [].concat(acc.desks || [], kindOf(acc) !== \"human\" ? (acc.memberDesks || []) : []);"]]],
  ["M8 stop writes with no scope", [
    ["api/_account-settings.js", "  if (ALWAYS_STEPS.indexOf(step) >= 0) {\n", "  if (ALWAYS_STEPS.indexOf(step) >= 0) { const w = (lib.mem.workspaces || []).find((x) => x.slug === lib.slugify(str(body.desk))); if (w) w.stoppedBy = acc.id; }\n  if (ALWAYS_STEPS.indexOf(step) >= 0) {\n"]]],
  ["M9 pause-off self-lock removed", [
    ["api/_account-settings.js", "if (offs.length && selfLocked(acc) && !(opts && opts.byHumanOwner)) {", "if (false) {"]]],
  ["M10 forSeat may target human seats", [
    ["api/_account-settings.js", "if (!target || target.id === seat.account.id || !selfLocked(target))", "if (!target || target.id === seat.account.id)"]]],
  ["M11 forSeat reply leaks target account", [
    ["api/_account-settings.js", "seat: { id: tgt.seatId, kind: kindOf(tgt.account) } }", "seat: { id: tgt.seatId, kind: kindOf(tgt.account), email: tgt.account.email, settings: tgt.account.settings } }"]]],
  ["M12 si never pauses", [
    ["api/_account-settings.js", "if (k !== \"ai\" && k !== \"si\") return false;", "if (k !== \"ai\") return false;"]]],
  ["M13 whoKind dropped", [
    ["api/_account-settings.js", "    whoKind: whoKind || stamp.whoKind,\n", ""]]],
  ["M14 spend 200 when pause off", [
    ["api/_account-settings.js", "  if (step === \"spend\") {\n    return { ok: false, status: 409,", "  if (step === \"spend\" && false) {\n    return { ok: false, status: 409,"]]],
  ["M15 kind lock trusts byHumanOwner", [
    ["api/_account-settings.js", "applyProfile(acc, set);", "applyProfile(acc, set, { byHumanOwner: true });"]]],
  ["M16 forSeat id case-insensitive/trimmed", [
    ["api/_account-settings.js", "(x) => x && x.id === id && !lib.isOwner(x)", "(x) => x && String(x.id).toLowerCase() === id.trim().toLowerCase() && !lib.isOwner(x)"]]],
  ["M17 secrets reply includes sealed", [
    ["api/_account-settings.js", ".map((s) => ({ name: s.name, set: true, updatedAt: s.updatedAt || s.createdAt || \"\" }));", ".map((s) => ({ name: s.name, set: true, updatedAt: s.updatedAt || s.createdAt || \"\", sealed: s.sealed }));"]]],
  ["M18 owner profile path allows name", [
    ["api/_account-settings.js", "const badF = onlyKeys(setF, [\"kind\"]);", "const badF = onlyKeys(setF, [\"kind\", \"name\"]);"]]],
  ["N1 forSeat accepts waiting/denied seats", [
    ["api/_account-settings.js", "  if (same.some((x) => x.status !== \"approved\")) return", "  if (false) return"]]],
  ["N2 forSeat refuses only waiting (denied passes)", [
    ["api/_account-settings.js", "same.some((x) => x.status !== \"approved\")", "same.some((x) => x.status === \"pending\")"]]],
  ["N3 forSeat refuses only denied (waiting passes)", [
    ["api/_account-settings.js", "same.some((x) => x.status !== \"approved\")", "same.some((x) => x.status === \"denied\")"]]],
  ["N4 forSeat may change kind again", [
    ["api/_account-settings.js", "      if (badF || setF.kind == null) madeF = { ok: false, status: 400, error: \"For an AI or SI seat, only stop-before can change here.\" };\n      else {", "      if (badF || setF.kind == null) madeF = { ok: false, status: 400, error: \"For an AI or SI seat, only stop-before can change here.\" };\n      else if (true) madeF = applyProfile(tgt.account, setF, { byHumanOwner: true });\n      else {"]]],
  ["N5 forSeat kind refusal writes no history", [
    ["api/_account-settings.js", "        addHistory(tgt.account, person, \"profile\", \"Refused: the owner of \"", "        (() => 0)(tgt.account, person, \"profile\", \"Refused: the owner of \""]]],
  ["N6 forSeat kind refusal is 200-ish (ok true)", [
    ["api/_account-settings.js", "madeF = { ok: false, status: 403, error: FOR_SEAT_KIND };", "madeF = { ok: true, what: FOR_SEAT_KIND };"]]],
  ["N7 forSeat pause lands on every desk key", [
    ["api/_account-settings.js", "  all[key] = { stopBefore: now, updatedAt: new Date().toISOString() };", "  all[key] = { stopBefore: now, updatedAt: new Date().toISOString() };\n  if (opts && opts.byHumanOwner) Object.keys(all).forEach((k2) => { all[k2] = { stopBefore: Object.assign({}, now), updatedAt: new Date().toISOString() }; });"]]],
  ["N8 forSeat pause also edits other fields (kind)", [
    ["api/_account-settings.js", "  all[key] = { stopBefore: now, updatedAt: new Date().toISOString() };", "  all[key] = { stopBefore: now, updatedAt: new Date().toISOString() };\n  if (opts && opts.byHumanOwner) acc.kind = \"human\";"]]],
  ["N9 kind object String() again (accountKindFrom)", [
    ["api/_account-settings.js", "  if (typeof value !== \"string\") return null;\n  const k = value.trim().toLowerCase();", "  const k = String(value).trim().toLowerCase();"]]],
  ["N10 str() stringifies objects", [
    ["api/_account-settings.js", "return typeof v === \"string\" ? v : typeof v === \"number\" && isFinite(v) ? String(v) : \"\";", "return v == null ? \"\" : String(v);"]]],
  ["N11 GET history filter removed", [
    ["api/_account-settings.js", "  return (Array.isArray(acc.history) ? acc.history : []).filter((h) => h && typeof h === \"object\" && !Array.isArray(h));", "  return Array.isArray(acc.history) ? acc.history : [];"]]],
  ["N12 save keeps junk history", [
    ["api/_account-settings.js", "  acc.history = acc.history.filter((h) => h && typeof h === \"object\" && !Array.isArray(h));\n", ""]]],
  ["N13 GET rewrites stored history", [
    ["api/_account-settings.js", "      history: historyView(acc)", "      history: historyOf(acc)"]]],
  ["N14 email object not checked", [
    ["api/_account-settings.js", "    if (typeof set.email !== \"string\") return { ok: false, status: 400, error: \"That email does not look right.\" };\n    const e = set.email.trim().toLowerCase();", "    const e = String(set.email).trim().toLowerCase();"]]],
  ["N15 askedOther String()s objects", [
    ["api/_account-settings.js", "      if (typeof src[k] !== \"string\" && typeof src[k] !== \"number\") return true;\n", ""]]],
  ["N16 forSeat object id not checked", [
    ["api/_account-settings.js", "  if (typeof body.forSeat !== \"string\") return { ok: false, status: 400, error: \"Name the seat by its id.\" };\n  const id = body.forSeat.slice(0, 80);", "  const id = String(body.forSeat).slice(0, 80);"]]],
  ["N17 unknown stored kind reads human", [
    ["api/_account-settings.js", "return ACCOUNT_KINDS.indexOf(k) >= 0 ? k : \"ai\";", "return ACCOUNT_KINDS.indexOf(k) >= 0 ? k : \"human\";"]]],
  ["N18 empty/null stored kind reads human", [
    ["api/_account-settings.js", "  if (!acc || acc.kind === undefined) return \"human\";", "  if (!acc || !acc.kind) return \"human\";"]]],
  ["N19 legacy no-kind reads ai", [
    ["api/_account-settings.js", "  if (!acc || acc.kind === undefined) return \"human\";", "  if (!acc) return \"human\";"]]],
  ["N20 Stop/Kill unscoped again", [
    ["api/_account-settings.js", "    if (!onOwnDesk(acc, body, seatRow)) return", "    if (false) return"]]],
  ["N21 Stop/Kill any named desk that exists", [
    ["api/_account-settings.js", "  return ownedDesks(acc).some((w) => w.slug === slug);\n}", "  return (lib.mem.workspaces || []).some((w) => w.slug === slug);\n}"]]],
  ["N22 Stop/Kill owner-only (helpers refused)", [
    ["api/_account-settings.js", "  if (seatRow && slug === seatRow.slug) return true;\n", ""]]],
  ["N23 Stop/Kill needs a named desk", [
    ["api/_account-settings.js", "  const slug = named ? lib.slugify(str(body.desk)) : (seatRow && seatRow.slug) || \"\";", "  const slug = named ? lib.slugify(str(body.desk)) : \"\";"]]],
  ["N24 Stop/Kill refused for paused ai/si", [
    ["api/_account-settings.js", "    return { ok: true, status: 200, step, paused: false, done: false, reply: \"Stop and Kill always work.\" };", "    if (kindOf(acc) !== \"human\" && !Object.keys(settingsOf(acc).automations).length) return { ok: false, status: 409, error: \"Paused.\" };\n    return { ok: true, status: 200, step, paused: false, done: false, reply: \"Stop and Kill always work.\" };"]]],
  ["N25 Stop/Kill off-desk writes history", [
    ["api/_account-settings.js", "    if (!onOwnDesk(acc, body, seatRow)) return { ok: false, status: 403, error: \"Stop and Kill work on your own desk only. Nothing was done.\" };", "    if (!onOwnDesk(acc, body, seatRow)) return { ok: false, status: 403, record: true, error: \"Stop and Kill work on your own desk only. Nothing was done.\" };"]]],
  ["N26 store gate removed", [
    ["api/_account-settings.js", "  if (req.method !== \"GET\" && typeof lib.storeNotReady === \"function\" && lib.storeNotReady(res)) return true;\n", ""]]],
  ["N27 store gate skips Stop/Kill", [
    ["api/_account-settings.js", "  if (req.method !== \"GET\" && typeof lib.storeNotReady === \"function\" && lib.storeNotReady(res)) return true;", "  if (req.method !== \"GET\" && [\"stop\", \"kill\"].indexOf(str(body.step).toLowerCase()) < 0 && typeof lib.storeNotReady === \"function\" && lib.storeNotReady(res)) return true;"]]],
  ["N28 store gate only for automation-step stop/kill (spend runs)", [
    ["api/_account-settings.js", "  if (req.method !== \"GET\" && typeof lib.storeNotReady === \"function\" && lib.storeNotReady(res)) return true;", "  if (req.method !== \"GET\" && [\"stop\", \"kill\"].indexOf(str(body.step).toLowerCase()) >= 0 && typeof lib.storeNotReady === \"function\" && lib.storeNotReady(res)) return true;"]]],
  ["N29 store gate after the step runs", [
    ["api/_account-settings.js", "  if (req.method !== \"GET\" && typeof lib.storeNotReady === \"function\" && lib.storeNotReady(res)) return true;\n", ""],
    ["api/_account-settings.js", "    const out = automationStep(acc, body, seat.row);\n", "    const out = automationStep(acc, body, seat.row);\n    if (out.record) addHistory(acc, person, \"automations\", out.error, whoKind);\n    if (typeof lib.storeNotReady === \"function\" && lib.storeNotReady(res)) return true;\n"]]],
  ["N30 store gate blocks GET too", [
    ["api/_account-settings.js", "  if (req.method !== \"GET\" && typeof lib.storeNotReady", "  if (typeof lib.storeNotReady"]]],
  ["N31 store gate answers 403 not 503", [
    ["api/_account-settings.js", "  if (req.method !== \"GET\" && typeof lib.storeNotReady === \"function\" && lib.storeNotReady(res)) return true;", "  if (req.method !== \"GET\" && typeof lib.storeNotReady === \"function\" && lib.storeNotReady({ setHeader() {}, status() { return this; }, json() { return this; } })) return refuse(res, 403, \"Not now.\"), true;"]]],
  ["K1 clear guard removed", [
    ["api/_account-settings.js", "    if (v === undefined || v === null || (typeof v === \"string\" && !v.trim())) return { ok: false, status: 400, error: KIND_CLEAR };\n", ""]]],
  ["K2 clear guard replaced by a real clear", [
    ["api/_account-settings.js", "    if (v === undefined || v === null || (typeof v === \"string\" && !v.trim())) return { ok: false, status: 400, error: KIND_CLEAR };", "    if (v === undefined || v === null || (typeof v === \"string\" && !v.trim())) { delete acc.kind; return { ok: true, what: \"Cleared kind.\" }; }"]]],
  ["K3 clear guard misses undefined", [
    ["api/_account-settings.js", "if (v === undefined || v === null ||", "if (v === null ||"]]],
  ["K4 clear guard misses blank strings", [
    ["api/_account-settings.js", "if (v === undefined || v === null || (typeof v === \"string\" && !v.trim()))", "if (v === undefined || v === null)"]]],
  ["K5 clear guard misses null", [
    ["api/_account-settings.js", "if (v === undefined || v === null ||", "if (v === undefined ||"]]],
  ["K6 kind key with undefined ignored (old == null)", [
    ["api/_account-settings.js", "  if (Object.prototype.hasOwnProperty.call(set, \"kind\")) {", "  if (set.kind != null) {"]]],
  ["K7 sign-up null reads human", [
    ["api/_account-settings.js", "  if (value === undefined) return \"human\";", "  if (value == null) return \"human\";"]]],
  ["K8 sign-up blank is a 400", [
    ["api/_account-settings.js", "  if (!k) return \"human\";\n", ""]]],
  ["K9 new human accounts store no kind", [
    ["api/_account.js", "kind: require(\"./_account-settings\").accountKindFrom(body && body.accountKind) || \"human\"", "kind: ((k) => (k === \"human\" ? undefined : k))(require(\"./_account-settings\").accountKindFrom(body && body.accountKind) || \"human\")"]]],
  ["K10 kind only when accountKind sent", [
    ["api/_account.js", "kind: require(\"./_account-settings\").accountKindFrom(body && body.accountKind) || \"human\"", "kind: body && body.accountKind ? require(\"./_account-settings\").accountKindFrom(body.accountKind) : undefined"]]],
  ["K11 sign-up kind check removed (auth open)", [
    ["api/auth.js", "    if (!require(\"./_account-settings\").accountKindFrom(body.accountKind)) return res.status(400).json({ error: \"Account kind must be human, ai, or si.\" });\n", ""]]],
  ["K12 mint kind check removed", [
    ["api/_account-http.js", "    if (!require(\"./_account-settings\").accountKindFrom(body.accountKind)) return res.status(400).json({ ok: false, error: \"Account kind must be human, ai, or si.\" });\n", ""]]],
  ["K13 profile writer clears on falsy kind", [
    ["api/_account-settings.js", "  if (wantKind && (acc.kind !== wantKind)) {", "  if (!wantKind && Object.prototype.hasOwnProperty.call(set, \"kind\")) delete acc.kind;\n  if (wantKind && (acc.kind !== wantKind)) {"],
    ["api/_account-settings.js", "    if (v === undefined || v === null || (typeof v === \"string\" && !v.trim())) return { ok: false, status: 400, error: KIND_CLEAR };\n", "    if (v === undefined || v === null || (typeof v === \"string\" && !v.trim())) { wantKind = null; } else {\n"],
    ["api/_account-settings.js", "    if (!wantKind) return { ok: false, status: 400, error: \"Pick human, ai, or si.\" };\n  }", "    if (!wantKind) return { ok: false, status: 400, error: \"Pick human, ai, or si.\" };\n  } }"]]],
  ["P-N12 Stop/Kill only the seat desk, not owned desks (Probe 336 @ 04651d6)", [
    ["api/_account-settings.js", "  return ownedDesks(acc).some((w) => w.slug === slug);\n}", "  return false;\n}"]]]
];

function run(dir, home) {
  const p = spawnSync(process.execPath, ["scripts/check-account-kind.js"], { cwd: dir, env: { PATH: process.env.PATH || "/usr/bin:/bin", HOME: home }, encoding: "utf8", timeout: 180000 });
  const out = (p.stdout || "") + (p.stderr || "");
  return { code: p.status == null ? 1 : p.status, first: (out.split("\n").find((l) => l.startsWith("FAIL")) || (p.error ? String(p.error.message) : "")).slice(0, 160) };
}

function main() {
  const only = process.argv[2] || "";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aia-kind-mut-"));
  const dir = path.join(tmp, "repo"), home = path.join(tmp, "home");
  fs.mkdirSync(home);
  fs.cpSync(root, dir, { recursive: true, filter: (s) => !/[\\/](\.git|node_modules)$/.test(s) });
  const files = Array.from(new Set(MUTANTS.reduce((all, m) => all.concat(m[1].map((r) => r[0])), [])));
  const orig = {};
  files.forEach((f) => { orig[f] = fs.readFileSync(path.join(dir, f), "utf8"); });
  const restore = () => files.forEach((f) => fs.writeFileSync(path.join(dir, f), orig[f]));
  let bad = 0, caught = 0, total = 0;
  try {
    const base = run(dir, home);
    console.log("UNMUTATED | " + (base.code === 0 ? "PASS" : "FAIL " + base.first));
    if (base.code !== 0) bad++;
    for (const [name, reps] of MUTANTS) {
      if (only && name.indexOf(only) < 0) continue;
      total++;
      const txt = Object.assign({}, orig);
      const miss = reps.find(([f, find, repl]) => { if (txt[f].indexOf(find) < 0) return true; txt[f] = txt[f].replace(find, () => repl); return false; });
      if (miss) { bad++; console.log(name + " | NOOP | text not found in " + miss[0]); continue; }
      files.forEach((f) => fs.writeFileSync(path.join(dir, f), txt[f]));
      const r = run(dir, home);
      restore();
      if (r.code !== 0) { caught++; console.log(name + " | CAUGHT | " + r.first); }
      else { bad++; console.log(name + " | SURVIVED |"); }
    }
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log("SCORE " + caught + "/" + total + " caught");
  process.exitCode = bad ? 1 : 0;
}

main();
