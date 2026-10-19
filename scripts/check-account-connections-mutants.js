#!/usr/bin/env node
// Mutant runner for scripts/check-account-connections.js (not in the npm test line).
// Copies the repo (no .git, no node_modules) to a temp dir, applies each mutant
// below to the api/ files there, runs check-account-connections.js with a
// stripped env (PATH and a temp HOME only; no keys) and no network (unshare -rn
// when available), and reports caught/total. The real tree is never written.
// Exit 1 if any mutant survives or no longer applies (its text is gone), or if
// the unmutated check fails.
// C1-C82 are the set behind the 82/82 claim in the PR; C83-C86 cover the
// plain-object request body gate (a body whose prototype carries
// allow.money:true is the same 400 as a field of the wrong type).
// Usage: node scripts/check-account-connections-mutants.js [name-filter]
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
// [name, file, [[find, replace], ...]]. Every find must occur in file; every
// occurrence is replaced.
const MUTANTS = [
  ["secret length echoed in the secret reply", "api/_account-connect.js", [["{ ok: true, name: name, set: true }", "{ ok: true, name: name, set: true, length: sealed.data.length }"]]],
  ["secret value written to account history", "api/_account-connect.js", [["names.forEach((n) => { secrets[n] = \"\"; });", ""], ["const line = (isNew ? \"Saved \" : \"Updated \")", "const line = JSON.stringify(secrets) + (isNew ? \"Saved \" : \"Updated \")"]]],
  ["secret stored unsealed", "api/_account-connect.js", [["return S().seal(acc, \"conn:\" + conn.id + \":\" + field, value);", "return S().secretKey() ? { aia: \"aia-acct-secret-1\", data: value } : null;"]]],
  ["scope widened to member desks", "api/_account-connect.js", [["const desks = s.ownedDesks(acc);", "const desks = (lib.mem.workspaces || []).filter((w) => w && ((acc.desks || []).indexOf(w.slug) >= 0 || (acc.memberDesks || []).indexOf(w.slug) >= 0));"]]],
  ["other account id honoured", "api/_account-connect.js", [["if (s.askedOther(req, body, acc)) return refuse(res, 404, NO_ONE);", ""]]],
  ["seat refusals leak status (401/403, not 404)", "api/_account-connect.js", [["if (!seat.ok) return refuse(res, 404, NO_ONE);", "if (!seat.ok) return refuse(res, seat.status, seat.error);"]]],
  ["duplicate card on repeat setup-card", "api/_account-connect.js", [["const have = cardsOf(acc).find((c) => c.key === source.key && c.status !== \"killed\");", "const have = null;"]]],
  ["duplicate card on repeat connect", "api/_account-connect.js", [["let card = cardsOf(acc).find((c) => c.key === \"connection:\" + conn.id && c.status !== \"killed\");", "let card = null;"]]],
  ["missing whoKind on card history", "api/_account-connect.js", [["who: stamp.who, whoKind: stamp.whoKind, what: plain(what, 200) };", "who: stamp.who, what: plain(what, 200) };"]]],
  ["missing who on card history", "api/_account-connect.js", [["who: stamp.who, whoKind: stamp.whoKind, what: plain(what, 200) };", "whoKind: stamp.whoKind, what: plain(what, 200) };"]]],
  ["pause-off allowed for ai / si", "api/_account-connect.js", [["if (offs.length && s.kindOf(acc) !== \"human\") {", "if (offs.length && s.kindOf(acc) === \"nobody\") {"]]],
  ["charge path in the dry run", "api/_account-connect.js", [["held: true, done: false, charged: false, text: \"Collect stays HOLD.", "held: true, done: false, charged: true, text: \"Collect stays HOLD."]]],
  ["buy fields accepted", "api/_account-connect.js", [["if (moneyKey(from) ||", "if (false && moneyKey(from) ||"]]],
  ["approve skippable", "api/_account-connect.js", [["const SKIPPABLE = [\"connect\", \"secret\"];", "const SKIPPABLE = [\"connect\", \"secret\", \"approve\"];"]]],
  ["order not enforced", "api/_account-connect.js", [["if (open) return refuse(res, 409,", "if (open && false) return refuse(res, 409,"]]],
  ["done step can be replayed", "api/_account-connect.js", [["if (step.state === \"done\" || step.state === \"skipped\") return refuse", "if (step.state === \"skipped\") return refuse"]]],
  ["status reads connected", "api/_account-connect.js", [["const status = c.status === \"tested\" ? \"tested\" : \"saved\";", "const status = c.status === \"tested\" ? \"tested\" : \"connected\";"]]],
  ["dry run marks tested", "api/_account-connect.js", [["const result = dryRun(acc, card, group,", "{ const cc = group.connectionId && connsOf(acc).find((c) => c.id === group.connectionId); if (cc) cc.status = \"tested\"; } const result = dryRun(acc, card, group,"]]],
  ["outside call in the dry run", "api/_account-connect.js", [["const checks = [];", "const checks = []; try { Promise.resolve(fetch(\"https://model.example.test/v1\")).catch(function () {}); } catch (e) {}"]]],
  ["Stop refused on a stopped / killed card", "api/_account-connect.js", [["return res.status(200).json({ ok: true, changed: false, card: publicCard(card) });", "return refuse(res, 409, \"Already.\");"]]],
  ["Stop fails when the save fails", "api/_account-connect.js", [["const out = { ok: true, changed: true, saved: saved,", "if (!saved) return refuse(res, 503, NOT_SAVED); const out = { ok: true, changed: true, saved: saved,"]]],
  ["2xx without a save", "api/_account-connect.js", [["if (!ok) putBack(acc, was);\n  return ok;", "return true;"]]],
  ["reads create arrays (writes on refused calls)", "api/_account-connect.js", [["function connsOf(acc) { return Array.isArray(acc.connections) ? acc.connections : []; }", "function connsOf(acc) { if (!Array.isArray(acc.connections)) acc.connections = []; return acc.connections; }"]]],
  ["kill leaves steps todo", "api/_account-connect.js", [["if (st.state === \"todo\") { st.state = \"blocked\";", "if (false) { st.state = \"blocked\";"]]],
  ["test run allowed before approve", "api/_account-connect.js", [["return refuse(res, 409, open.kind === \"approve\" ? \"Approve allowed actions first.\"", "if (open.kind !== \"approve\") return refuse(res, 409, open.kind === \"approve\" ? \"Approve allowed actions first.\""]]],
  ["type check dropped: connect.service", "api/_account-connect.js", [["connect: { service: \"text\", label: \"text\", secrets: \"textMap\", hook: \"text\", connectionId: \"text\", deskId: \"text\" }", "connect: { label: \"text\", secrets: \"textMap\", hook: \"text\", connectionId: \"text\", deskId: \"text\" }"]]],
  ["type check dropped: connect.label", "api/_account-connect.js", [["connect: { service: \"text\", label: \"text\", secrets: \"textMap\", hook: \"text\", connectionId: \"text\", deskId: \"text\" }", "connect: { service: \"text\", secrets: \"textMap\", hook: \"text\", connectionId: \"text\", deskId: \"text\" }"]]],
  ["type check dropped: connect.secrets", "api/_account-connect.js", [["connect: { service: \"text\", label: \"text\", secrets: \"textMap\", hook: \"text\", connectionId: \"text\", deskId: \"text\" }", "connect: { service: \"text\", label: \"text\", hook: \"text\", connectionId: \"text\", deskId: \"text\" }"]]],
  ["type check dropped: connect.hook", "api/_account-connect.js", [["connect: { service: \"text\", label: \"text\", secrets: \"textMap\", hook: \"text\", connectionId: \"text\", deskId: \"text\" }", "connect: { service: \"text\", label: \"text\", secrets: \"textMap\", connectionId: \"text\", deskId: \"text\" }"]]],
  ["type check dropped: connect.connectionId", "api/_account-connect.js", [["connect: { service: \"text\", label: \"text\", secrets: \"textMap\", hook: \"text\", connectionId: \"text\", deskId: \"text\" }", "connect: { service: \"text\", label: \"text\", secrets: \"textMap\", hook: \"text\", deskId: \"text\" }"]]],
  ["type check dropped: connect.deskId", "api/_account-connect.js", [["connect: { service: \"text\", label: \"text\", secrets: \"textMap\", hook: \"text\", connectionId: \"text\", deskId: \"text\" }", "connect: { service: \"text\", label: \"text\", secrets: \"textMap\", hook: \"text\", connectionId: \"text\" }"]]],
  ["type check dropped: connection-secret.connectionId", "api/_account-connect.js", [["\"connection-secret\": { connectionId: \"text\", name: \"text\", value: \"text\" }", "\"connection-secret\": { name: \"text\", value: \"text\" }"]]],
  ["type check dropped: connection-secret.name", "api/_account-connect.js", [["\"connection-secret\": { connectionId: \"text\", name: \"text\", value: \"text\" }", "\"connection-secret\": { connectionId: \"text\", value: \"text\" }"]]],
  ["type check dropped: connection-secret.value", "api/_account-connect.js", [["\"connection-secret\": { connectionId: \"text\", name: \"text\", value: \"text\" }", "\"connection-secret\": { connectionId: \"text\", name: \"text\" }"]]],
  ["type check dropped: disconnect.connectionId", "api/_account-connect.js", [["disconnect: { connectionId: \"text\" }", "disconnect: {  }"]]],
  ["type check dropped: setup-cards.deskId", "api/_account-connect.js", [["\"setup-cards\": { deskId: \"text\" }", "\"setup-cards\": {  }"]]],
  ["type check dropped: setup-card.from", "api/_account-connect.js", [["\"setup-card\": { from: \"obj\", deskId: \"text\" }", "\"setup-card\": { deskId: \"text\" }"]]],
  ["type check dropped: setup-card.deskId", "api/_account-connect.js", [["\"setup-card\": { from: \"obj\", deskId: \"text\" }", "\"setup-card\": { from: \"obj\" }"]]],
  ["type check dropped: setup-step.cardId", "api/_account-connect.js", [["\"setup-step\": { cardId: \"text\", stepId: \"text\", do: \"text\", reason: \"text\", deskId: \"text\", connectionId: \"text\", secret: \"obj\", allow: \"obj\", try: \"texts\", live: \"boolOrText\" }", "\"setup-step\": { stepId: \"text\", do: \"text\", reason: \"text\", deskId: \"text\", connectionId: \"text\", secret: \"obj\", allow: \"obj\", try: \"texts\", live: \"boolOrText\" }"]]],
  ["type check dropped: setup-step.stepId", "api/_account-connect.js", [["\"setup-step\": { cardId: \"text\", stepId: \"text\", do: \"text\", reason: \"text\", deskId: \"text\", connectionId: \"text\", secret: \"obj\", allow: \"obj\", try: \"texts\", live: \"boolOrText\" }", "\"setup-step\": { cardId: \"text\", do: \"text\", reason: \"text\", deskId: \"text\", connectionId: \"text\", secret: \"obj\", allow: \"obj\", try: \"texts\", live: \"boolOrText\" }"]]],
  ["type check dropped: setup-step.do", "api/_account-connect.js", [["\"setup-step\": { cardId: \"text\", stepId: \"text\", do: \"text\", reason: \"text\", deskId: \"text\", connectionId: \"text\", secret: \"obj\", allow: \"obj\", try: \"texts\", live: \"boolOrText\" }", "\"setup-step\": { cardId: \"text\", stepId: \"text\", reason: \"text\", deskId: \"text\", connectionId: \"text\", secret: \"obj\", allow: \"obj\", try: \"texts\", live: \"boolOrText\" }"]]],
  ["type check dropped: setup-step.reason", "api/_account-connect.js", [["\"setup-step\": { cardId: \"text\", stepId: \"text\", do: \"text\", reason: \"text\", deskId: \"text\", connectionId: \"text\", secret: \"obj\", allow: \"obj\", try: \"texts\", live: \"boolOrText\" }", "\"setup-step\": { cardId: \"text\", stepId: \"text\", do: \"text\", deskId: \"text\", connectionId: \"text\", secret: \"obj\", allow: \"obj\", try: \"texts\", live: \"boolOrText\" }"]]],
  ["type check dropped: setup-step.deskId", "api/_account-connect.js", [["\"setup-step\": { cardId: \"text\", stepId: \"text\", do: \"text\", reason: \"text\", deskId: \"text\", connectionId: \"text\", secret: \"obj\", allow: \"obj\", try: \"texts\", live: \"boolOrText\" }", "\"setup-step\": { cardId: \"text\", stepId: \"text\", do: \"text\", reason: \"text\", connectionId: \"text\", secret: \"obj\", allow: \"obj\", try: \"texts\", live: \"boolOrText\" }"]]],
  ["type check dropped: setup-step.connectionId", "api/_account-connect.js", [["\"setup-step\": { cardId: \"text\", stepId: \"text\", do: \"text\", reason: \"text\", deskId: \"text\", connectionId: \"text\", secret: \"obj\", allow: \"obj\", try: \"texts\", live: \"boolOrText\" }", "\"setup-step\": { cardId: \"text\", stepId: \"text\", do: \"text\", reason: \"text\", deskId: \"text\", secret: \"obj\", allow: \"obj\", try: \"texts\", live: \"boolOrText\" }"]]],
  ["type check dropped: setup-step.secret", "api/_account-connect.js", [["\"setup-step\": { cardId: \"text\", stepId: \"text\", do: \"text\", reason: \"text\", deskId: \"text\", connectionId: \"text\", secret: \"obj\", allow: \"obj\", try: \"texts\", live: \"boolOrText\" }", "\"setup-step\": { cardId: \"text\", stepId: \"text\", do: \"text\", reason: \"text\", deskId: \"text\", connectionId: \"text\", allow: \"obj\", try: \"texts\", live: \"boolOrText\" }"]]],
  ["type check dropped: setup-step.allow", "api/_account-connect.js", [["\"setup-step\": { cardId: \"text\", stepId: \"text\", do: \"text\", reason: \"text\", deskId: \"text\", connectionId: \"text\", secret: \"obj\", allow: \"obj\", try: \"texts\", live: \"boolOrText\" }", "\"setup-step\": { cardId: \"text\", stepId: \"text\", do: \"text\", reason: \"text\", deskId: \"text\", connectionId: \"text\", secret: \"obj\", try: \"texts\", live: \"boolOrText\" }"]]],
  ["type check dropped: setup-step.try", "api/_account-connect.js", [["\"setup-step\": { cardId: \"text\", stepId: \"text\", do: \"text\", reason: \"text\", deskId: \"text\", connectionId: \"text\", secret: \"obj\", allow: \"obj\", try: \"texts\", live: \"boolOrText\" }", "\"setup-step\": { cardId: \"text\", stepId: \"text\", do: \"text\", reason: \"text\", deskId: \"text\", connectionId: \"text\", secret: \"obj\", allow: \"obj\", live: \"boolOrText\" }"]]],
  ["type check dropped: setup-step.live", "api/_account-connect.js", [["\"setup-step\": { cardId: \"text\", stepId: \"text\", do: \"text\", reason: \"text\", deskId: \"text\", connectionId: \"text\", secret: \"obj\", allow: \"obj\", try: \"texts\", live: \"boolOrText\" }", "\"setup-step\": { cardId: \"text\", stepId: \"text\", do: \"text\", reason: \"text\", deskId: \"text\", connectionId: \"text\", secret: \"obj\", allow: \"obj\", try: \"texts\" }"]]],
  ["type check dropped: from.type", "api/_account-connect.js", [["const FROM_TYPES = { type: \"text\", connectionId: \"text\", id: \"text\", name: \"text\", service: \"text\", acts: \"texts\", items: \"objs\" }", "const FROM_TYPES = { connectionId: \"text\", id: \"text\", name: \"text\", service: \"text\", acts: \"texts\", items: \"objs\" }"]]],
  ["type check dropped: from.connectionId", "api/_account-connect.js", [["const FROM_TYPES = { type: \"text\", connectionId: \"text\", id: \"text\", name: \"text\", service: \"text\", acts: \"texts\", items: \"objs\" }", "const FROM_TYPES = { type: \"text\", id: \"text\", name: \"text\", service: \"text\", acts: \"texts\", items: \"objs\" }"]]],
  ["type check dropped: from.id", "api/_account-connect.js", [["const FROM_TYPES = { type: \"text\", connectionId: \"text\", id: \"text\", name: \"text\", service: \"text\", acts: \"texts\", items: \"objs\" }", "const FROM_TYPES = { type: \"text\", connectionId: \"text\", name: \"text\", service: \"text\", acts: \"texts\", items: \"objs\" }"]]],
  ["type check dropped: from.name", "api/_account-connect.js", [["const FROM_TYPES = { type: \"text\", connectionId: \"text\", id: \"text\", name: \"text\", service: \"text\", acts: \"texts\", items: \"objs\" }", "const FROM_TYPES = { type: \"text\", connectionId: \"text\", id: \"text\", service: \"text\", acts: \"texts\", items: \"objs\" }"]]],
  ["type check dropped: from.service", "api/_account-connect.js", [["const FROM_TYPES = { type: \"text\", connectionId: \"text\", id: \"text\", name: \"text\", service: \"text\", acts: \"texts\", items: \"objs\" }", "const FROM_TYPES = { type: \"text\", connectionId: \"text\", id: \"text\", name: \"text\", acts: \"texts\", items: \"objs\" }"]]],
  ["type check dropped: from.acts", "api/_account-connect.js", [["const FROM_TYPES = { type: \"text\", connectionId: \"text\", id: \"text\", name: \"text\", service: \"text\", acts: \"texts\", items: \"objs\" }", "const FROM_TYPES = { type: \"text\", connectionId: \"text\", id: \"text\", name: \"text\", service: \"text\", items: \"objs\" }"]]],
  ["type check dropped: from.items", "api/_account-connect.js", [["const FROM_TYPES = { type: \"text\", connectionId: \"text\", id: \"text\", name: \"text\", service: \"text\", acts: \"texts\", items: \"objs\" }", "const FROM_TYPES = { type: \"text\", connectionId: \"text\", id: \"text\", name: \"text\", service: \"text\", acts: \"texts\" }"]]],
  ["type check dropped: from.items[].type", "api/_account-connect.js", [["const ITEM_TYPES = { type: \"text\", id: \"text\", name: \"text\", service: \"text\", acts: \"texts\" }", "const ITEM_TYPES = { id: \"text\", name: \"text\", service: \"text\", acts: \"texts\" }"]]],
  ["type check dropped: from.items[].id", "api/_account-connect.js", [["const ITEM_TYPES = { type: \"text\", id: \"text\", name: \"text\", service: \"text\", acts: \"texts\" }", "const ITEM_TYPES = { type: \"text\", name: \"text\", service: \"text\", acts: \"texts\" }"]]],
  ["type check dropped: from.items[].name", "api/_account-connect.js", [["const ITEM_TYPES = { type: \"text\", id: \"text\", name: \"text\", service: \"text\", acts: \"texts\" }", "const ITEM_TYPES = { type: \"text\", id: \"text\", service: \"text\", acts: \"texts\" }"]]],
  ["type check dropped: from.items[].service", "api/_account-connect.js", [["const ITEM_TYPES = { type: \"text\", id: \"text\", name: \"text\", service: \"text\", acts: \"texts\" }", "const ITEM_TYPES = { type: \"text\", id: \"text\", name: \"text\", acts: \"texts\" }"]]],
  ["type check dropped: from.items[].acts", "api/_account-connect.js", [["const ITEM_TYPES = { type: \"text\", id: \"text\", name: \"text\", service: \"text\", acts: \"texts\" }", "const ITEM_TYPES = { type: \"text\", id: \"text\", name: \"text\", service: \"text\" }"]]],
  ["type check dropped: secret.name", "api/_account-connect.js", [["const SECRET_TYPES = { name: \"text\", value: \"text\" }", "const SECRET_TYPES = { value: \"text\" }"]]],
  ["type check dropped: secret.value", "api/_account-connect.js", [["const SECRET_TYPES = { name: \"text\", value: \"text\" }", "const SECRET_TYPES = { name: \"text\" }"]]],
  ["type check dropped: allow.money", "api/_account-connect.js", [["const ALLOW_TYPES = { money: \"bool\", deletes: \"bool\", messageNew: \"bool\" }", "const ALLOW_TYPES = { deletes: \"bool\", messageNew: \"bool\" }"]]],
  ["type check dropped: allow.deletes", "api/_account-connect.js", [["const ALLOW_TYPES = { money: \"bool\", deletes: \"bool\", messageNew: \"bool\" }", "const ALLOW_TYPES = { money: \"bool\", messageNew: \"bool\" }"]]],
  ["type check dropped: allow.messageNew", "api/_account-connect.js", [["const ALLOW_TYPES = { money: \"bool\", deletes: \"bool\", messageNew: \"bool\" }", "const ALLOW_TYPES = { money: \"bool\", deletes: \"bool\" }"]]],
  ["text accepts numbers", "api/_account-connect.js", [["text: [(v) => typeof v === \"string\", \"plain text\"]", "text: [(v) => typeof v === \"string\" || typeof v === \"number\", \"plain text\"]"]]],
  ["text accepts anything String() can read", "api/_account-connect.js", [["text: [(v) => typeof v === \"string\", \"plain text\"]", "text: [(v) => v != null && typeof v !== \"object\", \"plain text\"]"]]],
  ["bool accepts \"true\"", "api/_account-connect.js", [["bool: [(v) => typeof v === \"boolean\", \"true or false\"]", "bool: [(v) => typeof v === \"boolean\" || v === \"true\" || v === \"false\", \"true or false\"]"]]],
  ["plain object accepts arrays and class objects", "api/_account-connect.js", [["if (!v || typeof v !== \"object\" || Array.isArray(v)) return false;", "if (!v || typeof v !== \"object\") return false; return true;"]]],
  ["plain object accepts any prototype", "api/_account-connect.js", [["return p === Object.prototype || p === null;", "return true;"]]],
  ["plain object accepts functions", "api/_account-connect.js", [["if (!v || typeof v !== \"object\" || Array.isArray(v)) return false;", "if (typeof v === \"function\") return true; if (!v || typeof v !== \"object\" || Array.isArray(v)) return false;"]]],
  ["secrets values not checked", "api/_account-connect.js", [["textMap: [(v) => plainObj(v) && Object.keys(v).every((k) => typeof v[k] === \"string\"), \"names with text values\"]", "textMap: [(v) => plainObj(v), \"names with text values\"]"]]],
  ["string lists accept any array", "api/_account-connect.js", [["texts: [(v) => Array.isArray(v) && v.every((x) => typeof x === \"string\"), \"a list of words\"]", "texts: [(v) => Array.isArray(v), \"a list of words\"]"]]],
  ["object lists accept any array", "api/_account-connect.js", [["objs: [(v) => Array.isArray(v) && v.every(plainObj), \"a list of objects\"]", "objs: [(v) => Array.isArray(v), \"a list of objects\"]"]]],
  ["live accepts anything", "api/_account-connect.js", [["boolOrText: [(v) => typeof v === \"boolean\" || typeof v === \"string\", \"true or false\"]", "boolOrText: [(v) => true, \"true or false\"]"]]],
  ["null passes as left out", "api/_account-connect.js", [["    if (!Object.prototype.hasOwnProperty.call(src, k)) continue;", "    if (src[k] == null) continue;"]]],
  ["top-level type check removed", "api/_account-connect.js", [["  if (typeErr) return refuse(res, 400, typeErr);\n", ""]]],
  ["from type check removed", "api/_account-connect.js", [["    if (fromErr) return refuse(res, 400, fromErr);\n", ""]]],
  ["bundle item type check removed", "api/_account-connect.js", [["      if (itemErr) return refuse(res, 400, itemErr);\n", ""]]],
  ["secret type check removed", "api/_account-connect.js", [["    if (secErr) return refuse(res, 400, secErr);\n", ""]]],
  ["allow type check removed", "api/_account-connect.js", [["    if (allowErr) return refuse(res, 400, allowErr);\n", ""]]],
  ["type check after the lookups", "api/_account-connect.js", [["  const typeErr = FIELD_TYPES[action] ? wrongType(body, FIELD_TYPES[action]) : null;\n  if (typeErr) return refuse(res, 400, typeErr);\n", ""], ["  if (action === \"connections\") {", "  { const typeErr = FIELD_TYPES[action] ? wrongType(body, FIELD_TYPES[action]) : null; if (typeErr && action !== \"connect\" && action !== \"setup-step\") return refuse(res, 400, typeErr); }\n  if (action === \"connections\") {"]]],
  // Plain-object request body (Probe 355 prototype-body note).
  ["plain-body gate dropped on the connection actions", "api/_account-connect.js", [["  if (!plainObj(body)) return refuse(res, 400, s.BODY_NOT_PLAIN);\n", ""]]],
  ["connection plain-body gate accepts any prototype", "api/_account-connect.js", [["  if (!plainObj(body)) return refuse(res, 400, s.BODY_NOT_PLAIN);\n", "  if (!isObj(body)) return refuse(res, 400, s.BODY_NOT_PLAIN);\n"]]],
  ["plain-body gate dropped on the settings writes", "api/_account-settings.js", [["  if (req.method === \"POST\" && !plainBody(body)) return refuse(res, 400, BODY_NOT_PLAIN), true;\n", ""]]],
  ["settings plainBody accepts any prototype", "api/_account-settings.js", [["  return p === Object.prototype || p === null;\n}\n", "  return !!p || p === null;\n}\n"]]],
];

const hasUnshare = spawnSync("unshare", ["-rn", "true"]).status === 0;
function run(dir, home) {
  const argv = [process.execPath, path.join(dir, "scripts/check-account-connections.js")];
  const opts = { cwd: dir, encoding: "utf8", env: { PATH: process.env.PATH, HOME: home }, timeout: 120000 };
  const p = hasUnshare ? spawnSync("unshare", ["-rn"].concat(argv), opts) : spawnSync(argv[0], argv.slice(1), opts);
  const out = (p.stdout || "") + (p.stderr || "");
  return { code: p.status == null ? 1 : p.status, first: (out.split("\n").find((l) => l.startsWith("FAIL")) || (p.error ? String(p.error.message) : "")).slice(0, 160) };
}

function main() {
  const only = process.argv[2] || "";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aia-conn-mut-"));
  const dir = path.join(tmp, "repo"), home = path.join(tmp, "home");
  fs.mkdirSync(home);
  fs.cpSync(root, dir, { recursive: true, filter: (s) => !/[\\/](\.git|node_modules)$/.test(s) });
  const files = Array.from(new Set(MUTANTS.map((m) => m[1])));
  const orig = {};
  files.forEach((f) => { orig[f] = fs.readFileSync(path.join(dir, f), "utf8"); });
  const restore = () => files.forEach((f) => fs.writeFileSync(path.join(dir, f), orig[f]));
  let bad = 0, caught = 0, total = 0;
  try {
    if (!hasUnshare) console.log("note: unshare -rn not available; running without a network namespace (the check still blocks fetch / http)");
    const base = run(dir, home);
    console.log("UNMUTATED | " + (base.code === 0 ? "PASS" : "FAIL " + base.first));
    if (base.code !== 0) bad++;
    MUTANTS.forEach(([name, file, reps], i) => {
      const label = "C" + (i + 1) + " " + name;
      if (only && label.indexOf(only) < 0) return;
      total++;
      let txt = orig[file];
      const miss = reps.find(([find, repl]) => { if (txt.indexOf(find) < 0) return true; txt = txt.split(find).join(repl); return false; });
      if (miss) { bad++; console.log(label + " | NOOP | text not found in " + file); return; }
      fs.writeFileSync(path.join(dir, file), txt);
      const r = run(dir, home);
      restore();
      if (r.code !== 0) { caught++; console.log(label + " | CAUGHT | " + r.first); }
      else { bad++; console.log(label + " | SURVIVED |"); }
    });
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log("SCORE " + caught + "/" + total + " caught");
  process.exitCode = bad ? 1 : 0;
}

main();
