const { cors, catalog, mem, ready, storePath, blobToken } = require("./_lib");

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  await ready();
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
      live: driver === "blob" || driver === "file",
      note: driver === "blob"
        ? "Shared blob — second phone can see the same queue"
        : driver === "tmp-file"
          ? "Lambda /tmp — add BLOB_READ_WRITE_TOKEN to share across phones"
          : driver === "file"
            ? "File store on this box"
            : "Memory only"
    },
    files: {
      driver: blobToken() ? "blob" : "tmp-file",
      count: (mem.files || []).length,
      note: blobToken()
        ? "Vercel Blob live"
        : "No BLOB_READ_WRITE_TOKEN — files sit in /tmp"
    },
    pipes: catalog(),
    automation: {
      capture: true,
      qualify: "on capture + worker",
      do: "draft only — Send and Stop stay on the desk",
      collect: catalog().some((p) => p.live && p.id === "webhook") ? "webhook live — other paid pipes on hold" : "demo ship",
      follow: "worker + cron",
      inbound: "/api/hook",
      persist: (mem.driver === "blob") ? "shared blob" : "Lambda /tmp until BLOB_READ_WRITE_TOKEN",
      ownerStops: ["kill", "money over $250"]
    },
    domain: "automateitaway.com",
    dns: "pointed",
    repo: "funditaway/Automate-It-Away"
  });
};
