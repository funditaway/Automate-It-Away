const CAN_KEYS = [
  "queue", "capture", "qualify", "draft", "hand", "send",
  "invite", "approve", "edit", "explore", "export", "close",
  "rules", "pipes", "stop", "money", "delete", "code"
];

const HARD_OWNER = ["approve", "stop", "money", "delete", "code", "pipes"];

function blankCan() {
  const out = {};
  CAN_KEYS.forEach((k) => { out[k] = false; });
  return out;
}

function withCan(extra) {
  return Object.assign(blankCan(), extra || {});
}

const LEVELS = {
  pending: {
    id: "pending",
    label: "Waiting",
    who: "Requested seat",
    does: "On the book. Cannot open the queue until the owner taps Approve."
  },
  family: {
    id: "family",
    label: "Family",
    who: "Family",
    does: "Drop work. See cards handed to them. Copy a draft. No shop edits."
  },
  friend: {
    id: "friend",
    label: "Friend",
    who: "Friend",
    does: "Drop work or pick up a handed card. Copy a draft. No people list."
  },
  helper: {
    id: "helper",
    label: "Helper",
    who: "Helper",
    does: "Work the queue. Qualify. Copy, text, or email a draft. Hand a card. No Stop."
  },
  member: {
    id: "member",
    label: "Member",
    who: "Desk member",
    does: "On this desk at the permission the owner set. Queue and drop. No Stop. No money."
  },
  staff: {
    id: "staff",
    label: "Staff",
    who: "Staff",
    does: "Helper taps plus invite a person. Still no Stop, money, or desk delete."
  },
  agent: {
    id: "agent",
    label: "AI agent",
    who: "Approved crew seat",
    does: "Draft onto the card after owner Approve. Never Send. Never Stop. Never money."
  },
  owner: {
    id: "owner",
    label: "Owner",
    who: "Owner / admin",
    does: "Every tap. Approve seats. Stop. Money confirm. Desk code. Delete."
  }
};

const KIND_CAN = {
  pending: withCan({}),
  family: withCan({ queue: true, capture: true, draft: false, send: true, explore: true }),
  friend: withCan({ queue: true, capture: true, send: true }),
  helper: withCan({
    queue: true, capture: true, qualify: true, hand: true, send: true, explore: true
  }),
  member: withCan({
    queue: true, capture: true, qualify: true, hand: true, send: true, explore: true
  }),
  staff: withCan({
    queue: true, capture: true, qualify: true, hand: true, send: true,
    invite: true, explore: true
  }),
  agent: withCan({ queue: true, explore: true, draft: true }),
  owner: withCan({
    queue: true, capture: true, qualify: true, draft: true, hand: true, send: true,
    invite: true, approve: true, edit: true, explore: true, export: true, close: true,
    rules: true, pipes: true, stop: true, money: true, delete: true, code: true
  })
};

const AGENTS = {
  Foreman: {
    crew: "Foreman",
    title: "Sequence the desk",
    does: "Writes the next job card. Does not draft listings or code.",
    artifact: "job card",
    can: withCan({ queue: true, explore: true, draft: true }),
    never: ["send", "stop", "money", "pipes", "delete", "approve"]
  },
  Mapper: {
    crew: "Mapper",
    title: "Map the shop",
    does: "Turns one shop into Capture → Qualify → Do → Collect → Follow.",
    artifact: "shop map",
    can: withCan({ queue: true, explore: true, draft: true }),
    never: ["send", "stop", "money", "pipes", "delete", "approve"]
  },
  Packer: {
    crew: "Packer",
    title: "Write the pack",
    does: "Drafts pack fields, nouns, and adapters. Does not fork the desk.",
    artifact: "pack notes",
    can: withCan({ queue: true, explore: true, draft: true }),
    never: ["send", "stop", "money", "pipes", "delete", "approve"]
  },
  Doer: {
    crew: "Doer",
    title: "Draft the work",
    does: "Drafts the listing, packet, proposal, recall text, or widget copy.",
    artifact: "draft on the card",
    can: withCan({ queue: true, explore: true, draft: true }),
    never: ["send", "stop", "money", "pipes", "delete", "approve"]
  },
  Rail: {
    crew: "Rail",
    title: "Hold the line",
    does: "Writes SHIP / HOLD / KILL on the card. Does not tap Stop. Does not pass its own HOLD.",
    artifact: "rail note",
    can: withCan({ queue: true, explore: true, draft: true }),
    never: ["send", "stop", "money", "pipes", "delete", "approve"]
  },
  Builder: {
    crew: "Builder",
    title: "Fix the desk",
    does: "Notes API and page fixes. Does not deploy. Does not flip a pipe live.",
    artifact: "build note",
    can: withCan({ queue: true, explore: true, draft: true }),
    never: ["send", "stop", "money", "pipes", "delete", "approve"]
  },
  Worker: {
    crew: "Worker",
    title: "Keep the loop",
    does: "Qualifies new drops and writes follow nudges when a card sits.",
    artifact: "qualify / follow note",
    can: withCan({ queue: true, capture: false, qualify: true, explore: true, draft: true }),
    never: ["send", "stop", "money", "pipes", "delete", "approve"]
  }
};

function levelOf(kind, status) {
  if (String(status || "") === "pending") return LEVELS.pending;
  const k = String(kind || "helper").toLowerCase();
  return LEVELS[k] || LEVELS.helper;
}

function agentOf(crew) {
  const raw = String(crew || "").trim();
  const key = Object.keys(AGENTS).find((k) => k.toLowerCase() === raw.toLowerCase());
  return key ? AGENTS[key] : null;
}

function resolveCan(kind, crew, status) {
  if (String(status || "") === "pending" || String(status || "") === "denied") return blankCan();
  const k = String(kind || "helper").toLowerCase();
  if (k === "agent") {
    const agent = agentOf(crew);
    return Object.assign(blankCan(), (agent && agent.can) || KIND_CAN.agent);
  }
  return Object.assign(blankCan(), KIND_CAN[k] || KIND_CAN.helper);
}

function stripHard(can, person) {
  const out = Object.assign(blankCan(), can || {});
  const owner = person && (person.role === "owner" || person.kind === "owner");
  if (!owner) {
    HARD_OWNER.forEach((k) => { out[k] = false; });
  }
  if (person && (person.kind === "agent" || person.role === "agent")) {
    out.send = false;
    out.stop = false;
    out.money = false;
    out.approve = false;
    out.delete = false;
    out.code = false;
    out.pipes = false;
    out.edit = false;
    out.close = false;
  }
  return out;
}

function publicRole(person) {
  if (!person) return null;
  const kind = person.kind || (person.role === "owner" ? "owner" : "helper");
  const status = person.status || "approved";
  const level = levelOf(kind, status);
  const agent = kind === "agent" ? agentOf(person.crew || person.name) : null;
  return {
    level: level.id,
    label: level.label,
    does: (agent && agent.does) || level.does,
    artifact: agent ? agent.artifact : "",
    crew: agent ? agent.crew : "",
    title: agent ? agent.title : level.label,
    never: agent ? agent.never : (kind === "owner" ? [] : HARD_OWNER)
  };
}

function catalog() {
  return {
    levels: Object.keys(LEVELS).map((id) => Object.assign({ can: KIND_CAN[id] || blankCan() }, LEVELS[id])),
    agents: Object.keys(AGENTS).map((crew) => AGENTS[crew]),
    hardOwner: HARD_OWNER,
    keys: CAN_KEYS
  };
}

module.exports = {
  CAN_KEYS,
  HARD_OWNER,
  LEVELS,
  KIND_CAN,
  AGENTS,
  blankCan,
  levelOf,
  agentOf,
  resolveCan,
  stripHard,
  publicRole,
  catalog
};
