import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.mjs';

try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
} catch {
  // The reboot itself must still work when the data directory is read-only.
}

// Every line goes to stdout and to a file in the data directory, so a
// background service leaves the same trail as a manual run.
export function logger(fileName) {
  const file = path.join(DATA_DIR, fileName);
  const log = (message) => {
    const line = `${new Date().toISOString()} ${message}`;
    console.log(line);
    try {
      fs.appendFileSync(file, `${line}\n`);
    } catch {
      // A read-only skill directory must not break the reboot itself.
    }
  };
  log.file = file;
  return log;
}

export function readState(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

export function writeState(file, state) {
  try {
    fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
  } catch {
    // Same reason as above: state is best effort.
  }
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const stamp = () => new Date().toISOString();
