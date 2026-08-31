const roles = require("./_roles");
const { ensureRules, moneyWaitOf, moneyNeedsOwner, ruleWantsOwner, ruleWantsStop } = require("./_lib");

function personNamed(shop, name) {
  const want = String(name || "").trim().toLowerCase();
  if (!want || !shop) return null;
  return (shop.people || []).find((p) => p && (
    String(p.name || "").toLowerCase() === want ||
    String(p.crew || "").toLowerCase() === want ||
    p.id === name
  )) || null;
}
function isApprovedAgent(person) {
  if (!person) return false;
  const kind = String(person.kind || person.role || "").toLowerCase();
  return kind === "agent" && person.status === "approved";
}
function moneyOf(job) {
  const n = Number(job && (job.amount != null ? job.amount : job.ask));
  return Number.isFinite(n) ? n : null;
}
function agentSpec(who) {
  if (!who) return null;
  return roles.agentOf(who.crew || who.name) || {
    crew: who.crew || who.name || "Agent", title: "Draft the card",
    does: "Writes a draft on the card. Never Send.", artifact: "note",
    never: ["send", "stop", "money", "approve"]
  };
}
function crewOf(job, shop) {
  if (!job) return { id: "worker", label: "Worker", does: "Qualify and nudge. Never Send." };
  const rules = shop ? ensureRules(shop) : [];
  const holdAt = shop ? moneyWaitOf(rules) : null;
  if (job.risk === "legal" || job.risk === "title" || job.risk === "credit" || job.risk === "suitability"
    || ruleWantsStop(rules, job, "do") || ruleWantsStop(rules, job, "qualify")) {
    return { id: "rail", label: "Rail", does: "Hold. Owner taps Yes or No." };
  }
  if (moneyNeedsOwner(moneyOf(job), holdAt) || ruleWantsOwner(rules, job, "do") || ruleWantsOwner(rules, job, "qualify")) {
    return { id: "owner", label: "Owner", does: "Desk rule wait. Owner taps." };
  }
  if (job.assignee) {
    const who = personNamed(shop, job.assignee);
    if (isApprovedAgent(who)) {
      const spec = agentSpec(who);
      return { id: String(spec.crew).toLowerCase(), label: spec.crew, kind: "agent", does: spec.does, artifact: spec.artifact };
    }
    return { id: "human", label: job.assignee, kind: (who && who.kind) || "member", does: "A person on this desk has it." };
  }
  if (job.agentDraft && job.agentDraft.crew) {
    return { id: String(job.agentDraft.crew).toLowerCase(), label: job.agentDraft.crew, kind: "agent", does: job.agentDraft.does, artifact: job.agentDraft.artifact };
  }
  if (job.draft) return { id: "doer", label: "Doer", does: "Draft only. You tap Yes or No." };
  return { id: "worker", label: "Worker", does: "Qualify and nudge. Never Send." };
}
function applyHandoff(job, who, shop) {
  if (!job || !who) return job;
  job.assignee = who.name;
  job.handedTo = { id: who.id, name: who.name, kind: who.kind || who.role || "member", crew: who.crew || "" };
  if (isApprovedAgent(who)) {
    job.waitingOn = "agent";
    job.next = (who.crew || who.name) + " drafts on the card. A person taps Send.";
    job.agentDrafted = false;
  } else if (who.role === "owner" || who.kind === "owner") {
    job.waitingOn = "owner"; job.next = "Waiting on " + who.name + ".";
  } else {
    job.waitingOn = "helper"; job.next = "Waiting on " + who.name + ".";
  }
  job.crew = crewOf(job, shop);
  return job;
}
function agentDraft(job, who) {
  if (!job || !who) return job;
  const spec = agentSpec(who);
  const title = job.title || "Card";
  const notes = String(job.notes || job.why || "").trim().slice(0, 180);
  const bits = {
    Foreman: "Next on this desk: " + title + ". Sequence Capture → Qualify → Do → Collect → Follow. Foreman writes the job card only.",
    Mapper: "Shop map for " + title + ". Capture what arrived. Qualify fit. Do the work. Collect off this desk if money. Follow until it is done.",
    Packer: "Pack notes for " + title + ". Fields, nouns, and what this desk already knows. Packer does not fork the desk.",
    Doer: title + ". " + (notes || "Draft the listing, packet, or message.") + " Draft only — nothing sent.",
    Rail: "Rail on " + title + ": " + (job.risk && job.risk !== "none" ? "HOLD · " + job.risk : "SHIP ready if a person taps Yes") + ". Rail does not tap Stop.",
    Builder: "Build note for " + title + ". What the desk still needs. Builder does not deploy and does not flip a pipe live.",
    Worker: "Qualify " + title + ". " + (notes || "Need the missing fact before Yes.") + " Worker nudges. Never Send."
  };
  const text = bits[spec.crew] || (spec.crew + " draft for " + title + ". A person taps Send.");
  job.agentDraft = { crew: spec.crew, title: spec.title, artifact: spec.artifact, does: spec.does, never: spec.never || ["send", "stop", "money"], text: text, at: new Date().toISOString() };
  job.draft = text; job.artifact = spec.artifact; job.agentDrafted = true; job.waitingOn = "person";
  job.next = spec.crew + " wrote a " + spec.artifact + ". A person taps Send.";
  job.crew = { id: String(spec.crew).toLowerCase(), label: spec.crew, kind: "agent", does: spec.does, artifact: spec.artifact };
  return job;
}
module.exports = { personNamed, isApprovedAgent, agentSpec, crewOf, applyHandoff, agentDraft };
