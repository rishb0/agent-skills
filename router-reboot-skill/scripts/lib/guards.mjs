import { spawnSync } from 'node:child_process';
import { currentSsid } from './platform.mjs';

// Fail closed on purpose. A skipped reboot costs one manual prompt; rebooting
// while connected to a neighbour's network or during a live call is worse.
export function ssidCheck(cfg, readSsid = currentSsid) {
  const expected = String(cfg.safety.wifiSsid || '').trim();
  if (!expected) return { ok: true, skipped: true, reason: 'no SSID gate configured' };

  const actual = readSsid();
  if (!actual) return { ok: false, reason: 'cannot read the current SSID' };
  if (actual !== expected) {
    return { ok: false, reason: `connected to "${actual}", expected "${expected}"` };
  }
  return { ok: true, reason: `on "${actual}"` };
}

// Each guard is a shell command. Exit 0 means "go ahead", anything else blocks.
// This keeps call detection, hold files, and other local rules out of the code.
export function commandGuards(cfg, run = spawnSync) {
  const blocked = [];
  for (const guard of cfg.safety.guards || []) {
    if (!guard || typeof guard.command !== 'string' || !guard.command.trim()) continue;

    const result = run(guard.command, {
      shell: true,
      encoding: 'utf8',
      timeout: 30000,
      windowsHide: true,
    });

    if (result.status !== 0) {
      blocked.push({
        reason: guard.reason || `guard exited ${result.status ?? 'error'}: ${guard.command}`,
        command: guard.command,
        status: result.status,
      });
    }
  }
  return blocked;
}

export function runGuards(cfg, { readSsid, run } = {}) {
  const ssid = ssidCheck(cfg, readSsid);
  if (!ssid.ok) return { ok: false, code: 3, reason: ssid.reason };

  const blocked = commandGuards(cfg, run);
  if (blocked.length) return { ok: false, code: 4, reason: blocked[0].reason, blocked };

  return { ok: true, reason: ssid.reason };
}
