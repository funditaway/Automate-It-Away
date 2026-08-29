const { cors, mem, log, save, ready, workspaceOf } = require("./_lib");
const { runWorkspace } = require("./engine");

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
  const result = runWorkspace(scope, now);

  if (result.followed) {
    scope.filter((j) => j.followed && j.followNote).slice(0, result.followed).forEach((job) => {
      log("Follow", "Nudge · " + job.title, "OK", job.workspace);
    });
  }
  const pinged = await pingHooks(scope);
  if (result.touched || pinged.length) await save();

  return res.status(200).json({
    ok: true,
    workspace,
    touched: result.touched,
    qualified: result.qualified,
    followed: result.followed,
    pinged: pinged.length,
    waiting: mem.jobs.filter((j) => j.workspace === workspace && (j.status === "exception" || j.status === "held")).length,
    note: "Worker qualifies and nudges. It never Send or Stop. Tab can close."
  });
};
