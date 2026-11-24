#!/usr/bin/env node
// Check everything the watcher depends on and say plainly what is missing.
//
//   node scripts/doctor.mjs
import net from 'node:net';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { ConfigError, DATA_DIR, configFile, loadConfig, printVersionIfRequested, resolvePassword, versionLine } from './lib/config.mjs';
import { currentSsid, findBrowser, platformName, which } from './lib/platform.mjs';
import { countFailures, findDb, openDb } from './lib/opencode.mjs';
import { ssidCheck } from './lib/guards.mjs';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const results = [];
const add = (name, status, detail) => results.push({ name, status, detail });

if (printVersionIfRequested()) process.exit(0);

function tcp(host, port, timeout = 3000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

function serviceInstalled() {
  if (platformName() === 'linux') {
    return spawnSync('systemctl', ['--user', 'is-active', 'reboot-home-router'], { encoding: 'utf8' }).status === 0;
  }
  if (platformName() === 'macos') {
    return spawnSync('launchctl', ['print', `gui/${process.getuid()}/com.agent-skills.router-reboot`], { encoding: 'utf8' }).status === 0;
  }
  if (platformName() === 'windows') {
    return spawnSync('schtasks', ['/Query', '/TN', 'RouterReboot'], { encoding: 'utf8' }).status === 0;
  }
  return false;
}

const major = Number(process.versions.node.split('.')[0]);
add('node', major >= 18 ? 'ok' : 'fail', `v${process.versions.node}${major >= 18 ? '' : ' (18+ required)'}`);
add('version', 'ok', versionLine());
add('data dir', 'ok', DATA_DIR);

let cfg = null;
try {
  cfg = loadConfig();
  add('config', 'ok', configFile());
} catch (err) {
  add('config', 'fail', err instanceof ConfigError ? err.message : String(err.message));
}

if (cfg) {
  const password = resolvePassword(cfg);
  if (!cfg.reboot.login) {
    add('password', 'ok', 'not required (no login configured)');
  } else {
    add('password', password ? 'ok' : 'fail', password ? 'resolved' : `set router.password or export ${cfg.router.passwordEnv || 'ROUTER_PASSWORD'}`);
  }

  const ssid = ssidCheck(cfg);
  if (ssid.skipped) add('ssid gate', 'warn', 'not configured - a reboot would be allowed on any network');
  else add('ssid gate', ssid.ok ? 'ok' : 'fail', `${ssid.reason}${ssid.ok ? '' : ` (current: ${currentSsid() || 'unknown'})`}`);

  add('reboot mode', 'ok', cfg.reboot.mode);
}

const browser = findBrowser(cfg?.router.chromePath);
add('browser', browser ? 'ok' : 'fail', browser || 'install Chrome or Chromium, or set router.chromePath');

const require = createRequire(import.meta.url);

const hasNodeSqlite = (() => {
  try {
    return Boolean(require('node:sqlite').DatabaseSync);
  } catch {
    return false;
  }
})();
const hasSqliteCli = Boolean(which('sqlite3'));
add('sqlite backend', hasNodeSqlite || hasSqliteCli ? 'ok' : 'fail', hasNodeSqlite ? 'node:sqlite' : hasSqliteCli ? 'sqlite3 CLI' : 'need Node 22.5+ or the sqlite3 CLI');

const dbFile = findDb(cfg?.watch.opencodeDb);
if (!dbFile) {
  add('opencode database', 'fail', 'not found - set watch.opencodeDb');
} else {
  try {
    const db = openDb(dbFile);
    const total = countFailures(db, Date.now() - WEEK_MS);
    db.close();
    add('opencode database', 'ok', `${dbFile} (${total} free-limit row(s) in 7 days)`);
  } catch (err) {
    add('opencode database', 'warn', `${dbFile}: ${err.message.split('\n')[0]}`);
  }
}

const opencode = which('opencode');
add('opencode cli', opencode ? 'ok' : 'warn', opencode || 'not on PATH - auto-resume will not work');

if (cfg) {
  let url;
  try {
    url = new URL(cfg.router.baseUrl);
  } catch {
    url = null;
  }
  if (url) {
    const port = Number(url.port) || (url.protocol === 'https:' ? 443 : 80);
    const reachable = await tcp(url.hostname, port);
    add('router reachable', reachable ? 'ok' : 'warn', `${url.hostname}:${port}${reachable ? '' : ' - not answering (wrong network, or it is rebooting)'}`);
  }
}

const service = serviceInstalled();
add('start-up service', service ? 'ok' : 'warn', service ? 'installed and running' : 'not detected - run install.sh, or start scripts/watch-limit.mjs yourself');

const width = Math.max(...results.map((item) => item.name.length));
const icons = { ok: 'ok  ', warn: 'warn', fail: 'fail' };
for (const item of results) {
  console.log(`  ${icons[item.status]}  ${item.name.padEnd(width)}  ${item.detail}`);
}

const counts = results.reduce((acc, item) => ({ ...acc, [item.status]: (acc[item.status] || 0) + 1 }), {});
console.log(`\n  ${counts.ok || 0} ok, ${counts.warn || 0} warn, ${counts.fail || 0} fail`);

process.exit(counts.fail ? 1 : 0);
