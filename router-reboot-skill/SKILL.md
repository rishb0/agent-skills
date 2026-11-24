---
name: router-reboot-skill
description: Reboots the home router on demand, and automatically when OpenCode's free-tier limit is reached, then optionally resumes the interrupted sessions. Detects the router, writes its configuration, and installs an OS-level watcher that works without internet or an LLM. Use when the user asks to reboot or restart their router, to automate recovery after a free usage limit or quota exhaustion, or to keep agent sessions alive unattended.
---

# Router Reboot

Reboots the home router over the LAN and, when the OpenCode free limit is hit, restarts the sessions that died. The watcher runs locally with no LLM and no internet, so it still works after the quota is gone.

## Contents

- [Start here](#start-here)
- [Requirements](#requirements)
- [Install](#install)
- [Discover the router](#discover-the-router)
- [Configure](#configure)
- [Verify](#verify)
- [Enable start-up](#enable-start-up)
- [Commands](#commands)
- [Safety rules](#safety-rules)
- [Troubleshooting](#troubleshooting)
- [Uninstall](#uninstall)

## Start here

You may have been given only this `SKILL.md`, or the whole folder. Work out which before doing anything else.

| What you have | What to do |
| --- | --- |
| The whole `router-reboot-skill/` folder | Use it in place. Run the installer from the folder, then work in the installed copy. |
| Only this `SKILL.md` | Clone `https://github.com/rishb0/agent-skills.git` and use `agent-skills/router-reboot-skill/`. If the user cannot clone, ask for the folder path. |
| A path the user pasted | `cd` into that folder and confirm `scripts/reboot-router.mjs` exists. |

Never rebuild the scripts from this file. If the folder is incomplete, ask for it instead of writing a substitute: the scripts are tested, hand-written copies are not.

Before configuring anything, collect these four facts from the user and nothing more:

1. **Router address** — usually the default gateway. `discover.mjs` prints it; confirm the value with the user.
2. **Admin username** — often `admin`. Ask.
3. **Admin password** — ask, and never echo it back, log it, or put it in a chat summary. Prefer having the user export `ROUTER_PASSWORD` in their shell over storing it in the file.
4. **Exact home Wi-Fi name (SSID)** — ask the user to copy it from their phone's Wi-Fi list, not to type it from memory. Case and spaces matter. This is the safety gate that stops a reboot on someone else's network.

Ask for the missing ones in one message, then continue. Do not guess any of them, and do not proceed with an empty SSID unless the user explicitly accepts that risk.

Every command below assumes you are in the skill directory. Do that first, whether it is a clone or an installed copy:

```bash
cd /path/to/router-reboot-skill
node scripts/doctor.mjs --version
```

## Requirements

Check each item before installing. Report anything missing instead of working around it.

| Requirement | Why | Check |
| --- | --- | --- |
| Node.js 18+ | Runs every script | `node --version` |
| npm | Installs `playwright-core` | `npm --version` |
| Chromium, Chrome, or Edge | Drives the router login page | `which chromium google-chrome` |
| `sqlite3` CLI or Node 22+ | Reads the OpenCode database | `which sqlite3` |
| OpenCode CLI | Only for auto-resume | `opencode --version` |
| Router admin password | Logs in to the router | Ask the user |

## Install

Run the installer from the skill folder. It copies the skill into the agent's skills directory, installs dependencies, and registers the background service.

```bash
git clone https://github.com/rishb0/agent-skills.git
bash agent-skills/router-reboot-skill/install.sh
```

- `--claude` installs into `~/.claude/skills/router-reboot-skill` instead of the OpenCode path.
- `--target <dir>` installs somewhere else.
- `--no-service` copies the files without registering start-up.

On Windows run `powershell -ExecutionPolicy Bypass -File install.ps1` instead.

If the repository is already present, run the installer from wherever it lives. Never rewrite the scripts by hand: the installer is the supported path.

After install, all commands below run from the installed skill directory:

```bash
cd ~/.config/opencode/skills/router-reboot-skill
```

## Discover the router

Do not guess the router model or its endpoints. Probe the LAN first.

```bash
node scripts/discover.mjs
```

The report contains the default gateway, the login page title, every form field and button, and candidate reboot endpoints. Use it to choose one of two modes:

- **`http`** — preferred when the reboot is a single request. Log in once, open the browser devtools, click the reboot button, and copy the request (method, path, body). Fewer moving parts and survives UI redesigns.
- **`ui`** — use when the reboot is behind a menu or a confirmation dialog, or when the request is hard to replay. Describe the clicks in order.

If the gateway is not `192.168.1.1`, use the reported address. Confirm the router is the user's own before going further: the SSID gate in [Configure](#configure) is what makes that safe.

## Configure

Create `router.config.json` from the example if the installer did not:

```bash
cp config/router.config.example.json router.config.json
chmod 600 router.config.json
```

Fill in the router block. Leave `password` empty and export `ROUTER_PASSWORD` instead if the user prefers not to store it.

```json
{
  "configVersion": 1,
  "router": {
    "baseUrl": "https://192.168.1.1",
    "username": "admin",
    "password": "",
    "passwordEnv": "ROUTER_PASSWORD"
  },
  "safety": {
    "wifiSsid": "HomeNetwork",
    "guards": []
  },
  "reboot": { "mode": "http" }
}
```

`configVersion` is optional. Keep it at `1` unless the skill's README says otherwise; a config marked newer than the installed skill is rejected on purpose.

`safety.wifiSsid` is the main safety gate. Set it to the exact SSID of the home network. The scripts refuse to reboot when the machine is on any other network, or when the SSID cannot be read.

Then fill the block for the chosen mode.

**HTTP mode** — the request captured from the browser:

```json
"reboot": {
  "mode": "http",
  "login": {
    "path": "/",
    "username": "input[name=username]",
    "password": "input[name=password]",
    "submit": "input[type=submit]",
    "successUrl": "pages.html"
  },
  "http": {
    "method": "PUT",
    "path": "/api/devicectrl",
    "contentType": "application/json",
    "body": { "command": "reboot" }
  }
}
```

Set `"login": null` only when the reboot endpoint needs no session.

**UI mode** — the clicks in order:

```json
"reboot": {
  "mode": "ui",
  "login": { "path": "/", "username": "input[name=username]", "password": "input[name=password]", "submit": "input[type=submit]" },
  "steps": [
    { "click": "text=Maintenance" },
    { "hover": "text=Maintenance" },
    { "click": "text=Reboot Device" },
    { "click": "input[name=reboot]" },
    { "waitForText": "device is restarting", "timeoutMs": 10000 }
  ]
}
```

Selectors are Playwright selectors: CSS (`input[name=reboot]`), text (`text=Reboot`), role (`role=button[name="Reboot"]`). Step keys: `goto`, `click`, `hover`, `fill` with `value`, `press`, `waitForText`, `waitForSelector`, `waitMs`.

Optional guards run before every reboot. A command that exits non-zero blocks it:

```json
"guards": [
  { "command": "node scripts/meet-guard.mjs", "reason": "call in progress" }
]
```

`meet-guard.mjs` detects a live Google Meet call on Linux with PipeWire. On any OS where it cannot verify the state it exits blocked, which is correct: leave the guard out unless it is known to work there.

## Verify

Run these in this exact order and stop at the first failure. Do not skip the dry run.

```bash
node scripts/doctor.mjs        # environment, config, database, router reachability
node scripts/reboot-router.mjs --check    # proves the login works, changes nothing
node scripts/reboot-router.mjs --dry-run  # opens the reboot page, stops before clicking
```

`--dry-run` saves a screenshot to `artifacts/` when it fails. Read it to fix selectors.

Only then reboot for real, and tell the user the connection drops for about a minute:

```bash
node scripts/reboot-router.mjs
```

If any step fails, report the exit code and the log line that explains it. Do not retry the real reboot on a guess: fix the config, then start again from `doctor.mjs`.

Test detection without rebooting:

```bash
node scripts/watch-limit.mjs --dry-run
```

## Enable start-up

The installer registers the service. Confirm it is running:

| OS | Command |
| --- | --- |
| Linux | `systemctl --user status reboot-home-router` |
| macOS | `launchctl print gui/$(id -u)/com.agent-skills.router-reboot` |
| Windows | `schtasks /Query /TN RouterReboot` |

Logs are written to the skill directory by default: `watcher.log`, `router-reboot.log`, `auto-continue.log`. Set `ROUTER_REBOOT_DATA` to put logs, state, and screenshots somewhere else. `doctor.mjs` prints both the version and the data directory.

Auto-resume is off by default. Enable it after the reboot works reliably:

```json
"resume": { "enabled": true }
```

## Commands

| Command | Effect |
| --- | --- |
| `node scripts/discover.mjs` | Probe the gateway and login page |
| `node scripts/doctor.mjs` | Check environment and configuration |
| `node scripts/doctor.mjs --version` | Print skill version and config version |
| `node scripts/reboot-router.mjs --check` | Login only |
| `node scripts/reboot-router.mjs --dry-run` | Login and navigate, no reboot |
| `node scripts/reboot-router.mjs` | Reboot now |
| `node scripts/reboot-router.mjs --headful` | Reboot with a visible browser |
| `node scripts/reboot-router.mjs --api` | Use HTTP mode even if UI mode is configured |
| `node scripts/watch-limit.mjs --dry-run` | Detect limits, never reboot |
| `node scripts/watch-limit.mjs` | Run the watcher in the foreground |
| `node scripts/continue-sessions.mjs ses_a ses_b` | Resume specific sessions |

Exit codes: `0` success, `1` failure, `2` no password, `3` wrong network, `4` guard blocked, `5` invalid config.

## Safety rules

1. **Fail closed.** If the SSID or a guard cannot be verified, do not reboot. A missed reboot costs one prompt; a wrong reboot drops someone else's network.
2. **Never reboot mid-task.** The WAN drops for about a minute. Warn the user first.
3. **One reboot per cooldown.** The watcher enforces 15 minutes by default.
4. **Never store credentials in the repository.** `router.config.json` is ignored by git and should be mode `600`.
5. **Dry run first.** Always.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `no password` | Config and environment are both empty | Set `password` or export `ROUTER_PASSWORD` |
| `wrong network` | SSID does not match, or cannot be read | Connect to the home network, or fix `safety.wifiSsid` |
| `login rejected` | Wrong credentials, or the form selector is wrong | Check both with `--headful` |
| Login works, reboot does not | Selectors drifted after a firmware update | Re-run `discover.mjs`, update `steps` |
| `ERR_CONNECTION_REFUSED` | Router already rebooting | Wait two minutes |
| `db read failed` | Database briefly locked | Transient; the next poll retries |
| Watcher never fires | Detection signal is wrong for this OpenCode version | Run `doctor.mjs` and read [references/opencode-detection.md](references/opencode-detection.md) |
| Sessions not resumed | Background server down | `opencode service status`, then start it |

More detail: [references/troubleshooting.md](references/troubleshooting.md).

## Uninstall

```bash
bash uninstall.sh
```

It stops and removes the service, then deletes the installed skill directory. Add `--keep-config` to preserve `router.config.json`.

## References

- [references/router-setup.md](references/router-setup.md) — discovery commands per OS, request capture, selector recipes.
- [references/opencode-detection.md](references/opencode-detection.md) — how the limit is detected, database schema, log fallback.
- [references/troubleshooting.md](references/troubleshooting.md) — full symptom table.
