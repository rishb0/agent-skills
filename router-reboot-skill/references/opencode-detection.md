# OpenCode Detection

How the watcher knows the free tier ran out, and how to fix it when a new OpenCode version changes the shape of the data.

## Contents

- [Signal 1: the database](#signal-1-the-database)
- [Signal 2: the log](#signal-2-the-log)
- [Why the idle row is not enough to resume](#why-the-idle-row-is-not-enough-to-resume)
- [Verifying detection](#verifying-detection)
- [Resuming a session](#resuming-a-session)
- [When a new version breaks detection](#when-a-new-version-breaks-detection)
- [Tuning](#tuning)

## Signal 1: the database

OpenCode stores session history in SQLite at:

| OS | Default path |
| --- | --- |
| Linux | `~/.local/share/opencode/opencode.db` |
| macOS | `~/Library/Application Support/opencode/opencode.db` |
| Windows | `%APPDATA%\opencode\opencode.db` |

Override it with `watch.opencodeDb` or `OPENCODE_DB`.

A free-limit failure is written as an idle message whose `data.error.type` is `provider.free-limit`:

```json
{
  "type": "idle",
  "outcome": "failed",
  "error": {
    "type": "provider.free-limit",
    "message": "Free usage limit reached..."
  }
}
```

The query:

```sql
select session_id, time_created
from session_message
where type = 'idle'
  and json_extract(data, '$.error.type') = 'provider.free-limit'
  and time_created > :since
order by time_created;
```

`time_created` is Unix milliseconds. The watcher advances a stored cursor to the newest row it has seen, so a restart does not replay old failures. Use `--from-start` once if you want the history.

Inspect it yourself:

```bash
sqlite3 -json ~/.local/share/opencode/opencode.db \
  "select session_id, datetime(time_created/1000,'unixepoch') as at
     from session_message
    where json_extract(data,'\$.error.type')='provider.free-limit'
    order by time_created desc limit 10;"
```

Other error types exist and are not quota failures: `aborted`, `provider.transport`, `provider.error`, `provider.internal`, `provider.content-filter`, `compaction.failed`. Do not treat them as limits.

## Signal 2: the log

If the database is missing, locked, or the schema changed, the watcher scans the tail of the newest log file for `free-limit` or `free usage limit` and takes any `ses_...` ids from those lines.

Log locations tried, in order:

1. `watch.logPath`, if set.
2. `$XDG_STATE_HOME/opencode/log`, `$XDG_DATA_HOME/opencode/log`.
3. `~/.local/share/opencode/log`, `~/.local/state/opencode/log`.
4. `~/Library/Logs/opencode` on macOS.
5. `%LOCALAPPDATA%\opencode\log` on Windows.

The log signal is coarser: it can miss a session id, and it can repeat. The watcher deduplicates by session id for six hours, but the database is always preferred when it works.

## Why the idle row is not enough to resume

A success and a failure can be written in the same millisecond, so ordering by time does not tell you whether the session is actually dead. Before resuming, the script reads the last assistant turn:

```sql
select json_extract(data,'$.finish') as finish,
       json_extract(data,'$.error.type') as error,
       json_extract(data,'$.agent') as agent
from session_message
where session_id = :id and type = 'assistant'
order by time_created desc, rowid desc
limit 1;
```

Resume only when `finish = 'error'`. A session that already moved on is skipped, so a manual retry is never doubled.

The same row carries `agent`, which is how `continue` lands in the mode the session was left in (`plan` or `build`). Nothing overrides it.

## Verifying detection

```bash
node scripts/watch-limit.mjs --dry-run --from-start
```

`--from-start` replays the whole history and logs every session it would have rebooted for. Run it without `--from-start` to confirm the cursor is current and nothing fires.

`node scripts/doctor.mjs` reports which backend is in use (`node:sqlite` or `sqlite3`) and how many limit rows exist in the last seven days. If that count is zero on a machine that has hit the limit, detection is broken for that version.

## Resuming a session

The watcher calls the OpenCode CLI:

```bash
opencode api POST /api/session/<id>/prompt --data '{"text":"continue"}'
```

Requirements:

- `opencode` on `PATH`.
- The background server running. Check with `opencode service status`.
- `resume.enabled: true` in the config.

Each session is attempted three times, 30 seconds apart, with a 20 second gap between sessions so a fresh quota is not hammered all at once.

## When a new version breaks detection

1. Run `doctor.mjs`. If the database is readable but the count is zero, check the schema:

   ```bash
   sqlite3 ~/.local/share/opencode/opencode.db ".schema session_message"
   ```

2. Check which error type the new version writes:

   ```bash
   sqlite3 -json ~/.local/share/opencode/opencode.db \
     "select json_extract(data,'\$.error.type') as type, count(*)
        from session_message
       where type='idle' and json_extract(data,'\$.error.type') is not null
       group by type order by 2 desc;"
   ```

3. If the table or column changed, update `failuresSince` and `lastAssistant` in `scripts/lib/opencode.mjs`. Keep the same interface so the watcher does not change.
4. If only the error string changed, add it to the regex in `logSignal` in `scripts/watch-limit.mjs`.
5. Re-run `--dry-run --from-start` and confirm the expected sessions appear.

## Tuning

| Setting | Default | Meaning |
| --- | --- | --- |
| `watch.pollSeconds` | 3 | Database poll interval |
| `watch.batchSeconds` | 15 | Wait for a burst of failures before rebooting once |
| `watch.maxSessions` | 5 | Cap on sessions resumed per event |
| `watch.settleSeconds` | 90 | Time the router needs to boot before pinging |
| `safety.cooldownMinutes` | 15 | Minimum time between reboots |
| `resume.gapSeconds` | 20 | Pause between resumed sessions |
| `resume.attempts` | 3 | Resume attempts per session |
| `resume.retrySeconds` | 30 | Pause between attempts |

Raise `settleSeconds` for slow routers. Lower it only after measuring a real reboot: pinging too early reports "up" while the old WAN is still alive, and the resumed prompt dies mid-flight.
