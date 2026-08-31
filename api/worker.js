const { cors, mem, log, save, ready, workspaceOf } = require("./_lib");
const { runWorkspace } = require("./_engine");

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
      await fetch(hook.hook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "follow", job: { id: job.id, title: job.title, note: job.followNote } })
      });
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
  Object.keys(groups).forEach((slug) => {
    const result = runWorkspace(groups[slug], now, shopOf(slug));
    qualified += result.qualified;
    followed += result.followed;
  });

  if (followed) {
    scope.filter((j) => j.followed && j.followNote).slice(0, followed).forEach((job) => {
      log("Follow", "Nudge · " + job.title, "OK", job.workspace);
    });
  }
  const pinged = await pingHooks(scope);
  if (qualified || followed || pinged.length) await save();

  return res.status(200).json({
    ok: true,
    workspace,
    touched: qualified + followed,
    qualified,
    followed,
    pinged: pinged.length,
    desks: Object.keys(groups).length,
    waiting: mem.jobs.filter((j) => j.workspace === workspace && (j.status === "exception" || j.status === "held")).length,
    note: "Worker qualifies and nudges per desk. It never Send or Stop. Tab can close."
  });
};
