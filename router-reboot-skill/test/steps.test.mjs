import test from 'node:test';
import assert from 'node:assert/strict';
import { planSteps, substitute } from '../scripts/lib/steps.mjs';

const cfg = { router: { username: 'admin', baseUrl: 'http://192.168.1.1' } };

test('dry run stops in front of the marked reboot step', () => {
  const steps = [{ click: 'a' }, { click: 'b', reboot: true }, { waitForText: 'restarting' }];
  assert.deepEqual(planSteps(steps, true), { rebootIndex: 1, stopBefore: 1 });
});

test('a real run never stops early', () => {
  const steps = [{ click: 'a' }, { click: 'b', reboot: true }];
  assert.deepEqual(planSteps(steps, false), { rebootIndex: 1, stopBefore: -1 });
});

test('without a marker, the last step is treated as the reboot', () => {
  const steps = [{ click: 'a' }, { click: 'b' }];
  assert.equal(planSteps(steps, true).stopBefore, 1);
});

test('a single unmarked step is never executed in a dry run', () => {
  assert.equal(planSteps([{ click: 'reboot' }], true).stopBefore, 0);
});

test('an empty plan is harmless', () => {
  assert.deepEqual(planSteps([], true), { rebootIndex: -1, stopBefore: 0 });
});

test('substitutes credentials without touching other text', () => {
  assert.equal(
    substitute('${username}:${password}@${baseUrl}', cfg, 's3cret'),
    'admin:s3cret@http://192.168.1.1',
  );
  assert.equal(substitute('plain', cfg, 'x'), 'plain');
  assert.equal(substitute(undefined, cfg, 'x'), '');
});
