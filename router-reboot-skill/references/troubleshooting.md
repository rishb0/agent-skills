# Troubleshooting

## Contents

- [Install](#install)
- [Login](#login)
- [Reboot](#reboot)
- [Detection](#detection)
- [Resume](#resume)
- [Start-up](#start-up)
- [Logs](#logs)

## Install

| Symptom | Cause | Fix |
| --- | --- | --- |
| `node is required` | Node is missing or not on `PATH` | Install Node 18 or newer |
| `npm install failed` | No network, or a proxy blocks npm | Install once with network, or copy `node_modules` from another machine |
| `cannot find package 'playwright-core'` | Dependencies were not installed | `cd <skill dir> && npm install` |
| `cannot start the browser` | No Chrome, Chromium, or Edge found | Install one, or set `router.chromePath` |
| `systemd user session not available` | WSL or a container without systemd | Run `scripts/watch-limit.mjs` yourself, or enable systemd |
| Config not created | `--no-service` still copies it; a read-only directory does not | Copy `config/router.config.example.json` to `router.config.json` manually |

## Login

| Symptom | Cause | Fix |
| --- | --- | --- |
| `no password` | Empty config and no environment variable | Set `router.password`, or export `ROUTER_PASSWORD` |
| `login rejected` | Wrong credentials or wrong selectors | Re-run with `--headful` and watch the fields |
| `still on the login page` | The submit selector is wrong, or the form posts to a frame | Inspect the form with DevTools, update `reboot.login` |
| Login succeeds but the next step fails | Session cookie is scoped to a path | Add `{ "goto": "/pages.html" }` before the first click |
| Certificate error | Self-signed router certificate | Keep `router.ignoreHttpsErrors: true` |

## Reboot

| Symptom | Cause | Fix |
| --- | --- | --- |
| `guard blocked: connected to ...` | Not on the configured SSID | Connect to the home network, or fix `safety.wifiSsid` |
| `cannot read the current SSID` | No Wi-Fi tool, or Ethernet-only | Set `wifiSsid` to `""` only if you accept rebooting on any network |
| `ERR_CONNECTION_REFUSED` | Router is already rebooting | Wait two minutes |
| The UI path fails every time | Selectors drifted after a firmware update | Re-run `discover.mjs`, update `reboot.steps` |
| `http reboot -> 403` | Session cookie or CSRF token missing | Keep the `login` block, or switch to UI mode |
| `http reboot -> 404` | Wrong path | Re-capture the request in DevTools |
| Reboot happens twice | Both the UI step and the fallback ran | Ensure the reboot step has `"reboot": true` so the fallback is skipped |
| Dry run actually rebooted | No step is marked `reboot: true`, so the last step was not recognised | Mark the real step, or move it to the end |

## Detection

| Symptom | Cause | Fix |
| --- | --- | --- |
| `OpenCode database not found` | Non-default install location | Set `watch.opencodeDb` or `OPENCODE_DB` |
| `db read failed` | Database briefly locked | Transient; the next poll retries |
| Doctor shows 0 limit rows | Wrong database, or a new schema | Check the path, then read [opencode-detection.md](opencode-detection.md) |
| Watcher runs but never fires | Cursor is ahead of the failure | Run once with `--dry-run --from-start` |
| Reboots on every poll | Cursor is not being saved | Check write permission on the data directory |
| Two reboots for one event | Sessions landed after the batch window | Raise `watch.batchSeconds` |

## Resume

| Symptom | Cause | Fix |
| --- | --- | --- |
| Nothing resumes | `resume.enabled` is false | Set it to `true` |
| `opencode: not found` | CLI not on the service's `PATH` | Add the CLI directory to `PATH` in the service unit |
| `attempt 1/3 failed (exit 1)` | Background server down | `opencode service status`, then `opencode service start` |
| `already moving - skip` | Session recovered on its own | Expected; nothing is doubled |
| `continued in unknown mode` | No assistant turn yet | Harmless; the server still uses the session agent |
| Sessions resume before the WAN is back | Router boots faster than the settle time, or pings are cached | Raise `watch.settleSeconds` |

## Start-up

| OS | Check | Fix |
| --- | --- | --- |
| Linux | `systemctl --user status reboot-home-router` | `systemctl --user enable --now reboot-home-router` |
| Linux, no login | `loginctl show-user "$USER" -p Linger` | `loginctl enable-linger "$USER"` |
| macOS | `launchctl print gui/$(id -u)/com.agent-skills.router-reboot` | Re-run `install.sh` |
| Windows | `schtasks /Query /TN RouterReboot` | Re-run `install.ps1` as the same user |

## Logs

All logs live in the skill directory, or in `ROUTER_REBOOT_DATA` when it is set. `node scripts/doctor.mjs` prints the exact path.

```bash
tail -f watcher.log
tail -f router-reboot.log
tail -f auto-continue.log
```

- `watcher.log` — detection, cooldown decisions, reboot and resume dispatch.
- `router-reboot.log` — every step of the login and reboot, including which step failed.
- `auto-continue.log` — per-session resume attempts.
- `artifacts/` — screenshots from failed browser runs. Delete them freely.

For the service's own output:

```bash
journalctl --user -u reboot-home-router -f     # Linux
log stream --predicate 'process == "node"'     # macOS
```
