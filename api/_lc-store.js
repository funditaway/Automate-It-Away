'use strict';
// Lead Catcher — ISOLATED store. Clearly separate from the shared AIA store (api/_lib.js mem / Vercel Blob).
// Why: AIA keeps every desk in one shared JSON document that may live in Vercel Blob. Lead Catcher test and
// demo cards must never land there. This store is a local JSON file only:
//   AIA_LC_STORE_PATH (if set) or /tmp/aia-lead-catcher.json
// On Vercel that is per-instance /tmp: throwaway preview data, never production data.
// It refuses to run when VERCEL_ENV=production (Lead Catcher is not on the live site yet).
const fs = require('fs');
const path = require('path');

function storeFile() { return process.env.AIA_LC_STORE_PATH || path.join('/tmp', 'aia-lead-catcher.json'); }
function outboxFile() { return process.env.AIA_LC_OUTBOX_PATH || path.join('/tmp', 'aia-lead-catcher-outbox.mock.ndjson'); }
function liveBlocked() { return String(process.env.VERCEL_ENV || '') === 'production'; }

const EMPTY = () => ({ v: 1, accounts: {}, desks: {} });
let cache = null; let cacheFile = null;

function load() {
  const f = storeFile();
  if (cache && cacheFile === f) return cache;
  try { cache = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { cache = EMPTY(); }
  if (!cache || typeof cache !== 'object' || !cache.desks) cache = EMPTY();
  cacheFile = f;
  return cache;
}
function persist() {
  const f = storeFile();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = f + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache));
  fs.renameSync(tmp, f); // atomic replace
}
function reset() { cache = null; cacheFile = null; }
function desk(slug) {
  const s = load();
  if (!s.desks[slug]) s.desks[slug] = { slug, pack: { on: false }, cards: [], drafts: [], approvals: [], actions: [], activity: [], attempts: [], spans: [], seq: 0, roles: {} };
  return s.desks[slug];
}
function account(id) {
  const s = load();
  if (!s.accounts[id]) s.accounts[id] = { id, owned: [] };
  return s.accounts[id];
}

// MOCK outbound adapter. Never sends. Appends one line per approved action.
const outbox = {
  name: 'mock-outbox', mode: 'MOCK',
  deliver(entry) {
    const f = outboxFile();
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.appendFileSync(f, JSON.stringify(Object.assign({ mode: 'MOCK', notice: 'MOCK — NOT SENT. No email, text, or call left AIA.' }, entry)) + '\n');
    return { ok: true, mode: 'MOCK' };
  },
  read() {
    const f = outboxFile();
    if (!fs.existsSync(f)) return [];
    return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  },
};

module.exports = { load, persist, reset, desk, account, outbox, storeFile, outboxFile, liveBlocked };
