const { cors, catalog, mem, storePath } = require("./_lib");

module.exports = function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  const driver = mem.driver || "file";
  res.status(200).json({
    ok: true,
    product: "Automate It Away",
    engine: ["capture", "qualify", "do", "collect", "follow"],
    phase: "P1",
    store: {
      driver,
      path: mem.path || storePath(),
      jobs: mem.jobs.length,
      connections: mem.connections.length,
      audit: mem.audit.length,
      workspaces: mem.workspaces.length,
      live: driver !== "memory-fallback",
      note: driver === "tmp-file"
        ? "Lambda /tmp — not shared across phones yet"
        : driver === "file"
          ? "File store on this box"
          : "Memory only"
    },
    files: {
      driver: process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "tmp-file",
      count: (mem.files || []).length,
      note: process.env.BLOB_READ_WRITE_TOKEN
        ? "Vercel Blob live"
        : "No BLOB_READ_WRITE_TOKEN — files sit in /tmp"
    },
    pipes: catalog(),
    domain: "automateitaway.com",
    repo: "funditaway/Automate-It-Away"
  });
};
