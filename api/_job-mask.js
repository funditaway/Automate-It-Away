// Names on a job read, for a seat that is not the owner.
// One helper for GET /api/jobs, the queue read, and any jobs response that
// echoes a card. The stored row is never written. Callers pass a copy in
// only by reading what this returns.
// actorLabel is left as stored. The card-thread read path redacts that label.
// actorKind, role, kind, and whoKind stay so the desk can still show who-kind.
const { isOwner } = require("./_lib");

const BLANK = {
  from: 1,
  contactName: 1,
  whoTapped: 1,
  assignee: 1,
  doneBy: 1,
  sentByAgent: 1,
  priorityBy: 1,
  who: 1
};
const SKIP = {
  actorLabel: 1,
  actorKind: 1,
  role: 1,
  kind: 1,
  whoKind: 1,
  requestedKind: 1,
  droppedByKind: 1,
  status: 1,
  id: 1,
  step: 1,
  rail: 1,
  pack: 1,
  provider: 1,
  workspace: 1,
  slug: 1,
  desk: 1,
  accountId: 1,
  personId: 1,
  assigneeId: 1,
  whoTappedId: 1,
  doneById: 1,
  cardId: 1,
  aiId: 1,
  walletId: 1
};
const ROLE_WORD = {
  owner: 1, helper: 1, family: 1, employee: 1, friend: 1, member: 1, staff: 1,
  agent: 1, human: 1, ai: 1, si: 1, ext: 1, desk: 1, drop: 1, widget: 1, grok: 1,
  capture: 1, create: 1, webhook: 1, hook: 1, pipe: 1, worker: 1, system: 1,
  note: 1, ask: 1, tell: 1, follow: 1, rec: 1, then: 1, "desk-chat": 1,
  doer: 1, rail: 1, foreman: 1, mapper: 1, packer: 1, builder: 1
};

function roleWord(value) {
  return ROLE_WORD[String(value || "").trim().toLowerCase()] === true;
}

// A channel tag is one lowercase token (widget, onboard, desk-chat).
// A person's name is not. Those tags stay so the card still shows where it came from.
function channelFrom(value) {
  const s = String(value || "").trim();
  if (!s || roleWord(s)) return true;
  return /^[a-z0-9][a-z0-9-]{0,40}$/.test(s);
}

// A stranger has no seat. This mask is for seated non-owners only.
function seatSeesNames(person) {
  if (!person) return true;
  return isOwner(person);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function escapeReg(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function addName(found, value) {
  const s = String(value || "").trim();
  if (s.length < 3 || roleWord(s) || channelFrom(s)) return;
  const low = s.toLowerCase();
  for (let i = 0; i < found.length; i++) {
    if (found[i].toLowerCase() === low) return;
  }
  found.push(s);
}

function personish(node) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return false;
  if (node.url || node.bytes != null || node.type) return false;
  return !!(node.role || node.actorKind || node.deskAi || node.whoKind || node.crew || node.kind);
}

function collectFrom(node, found) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach(function (item) { collectFrom(item, found); });
    return;
  }
  Object.keys(node).forEach(function (k) {
    const v = node[k];
    if (typeof v === "string") {
      if (k === "actorLabel" && (redactedHuman(v) || roleWord(v))) return;
      if (BLANK[k] || k === "actorLabel" || (k === "name" && personish(node))) addName(found, v);
      else if (k === "label" && (node.does || node.crew || node.deskAi)) addName(found, v);
      return;
    }
    if (v && typeof v === "object") collectFrom(v, found);
  });
}

function namesFor(node, people) {
  const found = [];
  collectFrom(node, found);
  (people || []).forEach(function (p) { if (p) addName(found, p.name); });
  found.sort(function (a, b) { return b.length - a.length; });
  return found;
}

// readTalk's human label. It is not a channel tag (the tag test is lowercase)
// and not a seat name. A later mask pass must leave it so the card-thread
// read stays the writer of that label.
function redactedHuman(value) {
  return value === "You";
}

function shouldBlank(key, value, node) {
  if (typeof value !== "string") return false;
  if (key === "name") return personish(node);
  if (!BLANK[key]) return false;
  if (key === "from" && (channelFrom(value) || redactedHuman(value))) return false;
  if (key === "who" && roleWord(value)) return false;
  return true;
}

function blankNames(node) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach(blankNames);
    return;
  }
  Object.keys(node).forEach(function (k) {
    const v = node[k];
    if (shouldBlank(k, v, node)) {
      node[k] = "";
      return;
    }
    if (v && typeof v === "object") blankNames(v);
  });
}

function replaceNames(text, names) {
  let out = String(text);
  for (let i = 0; i < names.length; i++) {
    const re = new RegExp("(^|[^A-Za-z0-9])" + escapeReg(names[i]) + "([^A-Za-z0-9]|$)", "gi");
    out = out.replace(re, function (_m, before, after) { return (before || "") + (after || ""); });
  }
  return out;
}

// Only the lines that are built from a person's name. Card title, notes, and
// draft text stay, so a title that happens to include a seat name still reads.
function scrubSelected(node, names) {
  if (!node || typeof node !== "object" || !names.length) return;
  if (Array.isArray(node)) {
    node.forEach(function (item) { scrubSelected(item, names); });
    return;
  }
  ["next", "needLine", "followNote"].forEach(function (k) {
    if (typeof node[k] === "string") node[k] = replaceNames(node[k], names);
  });
  if (typeof node.label === "string" && (node.does || node.crew || node.deskAi)) {
    node.label = replaceNames(node.label, names);
  }
  if (Array.isArray(node.log)) {
    node.log = node.log.map(function (line) {
      return typeof line === "string" ? replaceNames(line, names) : line;
    });
  }
  Object.keys(node).forEach(function (k) {
    if (k === "log" || k === "thread" || k === "replies" || k === "you" || k === "people" || k === "draft" || k === "agentDraft") return;
    const v = node[k];
    if (v && typeof v === "object") scrubSelected(v, names);
  });
}

function scrubRows(list, names, keys) {
  if (!names.length) return;
  (list || []).forEach(function (row) {
    if (!row || typeof row !== "object") return;
    keys.forEach(function (k) {
      if (typeof row[k] !== "string") return;
      if (k === "from" && channelFrom(row[k])) return;
      row[k] = replaceNames(row[k], names);
    });
  });
}

// actorKind stays. role, kind, and whoKind stay. This walk does not delete them.
function keepRoleTags(node) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach(keepRoleTags);
    return;
  }
  Object.keys(node).forEach(function (k) {
    if (k === "actorKind" || k === "role" || k === "kind" || k === "whoKind") return;
    const v = node[k];
    if (v && typeof v === "object") keepRoleTags(v);
  });
}

function applyMask(node, people) {
  const names = namesFor(node, people);
  blankNames(node);
  scrubSelected(node, names);
  scrubRows(node && node.inbox, names, ["text", "from"]);
  scrubRows(node && node.audit, names, ["action", "agent"]);
  scrubRows(node && node.money, names, ["who", "what"]);
  keepRoleTags(node);
}

function maskJob(job, person, people) {
  if (!job || typeof job !== "object") return job;
  if (seatSeesNames(person)) return job;
  const copy = clone(job);
  applyMask(copy, people);
  return copy;
}

function maskText(text, person, people, job) {
  if (text == null || seatSeesNames(person)) return text;
  return replaceNames(String(text), namesFor(job, people));
}

function maskNeeds(actions, person, people, job) {
  if (!actions || seatSeesNames(person)) return actions;
  const names = namesFor(job, people);
  return actions.map(function (action) {
    if (!action || typeof action !== "object") return action;
    const out = Object.assign({}, action);
    if (typeof out.label === "string") out.label = replaceNames(out.label, names);
    if (typeof out.href === "string") out.href = replaceNames(out.href, names);
    return out;
  });
}

// The caller's own `you` block stays. The desk seat list stays too: helpers
// already see other seats as name and role only. Names on the card, the
// thread, and the other read rows are masked.
function maskJobsResponse(body, person, people) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  if (seatSeesNames(person)) return body;
  const hadYou = Object.prototype.hasOwnProperty.call(body, "you");
  const hadPeople = Object.prototype.hasOwnProperty.call(body, "people");
  const you = hadYou ? body.you : undefined;
  const seatList = hadPeople ? body.people : undefined;
  const copy = clone(body);
  if (hadYou) delete copy.you;
  if (hadPeople) delete copy.people;
  applyMask(copy, people);
  if (hadYou) copy.you = you;
  if (hadPeople) copy.people = seatList;
  return copy;
}

module.exports = {
  seatSeesNames,
  maskJob,
  maskText,
  maskNeeds,
  maskJobsResponse
};
