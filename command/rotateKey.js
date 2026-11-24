#!/usr/bin/env node
/**
 * Non-destructive Ed25519 key rotation.
 *
 * Retires the active key in data/.keys/keyring.json (keeping publicKeyPem
 * so historical ledger.ndjson lines still verify), mints a new keypair,
 * and rewrites ed25519.pem / ed25519.pub.pem.
 *
 *   node rotateKey.js
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rotateKeypair, shortPublicKey } from './lib/keys.js'

const here = dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.AIA_DATA_DIR || join(here, 'data')
const keyDir = process.env.AIA_KEY_DIR || join(dataDir, '.keys')

const result = rotateKeypair(keyDir)

console.log(
  JSON.stringify(
    {
      rotated: true,
      activeKeyId: result.keyId,
      fingerprint: result.fingerprint,
      publicKey: shortPublicKey(result.publicKeyHex),
      publicKeyHex: result.publicKeyHex,
      totalKeysInRing: result.keyring.keys.length,
      keyDir,
    },
    null,
    2,
  ),
)
