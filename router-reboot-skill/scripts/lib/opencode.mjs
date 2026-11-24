import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);

// Node 22.5+ ships SQLite, so most installs need no extra binary. Older Node
// falls back to the sqlite3 CLI. Both read the same file the same way.
let DatabaseSync = null;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  DatabaseSync = null;
}

export function dbCandidates() {
  const home = os.homedir();
  const out = [];

  if (process.env.OPENCODE_DB) out.push(process.env.OPENCODE_DB);
  if (process.env.XDG_DATA_HOME) out.push(path.join(process.env.XDG_DATA_HOME, 'opencode', 'opencode.db'));
  out.push(path.join(home, '.local', 'share', 'opencode', 'opencode.db'));

  if (process.platform === 'darwin') {
    out.push(path.join(home, 'Library', 'Application Support', 'opencode', 'opencode.db'));
  }
  if (process.platform === 'win32') {
    const roaming = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    out.push(path.join(roaming, 'opencode', 'opencode.db'));
    out.push(path.join(local, 'opencode', 'opencode.db'));
  }

  return [...new Set(out)];
}

export function findDb(explicit) {
  const list = explicit ? [explicit, ...dbCandidates()] : dbCandidates();
  for (const candidate of list) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return '';
}

const literal = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
};

function cliQuery(file, sql, params) {
  let index = 0;
  const filled = sql.replace(/\?/g, () => literal(params[index++]));
  const out = execFileSync('sqlite3', ['-json', file, filled], {
    encoding: 'utf8',
    timeout: 10000,
    windowsHide: true,
  });
  return out.trim() ? JSON.parse(out) : [];
}

export function openDb(file) {
  if (DatabaseSync) {
    const db = new DatabaseSync(file, { readOnly: true });
    return {
      kind: 'node:sqlite',
      all: (sql, params = []) => db.prepare(sql).all(...params),
      close: () => {
        try {
          db.close();
        } catch {
          // already closed
        }
      },
    };
  }

  return {
    kind: 'sqlite3',
    all: (sql, params = []) => cliQuery(file, sql, params),
    close: () => {},
  };
}

// The row OpenCode writes when the free tier runs out:
//   {"type":"idle","outcome":"failed","error":{"type":"provider.free-limit", ...}}
export function failuresSince(db, sinceMs, limit = 50) {
  return db.all(
    `select session_id, time_created from session_message
      where type = 'idle'
        and json_extract(data, '$.error.type') = 'provider.free-limit'
        and time_created > ?
      order by time_created
      limit ?`,
    [Number(sinceMs), Number(limit)],
  );
}

export function countFailures(db, sinceMs) {
  return db.all(
    `select count(*) as total from session_message
      where type = 'idle'
        and json_extract(data, '$.error.type') = 'provider.free-limit'
        and time_created > ?`,
    [Number(sinceMs)],
  )[0]?.total ?? 0;
}

// A failed idle row is not enough to decide whether to resume: a success and a
// failure can land in the same millisecond. The last assistant turn is reliable.
export function lastAssistant(db, sessionId) {
  return (
    db.all(
      `select json_extract(data, '$.finish') as finish,
              json_extract(data, '$.error.type') as error,
              json_extract(data, '$.agent') as agent
         from session_message
        where session_id = ? and type = 'assistant'
        order by time_created desc, rowid desc
        limit 1`,
      [sessionId],
    )[0] || {}
  );
}

export function resumeSession(sessionId, { timeoutMs = 120000 } = {}) {
  const result = spawnSync(
    'opencode',
    ['api', 'POST', `/api/session/${sessionId}/prompt`, '--data', JSON.stringify({ text: 'continue' })],
    {
      encoding: 'utf8',
      timeout: timeoutMs,
      shell: process.platform === 'win32',
      windowsHide: true,
    },
  );

  return {
    ok: result.status === 0,
    status: result.status,
    out: (result.stdout || '').trim(),
    err: (result.stderr || '').trim(),
  };
}

export function logCandidates() {
  const home = os.homedir();
  const out = [];

  if (process.env.XDG_STATE_HOME) out.push(path.join(process.env.XDG_STATE_HOME, 'opencode', 'log'));
  if (process.env.XDG_DATA_HOME) out.push(path.join(process.env.XDG_DATA_HOME, 'opencode', 'log'));
  out.push(path.join(home, '.local', 'share', 'opencode', 'log'));
  out.push(path.join(home, '.local', 'state', 'opencode', 'log'));

  if (process.platform === 'darwin') {
    out.push(path.join(home, 'Library', 'Logs', 'opencode'));
  }
  if (process.platform === 'win32') {
    out.push(path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'opencode', 'log'));
  }

  return [...new Set(out)];
}

export function newestLogFile(explicit) {
  if (explicit && fs.existsSync(explicit) && fs.statSync(explicit).isFile()) return explicit;

  for (const dir of logCandidates()) {
    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }
    const files = [];
    for (const name of entries) {
      if (!name.endsWith('.log')) continue;
      const file = path.join(dir, name);
      try {
        files.push({ file, mtime: fs.statSync(file).mtimeMs });
      } catch {
        // file vanished between readdir and stat
      }
    }
    files.sort((a, b) => b.mtime - a.mtime);
    if (files.length) return files[0].file;
  }
  return '';
}

// Read only the tail: logs can be large and detection runs every few seconds.
export function readTail(file, bytes = 512 * 1024) {
  const stat = fs.statSync(file);
  const start = Math.max(0, stat.size - bytes);
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    return buffer.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}
