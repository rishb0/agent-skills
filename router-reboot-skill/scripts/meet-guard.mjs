#!/usr/bin/env node
// Optional safety guard for meetings. Wired in as:
//   "guards": [{ "command": "node scripts/meet-guard.mjs", "reason": "call in progress" }]
//
// Exit 0 = safe to reboot. Exit 1 = do not reboot.
//
// Fail closed on purpose: when no check can run, the answer is "do not reboot".
// A skipped reboot costs one manual prompt; a wrong one kills a live call.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const HOLD_FILE = process.env.MEET_HOLD_FILE || '/tmp/meet-active';
const MEET_PORT = /:1930[0-9]\b/;
const BROWSER = /chrome|chromium|firefox|brave|edge/i;
const JSON_OUT = process.argv.includes('--json');

function run(cmd, args, timeout = 10000) {
  try {
    return {
      ok: true,
      out: execFileSync(cmd, args, {
        encoding: 'utf8',
        timeout,
        maxBuffer: 64 * 1024 * 1024,
        windowsHide: true,
      }),
    };
  } catch {
    return { ok: false, out: '' };
  }
}

function captureFromDump(json) {
  let nodes;
  try {
    nodes = JSON.parse(json);
  } catch {
    return null;
  }
  return nodes.some((node) => {
    const props = node?.info?.props || {};
    return (
      props['media.class'] === 'Stream/Input/Audio' &&
      BROWSER.test(props['application.name'] || '') &&
      node?.info?.state === 'running'
    );
  });
}

function captureFromWpctl(text) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!/input/i.test(lines[i]) || !BROWSER.test(lines[i])) continue;
    if (/<.*capture.*\[active\]/.test(lines.slice(i + 1, i + 7).join('\n'))) return true;
  }
  return false;
}

function checkMeet() {
  if (fs.existsSync(HOLD_FILE)) {
    return { active: true, conclusive: true, reason: `hold file ${HOLD_FILE}` };
  }

  const signals = [];
  let conclusive = false;

  const ps = run('ps', ['-eo', 'args']);
  if (ps.ok) {
    conclusive = true;
    if (/meet\.google\.com/.test(ps.out)) signals.push('meet process');
  }

  // Audio capture is the strongest signal: a live call holds the microphone.
  let audioChecked = false;
  const dump = run('pw-dump', [], 20000);
  if (dump.ok) {
    const active = captureFromDump(dump.out);
    if (active !== null) {
      audioChecked = true;
      if (active) signals.push('browser microphone');
    }
  }
  if (!audioChecked) {
    const wpctl = run('wpctl', ['status']);
    if (wpctl.ok) {
      audioChecked = true;
      if (captureFromWpctl(wpctl.out)) signals.push('browser microphone (wpctl)');
    }
  }
  if (audioChecked) conclusive = true;

  const sockets = run('ss', ['-uanp']);
  if (sockets.ok) {
    conclusive = true;
    if (MEET_PORT.test(sockets.out)) signals.push('meet media port');
  }

  if (signals.length) return { active: true, conclusive: true, reason: signals[0] };
  return {
    active: false,
    conclusive,
    reason: conclusive ? 'no call detected' : 'no working check',
  };
}

const verdict = checkMeet();

if (JSON_OUT) console.log(JSON.stringify(verdict, null, 2));
else console.log(verdict.active || !verdict.conclusive ? `blocked: ${verdict.reason}` : `safe: ${verdict.reason}`);

process.exit(verdict.active || !verdict.conclusive ? 1 : 0);
