import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CONFIG_VERSION, ConfigError, loadConfig, resolvePassword } from '../scripts/lib/config.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-config-'));

function write(name, value) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(value));
  return file;
}

function use(config) {
  process.env.ROUTER_CONFIG = write(`c-${Math.random().toString(36).slice(2)}.json`, config);
  return loadConfig();
}

test('merges defaults and keeps explicit values', () => {
  const cfg = use({
    configVersion: CONFIG_VERSION,
    router: { baseUrl: 'http://10.0.0.1' },
    safety: { wifiSsid: 'Home' },
    reboot: { mode: 'http', http: { path: '/reboot' } },
  });

  assert.equal(cfg.router.baseUrl, 'http://10.0.0.1');
  assert.equal(cfg.router.username, 'admin');
  assert.equal(cfg.watch.pollSeconds, 3);
  assert.equal(cfg.safety.wifiSsid, 'Home');
  assert.equal(cfg.reboot.mode, 'http');
  assert.ok(cfg.file.endsWith('.json'));
});

test('rejects a bad URL', () => {
  assert.throws(
    () => use({ router: { baseUrl: '192.168.1.1' }, reboot: { mode: 'http', http: { path: '/x' } } }),
    ConfigError,
  );
});

test('rejects UI mode without steps', () => {
  assert.throws(() => use({ reboot: { mode: 'ui', steps: [] } }), /reboot\.steps is empty/);
});

test('rejects HTTP mode without a path', () => {
  assert.throws(() => use({ reboot: { mode: 'http', http: { path: '' } } }), /reboot\.http\.path/);
});

test('rejects a config from a newer skill', () => {
  assert.throws(() => use({ configVersion: CONFIG_VERSION + 1 }), /newer than this skill/);
});

test('rejects a non-numeric configVersion', () => {
  assert.throws(() => use({ configVersion: 'one' }), /configVersion/);
});

test('password precedence: config, then named env, then ROUTER_PASSWORD', () => {
  const cfg = { router: { password: '', passwordEnv: 'RR_TEST_PASS' } };

  process.env.RR_TEST_PASS = 'named';
  process.env.ROUTER_PASSWORD = 'fallback';
  assert.equal(resolvePassword(cfg), 'named');

  delete process.env.RR_TEST_PASS;
  assert.equal(resolvePassword(cfg), 'fallback');

  cfg.router.password = 'direct';
  assert.equal(resolvePassword(cfg), 'direct');

  delete process.env.ROUTER_PASSWORD;
  cfg.router.password = '';
  assert.equal(resolvePassword(cfg), '');
});

test('missing config file has a clear message', () => {
  process.env.ROUTER_CONFIG = path.join(dir, 'nope.json');
  assert.throws(() => loadConfig(), /Copy config\/router\.config\.example\.json/);
});
