import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { countFailures, failuresSince, lastAssistant, openDb } from '../scripts/lib/opencode.mjs';

// Node 22.5+ ships SQLite; older versions need the sqlite3 CLI, which CI does
// not guarantee on every OS, so this file skips instead of failing.
let DatabaseSync = null;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  DatabaseSync = null;
}

const skip = DatabaseSync ? false : 'node:sqlite is unavailable on this Node version';

test('reads free-limit rows and ignores other errors', { skip }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-db-'));
  const file = path.join(dir, 'opencode.db');
  const db = new DatabaseSync(file);

  db.exec(`create table session_message (
    id text primary key,
    session_id text not null,
    type text not null,
    seq integer not null,
    time_created integer not null,
    time_updated integer not null,
    data text not null
  )`);

  const insert = db.prepare('insert into session_message values (?, ?, ?, ?, ?, ?, ?)');
  const idle = (type) => JSON.stringify({ type: 'idle', outcome: 'failed', error: { type } });
  const assistant = (finish, agent) => JSON.stringify({ finish, agent });

  insert.run('m1', 'ses_1', 'idle', 1, 1000, 1000, idle('provider.free-limit'));
  insert.run('m2', 'ses_1', 'assistant', 2, 1500, 1500, assistant('error', 'build'));
  insert.run('m3', 'ses_2', 'idle', 1, 2000, 2000, idle('provider.free-limit'));
  insert.run('m4', 'ses_2', 'assistant', 2, 2500, 2500, assistant('stop', 'plan'));
  insert.run('m5', 'ses_3', 'idle', 1, 3000, 3000, idle('aborted'));
  insert.run('m6', 'ses_4', 'idle', 1, 500, 500, idle('provider.free-limit'));
  db.close();

  const reader = openDb(file);
  try {
    assert.equal(reader.kind, 'node:sqlite');
    assert.deepEqual(
      failuresSince(reader, 0).map((row) => row.session_id),
      ['ses_4', 'ses_1', 'ses_2'],
    );
    assert.equal(countFailures(reader, 1500), 1);
    const first = lastAssistant(reader, 'ses_1');
    assert.equal(first.finish, 'error');
    assert.equal(first.error, null);
    assert.equal(first.agent, 'build');

    const second = lastAssistant(reader, 'ses_2');
    assert.equal(second.finish, 'stop');
    assert.equal(second.agent, 'plan');
  } finally {
    reader.close();
  }
});
