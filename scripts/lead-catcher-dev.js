// DEV ONLY — local preview of the Lead Catcher pack on 127.0.0.1. Not used on Vercel.
// Seeds a throwaway AIA store with a DEMO desk (fake PINs) in a temp folder. Nothing is sent or charged.
const os = require("os"), fs = require("fs"), path = require("path"), http = require("http");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aia-lc-dev-"));
process.env.AIA_STORE_PATH = path.join(dir, "aia.json");
process.env.AIA_LC_STORE_PATH = path.join(dir, "lead-catcher.json");
process.env.AIA_LC_OUTBOX_PATH = path.join(dir, "outbox.mock.ndjson");
delete process.env.BLOB_READ_WRITE_TOKEN; delete process.env.VERCEL_ENV;
// DEV ONLY safety: drop every key/token/secret from this process and refuse any network call that is not 127.0.0.1,
// so no AIA handler served here can reach a model, a webhook, Blob, or any outside service.
Object.keys(process.env).forEach((k) => { if (/KEY|TOKEN|SECRET|PASSWORD|BLOB/i.test(k)) delete process.env[k]; });
const realFetch = globalThis.fetch;
globalThis.fetch = (u, o) => { const h = new URL(String(u && u.url || u), "http://127.0.0.1").hostname; if (h !== "127.0.0.1" && h !== "localhost") return Promise.reject(new Error("DEV ONLY: outbound network blocked (" + h + ")")); return realFetch(u, o); };
const lib = require("../api/_lib");
const lc = require("../api/lead-catcher");
const ROOT = path.join(__dirname, "..");
const vercel = require("../vercel.json");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
(async () => {
  await lib.ready();
  const h = lib.hashPin;
  lib.mem.workspaces.push({ slug: "riverbend-demo", name: "Riverbend Plumbing (DEMO)", pin: h("1111"), people: [
    { id: "p_owner", name: "Dana Owner", role: "owner", kind: "owner", pin: h("1111") },
    { id: "p_rae", name: "Rae Responder", role: "employee", kind: "staff", pin: h("2222") },
    { id: "p_abe", name: "Abe Approver", role: "employee", kind: "staff", pin: h("3333") },
    { id: "p_bot", name: "Desk AI", role: "employee", kind: "agent", deskAi: true, pin: h("7777") }
  ] });
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://local");
    if (u.pathname.startsWith("/api/")) { // DEV ONLY: route like vercel.json rewrites, to the repo's own handlers, on the temp store
      const rw = (vercel.rewrites || []).find((r) => r.source === u.pathname);
      const dest = new URL(rw ? rw.destination : u.pathname, "http://local");
      const name = dest.pathname.replace(/^\/api\//, "");
      const file = path.join(ROOT, "api", name + ".js");
      if (!/^[a-z-]+$/.test(name) || !fs.existsSync(file)) { res.statusCode = 404; return res.end("{}"); }
      req.query = Object.assign(Object.fromEntries(dest.searchParams.entries()), Object.fromEntries(u.searchParams.entries()));
      res.status = (c) => { res.statusCode = c; return res; };
      res.json = (b) => { if (!res.headersSent) res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(b)); return res; };
      res.send = (b) => { res.end(typeof b === "string" ? b : JSON.stringify(b)); return res; };
      try { return await (name === "lead-catcher" ? lc : require(file))(req, res); }
      catch (e) { res.statusCode = 500; return res.end(JSON.stringify({ ok: false, error: "dev_handler_error", message: String(e && e.message) })); }
    }
    if (u.pathname === "/__dev-signin") { // DEV ONLY helper: puts the fake desk + PIN in this browser, then opens the page.
      res.setHeader("Content-Type", "text/html");
      return res.end("<script>localStorage.setItem('aia_ws'," + JSON.stringify(u.searchParams.get("ws") || "riverbend-demo") + ");localStorage.setItem('aia_pin'," + JSON.stringify(u.searchParams.get("pin") || "1111") + ");location.replace(" + JSON.stringify(u.searchParams.get("next") || "/lead-catcher") + ");</script>");
    }
    let f = u.pathname === "/" ? "/index.html" : u.pathname;
    if (!path.extname(f)) f += ".html";
    const full = path.normalize(path.join(ROOT, f));
    if (!full.startsWith(ROOT) || full.includes("node_modules") || full.includes(path.sep + "api" + path.sep) || !fs.existsSync(full)) { res.statusCode = 404; return res.end("Not found"); }
    res.setHeader("Content-Type", TYPES[path.extname(full)] || "application/octet-stream");
    fs.createReadStream(full).pipe(res);
  });
  const port = Number(process.env.PORT || 4318);
  server.listen(port, "127.0.0.1", () => console.log("DEV ONLY Lead Catcher preview on http://127.0.0.1:" + port + "/lead-catcher  (desk riverbend-demo, owner PIN 1111, staff PINs 2222 and 3333, desk AI PIN 7777) data: " + dir));
})();
