// Create-if-absent claims for automation runs.
// Tmp / preview: exclusive file create (fs open 'wx'), which the OS makes atomic.
// Live Blob (production only, same gate as the desk store): put() with
// addRandomSuffix:false and allowOverwrite:false, which refuses if the path exists.
// Desk publishes are a new claim desk/<version>. That is the compare-and-swap.
// A check-then-write of store.json is not the commit. Old claims are never overwritten.
const fs = require("fs");
const path = require("path");

const mutations = {
  noLock: false,
  noCas: false,
  noStopCheck: false,
  noKillPrecheck: false,
  noKillPostcheck: false,
  cronSkipStartedBy: false,
  cronSkipState: false,
  cronSkipTicksBy: false,
  cronSkipApproval: false,
  contactsCrossDesk: false,
  stepAnswerSkipAllowed: false,
  noNeedsNewYesHalt: false,
  reuseOldPlan: false,
  fallbackOtherAi: false,
  nameIsKnown: false,
  defaultAddNote: false,
  twoModelCalls: false
};

function mutation(name) {
  if (mutations[name]) return true;
  return process.env["AIA_MUTATE_" + name] === "1";
}

function setMutationForTests(name, on) {
  if (!Object.prototype.hasOwnProperty.call(mutations, name)) return false;
  mutations[name] = !!on;
  return true;
}

function storeFile() {
  if (process.env.AIA_STORE_PATH) return process.env.AIA_STORE_PATH;
  return path.join(__dirname, "data", "store.json");
}

function claimsDir() {
  const file = storeFile();
  return path.join(path.dirname(file), "aia-claims-" + path.basename(file).replace(/\.json$/i, ""));
}

function safeRel(rel) {
  const parts = String(rel || "").split("/").filter((part) => part && part !== "." && part !== "..");
  return parts.join("/");
}

function blobOn() {
  try {
    const lib = require("./_lib");
    return !!(lib.blobAllowed && lib.blobAllowed() && lib.blobReady && lib.blobReady());
  } catch (e) {
    return false;
  }
}

function jitter(ms) {
  const wait = ms == null ? 5 + Math.floor(Math.random() * 25) : ms;
  return new Promise((resolve) => setTimeout(resolve, wait));
}

async function readFileJson(file) {
  try {
    return JSON.parse(await fs.promises.readFile(file, "utf8"));
  } catch (e) {
    return null;
  }
}

async function claimFile(rel, obj) {
  const file = path.join(claimsDir(), safeRel(rel));
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  let fh;
  try {
    fh = await fs.promises.open(file, "wx");
  } catch (e) {
    if (e && e.code === "EEXIST") return { ok: false, record: await readFileJson(file) };
    throw e;
  }
  await fh.writeFile(JSON.stringify(obj));
  await fh.close();
  return { ok: true, record: obj };
}

async function readClaimFile(rel) {
  return readFileJson(path.join(claimsDir(), safeRel(rel)));
}

async function claimBlob(rel, obj) {
  const lib = require("./_lib");
  const { put } = require("@vercel/blob");
  const pathname = "aia-claims/" + safeRel(rel);
  try {
    await put(pathname, JSON.stringify(obj), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "application/json",
      token: lib.blobToken()
    });
    return { ok: true, record: obj };
  } catch (e) {
    const existing = await readClaimBlob(rel);
    return { ok: false, record: existing };
  }
}

async function readClaimBlob(rel) {
  const lib = require("./_lib");
  const { get } = require("@vercel/blob");
  const pathname = "aia-claims/" + safeRel(rel);
  try {
    const result = await get(pathname, { access: "private", token: lib.blobToken(), useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const chunks = [];
    for await (const chunk of result.stream) chunks.push(Buffer.from(chunk));
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (e) {
    return null;
  }
}

async function claim(rel, obj) {
  if (blobOn()) return claimBlob(rel, obj);
  return claimFile(rel, obj);
}

async function readClaim(rel) {
  if (blobOn()) return readClaimBlob(rel);
  return readClaimFile(rel);
}

async function highestDesk() {
  let best = null;
  for (let n = 1; n < 5000; n++) {
    const rec = await readClaim("desk/" + n);
    if (!rec) break;
    best = rec;
  }
  return best;
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj || {}));
}

function mergeJobs(freshJobs, mineJobs) {
  const jobs = Array.isArray(freshJobs) ? freshJobs.map((job) => clone(job)) : [];
  const index = {};
  jobs.forEach((job, i) => { if (job && job.id) index[job.id] = i; });
  (mineJobs || []).forEach((job) => {
    if (!job || !job.id) return;
    if (index[job.id] == null) {
      jobs.unshift(clone(job));
      return;
    }
    const base = jobs[index[job.id]];
    ["title", "email", "phone", "why", "tell", "contactName", "from"].forEach((key) => {
      if ((base[key] == null || base[key] === "") && job[key] != null) base[key] = job[key];
    });
    if (job.run && (!base.run || (job.run.runNo || 0) >= (base.run.runNo || 0))) {
      base.run = clone(job.run);
    }
    const applied = Array.isArray(base.applied) ? base.applied.slice() : [];
    (job.applied || []).forEach((id) => { if (applied.indexOf(id) < 0) applied.push(id); });
    if (applied.length) base.applied = applied;
    if (Array.isArray(job.notes) && !base.notes) base.notes = job.notes;
  });
  return jobs;
}

function mergeShops(fresh, mine) {
  const shops = Array.isArray(fresh) ? fresh.map((shop) => clone(shop)) : [];
  const index = {};
  shops.forEach((shop, i) => { if (shop && shop.slug) index[shop.slug] = i; });
  (mine || []).forEach((shop) => {
    if (!shop || !shop.slug) return;
    if (index[shop.slug] == null) {
      shops.unshift(clone(shop));
      return;
    }
    const base = shops[index[shop.slug]];
    if (Array.isArray(shop.ais)) base.ais = clone(shop.ais);
    if (Array.isArray(shop.people) && shop.people.length) base.people = clone(shop.people);
    const seen = {};
    (base.approvedContacts || []).forEach((row) => { if (row && row.key) seen[row.key] = true; });
    (shop.approvedContacts || []).forEach((row) => {
      if (!row || !row.key || seen[row.key]) return;
      if (!Array.isArray(base.approvedContacts)) base.approvedContacts = [];
      base.approvedContacts.push(clone(row));
    });
  });
  return shops;
}

function mergeBody(fresh, mine) {
  const out = clone(fresh || {});
  out.jobs = mergeJobs(fresh && fresh.jobs, mine && mine.jobs);
  out.workspaces = mergeShops(fresh && fresh.workspaces, mine && mine.workspaces);
  const inbox = Array.isArray(out.inbox) ? out.inbox.slice() : [];
  const seen = {};
  inbox.forEach((row) => { if (row && row.id) seen[row.id] = true; });
  (mine && mine.inbox || []).forEach((row) => {
    if (!row || !row.id || seen[row.id]) return;
    inbox.unshift(row);
  });
  out.inbox = inbox;
  return out;
}

// Publish the desk by claiming the next version. On conflict, merge and retry.
async function publishMem(body) {
  let mine = clone(body);
  for (let i = 0; i < 5; i++) {
    const current = await highestDesk();
    const curV = current && Number(current.version) || 0;
    const mineV = Number(mine.version) || 0;
    let merged = false;
    let next = mine;
    if (current && mineV !== curV) {
      next = mergeBody(current, mine);
      merged = true;
    }
    next = clone(next);
    next.version = curV + 1;
    const won = await claim("desk/" + next.version, next);
    if (won.ok) return { ok: true, body: next, merged: merged };
    mine = merged ? next : mine;
    await jitter();
  }
  return { ok: false, body: mine };
}

// Apply mutate(fresh) and commit it as the next desk version.
// noCas writes a stale snapshot as the next version (the bug the check catches).
async function casDesk(mutate, stale) {
  if (mutation("noCas") && stale) {
    const current = await highestDesk();
    const curV = current && Number(current.version) || 0;
    const next = clone(stale);
    mutate(next);
    next.version = curV + 1;
    const won = await claim("desk/" + next.version, next);
    if (won.ok) return { ok: true, body: next, cas: false };
    return { ok: false, conflict: true };
  }
  if (blobOn()) {
    const blobbed = await casBlob(mutate);
    if (blobbed) return blobbed;
  }
  const lib = require("./_lib");
  for (let i = 0; i < 5; i++) {
    const current = await highestDesk();
    const curV = current && Number(current.version) || 0;
    if (current && curV !== (Number(lib.mem.version) || 0)) lib.applyStore(current);
    const body = lib.payload();
    const changed = mutate(body);
    if (changed === false) return { ok: true, body: body, skipped: true };
    const next = clone(body);
    next.version = curV + 1;
    const won = await claim("desk/" + next.version, next);
    if (won.ok) {
      lib.mem.version = next.version;
      return { ok: true, body: lib.payload(), inplace: true };
    }
    const winner = await highestDesk();
    if (winner) lib.applyStore(winner);
    await jitter();
  }
  return { ok: false, conflict: true };
}

function preconditionFailed(err) {
  const name = err && err.name;
  if (name === "BlobPreconditionFailedError") return true;
  const msg = String(err && (err.message || err) || "");
  return /precondition|412|ifMatch|etag/i.test(msg);
}

async function casBlob(mutate) {
  const lib = require("./_lib");
  let head;
  let put;
  try {
    const blob = require("@vercel/blob");
    head = blob.head;
    put = blob.put;
  } catch (e) {
    return null;
  }
  const token = lib.blobToken();
  for (let i = 0; i < 5; i++) {
    let etag = "";
    let current = (await highestDesk()) || {};
    try {
      const meta = await head("aia/store.json", { token: token });
      etag = meta && meta.etag || "";
    } catch (e) {
      etag = "";
    }
    const next = clone(current);
    const changed = mutate(next);
    if (changed === false) return { ok: true, body: current, skipped: true };
    next.version = (Number(current.version) || 0) + 1;
    try {
      const opts = {
        access: "private",
        addRandomSuffix: false,
        contentType: "application/json",
        token: token
      };
      if (etag) {
        opts.allowOverwrite = true;
        opts.ifMatch = etag;
      } else {
        opts.allowOverwrite = false;
      }
      await put("aia/store.json", JSON.stringify(next), opts);
      await claim("desk/" + next.version, next);
      return { ok: true, body: next, etag: true };
    } catch (e) {
      if (preconditionFailed(e) || /already exists|allowOverwrite/i.test(String(e && e.message || e))) {
        await jitter();
        continue;
      }
      return null;
    }
  }
  return { ok: false, conflict: true };
}

async function reloadBody() {
  const claimed = await highestDesk();
  if (claimed) return claimed;
  try {
    return JSON.parse(await fs.promises.readFile(storeFile(), "utf8"));
  } catch (e) {
    return null;
  }
}

module.exports = {
  mutation,
  setMutationForTests,
  claim,
  readClaim,
  publishMem,
  casDesk,
  reloadBody,
  claimsDir,
  highestDesk,
  mergeBody
};
