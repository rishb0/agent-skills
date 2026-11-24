#!/usr/bin/env node
// Probe the LAN and report what the router exposes, so the config can be
// written from evidence instead of guesses. Read-only: no reboot is sent.
//
//   node scripts/discover.mjs          # human summary
//   node scripts/discover.mjs --json   # full report as JSON
import http from 'node:http';
import https from 'node:https';
import { configFile, loadConfig } from './lib/config.mjs';
import { defaultGateway, findBrowser, platformName } from './lib/platform.mjs';
import { countFailures, dbCandidates, findDb, openDb } from './lib/opencode.mjs';

const JSON_OUT = process.argv.includes('--json');
const DAY_MS = 24 * 60 * 60 * 1000;

// Common reboot endpoints, listed only as hints for the DevTools step. Nothing
// here is called automatically.
const CANDIDATE_ENDPOINTS = [
  'POST /reboot',
  'PUT /api/devicectrl {"command":"reboot"}',
  'GET /goform/setReboot',
  'POST /cgi-bin/reboot.cgi',
  'POST /rebootinfo.cgi',
  'PUT /api/system/reboot',
];

function probe(url, timeout = 6000) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      resolve({ ok: false, error: err.message });
      return;
    }

    const lib = parsed.protocol === 'https:' ? https : http;
    const request = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: 'GET',
        rejectUnauthorized: false,
        timeout,
        headers: { 'User-Agent': 'router-reboot-skill/1.0' },
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          if (body.length < 300000) body += chunk;
        });
        response.on('end', () => {
          resolve({
            ok: true,
            status: response.statusCode,
            location: response.headers.location || '',
            body,
          });
        });
      },
    );

    request.on('timeout', () => request.destroy(new Error('timed out')));
    request.on('error', (err) => resolve({ ok: false, error: err.message }));
    request.end();
  });
}

function describePage(html) {
  const text = html || '';
  const title = (text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim().replace(/\s+/g, ' ');
  const inputs = [...text.matchAll(/<input\b[^>]*>/gi)]
    .map((match) => match[0].replace(/\s+/g, ' ').slice(0, 160))
    .slice(0, 40);
  const buttons = [...text.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)]
    .map((match) => match[0].replace(/\s+/g, ' ').slice(0, 120))
    .slice(0, 20);
  const forms = [...text.matchAll(/<form\b[^>]*>/gi)]
    .map((match) => match[0].replace(/\s+/g, ' ').slice(0, 120))
    .slice(0, 10);

  return {
    title: title.slice(0, 120),
    inputs,
    buttons,
    forms,
    mentionsReboot: /reboot|restart/i.test(text),
  };
}

const report = {
  platform: platformName(),
  gateway: defaultGateway(),
  router: { probes: [], page: null },
  config: { file: configFile(), exists: false, mode: '', baseUrl: '' },
  browser: findBrowser(),
  opencode: { database: '', backend: '', freeLimits24h: 0, candidates: dbCandidates() },
  hints: CANDIDATE_ENDPOINTS,
};

for (const scheme of ['https', 'http']) {
  if (!report.gateway) break;
  const url = `${scheme}://${report.gateway}/`;
  const result = await probe(url);
  report.router.probes.push({
    url,
    ok: result.ok,
    status: result.status ?? 0,
    error: result.error || '',
  });

  if (result.ok && !report.router.page) {
    report.router.page = { url, ...describePage(result.body) };
  }
}

try {
  const cfg = loadConfig();
  report.config.exists = true;
  report.config.mode = cfg.reboot.mode;
  report.config.baseUrl = cfg.router.baseUrl;
} catch (err) {
  report.config.error = err.message;
}

const dbFile = findDb();
if (dbFile) {
  report.opencode.database = dbFile;
  try {
    const db = openDb(dbFile);
    report.opencode.backend = db.kind;
    report.opencode.freeLimits24h = countFailures(db, Date.now() - DAY_MS);
    db.close();
  } catch (err) {
    report.opencode.error = err.message.split('\n')[0];
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const line = (label, value) => console.log(`${label.padEnd(18)} ${value}`);

console.log('Router reboot - discovery\n');
line('platform', report.platform);
line('gateway', report.gateway || 'not detected');
line('browser', report.browser || 'not found');
line('config', report.config.exists ? `${report.config.mode} -> ${report.config.baseUrl}` : `missing (${report.config.file})`);
if (report.config.error) line('  config error', report.config.error);

console.log('\nRouter probes');
for (const item of report.router.probes) {
  line(`  ${item.url}`, item.ok ? `HTTP ${item.status}` : item.error);
}
if (!report.router.probes.length) console.log('  no gateway, nothing probed');

if (report.router.page) {
  const page = report.router.page;
  console.log(`\nLogin page ${page.url}`);
  line('  title', page.title || '(none)');
  line('  mentions reboot', page.mentionsReboot ? 'yes' : 'no');
  if (page.forms.length) {
    console.log('  forms');
    for (const form of page.forms) console.log(`    ${form}`);
  }
  if (page.inputs.length) {
    console.log('  inputs');
    for (const input of page.inputs) console.log(`    ${input}`);
  }
  if (page.buttons.length) {
    console.log('  buttons');
    for (const button of page.buttons) console.log(`    ${button}`);
  }
}

console.log('\nOpenCode');
line('  database', report.opencode.database || 'not found');
line('  backend', report.opencode.backend || 'unavailable');
line('  free limits 24h', String(report.opencode.freeLimits24h));

console.log('\nNext');
console.log('  1. Log in with --headful, open DevTools, click the reboot button, copy the request.');
console.log('  2. Set reboot.mode to "http" and paste the request, or describe the clicks in reboot.steps.');
console.log('  3. Run: node scripts/reboot-router.mjs --dry-run');
