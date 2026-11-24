# Router Reboot

Reboot the home router on demand, and automatically when OpenCode's free-tier limit is reached, then resume the sessions that died.

The watcher is plain Node.js reading a local SQLite file and talking to the router over the LAN. It needs no internet, no API key, and no model, so it still works after the quota is gone and the agent can no longer answer.

## Why

Free tiers run out mid-task. The usual recovery is: notice the failure, open the router page, log in, click reboot, wait a minute, then reopen every session and type "continue". This skill does that unattended, and refuses to do it when it is not safe.

## How it works

```text
OpenCode DB ──poll──> free-limit row?
                          │ yes
                          ▼
                  safety guards (SSID, optional commands)
                          │ pass
                          ▼
             log in to the router and reboot it
                          │
                          ▼
          wait for the WAN: settle + 3 clean pings
                          │
                          ▼
        optional: send "continue" to each dead session
```

1. **Detect.** Poll the OpenCode database for rows with `error.type = provider.free-limit`. Fall back to the log file when the database is unreadable.
2. **Group.** One limit usually kills several sessions within seconds. Wait out the burst and reboot once.
3. **Guard.** Refuse to reboot unless the machine is on the configured home SSID, and unless every optional guard command passes. Fail closed.
4. **Reboot.** Log in to the router and either replay the captured HTTP request or walk the UI steps.
5. **Recover.** Wait for the WAN to stabilise, then optionally send `continue` to each session whose last turn ended in an error.

## Requirements

| Requirement | Why |
| --- | --- |
| Node.js 18+ | Runs the scripts |
| Chromium, Chrome, or Edge | Drives the router login page |
| npm | Installs `playwright-core` |
| `sqlite3` CLI, or Node 22.5+ | Reads the OpenCode database |
| OpenCode CLI | Only for auto-resume |

## Install

```bash
git clone https://github.com/rishb0/agent-skills.git
bash agent-skills/router-reboot-skill/install.sh
```

| Flag | Effect |
| --- | --- |
| `--claude` | Install into `~/.claude/skills/router-reboot-skill` |
| `--target DIR` | Install somewhere else |
| `--no-service` | Copy the files without a start-up entry |

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```

The installer copies the skill, installs dependencies, creates `router.config.json` from the example, registers the start-up entry, and runs the doctor.

## Configure

1. **Find the router.** `node scripts/discover.mjs` reports the default gateway, the login page, every input and button, and candidate reboot endpoints.
2. **Pick a mode.** `http` replays one captured request; `ui` describes the clicks. Prefer `http`: it survives UI changes.
3. **Set the SSID gate.** `safety.wifiSsid` must be the exact home network name. Without it, the skill would happily reboot whichever router answers at that address.
4. **Verify.** `--check`, then `--dry-run`, then a real reboot.

Full walkthrough: [references/router-setup.md](references/router-setup.md).

Minimal configuration:

```json
{
  "configVersion": 1,
  "router": { "baseUrl": "https://192.168.1.1", "username": "admin" },
  "safety": { "wifiSsid": "HomeNetwork" },
  "reboot": {
    "mode": "http",
    "login": {
      "path": "/",
      "username": "input[name=username]",
      "password": "input[name=password]",
      "submit": "input[type=submit]"
    },
    "http": { "method": "PUT", "path": "/api/devicectrl", "body": { "command": "reboot" } }
  }
}
```

`configVersion` is optional but recommended: it lets the scripts tell an old config from a new one, and refuse a config written for a newer skill instead of silently misreading it.

Set the password with `export ROUTER_PASSWORD=...` or in `router.config.json` (mode `600`, ignored by git).

## Commands

| Command | Effect |
| --- | --- |
| `node scripts/discover.mjs` | Probe the gateway and login page |
| `node scripts/doctor.mjs` | Environment, config, database, router reachability |
| `node scripts/doctor.mjs --version` | Skill version and config version |
| `node scripts/reboot-router.mjs --check` | Login only |
| `node scripts/reboot-router.mjs --dry-run` | Navigate to the reboot action, stop before it |
| `node scripts/reboot-router.mjs` | Reboot now |
| `node scripts/watch-limit.mjs --dry-run` | Detect limits, never reboot |
| `node scripts/watch-limit.mjs` | Run the watcher in the foreground |
| `node scripts/continue-sessions.mjs ses_a ses_b` | Resume specific sessions |

Exit codes: `0` success, `1` failure, `2` no password, `3` wrong network, `4` guard blocked, `5` invalid config.

## Safety

- **Fail closed.** If the SSID or a guard cannot be verified, nothing happens. A missed reboot costs one prompt; a wrong reboot drops someone else's network.
- **Cooldown.** One reboot per 15 minutes by default.
- **Dry run.** Proves login and navigation without touching the router.
- **Secrets stay local.** `router.config.json` is gitignored and created with mode `600`.
- **Only reboots.** It never changes Wi-Fi, PPPoE, firewall, or DNS settings.

## Start-up

| OS | Mechanism |
| --- | --- |
| Linux | systemd user service, `Restart=always` |
| macOS | LaunchAgent, `KeepAlive` |
| Windows | Task Scheduler entry at logon, restart on failure |

The service is safe to leave running: it does nothing until a limit row appears, and the guards still apply.

## Logs

| File | Contents |
| --- | --- |
| `watcher.log` | Detection, cooldown, reboot decisions |
| `router-reboot.log` | Login, navigation, request results |
| `auto-continue.log` | Resume results |
| `artifacts/` | Screenshots from failed runs |

Everything is written inside the skill directory by default. Set `ROUTER_REBOOT_DATA` to a directory to move logs, state, and screenshots elsewhere, which keeps a git checkout clean:

```bash
export ROUTER_REBOOT_DATA="$HOME/.local/state/router-reboot"
```

## Uninstall

```bash
bash uninstall.sh              # Linux and macOS
powershell -File uninstall.ps1 # Windows
```

Add `--keep-config` (`-KeepConfig` on Windows) to save the router configuration before removing the folder.

## Documentation

- [SKILL.md](SKILL.md) — instructions the agent follows.
- [references/router-setup.md](references/router-setup.md) — discovery and request capture.
- [references/opencode-detection.md](references/opencode-detection.md) — detection signals and tuning.
- [references/troubleshooting.md](references/troubleshooting.md) — symptom table.

## License

MIT. See the repository [LICENSE](../LICENSE).
