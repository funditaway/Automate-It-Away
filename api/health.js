const { cors, catalog } = require("./_lib");

module.exports = function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  res.status(200).json({
    ok: true,
    product: "Automate It Away",
    engine: ["capture", "qualify", "do", "collect", "follow"],
    pipes: catalog()
  });
};
