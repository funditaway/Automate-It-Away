#!/usr/bin/env node
// Check for scripts/env-presence.js: one line, booleans and names only, never a value.
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SCRIPT = path.join(__dirname, 'env-presence.js');
let pass = 0, fail = 0;
function check(id, ok, note) {
  if (ok) { pass++; console.log('PASS ' + id); }
  else { fail++; console.log('FAIL ' + id + (note ? ' — ' + note : '')); }
}
function run(env) {
  const r = spawnSync(process.execPath, [SCRIPT], { env: Object.assign({ PATH: process.env.PATH }, env), encoding: 'utf8' });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
}

// Fake values: distinctive so any leak (whole value or a piece of it) is easy to spot.
const FAKE = {
  BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_FAKEa1b2c3d4e5f6g7h8',
  BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN: 'FAKEblobRWzz9911',
  BLOB_READ_WRITE_TOKEN_STORE_ID: 'store_FAKEstore7788',
  BLOB_STORE_ID: 'store_FAKEid4455',
  AIA_BLOB_TOKEN: 'FAKEaiaBlobQQ22',
  BLOB_EXTRA_THING: 'FAKEblobExtra3141',
  AIA_PIN_SALT: 'FAKEsaltPepper2718',
  AIA_ADMIN_PIN: '8675309',
  AIA_PIN: '4242',
  AIA_SESSION: 'FAKEsessTok1618',
  AIA_CONNECT_SECRET: 'FAKEconnectSecret1414',
  XAI_API_KEY: 'xai-FAKEkeyAAAA1111',
  GROK_API_KEY: 'FAKEgrok2222',
  AIA_GROK_KEY: 'FAKEaiaGrok3333',
  AIA_GROK_API_KEY: 'FAKEaiaGrokApi4444',
  AIA_SPACEXAI_API_KEY: 'FAKEspacex5555',
  AIA_LC_MODEL_API_KEY: 'FAKElcModel6666',
  AIA_DOT_AIA_KEY: 'FAKEdotAia7777',
  AIA_REGISTRY_KEY: 'FAKEregistry8888',
  AIA_WEB3_KEY: '0xFAKEweb39999',
  AIA_HOOK_URL: 'https://hooks.example.test/FAKEhookPath0101',
  CRON_SECRET: 'FAKEcron0202',
  GHL_API_KEY: 'FAKEghl0303',
  STRIPE_SECRET_KEY: 'sk_test_FAKEstripe0404',
  VERCEL_OIDC_TOKEN: 'eyJFAKE.oidc.0505',
  VERCEL_ENV: 'preview',
  HARMLESS_SETTING: 'FAKEharmless0606'
};
const values = Object.entries(FAKE).filter(([k]) => k !== 'VERCEL_ENV').map(([, v]) => v);

// E01: every group present, one line, exit 0.
const all = run(FAKE);
const lines = all.out.split('\n').filter(Boolean);
check('E01 one line, exit 0, nothing on stderr', all.code === 0 && lines.length === 1 && all.err === '', JSON.stringify(all));
const line = lines[0] || '';
check('E02 starts with AIA_ENV_PRESENCE env=preview', line.startsWith('AIA_ENV_PRESENCE env=preview '), line);
for (const g of ['blob', 'pinSalt', 'adminPin', 'session', 'connectSecret', 'aiKeys', 'registry', 'webhook', 'cron', 'ghl', 'other', 'system']) {
  check('E03 ' + g + '=present', line.includes(' ' + g + '=present'), line);
}

// E04: no value, and no 4+ char piece of any value, appears in the output.
let leak = '';
for (const v of values) {
  if (all.out.includes(v)) { leak = v; break; }
  for (let i = 0; i + 4 <= v.length && !leak; i++) {
    const piece = v.slice(i, i + 4);
    // Skip pieces that are also part of a variable name or a fixed word in the line.
    if (/^[A-Z0-9_]+$/.test(piece) && Object.keys(FAKE).some((k) => k.includes(piece))) continue;
    if (/^(present|missing|preview|none|system|other|blob|cron|hook)/i.test(piece)) continue;
    if (all.out.includes(piece) && !/^[a-z]+$/i.test(piece)) leak = v + ' (piece ' + piece + ')';
  }
  if (leak) break;
}
check('E04 no value or piece of a value in output', !leak, 'leaked: ' + leak);
check('E05 no FAKE marker in output', !/FAKE/.test(all.out), line);
check('E06 no digits except in names', !/\d/.test(line.replace(/[A-Z][A-Z0-9_]*[A-Z0-9]/g, '')), line);
check('E07 harmless names not listed', !line.includes('HARMLESS_SETTING'), line);

// E14: the line has only known fields; presentNames holds only exact env names that were set.
const tokens = line.split(' ');
const fieldsOk = tokens.slice(2, -1).every((t) => /^[a-zA-Z]+=(present|missing)$/.test(t));
const pn = (tokens[tokens.length - 1] || '').replace(/^presentNames=/, '').split(',');
const expected = Object.keys(FAKE).filter((k) => k !== 'VERCEL_ENV' && k !== 'HARMLESS_SETTING').sort();
check('E14 only present|missing fields, and presentNames is exactly the set names', fieldsOk && JSON.stringify(pn) === JSON.stringify(expected), line);

// E08: empty environment → everything missing.
const none = run({ VERCEL_ENV: 'preview' });
check('E08 empty env: all missing, presentNames=none', none.code === 0 && !/=present/.test(none.out) && /presentNames=none\n$/.test(none.out), none.out);

// E09: empty-string values count as missing (the code treats them as unset).
const blank = run({ VERCEL_ENV: 'preview', BLOB_READ_WRITE_TOKEN: '', AIA_PIN_SALT: '' });
check('E09 blank values are missing', / blob=missing /.test(blank.out) && / pinSalt=missing /.test(blank.out), blank.out);

// E10: production builds print a skip line only.
const prod = run(Object.assign({}, FAKE, { VERCEL_ENV: 'production' }));
check('E10 production: skip line only', prod.code === 0 && prod.out === 'AIA_ENV_PRESENCE env=production skipped\n', prod.out);

// E11: odd VERCEL_ENV values are not echoed.
const odd = run({ VERCEL_ENV: 'FAKE secret value!!' });
check('E11 odd VERCEL_ENV not echoed', /env=unrecognized /.test(odd.out) && !/FAKE/.test(odd.out), odd.out);

// E12: the script reads env only: no _lib, store, fs, network or child processes.
const src = fs.readFileSync(SCRIPT, 'utf8').replace(/\/\/.*$/gm, '');
const bad = ['_lib', 'require(\'fs\')', 'require("fs")', 'http', 'net', 'dns', '@vercel/blob', 'fetch(', 'child_process', 'writeFile'];
const found = bad.filter((b) => src.includes(b));
check('E12 no _lib/store/fs/network imports', found.length === 0, found.join(','));

// E13: package.json runs it as the Vercel build step and can't fail the build.
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
check('E13 vercel-build runs env-presence and never fails', /node scripts\/env-presence\.js/.test(pkg.scripts['vercel-build'] || '') && /\|\| true$/.test(pkg.scripts['vercel-build'] || ''), pkg.scripts['vercel-build']);

console.log('PASS ' + pass + ' · FAIL ' + fail);
process.exit(fail ? 1 : 0);
