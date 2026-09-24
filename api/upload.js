const fs = require("fs");
const path = require("path");
const { cors, mem, log, save, workspaceOf, readBody } = require("./_lib");

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
  "text/html": "html",
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
  if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
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
async function putBlob(name, buf, mime) {
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
          addRandomSuffix: false,
          allowOverwrite: true
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
    "x-add-random-suffix": "0"
  };
  if (storeId) headersBase["x-vercel-blob-store-id"] = storeId;
  const urls = [
    "https://vercel.com/api/blob/?pathname=" + encodeURIComponent(name),
    "https://blob.vercel-storage.com/" + name
  ];
  const variants = [
    {},
    { "x-allow-overwrite": "1" },
    { "x-vercel-blob-access": "public" },
    { "x-allow-overwrite": "1", "x-vercel-blob-access": "public" }
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
  const map = { jpg: "jpg", jpeg: "jpg", png: "png", webp: "webp", gif: "gif", heic: "heic", heif: "heif", pdf: "pdf", txt: "txt", csv: "csv", html: "html", htm: "html", rtf: "rtf", doc: "doc", docx: "docx", xls: "xls", xlsx: "xlsx", mp4: "mp4", mov: "mov", webm: "webm", "3gp": "3gp" };
  return map[ext] || null;
}
function mimeFromExt(ext) {
  const hit = Object.keys(ALLOW).find((k) => ALLOW[k] === ext);
  return hit || "application/octet-stream";
}
function kindOf(ext) {
  if (/jpg|png|webp|gif|heic|heif/.test(ext)) return "photo";
  if (/mp4|mov|webm|3gp/.test(ext)) return "video";
  return "document";
}
function publicFile(rec) {
  return { id: rec.id, name: rec.name, type: rec.type, kind: rec.kind, bytes: rec.bytes, url: rec.url, driver: rec.driver };
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!Array.isArray(mem.files)) mem.files = [];
  const workspace = workspaceOf(req);
  if (req.method === "GET") {
    const id = req.query.id;
    if (!id) {
      return res.status(200).json({
        workspace, driver: driverOf(),
        files: mem.files.filter((f) => f.workspace === workspace).slice(0, 40),
        note: driverOf() === "blob" ? "Vercel Blob — durable" : "Lambda /tmp — file dies with the instance. Add BLOB_READ_WRITE_TOKEN."
      });
    }
    const rec = mem.files.find((f) => f.id === id && f.workspace === workspace);
    if (!rec) return res.status(404).json({ error: "File not found" });
    if (rec.remoteUrl) { res.setHeader("Location", rec.remoteUrl); return res.status(302).end(); }
    try {
      const buf = fs.readFileSync(rec.path);
      res.setHeader("Content-Type", rec.type);
      res.setHeader("Cache-Control", "private, max-age=3600");
      return res.status(200).end(buf);
    } catch (e) {
      return res.status(410).json({ error: "File expired on this lambda" });
    }
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Use GET or POST" });
  const body = await readBody(req);
  const batch = Array.isArray(body.files) ? body.files.slice(0, MAX_BATCH) : null;
  const items = batch && batch.length ? batch : [{ name: body.name, type: body.type, data: body.data || body.file }];
  const saved = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i] || {};
    const { mime: parsedMime, buf } = decodeData(item.data || item.file || "");
    const type = String(item.type || parsedMime || "").toLowerCase();
    const ext = ALLOW[type] || extFromName(item.name);
    if (!ext) return res.status(415).json({ error: "Photos, documents, or short videos only.", allow: Object.keys(ALLOW) });
    if (!buf || !buf.length) return res.status(400).json({ error: "Missing file data" });
    if (buf.length > MAX) return res.status(413).json({ error: "Each file must stay under 8MB." });
    const id = "file_" + Date.now().toString(36) + i;
    const name = workspace + "/" + id + "." + ext;
    const rec = { id, workspace, name: item.name || name, type: type || mimeFromExt(ext), bytes: buf.length, kind: kindOf(ext), driver: driverOf(), createdAt: new Date().toISOString() };
    try {
      if (driverOf() === "blob") {
        rec.remoteUrl = await putBlob(name, buf, rec.type);
        rec.url = rec.remoteUrl;
      } else {
        const filePath = path.join(dir(), id + "." + ext);
        fs.writeFileSync(filePath, buf);
        rec.path = filePath;
        rec.url = "/api/upload?id=" + id;
      }
    } catch (e) {
      return res.status(500).json({ error: "Store failed", detail: blobErrText(e) });
    }
    mem.files.unshift(rec);
    saved.push(publicFile(rec));
    log("Capture", "File · " + rec.name, rec.driver, workspace);
  }
  await save();
  const first = saved[0];
  return res.status(201).json({ ok: true, file: first, files: saved, photoUrl: first && first.url, count: saved.length, driver: driverOf() });
};
