const { cors, mem, log, save, ready, PROVIDERS, readBody, personOf, isOwner, ensureRules, defaultRules, ensureNouns, defaultNouns, widgetCount, moneyWaitOf, moneyNeedsOwner, ensurePeople, publicPerson, ruleWantsOwner, ruleWantsStop, ruleWhy } = require("./_lib");
const roles = require("./_roles");
const { moneyHold: holdFn } = require("./_hold");
function moneyHold(rules) { return holdFn(moneyWaitOf, rules); }
const { pickFields, mergeFields, slugField, ensureFields, addTalk, makeCapturedJob } = require("./_fields");
const { qualifyJob, recommend, icsOf, runWorkspace, markFlow } = require("./_engine");
const { grokRecommend } = require("./_grok");
const { needsOf, isPriorityJob } = require("./_history");

function namedWorkspace(req) {
  const raw = req.headers["x-workspace"] || (req.query && req.query.workspace);
  if (raw == null || !String(raw).trim()) return "";
  return String(raw).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}
function pipeWroteBack(dispatch) {
  return !!(dispatch && !dispatch.demo && (dispatch.ok === true || dispatch.inbound === true));
}
function pipesFor(workspace) {
  return mem.connections.filter((c) => c.workspace === workspace);
}
async function fireWebhook(hook, payload) {
  if (!hook) return { skipped: true };
  const r = await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  return { status: r.status, ok: r.ok };
}
function actorName(person, body) {
  return (person && person.name) || body.whoTapped || "desk";
}
function ownerCanOverride(person) {
  return isOwner(person) && roles.canOverride(person);
}
function previewDispatch(job, pipe, amount) {
  const live = !!(pipe && pipe.live && pipe.provider !== "whatnot");
  return {
    preview: true,
    live: live,
    demo: !live,
    provider: (pipe && pipe.provider) || job.provider || null,
    amount: amount || job.amount || 0,
    note: live
      ? "Preview. Live pipe would leave the desk. Owner taps confirm to send."
      : "Preview. No live pipe. Stays on the desk unless the owner sends it."
  };
}
function markDone(job, person, body, how) {
  const note = String((body && (body.text || body.notes)) || "Done off the desk.").trim();
  job.status = "shipped";
  job.doneHow = how || (body && body.how) || "off-desk";
  job.doneAt = new Date().toISOString();
  job.doneBy = actorName(person, body || {});
  job.awaiting = null;
  job.offDesk = false;
  job.followed = true;
  job.followNote = note;
  job.step = "Follow";
  job.rail = job.doneHow === "hand" ? "carried" : "done";
  job.whoTapped = actorName(person, body || {});
  job.dispatch = job.dispatch || { demo: false, done: true, how: job.doneHow };
  return note;
}
function markHand(job, person, body) {
  const note = String((body && (body.text || body.notes || body.reason)) || "Needs a hand.").trim();
  job.status = "exception";
  job.awaiting = null;
  job.offDesk = false;
  job.waitingOn = "owner";
  job.why = note;
  job.next = "Do this by hand. Then tap Done off desk.";
  job.doneHow = null;
  job.whoTapped = actorName(person, body || {});
  job.rail = "hand";
  job.step = "Do";
  return note;
}
