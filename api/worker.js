const { cors, mem, log, save, ready, workspaceOf } = require("./_lib");
const { runWorkspace } = require("./engine");

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
  if (result.touched) await save();

  return res.status(200).json({
    ok: true,
    workspace,
    touched: result.touched,
    qualified: result.qualified,
    followed: result.followed,
    waiting: mem.jobs.filter((j) => j.workspace === workspace && (j.status === "exception" || j.status === "held")).length,
    note: "Worker qualifies and nudges. It never Send or Stop. Tab can close."
  });
};
