const crypto = require("crypto");
const {
  cors, mem, log, save, ready, readBody, workspaceOf, deskSeat, isOwner, scrubLog,
  blobAllowed, blobSeal, blobCopy, blobHead, blobDel, blobListAll, blobPutAt, storeBody, applyStore, blobErrText
} = require("./_lib");
const { addTalk } = require("./_fields");
const uploadApi = require("./upload");

// Temporary. Remove this file after the 9 pre-#324 uploads have been moved
// and James has said Yes to delete the old copies. Dry-run is the default.
// Nothing here deletes unless action is "delete" and confirmDelete is "yes".
const CONFIRM = "move-old-uploads";
const CONFIRM_DELETE = "yes";
const EXPECT = 9;
const OLD_PATH = /^[^/]+\/file_[0-9a-z]+\.[a-z0-9]+$/;

function driverOf() {
  return blobAllowed() && process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "tmp-file";
}

function cleanText(text) {
  let s = scrubLog(text == null ? "" : text);
  const token = process.env.BLOB_READ_WRITE_TOKEN || "";
  if (token && s.indexOf(token) >= 0) s = s.split(token).join("[redacted]");
  const extra = process.env.BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN || "";
  if (extra && s.indexOf(extra) >= 0) s = s.split(extra).join("[redacted]");
  return s;
}

function send(res, status, body) {
  let text = JSON.stringify(body);
  text = cleanText(text);
  return res.status(status).json(JSON.parse(text));
}

function deny(res, status, error) {
  return send(res, status, { ok: false, error: error, driver: driverOf() });
}

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function pathnameOf(url) {
  try {
    const u = new URL(String(url || ""));
    return decodeURIComponent(u.pathname.replace(/^\/+/, ""));
  } catch (e) {
    return "";
  }
}

function isOldPath(pathname) {
  return OLD_PATH.test(String(pathname || ""));
}

function peekUploads() {
  const m = mem.migrations;
  if (!m || typeof m !== "object" || Array.isArray(m)) return {};
  const uploads = m.uploads;
  if (!uploads || typeof uploads !== "object" || Array.isArray(uploads)) return {};
  return uploads;
}

function uploadMap() {
  if (!mem.migrations || typeof mem.migrations !== "object" || Array.isArray(mem.migrations)) mem.migrations = {};
  if (!mem.migrations.uploads || typeof mem.migrations.uploads !== "object" || Array.isArray(mem.migrations.uploads)) {
    mem.migrations.uploads = {};
  }
  return mem.migrations.uploads;
}

function mappingByPath(pathname) {
  const map = peekUploads();
  const keys = Object.keys(map);
  for (let i = 0; i < keys.length; i++) {
    const row = map[keys[i]];
    if (!row) continue;
    if (row.oldPath === pathname || pathnameOf(keys[i]) === pathname || pathnameOf(row.oldUrl) === pathname) return row;
  }
  return null;
}

// Read-only link-shape counts. Counts only: no url, path, host, file id, file name,
// or workspace name is ever put in the result. Never writes the store.
const UUID_HEAD = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const HEX16_TAIL = /^-[0-9a-f]{16}/i;
const SUFFIX_TAIL = /^-[0-9a-z]{6,}$/i;
const EXT_IMAGE = ["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "heic", "heif", "ico", "tif", "tiff"];
const EXT_VIDEO = ["mp4", "mov", "webm", "m4v", "avi", "mkv", "mpg", "mpeg"];
const EXT_MARKUP = ["html", "htm", "xhtml", "svg"];

function extClass(ext) {
  const e = String(ext || "").toLowerCase();
  if (!e) return "none";
  if (EXT_IMAGE.indexOf(e) >= 0) return "image";
  if (e === "pdf") return "pdf";
  if (EXT_VIDEO.indexOf(e) >= 0) return "video";
  if (EXT_MARKUP.indexOf(e) >= 0) return "htmlSvg";
  return "other";
}

function shapeSlot() {
  return {
    total: 0,
    notText: 0,
    url: { absolute: 0, protocolRelative: 0, relative: 0, none: 0 },
    relativeApiRoute: 0,
    hasQuery: 0,
    host: { vercelBlob: 0, other: 0, none: 0 },
    depth: { "0": 0, "1": 0, "2": 0, "3plus": 0 },
    filePrefix: 0,
    uuidName: 0,
    uuidHex16Name: 0,
    randomSuffix: 0,
    ext: { image: 0, pdf: 0, video: 0, htmlSvg: 0, other: 0, none: 0 },
    upperExt: 0,
    driver: { blob: 0, tmpFile: 0, other: 0, none: 0 },
    matchesOldPath: 0,
    looksOldPath: 0,
    hasMapping: 0,
    slugPresent: 0,
    slugKnown: 0,
    slugIsFirstSegment: 0
  };
}

function shapePath(raw) {
  const u = String(raw || "");
  if (!u) return { kind: "none", host: "none", path: "", query: false };
  const query = u.indexOf("?") >= 0;
  let kind = "relative";
  let host = "none";
  let path = "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(u) || u.indexOf("//") === 0) {
    kind = u.indexOf("//") === 0 ? "protocolRelative" : "absolute";
    try {
      const parsed = new URL(kind === "protocolRelative" ? "https:" + u : u);
      const h = String(parsed.hostname || "").toLowerCase();
      host = h === "blob.vercel-storage.com" || /\.blob\.vercel-storage\.com$/.test(h) ? "vercelBlob" : "other";
      path = parsed.pathname.replace(/^\/+/, "");
    } catch (e) {
      host = "other";
    }
  } else {
    path = u.split("#")[0].split("?")[0].replace(/^\/+/, "");
  }
  try { path = decodeURIComponent(path); } catch (e) { /* keep raw path */ }
  return { kind: kind, host: host, path: path, query: query };
}

function shapeAdd(slot, raw, extra, slugs) {
  slot.total += 1;
  if (raw == null || typeof raw === "object" || typeof raw === "function") raw = "";
  const info = shapePath(raw);
  slot.url[info.kind] += 1;
  slot.host[info.host] += 1;
  if (info.query) slot.hasQuery += 1;
  if (info.kind === "relative" && /^api\//i.test(info.path)) slot.relativeApiRoute += 1;
  const path = info.path;
  const parts = path ? path.split("/") : [];
  const depth = parts.length ? parts.length - 1 : 0;
  slot.depth[depth >= 3 ? "3plus" : String(depth)] += 1;
  const base = parts.length ? parts[parts.length - 1] : "";
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 ? base.slice(dot + 1) : "";
  const stem = dot > 0 ? base.slice(0, dot) : base;
  slot.ext[extClass(ext)] += 1;
  if (ext && ext !== ext.toLowerCase()) slot.upperExt += 1;
  if (/^file_/i.test(stem)) slot.filePrefix += 1;
  let rest = stem;
  if (UUID_HEAD.test(stem)) {
    slot.uuidName += 1;
    rest = stem.slice(36);
    if (HEX16_TAIL.test(rest)) {
      slot.uuidHex16Name += 1;
      rest = rest.slice(17);
    }
    if (SUFFIX_TAIL.test(rest)) slot.randomSuffix += 1;
  } else if (/.-(?=[0-9a-z]*[0-9])(?=[0-9a-z]*[a-z])[0-9a-z]{8,}$/i.test(stem)) {
    slot.randomSuffix += 1;
  }
  // matchesOldPath is what the tool itself matches (toolPath). looksOldPath also counts
  // relative links, which the tool cannot see, so a relative old-style name shows up here.
  const toolPath = String((extra && extra.toolPath) || "");
  if (toolPath && isOldPath(toolPath)) slot.matchesOldPath += 1;
  if (path && isOldPath(path)) slot.looksOldPath += 1;
  if ((toolPath && mappingByPath(toolPath)) || (path && mappingByPath(path))) slot.hasMapping += 1;
  const first = parts.length > 1 ? parts[0] : "";
  if (first && slugs.known[first]) slot.slugKnown += 1;
  if (extra && extra.slug) {
    slot.slugPresent += 1;
    if (first && first === extra.slug) slot.slugIsFirstSegment += 1;
  }
  if (extra && Object.prototype.hasOwnProperty.call(extra, "driver")) {
    const d = String(extra.driver || "");
    slot.driver[d === "blob" ? "blob" : d === "tmp-file" ? "tmpFile" : d ? "other" : "none"] += 1;
  }
}

function linkShapes(files, blobs, listedVia) {
  const known = {};
  (Array.isArray(mem.workspaces) ? mem.workspaces : []).forEach((w) => {
    if (w && typeof w.slug === "string" && w.slug) known[w.slug] = true;
  });
  const slugs = { known: known };
  const f = shapeSlot();
  const b = shapeSlot();
  delete b.driver;
  delete b.slugPresent;
  delete b.slugIsFirstSegment;
  let filesMatchingOldPath = 0;
  let blobsMatchingOldPath = 0;
  let remotePresent = 0;
  let remoteSame = 0;
  let remoteMatchesOldPath = 0;
  (Array.isArray(files) ? files : []).forEach((rec) => {
    if (!rec || typeof rec !== "object") {
      f.total += 1;
      f.notText += 1;
      return;
    }
    const raw = typeof rec.url === "string" && rec.url ? rec.url : (typeof rec.remoteUrl === "string" ? rec.remoteUrl : "");
    const toolPath = pathnameOf(raw);
    shapeAdd(f, raw, { slug: typeof rec.workspace === "string" ? rec.workspace : "", driver: rec.driver, toolPath: toolPath }, slugs);
    if (isOldPath(toolPath)) filesMatchingOldPath += 1;
    if (typeof rec.remoteUrl === "string" && rec.remoteUrl) {
      remotePresent += 1;
      if (rec.remoteUrl === rec.url) remoteSame += 1;
      if (isOldPath(pathnameOf(rec.remoteUrl))) remoteMatchesOldPath += 1;
    }
  });
  (Array.isArray(blobs) ? blobs : []).forEach((blob) => {
    if (!blob || typeof blob !== "object") {
      b.total += 1;
      b.notText += 1;
      return;
    }
    const raw = typeof blob.url === "string" && blob.url ? blob.url : (typeof blob.pathname === "string" ? blob.pathname : "");
    const toolPath = String(blob.pathname || pathnameOf(blob.url) || "");
    shapeAdd(b, raw, { toolPath: toolPath }, slugs);
    if (isOldPath(toolPath)) blobsMatchingOldPath += 1;
  });
  delete b.driver;
  f.remoteUrl = { present: remotePresent, sameAsUrl: remoteSame, matchesOldPath: remoteMatchesOldPath };
  return {
    listedVia: listedVia || "unknown",
    filesTotal: f.total,
    blobsTotal: b.total,
    filesMatchingOldPath: filesMatchingOldPath,
    blobsMatchingOldPath: blobsMatchingOldPath,
    files: f,
    blobs: b
  };
}

function safeShapes(files, blobs, listedVia) {
  try {
    return linkShapes(files, blobs, listedVia);
  } catch (e) {
    return { error: "shape count failed", listedVia: listedVia || "unknown" };
  }
}

function walkStore(visit) {
  const body = storeBody();
  function rec(node, parent, key, ctx) {
    if (typeof node === "string") {
      visit(node, parent, key, ctx);
      return;
    }
    if (!node || typeof node !== "object") return;
    const next = Object.assign({}, ctx);
    if (node.id && /^job_/.test(String(node.id))) next.jobId = String(node.id);
    if (node.id && /^file_/.test(String(node.id))) next.fileId = String(node.id);
    if (Array.isArray(node)) {
      node.forEach((item, i) => rec(item, node, i, next));
      return;
    }
    Object.keys(node).forEach((k) => {
      if (!parent && k === "migrations") return;
      const child = Object.assign({}, next);
      if (k === "files" && next.jobId) child.inJobFiles = true;
      rec(node[k], node, k, child);
    });
  }
  rec(body, null, null, {});
}

function fieldName(ctx, key) {
  if (ctx && ctx.inJobFiles) return "files." + key;
  return String(key);
}

function cardRefs(oldUrl) {
  const byId = {};
  walkStore((value, parent, key, ctx) => {
    if (!ctx.jobId || typeof value !== "string" || value.indexOf(oldUrl) < 0) return;
    if (!byId[ctx.jobId]) byId[ctx.jobId] = { id: ctx.jobId, fields: [] };
    const name = fieldName(ctx, key);
    if (byId[ctx.jobId].fields.indexOf(name) < 0) byId[ctx.jobId].fields.push(name);
  });
  return Object.keys(byId).map((id) => byId[id]);
}

function stillHolds(oldUrl) {
  let n = 0;
  walkStore((value) => {
    if (typeof value === "string" && value.indexOf(oldUrl) >= 0) n += 1;
  });
  return n;
}

function replaceUrl(oldUrl, newUrl) {
  const was = [];
  walkStore((value, parent, key, ctx) => {
    if (typeof value !== "string" || value.indexOf(oldUrl) < 0) return;
    if (!parent || key == null) return;
    parent[key] = value === oldUrl ? newUrl : value.split(oldUrl).join(newUrl);
    was.push({
      jobId: ctx.jobId || "",
      fileId: ctx.fileId || "",
      field: fieldName(ctx, key),
      value: value
    });
  });
  return was;
}

async function publicGet(url) {
  const r = await fetch(url, { method: "GET", redirect: "follow" });
  const headers = r.headers;
  const type = String((headers && headers.get && headers.get("content-type")) || "").split(";")[0].trim().toLowerCase();
  const lenRaw = headers && headers.get ? headers.get("content-length") : null;
  let buf;
  if (r && typeof r.arrayBuffer === "function") buf = Buffer.from(await r.arrayBuffer());
  else buf = Buffer.from(String(await r.text()));
  const contentLength = lenRaw == null || lenRaw === "" || Number.isNaN(Number(lenRaw)) ? null : Number(lenRaw);
  return { status: r.status, type: type, bytes: buf, size: buf.length, contentLength: contentLength };
}

function chooseType(bytes, file, keep) {
  const sniffed = uploadApi.storedType(bytes);
  if (!keep) return sniffed;
  const original = String((file && file.type) || "").split(";")[0].trim().toLowerCase();
  if (!original) return sniffed;
  if (original === "text/html" || original === "image/svg+xml" || original === "application/xhtml+xml") return sniffed;
  return original;
}

function isMarkup(bytes, file, pathname) {
  if (uploadApi.looksLikeMarkup(bytes)) return true;
  if (uploadApi.markupClaim(file && file.type, file && file.name)) return true;
  if (uploadApi.markupClaim("", pathname)) return true;
  return false;
}

function sayOnCard(job, person, text) {
  const note = cleanText(text).trim();
  if (!job || !note) return;
  // Same writes as POST /api/jobs { action: "say" }: addTalk, a Note log line, lib.log.
  // Done in this request so the relink stays one save. jobs.js ready() would reload the store.
  addTalk(job, (person && person.name) || "desk", note.slice(0, 500), "note");
  job.log = (job.log || []).concat(["Note"]);
  log("Desk", "Note · " + (job.title || job.id || "card"), "OK", job.workspace || null);
}

function progressCard(ctx) {
  const id = String((ctx.body && (ctx.body.cardId || ctx.body.id)) || "").trim();
  if (!id) return { id: "", card: null, missing: false };
  const card = (mem.jobs || []).find((j) => j && j.id === id && j.workspace === ctx.row.slug) || null;
  return { id: id, card: card, missing: !card };
}

async function readOld(item) {
  let meta = null;
  try {
    meta = await blobHead(item.url);
  } catch (e) {
    item.readError = cleanText(blobErrText(e));
    return item;
  }
  const pub = await publicGet(item.url);
  if (pub.status !== 200 || !pub.bytes) {
    item.readError = "old file did not answer 200";
    return item;
  }
  item.bytes = pub.size;
  item.sha256 = sha256(pub.bytes);
  item.bytesBuf = pub.bytes;
  item.headType = meta && meta.contentType ? String(meta.contentType).split(";")[0].trim().toLowerCase() : "";
  if (meta && meta.size != null && Number(meta.size) !== pub.size) item.readError = "head size does not match the file";
  return item;
}

async function buildPlan(keep) {
  const listed = await blobListAll();
  const shapes = safeShapes(mem.files, listed, blobListAll.via || "unknown");
  const blobs = (listed || []).filter((b) => b && isOldPath(b.pathname || pathnameOf(b.url)));
  const items = [];
  const seen = {};
  blobs.forEach((b) => {
    const pathname = b.pathname || pathnameOf(b.url);
    if (!pathname || seen[pathname]) return;
    seen[pathname] = true;
    const file = (mem.files || []).find((f) => f && (pathnameOf(f.url) === pathname || pathnameOf(f.remoteUrl) === pathname)) || null;
    const url = (file && (file.url || file.remoteUrl)) || b.url;
    items.push({
      pathname: pathname,
      url: url,
      blobUrl: b.url || url,
      fileId: file ? file.id : "",
      file: file,
      fromType: file && file.type ? String(file.type) : ""
    });
  });
  const missing = [];
  (mem.files || []).forEach((f) => {
    if (!f) return;
    const pathname = pathnameOf(f.url || f.remoteUrl);
    if (!isOldPath(pathname) || seen[pathname]) return;
    const known = mappingByPath(pathname);
    if (known) return;
    missing.push({ pathname: pathname, url: f.url || f.remoteUrl || "", fileId: f.id || "" });
  });
  const orphans = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.file) continue;
    if (mappingByPath(item.pathname)) continue;
    orphans.push({ pathname: item.pathname, url: item.url });
  }
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const prev = mappingByPath(item.pathname);
    item.cards = cardRefs(item.url);
    if (item.blobUrl && item.blobUrl !== item.url) {
      cardRefs(item.blobUrl).forEach((ref) => {
        const have = item.cards.find((c) => c.id === ref.id);
        if (!have) item.cards.push(ref);
        else ref.fields.forEach((f) => { if (have.fields.indexOf(f) < 0) have.fields.push(f); });
      });
    }
    if (prev && prev.status === "flagged") {
      item.plan = "flagged";
      item.reason = prev.reason || "markup";
      continue;
    }
    if (prev && prev.verified && prev.newUrl && (prev.status === "relinked" || prev.status === "deleted" || prev.oldDeleted)) {
      item.plan = stillHolds(item.url) ? "relink" : "already";
      item.newUrl = prev.newUrl;
      item.newPath = prev.newPath || pathnameOf(prev.newUrl);
      item.toType = prev.type || "";
      item.bytes = prev.bytes;
      item.sha256 = prev.sha256;
      continue;
    }
    await readOld(item);
    if (item.readError) {
      item.plan = "unread";
      continue;
    }
    if (isMarkup(item.bytesBuf, item.file, item.pathname)) {
      item.plan = "flag";
      item.reason = "markup";
      continue;
    }
    item.toType = chooseType(item.bytesBuf, item.file, keep);
    item.plan = "copy";
    delete item.bytesBuf;
  }
  items.forEach((item) => { delete item.bytesBuf; delete item.file; });
  const mismatch = items.length !== EXPECT || missing.length > 0 || orphans.length > 0;
  return { items: items, missing: missing, orphans: orphans, count: items.length, expect: EXPECT, mismatch: mismatch, shapes: shapes };
}

function publicItem(item) {
  return {
    oldPath: item.pathname,
    oldUrl: item.url,
    bytes: item.bytes || 0,
    fromType: item.fromType || "",
    toType: item.toType || "",
    plan: item.plan,
    reason: item.reason || "",
    readError: item.readError || "",
    newUrl: item.newUrl || "",
    newPath: item.newPath || "",
    sha256: item.sha256 || "",
    cards: item.cards || [],
    fileId: item.fileId || ""
  };
}

function reportBody(ctx, extra) {
  return Object.assign({
    ok: true,
    driver: driverOf(),
    dryRun: !extra.apply,
    apply: !!extra.apply,
    deleted: false,
    keepOriginalTypes: !!(ctx.body && ctx.body.keepOriginalTypes === true),
    expect: EXPECT
  }, extra);
}

async function verifyNew(item) {
  const got = await publicGet(item.newUrl);
  if (got.status !== 200) return "new file status " + got.status;
  if (got.type !== String(item.toType || "").toLowerCase()) return "content-type";
  if (got.size !== item.bytes) return "size";
  if (got.contentLength !== item.bytes) return "content-length";
  if (sha256(got.bytes) !== item.sha256) return "sha256";
  return "";
}

async function sealedBackup() {
  const body = storeBody();
  const sealed = blobSeal(JSON.stringify(body));
  if (String(sealed).indexOf("aia-blob-1") < 0) {
    const err = new Error("Backup could not be sealed");
    err.code = "AIA_BACKUP";
    throw err;
  }
  const key = "aia/backup-uploads-" + Date.now() + ".json";
  const put = await blobPutAt(key, sealed, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: "application/json"
  });
  return { key: (put && put.pathname) || key, url: put && put.url || "" };
}

function noteChangedCards(ctx, wasRows) {
  const seen = {};
  wasRows.forEach((row) => {
    if (!row.jobId || seen[row.jobId]) return;
    seen[row.jobId] = true;
    const job = (mem.jobs || []).find((j) => j && j.id === row.jobId);
    if (!job) return;
    job.log = (job.log || []).concat(["Upload moved to a private name"]);
    sayOnCard(job, ctx.person, "An old upload on this card now uses a private name. The old copy stays until you say Yes to delete it.");
  });
}

function noteProgress(ctx, card, lines) {
  if (!card) return;
  lines.forEach((line) => sayOnCard(card, ctx.person, line));
}

async function moveOld(req, res, ctx, apply) {
  const keep = !!(ctx.body && ctx.body.keepOriginalTypes === true);
  const progress = progressCard(ctx);
  let plan;
  try {
    plan = await buildPlan(keep);
  } catch (e) {
    return send(res, 500, reportBody(ctx, {
      apply: apply, ok: false, error: cleanText(blobErrText(e)), step: "inventory",
      shapes: safeShapes(mem.files, [], "failed")
    }));
  }
  const steps = [];
  steps.push({
    step: "inventory",
    count: plan.count,
    expect: plan.expect,
    mismatch: plan.mismatch,
    orphans: plan.orphans,
    missing: plan.missing,
    flagged: plan.items.filter((i) => i.plan === "flag" || i.plan === "flagged").length
  });
  const base = {
    count: plan.count,
    mismatch: plan.mismatch,
    orphans: plan.orphans,
    missing: plan.missing,
    items: plan.items.map(publicItem),
    shapes: plan.shapes,
    steps: steps,
    cardId: progress.id,
    cardFound: progress.id ? !progress.missing : false
  };
  if (!apply) {
    steps.unshift({ step: "preflight", dryRun: true, backup: false });
    return send(res, 200, reportBody(ctx, Object.assign({ apply: false, noop: false }, base, {
      note: "Dry run. Nothing was copied, relinked, or deleted."
    })));
  }
  if (plan.mismatch || plan.items.some((i) => i.plan === "unread")) {
    return send(res, 409, reportBody(ctx, Object.assign({ apply: true, ok: false }, base, {
      error: plan.mismatch ? "Inventory does not match the 9 old uploads." : "An old file could not be read. Nothing was changed."
    })));
  }
  if (progress.missing) return deny(res, 404, "Job not found.");
  const todo = plan.items.filter((i) => i.plan === "copy" || i.plan === "relink");
  const flags = plan.items.filter((i) => i.plan === "flag" || i.plan === "flagged");
  if (!todo.length) {
    steps.unshift({ step: "preflight", dryRun: false, backup: false, noop: true });
    return send(res, 200, reportBody(ctx, Object.assign({ apply: true, noop: true }, base, {
      note: "Already moved. Nothing to copy or relink. Old copies are still there until you say Yes."
    })));
  }
  let backup = null;
  try {
    backup = await sealedBackup();
  } catch (e) {
    return send(res, 500, reportBody(ctx, Object.assign({ apply: true, ok: false }, base, {
      error: cleanText(blobErrText(e)), step: "preflight"
    })));
  }
  steps.unshift({ step: "preflight", backup: backup.key, sealed: true });
  const copied = [];
  for (let i = 0; i < plan.items.length; i++) {
    const item = plan.items[i];
    if (item.plan !== "copy") continue;
    try {
      const blob = await blobCopy(item.url, uploadApi.blobPath(), {
        addRandomSuffix: true,
        contentType: item.toType
      });
      if (!blob || !blob.url) throw new Error("copy returned no url");
      item.newUrl = blob.url;
      item.newPath = blob.pathname || pathnameOf(blob.url);
      copied.push(item);
    } catch (e) {
      return send(res, 409, reportBody(ctx, Object.assign({ apply: true, ok: false }, base, {
        items: plan.items.map(publicItem),
        error: "Copy stopped. Nothing was relinked.",
        detail: cleanText(blobErrText(e)),
        step: "copy"
      })));
    }
  }
  steps.push({ step: "copy", copied: copied.length, flagged: flags.length });
  for (let i = 0; i < copied.length; i++) {
    const why = await verifyNew(copied[i]);
    if (why) {
      steps.push({ step: "verify", ok: false, reason: why, oldPath: copied[i].pathname });
      return send(res, 409, reportBody(ctx, Object.assign({ apply: true, ok: false }, base, {
        items: plan.items.map(publicItem),
        steps: steps,
        error: "Verify failed. Nothing was relinked.",
        verify: why
      })));
    }
    copied[i].verified = true;
  }
  const relinkAlso = plan.items.filter((i) => i.plan === "relink" && i.newUrl);
  for (let i = 0; i < relinkAlso.length; i++) {
    const why = await verifyNew(relinkAlso[i]);
    if (why) {
      return send(res, 409, reportBody(ctx, Object.assign({ apply: true, ok: false }, base, {
        items: plan.items.map(publicItem),
        error: "Verify failed. Nothing was relinked.",
        verify: why
      })));
    }
  }
  steps.push({ step: "verify", ok: true, checked: copied.length + relinkAlso.length });

  const snap = JSON.parse(JSON.stringify(storeBody()));
  const map = uploadMap();
  const allWas = [];
  const relinkItems = copied.concat(relinkAlso);
  for (let i = 0; i < relinkItems.length; i++) {
    const item = relinkItems[i];
    const urls = [];
    if (item.url) urls.push(item.url);
    if (item.blobUrl && urls.indexOf(item.blobUrl) < 0) urls.push(item.blobUrl);
    let was = [];
    urls.forEach((oldUrl) => { was = was.concat(replaceUrl(oldUrl, item.newUrl)); });
    item.was = was;
    allWas.push.apply(allWas, was);
    const key = item.url;
    map[key] = {
      oldUrl: key,
      oldPath: item.pathname,
      newUrl: item.newUrl,
      newPath: item.newPath || pathnameOf(item.newUrl),
      bytes: item.bytes,
      type: item.toType,
      sha256: item.sha256,
      at: new Date().toISOString(),
      status: "relinked",
      verified: true,
      oldDeleted: false,
      was: was
    };
  }
  flags.forEach((item) => {
    if (item.plan !== "flag") return;
    if (mappingByPath(item.pathname)) return;
    map[item.url] = {
      oldUrl: item.url,
      oldPath: item.pathname,
      bytes: item.bytes || 0,
      type: item.fromType || "",
      sha256: item.sha256 || "",
      at: new Date().toISOString(),
      status: "flagged",
      verified: false,
      reason: "markup",
      oldDeleted: false,
      was: []
    };
  });
  const left = relinkItems.filter((item) => stillHolds(item.url) || (item.blobUrl && item.blobUrl !== item.url && stillHolds(item.blobUrl)));
  if (left.length) {
    applyStore(snap);
    return send(res, 409, reportBody(ctx, Object.assign({ apply: true, ok: false }, base, {
      error: "Relink left an old link in place. Nothing was saved.",
      step: "relink"
    })));
  }
  if (!mem.migrations || typeof mem.migrations !== "object") mem.migrations = {};
  mem.migrations.backup = { key: backup.key, at: new Date().toISOString() };
  const lines = [
    "Step 1 preflight: sealed backup saved. Nothing deleted.",
    "Step 2 inventory: " + plan.count + " old uploads. " + flags.length + " flagged as markup and left as-is.",
    "Step 3 copy: " + copied.length + " copied to private names.",
    "Step 4 verify: " + (copied.length + relinkAlso.length) + " matched type, size, and SHA-256.",
    "Step 5 relink: cards updated in one save. Old copies are still there.",
    "Step 6 report: say Yes in a separate delete before any old copy is removed."
  ];
  noteChangedCards(ctx, allWas);
  noteProgress(ctx, progress.card, lines);
  steps.push({ step: "relink", cards: Object.keys(allWas.reduce((m, row) => { if (row.jobId) m[row.jobId] = true; return m; }, {})).length, was: allWas.length });
  await save();
  steps.push({ step: "report", saved: true });
  return send(res, 200, reportBody(ctx, Object.assign({ apply: true, ok: true, noop: false }, base, {
    items: plan.items.map(publicItem),
    steps: steps,
    backup: backup.key,
    note: "Moved. Old copies are still public until you say Yes to delete them."
  })));
}

async function deleteOld(req, res, ctx) {
  if (!ctx.body || ctx.body.confirmDelete !== CONFIRM_DELETE) {
    return deny(res, 403, "Delete needs James's Yes.");
  }
  const progress = progressCard(ctx);
  if (progress.missing) return deny(res, 404, "Job not found.");
  const map = peekUploads();
  const keys = Object.keys(map);
  const rows = keys.map((k) => Object.assign({ oldUrl: map[k] && map[k].oldUrl || k }, map[k]));
  const unfinished = rows.filter((r) => r.status !== "flagged" && !(r.verified && r.newUrl && (r.status === "relinked" || r.status === "deleted" || r.oldDeleted)));
  const ready = rows.filter((r) => r.verified && r.newUrl && (r.status === "relinked" || r.status === "deleted" || r.oldDeleted) && r.status !== "flagged");
  if (!ready.length || unfinished.length) {
    return deny(res, 409, "Delete stays locked until every moved file is verified and relinked.");
  }
  const gone = [];
  const kept = rows.filter((r) => r.status === "flagged").map((r) => r.oldPath || r.oldUrl);
  let changed = false;
  for (let i = 0; i < ready.length; i++) {
    const row = ready[i];
    const url = row.oldUrl;
    let missing = false;
    try {
      await blobHead(url);
    } catch (e) {
      if (e && e.code === "AIA_BLOB_MISSING") missing = true;
      else return send(res, 409, { ok: false, error: "Delete stopped. Could not check an old file.", driver: driverOf(), deleted: gone.length });
    }
    if (missing && row.oldDeleted) {
      gone.push(row.oldPath || url);
      continue;
    }
    if (!missing) {
      try {
        await blobDel(url);
      } catch (e) {
        return send(res, 409, { ok: false, error: "Delete stopped. An old file was not removed.", driver: driverOf(), deleted: gone.length });
      }
      try {
        await blobHead(url);
        return send(res, 409, { ok: false, error: "Delete stopped. An old file is still there.", driver: driverOf(), deleted: gone.length });
      } catch (e) {
        if (!e || e.code !== "AIA_BLOB_MISSING") {
          return send(res, 409, { ok: false, error: "Delete stopped. Could not confirm an old file was removed.", driver: driverOf(), deleted: gone.length });
        }
      }
    }
    const slot = map[url] || map[row.oldUrl];
    if (slot && !slot.oldDeleted) {
      slot.oldDeleted = true;
      slot.deletedAt = new Date().toISOString();
      slot.status = "deleted";
      changed = true;
    }
    gone.push(row.oldPath || url);
  }
  if (!changed) {
    return send(res, 200, {
      ok: true,
      action: "delete",
      driver: driverOf(),
      dryRun: false,
      apply: false,
      deleted: true,
      noop: true,
      removed: 0,
      kept: kept,
      note: "Old copies were already removed. Nothing else was deleted."
    });
  }
  const card = progress.card;
  if (card) {
    sayOnCard(card, ctx.person, "Old copies removed: " + gone.length + ". Flagged files left in place: " + kept.length + ". New private names stay.");
  }
  const told = {};
  ready.forEach((row) => {
    (row.was || []).forEach((w) => {
      if (!w.jobId || told[w.jobId]) return;
      told[w.jobId] = true;
      const job = (mem.jobs || []).find((j) => j && j.id === w.jobId);
      if (!job) return;
      job.log = (job.log || []).concat(["Old upload copy deleted"]);
      sayOnCard(job, ctx.person, "The old copy of a moved upload was deleted. The private name on this card stays.");
    });
  });
  await save();
  return send(res, 200, {
    ok: true,
    action: "delete",
    driver: driverOf(),
    dryRun: false,
    apply: false,
    deleted: true,
    removed: gone.length,
    kept: kept,
    note: "Old copies that were verified and relinked are gone. Flagged files were not deleted."
  });
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return deny(res, 405, "Use POST.");
  await ready();
  const slug = workspaceOf(req);
  const headers = Object.assign({}, (req && req.headers) || {});
  if (slug) headers["x-workspace"] = slug;
  // deskSeat is the shared seat read (X-Pin, X-Session, aia_session cookie).
  // A real desk with no code is 401. A missing desk is 404. A waiting seat is 403.
  // Notes are written in this request. This route does not call jobs or hook.
  const found = deskSeat({ headers: headers, query: (req && req.query) || {} }, slug);
  if (!found.workspace) return deny(res, 404, "No desk with that name.");
  if (found.pending) return deny(res, 403, "That seat is waiting on the owner.");
  if (!found.person) return deny(res, 401, "Desk code required.");
  if (!isOwner(found.person)) return deny(res, 403, "Only the owner can move old uploads.");
  let body = {};
  try { body = await readBody(req); } catch (e) { return deny(res, 400, "That confirm phrase does not match."); }
  if (!body || body.confirm !== CONFIRM) return deny(res, 403, "That confirm phrase does not match.");
  if (!blobAllowed()) return deny(res, 409, "Old uploads can only be moved on the live desk.");
  const ctx = { row: found.workspace, person: found.person, body: body };
  if (body.action === "delete") return deleteOld(req, res, ctx);
  return moveOld(req, res, ctx, body.apply === true);
};

module.exports.CONFIRM = CONFIRM;
module.exports.CONFIRM_DELETE = CONFIRM_DELETE;
module.exports.EXPECT = EXPECT;

// Store guard: no saving request answers 2xx while its write was refused.
module.exports = require("./_lib").guardStore(module.exports);
