#!/usr/bin/env node
/**
 * Bootstrap (or report) the local Ed25519 sovereign keypair.
 *
 *   node keygen.js
 *
 * Idempotent: existing keys under data/.keys are preserved.
 * Pass --rotate to mint a fresh keypair while retaining prior public
 * keys in keyring.json (same as `node rotateKey.js`).
 */
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadOrCreateKeypair, rotateKeypair, shortPublicKey } from './lib/keys.js'

const here = dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.AIA_DATA_DIR || join(here, 'data')
const keyDir = process.env.AIA_KEY_DIR || join(dataDir, '.keys')
const rotate = process.argv.includes('--rotate')

mkdirSync(dataDir, { recursive: true, mode: 0o700 })

if (rotate) {
  const result = rotateKeypair(keyDir)
  console.log(
    JSON.stringify(
      {
        status: 'KEYPAIR_ROTATED',
        keyId: result.keyId,
        fingerprint: result.fingerprint,
        keyDir,
        publicKey: shortPublicKey(result.publicKeyHex),
        publicKeyHex: result.publicKeyHex,
        totalKeysInRing: result.keyring.keys.length,
      },
      null,
      2,
    ),
  )
  process.exit(0)
}

const existed = existsSync(join(keyDir, 'ed25519.pem')) && existsSync(join(keyDir, 'ed25519.pub.pem'))
const keys = loadOrCreateKeypair(keyDir)

console.log(
  JSON.stringify(
    {
      status: existed ? 'EXISTING_KEYPAIR_PRESERVED' : 'KEYPAIR_CREATED',
      keyDir,
      publicKey: shortPublicKey(keys.publicKeyHex),
      publicKeyHex: keys.publicKeyHex,
    },
    null,
    2,
  ),
)
