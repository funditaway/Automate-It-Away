const { cors, mem, log, save, ready, workspaceOf, readBody, personOf } = require("./ _lib");
const { qualifyJob, recommend } = require("./_engine");
const { addTalk } = require("./_fields");
const { grokRecommend } = require("./_grok");

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  await ready();
  const workspace = workspaceOf(req);
  const { workspace: shop, person } = personOf(req, workspace);
  if (req.method !== "POST") return res.status(405).json({ error: "POST a job id." });
  const body = await readBody(req);
  const job = mem.jobs.find((j) => j.id === body.id && j.workspace === workspace);
  if (!job) return res.status(404).json({ error: "Job not found" });
  qualifyJob(job, shop);
  const grok = await grokRecommend(job, shop);
  if (grok && grok.ok) addTalk(job, "grok", job.draft || "Draft on the card.", "rec");
  else recommend(job, [], shop);
  job.whoTapped = (person && person.name) || body.whoTapped || "desk";
  log("Desk", "Grok recs · " + job.title, grok && grok.ok ? "OK" : "Hold", workspace);
  await save();
  return res.status(200).json({
    ok: true,
    job,
    grok: grok && grok.ok ? "on" : (grok && grok.reason) || "off"
  });
};
