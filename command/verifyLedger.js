/**
 * Verify command/data/ledger.ndjson.
 *
 * Recomputes every SHA-256 link and checks the Ed25519 signature against
 * the local sovereign public key. Exits 0 when the chain is intact.
 *
 *   node verifyLedger.js [path/to/ledger.ndjson]
 */
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadOrCreateKeypair } from './lib/keys.js'
import { verifyLedgerFile } from './lib/ledger.js'

const here = dirname(fileURLToPath(import.meta.url))

export function verifyAt(filePath, keyDir) {
  const ledgerPath = resolve(filePath || join(here, 'data', 'ledger.ndjson'))
  const keys = loadOrCreateKeypair(keyDir || join(dirname(ledgerPath), '.keys'))
  const result = verifyLedgerFile(ledgerPath, keys.publicKeyPem)
  return { ...result, publicKey: keys.publicKeyHex, filePath: ledgerPath }
}

function isMain() {
  const entry = process.argv[1]
  if (!entry) return false
  return fileURLToPath(import.meta.url) === resolve(entry)
}

if (isMain()) {
  try {
    const result = verifyAt(process.argv[2])
    if (result.ok) {
      const state = result.missing ? 'empty (no file yet)' : `${result.count} entr${result.count === 1 ? 'y' : 'ies'}`
      console.log(`ledger ok — ${state}`)
      console.log(`tip ${result.tip}`)
      process.exit(0)
    }
    console.error('ledger INVALID')
    for (const error of result.errors) console.error(`- ${error}`)
    process.exit(1)
  } catch (err) {
    console.error(err.message || err)
    process.exit(1)
  }
}
