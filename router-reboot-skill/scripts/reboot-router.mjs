#!/usr/bin/env node
// Log in to the router and reboot it. Works with no internet and no LLM.
//
//   node scripts/reboot-router.mjs             # do it
//   node scripts/reboot-router.mjs --check     # prove the login, change nothing
//   node scripts/reboot-router.mjs --dry-run   # navigate to the reboot page, stop
//   node scripts/reboot-router.mjs --api       # force the captured HTTP request
//   node scripts/reboot-router.mjs --headful   # watch it in a visible browser
//   node scripts/reboot-router.mjs --force     # ignore the safety guards (testing)
import fs from 'node:fs';
import path from 'node:path';
import { ARTIFACTS_DIR, ConfigError, loadConfig, printVersionIfRequested, resolvePassword } from './lib/config.mjs';
import { logger } from './lib/log.mjs';
import { runGuards } from './lib/guards.mjs';
import { launch, login, httpReboot, runSteps } from './lib/ui.mjs';

const flags = new Set(process.argv.slice(2));
const DRY = flags.has('--dry-run');
const CHECK = flags.has('--check');
const FORCE_HTTP = flags.has('--api');
const HEADFUL = flags.has('--headful');
const FORCE = flags.has('--force');

const log = logger('router-reboot.log');

if (printVersionIfRequested()) process.exit(0);

function fail(code, message) {
  log(message);
  process.exit(code);
}

let cfg;
try {
  cfg = loadConfig();
} catch (err) {
  const message = err instanceof ConfigError ? err.message : `cannot load config: ${err.message}`;
  log(message);
  process.exit(5);
}

const password = resolvePassword(cfg);
if (!password && cfg.reboot.login) {
  fail(2, `no password. Set router.password in ${cfg.file} or export ${cfg.router.passwordEnv || 'ROUTER_PASSWORD'}.`);
}

const guard = runGuards(cfg);
if (!guard.ok && !FORCE) {
  fail(guard.code, `guard blocked: ${guard.reason}`);
}
if (!guard.ok) log(`guard: ${guard.reason} - continuing because --force was given`);
else log(`guard: ${guard.reason}`);

async function screenshot(page, name) {
  try {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
    const file = path.join(ARTIFACTS_DIR, `${name}-${Date.now()}.png`);
    await page.screenshot({ path: file, fullPage: true });
    log(`screenshot: ${file}`);
  } catch {
    // A screenshot is a debugging aid, never a reason to fail.
  }
}

let browser;
let page;

try {
  ({ browser, page } = await launch(cfg, { headful: HEADFUL }));
} catch (err) {
  fail(1, `cannot start the browser: ${err.message.split('\n')[0]}. Install Chrome or Chromium, or set router.chromePath.`);
}

let rebooted = false;

try {
  const auth = await login(page, cfg, password);
  log(`login: ${auth.reason}`);

  if (CHECK) {
    log('check ok - credentials and navigation work');
    process.exitCode = 0;
  } else {
    const mode = FORCE_HTTP ? 'http' : cfg.reboot.mode;

    if (!cfg.reboot.login) {
      await page.goto(cfg.router.baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      log(`opened ${cfg.router.baseUrl}`);
    }

    if (mode === 'http') {
      if (DRY) {
        log('dry run - not sending the reboot request');
      } else {
        const response = await httpReboot(page, cfg);
        log(`http reboot -> ${response.status}`);
        if (response.status >= 400) {
          throw new Error(`reboot request returned ${response.status}: ${response.body}`);
        }
        rebooted = true;
      }
    } else {
      const result = await runSteps(page, cfg, password, { dryRun: DRY, log });
      rebooted = result.rebooted;
      if (DRY) await screenshot(page, 'dry-run');
    }

    log(rebooted ? 'reboot sent' : DRY ? 'dry run finished' : 'finished without a reboot step');
    process.exitCode = 0;
  }
} catch (err) {
  log(`FAILED: ${err.message.split('\n')[0]}`);
  await screenshot(page, 'failure');

  // The UI path is the fragile one. If the click never happened, replay the
  // captured request on the same authenticated session instead.
  if (!DRY && !rebooted && !FORCE_HTTP && cfg.reboot.http?.path) {
    log('falling back to the captured HTTP request');
    try {
      const response = await httpReboot(page, cfg);
      log(`fallback reboot -> ${response.status}`);
      process.exitCode = response.status < 400 ? 0 : 1;
    } catch (fallbackError) {
      log(`fallback failed: ${fallbackError.message.split('\n')[0]}`);
      process.exitCode = 1;
    }
  } else {
    process.exitCode = 1;
  }
} finally {
  await browser?.close().catch(() => {});
}
