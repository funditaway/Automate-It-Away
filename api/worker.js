const { cors, mem, log, save, ready, workspaceOf } = require("./_lib");

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  await ready();

  const workspace = workspaceOf(req);
  const now = Date.now();
  let touched = 0;
  const scope = req.query.all === "1" ? mem.jobs : mem.jobs.filter((j) => j.workspace === workspace);

  scope.forEach((job) => {
    if (job.status === "exception" && job.step === "Qualify") {
      job.step = "Do the work";
      job.log = (job.log || []).concat(["Worker qualified"]);
      touched += 1;
    }
    if (job.status === "shipped" && !job.followed) {
      const age = now - Date.parse(job.createdAt || 0);
      if (age > 60 * 1000) {
        job.followed = true;
        job.log = (job.log || []).concat(["Follow nudge"]);
        log("Follow", "Nudge · " + job.title, "OK", job.workspace);
        touched += 1;
      }
    }
  });
  if (touched) await save();

  return res.status(200).json({
    ok: true,
    workspace,
    touched,
    waiting: mem.jobs.filter((j) => j.workspace === workspace && j.status === "exception").length,
    note: "Worker runs when called or on the daily cron. Tab can close."
  });
};
