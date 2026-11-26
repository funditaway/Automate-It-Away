#!/usr/bin/env node
/**
 * Dry-run pack registry replay.
 *
 * Loads packs/*.json through the swarm loader without touching
 * active queue or ledger.ndjson. Useful before arming packs live.
 *
 *   node replayPacks.js
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadPacks } from './deploySwarm.js'

const here = dirname(fileURLToPath(import.meta.url))
const packsDir = process.env.AIA_PACKS_DIR || join(here, '..', 'packs')

const packs = loadPacks(packsDir)
const results = packs.map((pack) => ({
  id: pack.id,
  name: pack.name,
  agentId: pack.agentId,
  pipes: pack.pipes.length,
  rails: pack.rails.length,
  taps: pack.taps.length,
  status: 'PACK_LOADED',
}))

console.log(
  JSON.stringify(
    {
      ok: true,
      packsDir,
      replayedCount: results.length,
      results,
    },
    null,
    2,
  ),
)
