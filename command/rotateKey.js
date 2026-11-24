#!/usr/bin/env node
/**
 * Non-destructive Ed25519 key rotation.
 *
 * Retires the active key in data/.keys/keyring.json (keeping publicKeyPem
 * so historical ledger.ndjson lines and archive slices still verify), mints
 * a new keypair, and rewrites ed25519.pem / ed25519.pub.pem atomically.
 *
 *   node rotateKey.js
 *   node rotateKey.js --dry-run
 */
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rotateKeypair, shortPublicKey } from './lib/keys.js'

const here = dirname(fileURLToPath(import.meta.url))

function parseArgs(argv) {
  return { dryRun: argv.includes('--dry-run') }
}

export function runRotateKey(opts = {}) {
  const dataDir = opts.dataDir || process.env.AIA_DATA_DIR || join(here, 'data')
  const keyDir = opts.keyDir || process.env.AIA_KEY_DIR || join(dataDir, '.keys')
  const dryRun = Boolean(opts.dryRun)
  const result = rotateKeypair(keyDir, { dryRun, rotatedAt: opts.rotatedAt })

  return {
    rotated: !dryRun,
    dryRun,
    previousActiveKeyId: result.previousActiveKeyId || null,
    newKeyId: result.keyId,
    activeKeyId: result.keyId,
    fingerprint: result.fingerprint,
    publicKey: shortPublicKey(result.publicKeyHex),
    publicKeyHex: result.publicKeyHex,
    totalKeysInRing: dryRun
      ? (result.keyring?.keys?.length || 0) + 1
      : result.keyring.keys.length,
    keyDir: result.keyDir || keyDir,
    keyringPath: result.keyringPath || join(keyDir, 'keyring.json'),
    privateKeyPath: result.privateKeyPath || join(keyDir, 'ed25519.pem'),
    publicKeyPath: result.publicKeyPath || join(keyDir, 'ed25519.pub.pem'),
    rotatedAt: result.rotatedAt,
  }
}

function isMain() {
  const entry = process.argv[1]
  if (!entry) return false
  return fileURLToPath(import.meta.url) === resolve(entry)
}

if (isMain()) {
  try {
    const cli = parseArgs(process.argv.slice(2))
    const report = runRotateKey({ dryRun: cli.dryRun })
    console.log(JSON.stringify(report, null, 2))
  } catch (err) {
    console.error(err.message || err)
    process.exit(1)
  }
}
