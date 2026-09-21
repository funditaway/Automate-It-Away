/**
 * Environment doctor for the sovereign command center.
 *
 *   node doctor.js
 *
 * Warnings (missing Grok key, PM2 not installed) do not fail the run.
 * A missing Express install, an unreadable pack registry, or a broken
 * ledger does.
 */
import { constants } from 'node:fs'
import { access, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadOrCreateKeypair, shortPublicKey } from './lib/keys.js'
import { verifyLedgerFile } from './lib/ledger.js'
import { loadPacks } from './deploySwarm.js'

const here = dirname(fileURLToPath(import.meta.url))

function check(checks, name, status, detail) {
  checks.push({ name, status, detail })
}

export async function runDoctor(opts = {}) {
  const checks = []
  const dataDir = opts.dataDir || join(here, 'data')
  const packsDir = opts.packsDir || join(here, '..', 'packs')
  const major = Number(process.versions.node.split('.')[0])

  check(checks, 'node', major >= 20 ? 'pass' : 'fail', `v${process.versions.node} (need 20+)`)

  try {
    await import('express')
    check(checks, 'express', 'pass', 'daemon dependency resolved')
  } catch {
    check(checks, 'express', 'fail', 'run npm install in command/ — Express is required for the daemon')
  }

  try {
    await mkdir(dataDir, { recursive: true, mode: 0o700 })
    await access(dataDir, constants.W_OK)
    check(checks, 'data-dir', 'pass', dataDir)
  } catch (err) {
    check(checks, 'data-dir', 'fail', err.message || 'not writable')
  }

  let publicKeyPem = ''
  try {
    const keys = loadOrCreateKeypair(opts.keyDir || join(dataDir, '.keys'))
    publicKeyPem = keys.publicKeyPem
    check(checks, 'ed25519', 'pass', shortPublicKey(keys.publicKeyHex))
  } catch (err) {
    check(checks, 'ed25519', 'fail', err.message || 'keypair unavailable')
  }

  if (publicKeyPem) {
    const ledgerPath = opts.ledgerPath || join(dataDir, 'ledger.ndjson')
    const verified = verifyLedgerFile(ledgerPath, publicKeyPem)
    check(
      checks,
      'ledger',
      verified.ok ? 'pass' : 'fail',
      verified.ok
        ? `${verified.missing ? 'empty' : verified.count + ' entries'} ${ledgerPath}`
        : verified.errors.join('; '),
    )
  }

  const packs = loadPacks(packsDir)
  check(
    checks,
    'packs',
    packs.length ? 'pass' : 'fail',
    packs.length ? `${packs.length} packs in ${packsDir}` : `no packs in ${packsDir}`,
  )

  const grokKey = process.env.AIA_SPACEXAI_API_KEY || process.env.AIA_GROK_API_KEY || process.env.XAI_API_KEY
  check(
    checks,
    'grok',
    grokKey ? 'pass' : 'warn',
    grokKey ? 'SpaceXAI key present — live synthesis enabled' : 'no API key — local meta-prompt fallback',
  )

  const bind = process.env.AIA_BIND || '127.0.0.1'
  const loopback = bind === '127.0.0.1' || bind === 'localhost' || bind === '::1'
  check(
    checks,
    'bind',
    loopback ? 'pass' : 'warn',
    loopback ? `${bind}:${process.env.AIA_PORT || 3000}` : `${bind} is not loopback — sovereign default is 127.0.0.1`,
  )

  const ok = checks.every((item) => item.status !== 'fail')
  return { ok, checks, service: 'aia-command' }
}

function printReport(report) {
  for (const item of report.checks) {
    const mark = item.status === 'pass' ? 'ok' : item.status === 'warn' ? 'warn' : 'FAIL'
    console.log(`${mark.padEnd(4)} ${item.name.padEnd(10)} ${item.detail}`)
  }
  console.log(report.ok ? 'doctor: ok' : 'doctor: failed')
}

function isMain() {
  const entry = process.argv[1]
  if (!entry) return false
  return import.meta.url === pathToFileURL(entry).href
}

if (isMain()) {
  runDoctor()
    .then((report) => {
      if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2))
      else printReport(report)
      process.exit(report.ok ? 0 : 1)
    })
    .catch((err) => {
      console.error(err.message || err)
      process.exit(1)
    })
}
