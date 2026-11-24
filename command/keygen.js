#!/usr/bin/env node
/**
 * Bootstrap (or report) the local Ed25519 sovereign keypair.
 *
 *   node keygen.js
 *
 * Idempotent: existing keys under data/.keys are preserved.
 * Pass --rotate to mint a fresh keypair (previous files are renamed aside).
 */
import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadOrCreateKeypair, shortPublicKey } from './lib/keys.js'

const here = dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.AIA_DATA_DIR || join(here, 'data')
const keyDir = process.env.AIA_KEY_DIR || join(dataDir, '.keys')
const rotate = process.argv.includes('--rotate')

mkdirSync(dataDir, { recursive: true, mode: 0o700 })

if (rotate) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  for (const name of ['ed25519.pem', 'ed25519.pub.pem']) {
    const path = join(keyDir, name)
    if (existsSync(path)) {
      renameSync(path, `${path}.retired-${stamp}`)
    }
  }
}

const existed = existsSync(join(keyDir, 'ed25519.pem')) && existsSync(join(keyDir, 'ed25519.pub.pem'))
const keys = loadOrCreateKeypair(keyDir)

const report = {
  status: rotate ? 'KEYPAIR_ROTATED' : existed ? 'EXISTING_KEYPAIR_PRESERVED' : 'KEYPAIR_CREATED',
  keyDir,
  publicKey: shortPublicKey(keys.publicKeyHex),
  publicKeyHex: keys.publicKeyHex,
}

console.log(JSON.stringify(report, null, 2))
