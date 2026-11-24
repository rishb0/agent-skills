import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { DATA_DIR, SKILL_DIR, skillVersion } from '../scripts/lib/config.mjs';

const configUrl = pathToFileURL(path.join(SKILL_DIR, 'scripts', 'lib', 'config.mjs')).href;

function probe(env) {
  const script = `import(${JSON.stringify(configUrl)}).then((m) =>
    console.log(JSON.stringify({ skill: m.SKILL_DIR, data: m.DATA_DIR, art: m.ARTIFACTS_DIR })))`;

  const out = execFileSync(process.execPath, ['-e', script], {
    cwd: os.tmpdir(),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return JSON.parse(out);
}

test('skill paths do not depend on the working directory', () => {
  const result = probe({ ROUTER_REBOOT_DATA: '' });
  assert.equal(result.skill, SKILL_DIR);
  assert.equal(result.data, DATA_DIR);
  assert.equal(result.art, path.join(DATA_DIR, 'artifacts'));
});

test('ROUTER_REBOOT_DATA moves logs and screenshots', () => {
  const target = path.join(os.tmpdir(), `rr-data-${process.pid}-${Date.now()}`);
  const result = probe({ ROUTER_REBOOT_DATA: target });
  assert.equal(result.data, path.resolve(target));
  assert.equal(result.art, path.join(path.resolve(target), 'artifacts'));
});

test('version is a semantic version', () => {
  assert.match(skillVersion(), /^\d+\.\d+\.\d+$/);
});
