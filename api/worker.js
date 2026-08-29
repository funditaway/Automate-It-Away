const { cors, mem, log, save, workspaceOf } = require("./_lib");

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  const workspace = workspaceOf(req);
  const now = Date.now();
  let touched = 0;

  mem.jobs.filter((j) => j.workspace === workspace).forEach((job) => {
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
        log("Follow", "Nudge · " + job.title, "OK", workspace);
        touched += 1;
      }
    }
  });
  if (touched) save();

  return res.status(200).json({
    ok: true,
    workspace,
    touched,
    waiting: mem.jobs.filter((j) => j.workspace === workspace && j.status === "exception").length,
    note: "Worker runs when called. Cron later. Tab can close."
  });
};
