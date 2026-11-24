import test from 'node:test';
import assert from 'node:assert/strict';
import { commandGuards, runGuards, ssidCheck } from '../scripts/lib/guards.mjs';

const cfg = (ssid, guards = []) => ({ safety: { wifiSsid: ssid, guards } });

test('no gate is reported as skipped, not as a pass', () => {
  const result = ssidCheck(cfg(''), () => '');
  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
});

test('matching SSID passes', () => {
  const result = ssidCheck(cfg('Home'), () => 'Home');
  assert.deepEqual(result, { ok: true, reason: 'on "Home"' });
});

test('different SSID blocks and names both networks', () => {
  const result = ssidCheck(cfg('Home'), () => 'Cafe');
  assert.equal(result.ok, false);
  assert.match(result.reason, /Cafe/);
  assert.match(result.reason, /Home/);
});

test('unreadable SSID blocks instead of guessing', () => {
  assert.equal(ssidCheck(cfg('Home'), () => '').ok, false);
});

test('a guard command that exits non-zero blocks', () => {
  const blocked = commandGuards(cfg('', [{ command: 'exit 1', reason: 'call in progress' }]), () => ({ status: 1 }));
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].reason, 'call in progress');
});

test('a guard command that exits zero passes', () => {
  assert.deepEqual(commandGuards(cfg('', [{ command: 'true' }]), () => ({ status: 0 })), []);
});

test('an empty guard command is ignored', () => {
  assert.deepEqual(commandGuards(cfg('', [{ command: '   ' }])), []);
});

test('runGuards reports the SSID failure first, with exit code 3', () => {
  const result = runGuards(cfg('Home'), { readSsid: () => 'Cafe', run: () => ({ status: 0 }) });
  assert.equal(result.ok, false);
  assert.equal(result.code, 3);
});

test('runGuards reports a command guard with exit code 4', () => {
  const result = runGuards(cfg('Home', [{ command: 'x', reason: 'held' }]), {
    readSsid: () => 'Home',
    run: () => ({ status: 1 }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 4);
  assert.equal(result.reason, 'held');
});
