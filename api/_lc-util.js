// Lead Catcher — Official AIA Pack. Ported from the tested reference build (/workspace/aia-lead-catcher).
'use strict';
const crypto = require('crypto');

function sha256(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
function newId(prefix) { return prefix + '_' + crypto.randomBytes(9).toString('hex'); }

// Canonical JSON: sorted keys, no whitespace. Used for payload hashing.
function canonical(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
}

function normPhone(p) {
  const d = String(p || '').replace(/[^0-9]/g, '');
  if (d.length === 11 && d[0] === '1') return '+' + d;
  if (d.length === 10) return '+1' + d;
  return d ? '+' + d : '';
}
function normEmail(e) { return String(e || '').trim().toLowerCase(); }
function normText(t) { return String(t || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

class HttpError extends Error {
  constructor(status, code, message, extra) { super(message); this.status = status; this.code = code; this.extra = extra || {}; }
}

function j(v, fallback) { try { return JSON.parse(v); } catch (_) { return fallback; } }

module.exports = { sha256, newId, canonical, normPhone, normEmail, normText, HttpError, j };
