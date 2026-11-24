#!/usr/bin/env node
// Watch OpenCode's database for free-limit failures, reboot the router once,
// then optionally resume every session that died.
//
// Local database and LAN only: no internet, no model, no API key.
//
//   node scripts/watch-limit.mjs              # daemon
//   node scripts/watch-limit.mjs --dry-run    # detect and log, never reboot
//   node scripts/watch-limit.mjs --from-start # replay old failures on first run
//   node scripts/watch-limit.mjs --once       # single pass, then exit
import path from 'node:path';
import { spawn } from 'node:child_process';
import { SKILL_DIR, DATA_DIR, ConfigError, cooldownMs, loadConfig, printVersionIfRequested } from './lib/config.mjs';
import { logger, readState, writeState, sleep, stamp } from './lib/log.mjs';
import { findDb, openDb, failuresSince, newestLogFile, readTail } from './lib/opencode.mjs';

const flags = new Set(process.argv.slice(2));
const DRY = flags.has('--dry-run');
const FROM_START = flags.has('--from-start');
const ONCE = flags.has('--once');

if (printVersionIfRequested()) process.exit(0);

const STATE_FILE = path.join(DATA_DIR, '.watch-state.json');
const SEEN_TTL_MS = 6 * 60 * 60 * 1000;
const log = logger('watcher.log');

let cfg;
try {
  cfg = loadConfig();
} catch (err) {
  log(err instanceof ConfigError ? err.message : `cannot load config: ${err.message}`);
  process.exit(5);
}

const pollMs = Number(cfg.watch.pollSeconds) * 1000;
const batchMs = Number(cfg.watch.batchSeconds) * 1000;
const maxSessions = Number(cfg.watch.maxSessions);

const state = readState(STATE_FILE);
if (state.lastSeen === undefined) state.lastSeen = FROM_START ? 0 : Date.now();
if (!state.seen) state.seen = {};

const save = () => writeState(STATE_FILE, state);

let busy = false;

function run(script, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(SKILL_DIR, 'scripts', script), ...args], {
      cwd: SKILL_DIR,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', (err) => {
      log(`${script}: ${err.message}`);
      resolve(1);
    });
  });
}

// Primary signal: the row OpenCode writes when the free tier runs out.
function databaseSignal() {
  const file = findDb(cfg.watch.opencodeDb);
  if (!file) return { ok: false, reason: 'OpenCode database not found' };

  const db = openDb(file);
  try {
    const rows = failuresSince(db, state.lastSeen, 500);
    if (rows.length) {
      state.lastSeen = Math.max(state.lastSeen, ...rows.map((row) => row.time_created));
    }
    return {
      ok: true,
      file,
      sessions: rows.map((row) => row.session_id),
      firstAt: rows[0]?.time_created ?? 0,
    };
  } catch (err) {
    return { ok: false, reason: err.message.split('\n')[0] };
  } finally {
    db.close();
  }
}

// Fallback signal: the log line, used when the schema or the file is not
// readable. Session ids are taken from the line when present.
function logSignal() {
  const file = newestLogFile(cfg.watch.logPath);
  if (!file) return { ok: false, reason: 'OpenCode log not found' };

  let tail;
  try {
    tail = readTail(file);
  } catch (err) {
    return { ok: false, reason: err.message.split('\n')[0] };
  }

  const ids = new Set();
  for (const line of tail.split('\n')) {
    if (!/free[- ]limit|free usage limit/i.test(line)) continue;
    for (const match of line.matchAll(/ses_[A-Za-z0-9]+/g)) ids.add(match[0]);
  }

  const fresh = [...ids].filter((id) => !state.seen[id]);
  const now = Date.now();
  for (const id of fresh) state.seen[id] = now;
  for (const [id, at] of Object.entries(state.seen)) {
    if (now - Number(at) > SEEN_TTL_MS) delete state.seen[id];
  }

  return { ok: true, file, sessions: fresh };
}

async function collect(firstSeenAt) {
  const dbFile = findDb(cfg.watch.opencodeDb);
  if (!dbFile) return [];
  const db = openDb(dbFile);
  try {
    // One limit kills several sessions within seconds, so wait out the burst
    // and collect the whole group before rebooting once.
    return failuresSince(db, Math.max(0, firstSeenAt - 5000), 500).map((row) => row.session_id);
  } catch {
    return [];
  } finally {
    db.close();
  }
}

async function tick() {
  if (busy) return;

  const now = Date.now();
  let sessions = [];
  let source = 'database';
  let firstAt = now - batchMs;

  const dbSignal = databaseSignal();
  if (dbSignal.ok) {
    sessions = dbSignal.sessions;
    if (dbSignal.firstAt) firstAt = dbSignal.firstAt;
  } else {
    source = 'log';
    const fallback = logSignal();
    if (!fallback.ok) {
      log(`no signal: ${dbSignal.reason}; ${fallback.reason}`);
      return;
    }
    sessions = fallback.sessions;
  }

  sessions = [...new Set(sessions)].filter(Boolean);
  if (!sessions.length) return;

  log(`limit detected via ${source}: ${sessions.length} session(s)`);

  if (DRY) {
    log(`dry run - would reboot and continue: ${sessions.slice(0, maxSessions).join(' ')}`);
    save();
    return;
  }

  const lastReboot = state.lastReboot ? Date.parse(state.lastReboot) : 0;
  if (now - lastReboot < cooldownMs(cfg)) {
    log(`cooldown active (last reboot ${state.lastReboot || 'never'}) - skipping`);
    save();
    return;
  }

  busy = true;
  try {
    if (batchMs) await sleep(batchMs);

    const batch = await collect(firstAt);
    const ids = [...new Set([...sessions, ...batch])].slice(0, maxSessions);

    state.lastReboot = stamp();
    save();
    log(`rebooting for ${ids.length} session(s): ${ids.join(' ')}`);

    const code = await run('reboot-router.mjs', []);
    if (code === 3 || code === 4) {
      log('skipped: guard blocked the reboot - nothing to resume');
      return;
    }
    if (code !== 0) {
      log(`reboot failed (exit ${code}) - not resuming`);
      return;
    }

    if (!cfg.resume.enabled) {
      log('reboot sent; resume is disabled (set resume.enabled to true)');
      return;
    }
    await run('continue-sessions.mjs', ids);
  } finally {
    busy = false;
    save();
  }
}

log(`watching for free-limit failures (dry run: ${DRY}, poll: ${pollMs / 1000}s)`);

if (ONCE) {
  await tick();
  process.exit(0);
}

await tick();
setInterval(tick, pollMs);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    log(`stopped on ${signal}`);
    process.exit(0);
  });
}
