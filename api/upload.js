const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { cors, mem, log, save, ready, workspaceOf, readBody, blobAllowed, personOf } = require("./_lib");

// Accepted uploads. HTML and SVG are intentionally absent: those types are
// never stored, even when a client claims a safer type or a safe extension.
const ALLOW = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/rtf": "rtf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/3gpp": "3gp"
};
const MAX = 8_000_000;
const MAX_BATCH = 8;
const RATE_MAX = 30;
const RATE_WINDOW_MS = 60 * 1000;
// First guard only. The counts live in this process, so the limit is per warm
// server instance, not a global cap across instances.
const rateHits = new Map();

function dir() {
  const p = process.env.AIA_UPLOAD_DIR || path.join("/tmp", "aia-uploads");
  fs.mkdirSync(p, { recursive: true });
  return p;
}
function decodeData(data) {
  const raw = String(data || "");
  const m = raw.match(/^data:([^;]+);base64,(.+)$/);
  if (m) return { mime: m[1], buf: Buffer.from(m[2], "base64") };
  return { mime: null, buf: Buffer.from(raw, "base64") };
}
function driverOf() {
  // Fix G: uploads go to the shared Blob store only on production.
  if (blobAllowed() && process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  return "tmp-file";
}
function blobErrText(e) {
  if (e == null) return "blob-fail";
  if (typeof e === "string") {
    const s = e.trim();
    if (!s || s === "[object Object]") return "blob-fail";
    return s.slice(0, 180);
  }
  if (typeof e === "number" || typeof e === "boolean") return String(e);
  const msg = e && e.message;
  if (typeof msg === "string" && msg && msg !== "[object Object]") return msg.slice(0, 180);
  if (msg && typeof msg === "object" && msg !== e) {
    const inner = blobErrText(msg);
    if (inner !== "blob-fail") return inner;
  }
  const nested = e && (e.error || e.cause);
  if (nested && nested !== e) {
    const inner = blobErrText(nested);
    if (inner !== "blob-fail") return inner;
  }
  if (e && typeof e === "object") {
    try {
      const json = JSON.stringify(e);
      if (json && json !== "{}" && json !== "[]") return json.slice(0, 180);
    } catch (x) {}
  }
  return "blob-fail";
}
function blobStoreId(token) {
  const env = process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN_STORE_ID || "";
  if (env) return env;
  const t = String(token || "");
  if (/^vercel_blob_rw_/.test(t)) {
    const parts = t.split("_");
    return parts[3] || "";
  }
  return "";
}
function blobPath() {
  // Unguessable. Never the desk, the filename, or the clock.
  return crypto.randomUUID() + "-" + crypto.randomBytes(8).toString("hex");
}
async function putBlob(name, buf, mime) {
  if (!blobAllowed()) throw new Error("Blob uploads are production-only");
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("Blob not configured");
  const storeId = blobStoreId(token);
  let last = "put failed";

  try {
    const { put } = require("@vercel/blob");
    const attempts = [];
    if (storeId) attempts.push({ storeId: storeId });
    attempts.push({});
    attempts.push({ token: token });
    for (let i = 0; i < attempts.length; i++) {
      try {
        const blob = await put(name, buf, Object.assign({
          access: "public",
          contentType: mime,
          addRandomSuffix: true,
          allowOverwrite: false
        }, attempts[i]));
        if (blob && blob.url) return blob.url;
      } catch (e) {
        last = blobErrText(e);
      }
    }
  } catch (e) {
    last = blobErrText(e);
  }

  const headersBase = {
    Authorization: "Bearer " + token,
    "x-api-version": "7",
    "x-content-type": mime,
    "x-add-random-suffix": "1"
  };
  if (storeId) headersBase["x-vercel-blob-store-id"] = storeId;
  const urls = [
    "https://vercel.com/api/blob/?pathname=" + encodeURIComponent(name),
    "https://blob.vercel-storage.com/" + name
  ];
  const variants = [
    {},
    { "x-vercel-blob-access": "public" }
  ];
  for (let u = 0; u < urls.length; u++) {
    for (let v = 0; v < variants.length; v++) {
      const r = await fetch(urls[u], {
        method: "PUT",
        headers: Object.assign({}, headersBase, variants[v]),
        body: buf
      });
      const text = await r.text();
      let json = {};
      try { json = JSON.parse(text); } catch (e) { json = { raw: text }; }
      if (r.ok && json.url) return json.url;
      last = blobErrText(json.error || json.message || text || ("http-" + r.status));
    }
  }
  throw new Error(last);
}
function extFromName(name) {
  const ext = String(name || "").split(".").pop().toLowerCase();
  const map = { jpg: "jpg", jpeg: "jpg", png: "png", webp: "webp", gif: "gif", heic: "heic", heif: "heif", pdf: "pdf", txt: "txt", csv: "csv", rtf: "rtf", doc: "doc", docx: "docx", xls: "xls", xlsx: "xlsx", mp4: "mp4", mov: "mov", webm: "webm", "3gp": "3gp" };
  return map[ext] || null;
}
function claimedType(type) {
  return String(type || "").toLowerCase().split(";")[0].trim();
}
function markupClaim(type, name) {
  const t = claimedType(type);
  if (t === "text/html" || t === "application/xhtml+xml" || t === "image/svg+xml") return true;
  const ext = String(name || "").split(".").pop().toLowerCase();
  return ext === "html" || ext === "htm" || ext === "xhtml" || ext === "svg";
}
function sniffImage(buf) {
  if (!buf || !buf.length) return "";
  if (buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return "image/jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47 && buf[4] === 0x0D && buf[5] === 0x0A && buf[6] === 0x1A && buf[7] === 0x0A) return "image/png";
  if (buf.length >= 6) {
    const g = buf.slice(0, 6).toString("ascii");
    if (g === "GIF87a" || g === "GIF89a") return "image/gif";
  }
  if (buf.length >= 12 && buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return "";
}
function looksLikeMarkup(buf) {
  if (!buf || !buf.length) return false;
  let text = buf.slice(0, Math.min(buf.length, 512)).toString("utf8");
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const head = text.replace(/^\s+/, "").toLowerCase();
  if (head.startsWith("<!doctype html") || head.startsWith("<html") || head.startsWith("<svg")) return true;
  if (/<svg[\s>]/.test(head)) return true;
  return false;
}
// png, jpeg, gif, and webp keep their real type. Everything else is stored as
// octet-stream so a direct Blob link cannot be sniffed into HTML or SVG.
function storedType(buf) {
  return sniffImage(buf) || "application/octet-stream";
}
function accepted(type, name, buf) {
  if (markupClaim(type, name)) return false;
  if (sniffImage(buf)) return true;
  if (looksLikeMarkup(buf)) return false;
  const t = claimedType(type);
  if (ALLOW[t]) return true;
  return !!extFromName(name);
}
function isPhotoType(type) {
  const t = claimedType(type);
  return t === "image/png" || t === "image/jpeg" || t === "image/gif" || t === "image/webp";
}
function kindOf(type) {
  return isPhotoType(type) ? "photo" : "document";
}
function labelOf(name, id) {
  const base = String(name || "").replace(/[\r\n\0]/g, "").trim().slice(0, 180);
  return base || id;
}
function publicFile(rec) {
  const photo = isPhotoType(rec && rec.type);
  const out = {
    id: rec.id,
    name: rec.name,
    type: rec.type,
    kind: photo ? "photo" : "document",
    bytes: rec.bytes,
    url: rec.url,
    driver: rec.driver
  };
  if (photo) out.photoUrl = rec.url;
  return out;
}
function fallbackType(type) {
  const t = claimedType(type);
  if (t === "image/jpg" || t === "image/jpeg") return "image/jpeg";
  if (t === "image/png" || t === "image/gif" || t === "image/webp") return t;
  return "application/octet-stream";
}
function senderOf(req) {
  const headers = (req && req.headers) || {};
  const fwd = String(headers["x-forwarded-for"] || headers["x-real-ip"] || "").split(",")[0].trim().slice(0, 80);
  return fwd || "local";
}
function overRate(req) {
  const key = senderOf(req);
  const now = Date.now();
  const prev = (rateHits.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (prev.length >= RATE_MAX) {
    rateHits.set(key, prev);
    return true;
  }
  prev.push(now);
  rateHits.set(key, prev);
  return false;
}
// Same seat check as GET /api/desks: personOf reads X-Pin, X-Session, and the aia_session cookie.
function seatOf(req) {
  const slug = workspaceOf(req);
  const headers = Object.assign({}, (req && req.headers) || {});
  headers["x-workspace"] = slug;
  const { workspace: row, person, pending } = personOf({ headers, query: (req && req.query) || {} }, slug);
  return { row, person, pending };
}
function deskOf(req) {
  const slug = workspaceOf(req);
  if (!slug) return null;
  const rows = Array.isArray(mem.workspaces) ? mem.workspaces : [];
  return rows.find((w) => w && w.slug === slug) || null;
}
function deny(res, status, error) {
  return res.status(status).json({ ok: false, error: error, driver: driverOf() });
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!Array.isArray(mem.files)) mem.files = [];
  if (req.method === "GET") {
    await ready();
    const gate = seatOf(req);
    if (!gate.row) return deny(res, 404, "No desk with that name.");
    if (gate.pending) return deny(res, 403, "That seat is waiting on the owner.");
    if (!gate.person) return deny(res, 401, "Desk code required.");
    const id = req.query && req.query.id;
    if (!id) {
      const files = mem.files.filter((f) => f && f.workspace === gate.row.slug).slice(0, 40).map(publicFile);
      return res.status(200).json({
        workspace: gate.row.slug,
        driver: driverOf(),
        files: files,
        note: driverOf() === "blob" ? "Vercel Blob — durable" : "Lambda /tmp — file dies with the instance. Add BLOB_READ_WRITE_TOKEN."
      });
    }
    const rec = mem.files.find((f) => f && f.id === id && f.workspace === gate.row.slug);
    if (!rec) return res.status(404).json({ error: "File not found" });
    if (rec.remoteUrl) {
      res.setHeader("Location", rec.remoteUrl);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(302).end();
    }
    try {
      const buf = fs.readFileSync(rec.path);
      const type = fallbackType(rec.type);
      res.setHeader("Content-Type", type);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, max-age=3600");
      if (type === "application/octet-stream") res.setHeader("Content-Disposition", "attachment");
      return res.status(200).end(buf);
    } catch (e) {
      return res.status(410).json({ error: "File expired on this lambda" });
    }
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Use GET or POST" });
  if (overRate(req)) return res.status(429).json({ error: "Too many uploads. Wait a minute and try again." });
  await ready();
  const row = deskOf(req);
  if (!row) return res.status(404).json({ error: "No desk with that name." });
  const body = await readBody(req);
  const batch = Array.isArray(body.files) ? body.files.slice(0, MAX_BATCH) : null;
  const items = batch && batch.length ? batch : [{ name: body.name, type: body.type, data: body.data || body.file }];
  const saved = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i] || {};
    const decoded = decodeData(item.data || item.file || "");
    const buf = decoded.buf;
    const type = String(item.type || decoded.mime || "");
    if (!buf || !buf.length) return res.status(400).json({ error: "Missing file data" });
    if (buf.length > MAX) return res.status(413).json({ error: "Each file must stay under 8MB." });
    if (!accepted(type, item.name, buf)) return res.status(415).json({ error: "Photos, documents, or short videos only.", allow: Object.keys(ALLOW) });
    const mime = storedType(buf);
    const id = "file_" + crypto.randomBytes(16).toString("hex");
    const rec = {
      id: id,
      workspace: row.slug,
      name: labelOf(item.name, id),
      type: mime,
      bytes: buf.length,
      kind: kindOf(mime),
      driver: driverOf(),
      createdAt: new Date().toISOString()
    };
    try {
      if (driverOf() === "blob") {
        const name = blobPath();
        rec.remoteUrl = await putBlob(name, buf, mime);
        rec.url = rec.remoteUrl;
      } else {
        const filePath = path.join(dir(), id);
        fs.writeFileSync(filePath, buf);
        rec.path = filePath;
        rec.url = "/api/upload?id=" + id;
      }
    } catch (e) {
      return res.status(500).json({ error: "Store failed", detail: blobErrText(e) });
    }
    mem.files.unshift(rec);
    saved.push(rec);
    log("Capture", "File · " + rec.name, rec.driver, row.slug);
  }
  await save();
  const first = saved[0];
  const files = saved.map(publicFile);
  const reply = {
    ok: true,
    file: files[0] || null,
    files: files,
    driver: driverOf()
  };
  if (first && isPhotoType(first.type)) reply.photoUrl = first.url;
  return res.status(201).json(reply);
};

// Shared with the one-time old-upload move. POST behavior above is unchanged.
module.exports.storedType = storedType;
module.exports.looksLikeMarkup = looksLikeMarkup;
module.exports.markupClaim = markupClaim;
module.exports.blobPath = blobPath;
module.exports.sniffImage = sniffImage;
