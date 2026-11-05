// One shape for a new line on a card thread. Writers call talkEntry
// (through addTalk) so a line cannot land without an actor kind.
// Read paths use readTalk, which copies. It never writes the stored row.
const ACTOR_KINDS = ["si", "ai", "human", "helper", "family", "employee", "ext"];
const KIND_ERROR = "Pick si, ai, human, helper, family, employee, or ext.";

function normKind(v) {
  return String(v == null ? "" : v).trim().toLowerCase();
}
function knownKind(v) {
  return ACTOR_KINDS.indexOf(normKind(v)) >= 0;
}
function clip(v, n) {
  return String(v == null ? "" : v).slice(0, n);
}

// Unknown kinds are refused. A blank value is "not sent", not a kind.
function rejectActorKind(v) {
  if (v == null || String(v).trim() === "") return "";
  if (knownKind(v)) return "";
  return KIND_ERROR;
}

// Old lines have from / role / who and no actorKind. Guess a kind for the
// read view only. Do not write it back onto the stored row.
function inferActorKind(entry) {
  const src = entry || {};
  const role = normKind(src.role || src.whoKind || "");
  const from = normKind(src.from || src.who || src.actorLabel || "");
  if (role === "si" || from === "si") return "si";
  if (role === "agent" || role === "ai" || from === "grok" || from === "model" || from === "worker" || from === "agent" || from === "desk" || from === "desk ai") return "ai";
  if (role === "helper" || from === "helper") return "helper";
  if (role === "family" || from === "family") return "family";
  if (role === "employee" || role === "staff" || from === "employee" || from === "staff") return "employee";
  if (role === "ext" || from === "ext" || from === "pipe" || from === "webhook" || from === "hook" || from === "drop" || from === "widget" || from === "capture") return "ext";
  return "human";
}

// A stored kind outside the seven is not shown as-is. Fall back to a known kind.
function safeKind(entry) {
  const raw = normKind(entry && entry.actorKind);
  if (ACTOR_KINDS.indexOf(raw) >= 0) return raw;
  const guessed = inferActorKind(entry);
  if (ACTOR_KINDS.indexOf(guessed) >= 0) return guessed;
  return "human";
}
function redactedLabel(kind) {
  if (kind === "human") return "You";
  if (kind === "ai") return "AI";
  if (kind === "si") return "SI";
  return kind || "You";
}
function readTalk(entry, opts) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
  const actorKind = safeKind(entry);
  let actorLabel = entry.actorLabel || entry.from || entry.who || "";
  if (opts && opts.redact) actorLabel = redactedLabel(actorKind);
  return Object.assign({}, entry, {
    actorKind: actorKind,
    actorLabel: actorLabel,
    input: entry.input != null ? entry.input : "",
    output: entry.output != null ? entry.output : ""
  });
}

// Seat → actor. Owner / person / user → human. Desk AI → ai. Helper, family,
// employee, and ext when that seat already says so. An SI account's owner
// seat is si. A helper on that desk stays a helper.
function actorForSeat(person, account) {
  const label = (person && person.name) || "desk";
  if (!person) return { actorKind: "ext", actorLabel: label };
  const kind = normKind(person.kind);
  const role = normKind(person.role);
  if (person.deskAi || kind === "agent" || role === "agent") return { actorKind: "ai", actorLabel: label };
  if (kind === "si" || role === "si") return { actorKind: "si", actorLabel: label };
  if (kind === "helper" || role === "helper") return { actorKind: "helper", actorLabel: label };
  if (kind === "family" || role === "family") return { actorKind: "family", actorLabel: label };
  if (kind === "employee" || kind === "staff") return { actorKind: "employee", actorLabel: label };
  if (kind === "ext" || role === "ext") return { actorKind: "ext", actorLabel: label };
  const owner = role === "owner" || kind === "owner";
  const accKind = normKind(account && account.kind);
  if (owner && accKind === "si") return { actorKind: "si", actorLabel: label };
  if (kind === "friend" || role === "friend") return { actorKind: "human", actorLabel: label };
  if (role === "employee" && !kind) return { actorKind: "employee", actorLabel: label };
  return { actorKind: "human", actorLabel: label };
}

// A public drop has no seat. The client does not choose the kind: signed-out is ext.
function actorForDrop() {
  return { actorKind: "ext", actorLabel: "ext" };
}

// From-label used when a writer has no seat (grok, pipe, desk, worker).
function actorForLabel(from, talkKind) {
  const f = normKind(from);
  const k = normKind(talkKind);
  if (f === "grok" || f === "model" || f === "worker" || f === "agent" || f === "desk ai") return { actorKind: "ai", actorLabel: from || "grok" };
  if (f === "desk" && (k === "rec" || k === "note" || !k)) return { actorKind: "ai", actorLabel: from || "desk" };
  if (f === "helper") return { actorKind: "helper", actorLabel: from || "helper" };
  if (f === "family") return { actorKind: "family", actorLabel: from || "family" };
  if (f === "employee" || f === "staff") return { actorKind: "employee", actorLabel: from || "employee" };
  if (f === "si") return { actorKind: "si", actorLabel: from || "si" };
  if (f === "pipe" || f === "webhook" || f === "hook" || f === "drop" || f === "widget" || f === "capture" || f === "ext") return { actorKind: "ext", actorLabel: from || "ext" };
  return { actorKind: "human", actorLabel: from || "desk" };
}

function aiActor(label) {
  return { actorKind: "ai", actorLabel: label || "grok" };
}
function extActor(label) {
  return { actorKind: "ext", actorLabel: label || "ext" };
}

// The only constructor for a new thread row. Missing or unknown actorKind
// returns null so the caller writes nothing.
function talkEntry(spec) {
  const src = spec && typeof spec === "object" ? spec : {};
  const actorKind = normKind(src.actorKind);
  if (ACTOR_KINDS.indexOf(actorKind) < 0) return null;
  const actorLabel = clip(src.actorLabel || src.from || "desk", 80);
  const text = clip(src.text || "", 500);
  if (!String(text).trim()) return null;
  const input = src.input != null ? clip(src.input, 500) : (actorKind === "ai" ? "" : text);
  const output = src.output != null ? clip(src.output, 500) : (actorKind === "ai" ? text : "");
  return {
    at: src.at || new Date().toISOString(),
    from: clip(src.from || actorLabel || "desk", 80),
    text: text,
    kind: src.kind || "note",
    actorKind: actorKind,
    actorLabel: actorLabel,
    input: input,
    output: output
  };
}

module.exports = {
  ACTOR_KINDS,
  KIND_ERROR,
  normKind,
  knownKind,
  rejectActorKind,
  inferActorKind,
  readTalk,
  actorForSeat,
  actorForDrop,
  actorForLabel,
  aiActor,
  extActor,
  talkEntry
};
