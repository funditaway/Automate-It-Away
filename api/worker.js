// A cold run's clock starts at load: the store load (hydrate) that ready()
// waits on counts against the same 60 s.
const loadedAt = Date.now();
let coldRun = true;
const crypto = require("crypto");
const { cors, mem, log, save, ready, workspaceOf, storeTrusted, requestStartedAt } = require("./_lib");
const { runWorkspace } = require("./_engine");
const { personNamed, isApprovedAgent, agentDraft, applyDeskAiDraft } = require("./_handoff");
const ais = require("./_ais");
const { addTalk } = require("./_fields");

function shopOf(slug) {
  return (mem.workspaces || []).find((w) => w && w.slug === slug) || null;
}
function groupByDesk(jobs) {
  const groups = {};
  (jobs || []).forEach((job) => {
    const key = job && job.workspace ? job.workspace : "";
    if (!groups[key]) groups[key] = [];
    groups[key].push(job);
  });
  return groups;
}
// One run fits maxDuration 60 s: a hook gets 4 s and starts only while it
// can end by 30 s; at most 3 per run, the rest wait for the next cron. A save
// that cannot start by 35 s (put 15 s + read-back 5 s + 5 s margin) is
// deferred. Hooks end before the cutoff, so a run that sent a hook never defers.
const HOOK_MS = 4000;
const HOOK_CAP = 3;
const HOOK_END_MS = 30000;
const DEFER_MS = 35000;
const RUN_SLOT_MS = 3600000;
// Delivery id from stored fields only (job id + event key), never per try: a
// hook re-sent after a failed save carries the same id.
function deliveryOf(job) {
  return "follow_" + crypto.createHash("sha256").update(job.id + "|follow|" + (job.doneAt || "")).digest("hex").slice(0, 16);
}
// Try order without saved state: start at a per-run offset (golden-ratio
// step over the hour slot, so every position comes up whatever the cron
// spacing), then least-recently-tried first when followTriedAt was saved.
function hookOrder(list, t0) {
  if (!list.length) return list;
  const slot = Math.floor(t0 / RUN_SLOT_MS);
  const start = Math.floor(((slot * 0.6180339887498949) % 1) * list.length);
  const turned = list.slice(start).concat(list.slice(0, start));
  return turned.map((x, i) => [x, i]).sort((a, b) => String(a[0].job.followTriedAt || "").localeCompare(String(b[0].job.followTriedAt || "")) || a[1] - b[1]).map((p) => p[0]);
}
async function pingHooks(jobs, t0) {
  const sent = [];
  let tried = 0;
  const due = [];
  for (const job of jobs) {
    if (!job.followed || !job.followNote || job.followPinged) continue;
    const hook = (mem.connections || []).find((c) => c.workspace === job.workspace && c.provider === "webhook" && c.hook);
    if (hook) due.push({ job, hook });
  }
  for (const { job, hook } of hookOrder(due, t0)) {
    if (tried >= HOOK_CAP || Date.now() - t0 + HOOK_MS > HOOK_END_MS) break;
    tried += 1;
    job.followTriedAt = new Date(Date.now()).toISOString();
    try {
      const delivery = deliveryOf(job);
      await fetch(hook.hook, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": delivery }, body: JSON.stringify({ event: "follow", delivery, job: { id: job.id, title: job.title, note: job.followNote } }), signal: AbortSignal.timeout(HOOK_MS) });
      job.followPinged = true;
      sent.push(job.id);
    } catch (e) {
      job.log = (job.log || []).concat(["Follow hook missed"]);
    }
  }
  sent.tried = tried;
  return sent;
}
module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  // Warm: from when guardStore took the request, so its recovery reads count.
  const t0 = coldRun ? loadedAt : (requestStartedAt() || Date.now());
  coldRun = false;
  await ready();
  const workspace = workspaceOf(req);
  const now = Date.now();
  const scope = req.query.all === "1" ? mem.jobs : mem.jobs.filter((j) => j.workspace === workspace);
  const groups = groupByDesk(scope);
  let qualified = 0;
  let followed = 0;
  let clocked = 0;
  Object.keys(groups).forEach((slug) => {
    const result = runWorkspace(groups[slug], now, shopOf(slug)) || {};
    qualified += result.qualified || 0;
    followed += result.followed || 0;
    clocked += result.clocked || 0;
  });
  if (followed) {
    scope.filter((j) => j.followed && j.followNote).slice(0, followed).forEach((job) => {
      log("Follow", "Nudge · " + job.title, "OK", job.workspace);
    });
  }
  let drafted = 0;
  scope.forEach((job) => {
    if (!job || job.status === "killed" || job.status === "shipped" || job.status === "held") return;
    const shop = shopOf(job.workspace);
    const step = ais.stepOf(job);
    if (step === "collect") return;
    if (job.thenAiGone && !ais.findDeskAi(shop, job.deskAi)) return;
    let who = personNamed(shop, job.assignee);
    if (who && !isApprovedAgent(who)) return;
    if (!isApprovedAgent(who)) {
      const picked = ais.pickDeskAi(shop, step, job.deskAi);
      who = picked ? (ais.findAiSeat(shop, picked) || { name: picked.name, crew: picked.role, deskAi: true, status: "approved", kind: "agent", role: "agent", prompt: picked.prompt, does: picked.does, never: picked.never, steps: picked.steps }) : null;
    }
    if (!isApprovedAgent(who) && !(who && who.deskAi && who.status === "approved")) return;
    if (who && who.steps && !ais.aiMayDraft(who, step)) return;
    if (job.agentDrafted && job.deskAi) return;
    if (job.agentDrafted && !who.deskAi) return;
    if (who.deskAi) applyDeskAiDraft(job, shop, step);
    else agentDraft(job, who);
    addTalk(job, (job.agentDraft && (job.agentDraft.name || job.agentDraft.crew)) || who.name, (job.agentDraft && job.agentDraft.text) || job.draft, "rec");
    drafted += 1;
    log(who.deskAi ? (who.name || "Desk AI") : (who.crew || "Agent"), "Draft · " + job.title, "OK", job.workspace);
  });
  let nudged = 0;
  scope.forEach((job) => {
    if (!job || job.status !== "out" || job.nudgeOut) return;
    addTalk(job, "worker", "Still off the desk. Confirm done, or tap Needs a hand.", "note");
    job.nudgeOut = true;
    job.next = "Off the desk. Waiting on write-back, or tap Done off desk / Needs a hand.";
    nudged += 1;
  });
  // Hooks last, right before the save; none while the store is untrusted
  // (its save would be refused and the hook sent again next run).
  const pinged = storeTrusted() ? await pingHooks(scope, t0) : [];
  if (qualified || followed || pinged.tried || nudged || drafted || clocked) {
    if (Date.now() - t0 > DEFER_MS) {
      res.setHeader("Retry-After", "5");
      return res.status(503).json({ ok: false, deferred: true, saved: false, error: "Worker ran out of time; the next cron run does this work." });
    }
    await save();
  }
  return res.status(200).json({
    ok: true, workspace, touched: qualified + followed + drafted + clocked, qualified, followed,
    pinged: pinged.length, drafted, nudged, clocked,
    note: "Worker qualifies, nudges, drafts for named desk AIs, and ticks due/expire. Never Send or Stop."
  });
};

// Store guard: no saving request answers 2xx while its write was refused.
module.exports = require("./_lib").guardStore(module.exports);
module.exports.WORKER_BUDGET = { HOOK_MS, HOOK_CAP, HOOK_END_MS, DEFER_MS, RUN_SLOT_MS };
module.exports.deliveryOf = deliveryOf;
