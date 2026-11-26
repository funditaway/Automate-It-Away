#!/usr/bin/env node
/**
 * Service health watchdog for the HITL command daemon.
 *
 * Probes /healthz (liveness) and /readyz (readiness) on AIA_DAEMON_URL,
 * optionally /healthz on a separate AIA_INGEST_URL, and can invoke a bounded
 * restart command when a probe fails. Never touches ledger.ndjson,
 * keyring.json, or active_queue.json.
 *
 *   node watchdog.js
 *   node watchdog.js --dry-run --restart-cmd "pm2 restart aia-command"
 *   node watchdog.js --no-ingest
 */
import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

function parseArgs(argv, env = process.env) {
  let restartCmd = env.AIA_WATCHDOG_RESTART_CMD || ''
  let checkIngest = true
  let dryRun = false

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--restart-cmd' && argv[i + 1]) {
      restartCmd = argv[i + 1]
      i += 1
    } else if (argv[i] === '--no-ingest') {
      checkIngest = false
    } else if (argv[i] === '--dry-run') {
      dryRun = true
    }
  }

  return { restartCmd, checkIngest, dryRun }
}

function normalizeBase(urlStr) {
  return String(urlStr || '').replace(/\/+$/, '')
}

export async function probeEndpoint(urlStr, timeoutMs, fetchImpl = globalThis.fetch) {
  const started = Date.now()
  let target
  try {
    target = new URL(urlStr)
  } catch (err) {
    return {
      url: urlStr,
      ok: false,
      status: 0,
      latencyMs: Date.now() - started,
      error: err.message,
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(target, { method: 'GET', signal: controller.signal })
    const body = String(await res.text()).slice(0, 240)
    const status = res.status || 0
    return {
      url: urlStr,
      ok: status >= 200 && status < 300,
      status,
      latencyMs: Date.now() - started,
      body,
    }
  } catch (err) {
    return {
      url: urlStr,
      ok: false,
      status: 0,
      latencyMs: Date.now() - started,
      error: err.name === 'AbortError' ? `Timeout after ${timeoutMs}ms` : err.message,
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function runRestartCommand(cmdString, execImpl = execFileAsync) {
  try {
    const { stdout, stderr } = await execImpl('/usr/bin/env', ['bash', '-lc', cmdString], {
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    })
    return {
      invoked: true,
      ok: true,
      exitCode: 0,
      stdout: String(stdout || '').trim(),
      stderr: String(stderr || '').trim(),
    }
  } catch (err) {
    return {
      invoked: true,
      ok: false,
      exitCode: typeof err.code === 'number' ? err.code : 1,
      stdout: String(err.stdout || '').trim(),
      stderr: String(err.stderr || err.message || '').trim(),
    }
  }
}

export async function runWatchdog(opts = {}) {
  const env = opts.env || process.env
  const daemonBase = normalizeBase(opts.daemonUrl || env.AIA_DAEMON_URL || 'http://127.0.0.1:3000')
  const ingestBase = normalizeBase(
    opts.ingestUrl || env.AIA_INGEST_URL || env.AIA_DAEMON_URL || 'http://127.0.0.1:3000',
  )
  const timeoutMs =
    Number.parseInt(String(opts.timeoutMs ?? env.AIA_WATCHDOG_TIMEOUT_MS ?? '2500'), 10) || 2500
  const restartCmd = opts.restartCmd ?? env.AIA_WATCHDOG_RESTART_CMD ?? ''
  const checkIngest = opts.checkIngest !== undefined ? Boolean(opts.checkIngest) : true
  const dryRun = Boolean(opts.dryRun)
  const probe = opts.probeEndpoint || probeEndpoint
  const restart = opts.runRestartCommand || runRestartCommand
  const fetchImpl = opts.fetchImpl || globalThis.fetch
  const checkedAt = opts.checkedAt || new Date().toISOString()

  const checks = [
    await probe(`${daemonBase}/healthz`, timeoutMs, fetchImpl),
    await probe(`${daemonBase}/readyz`, timeoutMs, fetchImpl),
  ]

  // Unified daemon+ingest on one port — avoid a duplicate /healthz probe.
  if (checkIngest && ingestBase !== daemonBase) {
    checks.push(await probe(`${ingestBase}/healthz`, timeoutMs, fetchImpl))
  }

  const allHealthy = checks.every((c) => c.ok)
  let recovery = null

  if (!allHealthy && restartCmd) {
    if (dryRun) {
      recovery = {
        invoked: false,
        dryRun: true,
        wouldRun: restartCmd,
      }
    } else {
      recovery = await restart(restartCmd, opts.execImpl)
    }
  }

  const healthyAfterRecovery = recovery && recovery.ok ? true : allHealthy

  return {
    checkedAt,
    healthy: healthyAfterRecovery,
    initialHealthy: allHealthy,
    daemonUrl: daemonBase,
    ingestUrl: checkIngest ? ingestBase : null,
    checks,
    recovery,
  }
}

function isMain() {
  const entry = process.argv[1]
  if (!entry) return false
  return fileURLToPath(import.meta.url) === resolve(entry)
}

if (isMain()) {
  const cli = parseArgs(process.argv.slice(2))
  runWatchdog({
    restartCmd: cli.restartCmd,
    checkIngest: cli.checkIngest,
    dryRun: cli.dryRun,
  })
    .then((report) => {
      console.log(JSON.stringify(report, null, 2))
      if (!report.healthy) process.exit(1)
    })
    .catch((err) => {
      console.error(err.message || err)
      process.exit(1)
    })
}
