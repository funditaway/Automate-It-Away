// Cron entry for automation ticks. Not listed in vercel.json.
// Production cron stays off until the owner turns it on.
// A call is refused unless Authorization matches CRON_SECRET.
const { cors, ready } = require("./_lib");
const { cronHandler } = require("./_automation");

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  await ready();
  return cronHandler(req, res);
};
