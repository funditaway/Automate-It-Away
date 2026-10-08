#!/usr/bin/env node
// Lead Catcher preview-isolation check (proposal J, approved by James 2026-10-08).
//
// Prints ONE line to stdout saying which secret / store env var NAMES are set
// (non-empty) in this build, grouped, as present|missing. It never prints a
// value, a length, a prefix, or a hash. It reads process.env only: it does not
// load api/_lib.js, touch any store or file, or use the network.
//
// Wired as the Vercel build step (package.json "vercel-build") so the line shows
// up in the preview build log. Vercel gives a build the same env vars as that
// environment's functions, so the line reflects what preview functions see.
// It always exits 0 so it can never fail a build.
'use strict';

// Names the code reads (see docs/lead-catcher/PREVIEW_ISOLATION.md), grouped.
const GROUPS = [
  ['blob', ['BLOB_READ_WRITE_TOKEN', 'BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN',
    'BLOB_READ_WRITE_TOKEN_STORE_ID', 'BLOB_STORE_ID', 'AIA_BLOB_TOKEN']],
  ['pinSalt', ['AIA_PIN_SALT']],
  ['adminPin', ['AIA_ADMIN_PIN', 'AIA_PIN']],
  ['session', ['AIA_SESSION']],
  ['connectSecret', ['AIA_CONNECT_SECRET']],
  ['aiKeys', ['XAI_API_KEY', 'GROK_API_KEY', 'AIA_GROK_KEY', 'AIA_GROK_API_KEY',
    'AIA_SPACEXAI_API_KEY', 'AIA_LC_MODEL_API_KEY']],
  ['registry', ['AIA_DOT_AIA_KEY', 'AIA_REGISTRY_KEY', 'AIA_WEB3_KEY']],
  ['webhook', []],
  ['cron', ['CRON_SECRET']],
  ['ghl', []],
  ['other', []],
  ['system', ['VERCEL_OIDC_TOKEN']]
];

const SECRETISH = /KEY|SECRET|TOKEN|SALT|PIN|PASSWORD|PASSWD|CREDENTIAL|PRIVATE/;

// Which group a name belongs to, or null if it isn't secret/store-like.
function groupOf(name) {
  for (const [g, names] of GROUPS) if (names.indexOf(name) !== -1) return g;
  if (/^(VERCEL|NOW)_/.test(name)) return SECRETISH.test(name) ? 'system' : null;
  if (/^BLOB_/.test(name) || /^AIA_BLOB_/.test(name)) return 'blob';
  if (/HOOK/.test(name)) return 'webhook';
  if (/GHL|HIGHLEVEL/.test(name)) return 'ghl';
  if (SECRETISH.test(name)) return 'other';
  return null;
}

function presenceLine(env) {
  env = env || {};
  const envName = /^[a-z0-9-]{1,40}$/.test(String(env.VERCEL_ENV || ''))
    ? env.VERCEL_ENV : (env.VERCEL_ENV ? 'unrecognized' : 'unset');
  if (envName === 'production') return 'AIA_ENV_PRESENCE env=production skipped';
  const hit = {};
  const names = [];
  for (const name of Object.keys(env)) {
    if (!/^[A-Z][A-Z0-9_]{0,80}$/.test(name)) continue;
    const v = env[name];
    if (typeof v !== 'string' || v === '') continue;
    const g = groupOf(name);
    if (!g) continue;
    hit[g] = true;
    names.push(name);
  }
  const parts = ['AIA_ENV_PRESENCE', 'env=' + envName];
  for (const [g] of GROUPS) parts.push(g + '=' + (hit[g] ? 'present' : 'missing'));
  names.sort();
  parts.push('presentNames=' + (names.length ? names.join(',') : 'none'));
  return parts.join(' ');
}

module.exports = { presenceLine, groupOf, GROUPS };

if (require.main === module) {
  try {
    process.stdout.write(presenceLine(process.env) + '\n');
  } catch (e) {
    process.stdout.write('AIA_ENV_PRESENCE error\n');
  }
  process.exitCode = 0;
}
