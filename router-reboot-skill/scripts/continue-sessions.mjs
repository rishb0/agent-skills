#!/usr/bin/env node
// After a reboot, send "continue" to every session that died on the free limit.
// The session keeps its own agent (plan/build), so nothing is overridden here.
//
//   node scripts/continue-sessions.mjs ses_aaa ses_bbb
import { ConfigError, loadConfig, printVersionIfRequested } from './lib/config.mjs';
import { logger, sleep } from './lib/log.mjs';
import { findDb, lastAssistant, openDb, resumeSession } from './lib/opencode.mjs';
import { pingOnce } from './lib/platform.mjs';

const log = logger('auto-continue.log');

if (printVersionIfRequested()) process.exit(0);

let cfg;
try {
  cfg = loadConfig();
} catch (err) {
  log(err instanceof ConfigError ? err.message : `cannot load config: ${err.message}`);
  process.exit(5);
}

const ids = process.argv
  .slice(2)
  .filter((arg) => arg.startsWith('ses_'))
  .slice(0, Number(cfg.watch.maxSessions));

if (!ids.length) {
  log('nothing to continue');
  process.exit(0);
}

const settleMs = Number(cfg.watch.settleSeconds) * 1000;
const WAN_TIMEOUT_MS = 180000;
const ATTEMPTS = Math.max(1, Number(cfg.resume.attempts));
const RETRY_MS = Number(cfg.resume.retrySeconds) * 1000;
const GAP_MS = Number(cfg.resume.gapSeconds) * 1000;

let db = null;
const dbFile = findDb(cfg.watch.opencodeDb);
if (dbFile) {
  try {
    db = openDb(dbFile);
  } catch (err) {
    log(`database unavailable, resuming without the dead-session check: ${err.message.split('\n')[0]}`);
  }
} else {
  log('database not found, resuming without the dead-session check');
}

function lastTurn(sessionId) {
  if (!db) return {};
  try {
    return lastAssistant(db, sessionId);
  } catch {
    return {};
  }
}

// A successful ping straight after the reboot click proves nothing: the old
// WAN is still answering. Require several in a row before touching a session.
async function waitForWan() {
  log(`settling ${settleMs / 1000}s for the router to boot`);
  await sleep(settleMs);

  const start = Date.now();
  let streak = 0;
  while (Date.now() - start < WAN_TIMEOUT_MS) {
    if (pingOnce()) {
      streak++;
      if (streak >= 3) {
        log(`wan stable after ${Math.round((Date.now() - start) / 1000)}s`);
        return true;
      }
    } else {
      streak = 0;
    }
    await sleep(3000);
  }

  log('wan did not stabilise in time - trying anyway');
  return false;
}

await waitForWan();

let resumed = 0;

for (const [index, id] of ids.entries()) {
  const turn = lastTurn(id);
  if (turn.finish && turn.finish !== 'error') {
    log(`${id}: already moving (last turn ${turn.finish}) - skip`);
    continue;
  }

  let result;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    result = resumeSession(id);
    if (result.ok) break;

    const why = (result.err || result.out || '').replace(/\s+/g, ' ').slice(0, 140);
    log(`${id}: attempt ${attempt}/${ATTEMPTS} failed (exit ${result.status}) ${why}`);
    if (attempt < ATTEMPTS) await sleep(RETRY_MS);
  }

  if (result?.ok) {
    resumed++;
    log(`${id}: continued in ${turn.agent || 'unknown'} mode`);
  } else {
    log(`${id}: gave up after ${ATTEMPTS} attempts`);
  }

  if (index < ids.length - 1) await sleep(GAP_MS);
}

db?.close();
log(`done: ${resumed}/${ids.length} resumed`);
process.exit(resumed > 0 ? 0 : 1);
