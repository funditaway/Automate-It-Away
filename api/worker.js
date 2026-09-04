const { cors, mem, log, save, ready, workspaceOf } = require("./_lib");
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
async function pingHooks(jobs) {
  const sent = [];
  for (const job of jobs) {
    if (!job.followed || !job.followNote || job.followPinged) continue;
    const hook = (mem.connections || []).find((c) => c.workspace === job.workspace && c.provider === "webhook" && c.hook);
    if (!hook) continue;
    try {
      await fetch(hook.hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "follow", job: { id: job.id, title: job.title, note: job.followNote } }) });
      job.followPinged = true;
      sent.push(job.id);
    } catch (e) {
      job.log = (job.log || []).concat(["Follow hook missed"]);
    }
  }
  return sent;
}
module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
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
  const pinged = await pingHooks(scope);
  let drafted = 0;
  scope.forEach((job) => {
    if (!job || job.status === "killed" || job.status === "shipped" || job.status === "held") return;
    const shop = shopOf(job.workspace);
    const step = ais.stepOf(job);
    if (step === "collect") return;
    let who = personNamed(shop, job.assignee);
    if (who && !isApprovedAgent(who)) return;
    if (!isApprovedAgent(who)) {
      const picked = ais.pickDeskAi(shop, step);
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
  if (qualified || followed || pinged.length || nudged || drafted || clocked) await save();
  return res.status(200).json({
    ok: true, workspace, touched: qualified + followed + drafted + clocked, qualified, followed,
    pinged: pinged.length, drafted, nudged, clocked,
    note: "Worker qualifies, nudges, drafts for named desk AIs, and ticks due/expire. Never Send or Stop."
  });
};
