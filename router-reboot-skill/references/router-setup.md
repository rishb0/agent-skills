# Router Setup

How to go from "a router on the LAN" to a working `router.config.json`.

## Contents

- [1. Find the gateway](#1-find-the-gateway)
- [2. Confirm it is your router](#2-confirm-it-is-your-router)
- [3. Capture the reboot request](#3-capture-the-reboot-request)
- [4. Write HTTP mode](#4-write-http-mode)
- [5. Write UI mode](#5-write-ui-mode)
- [6. Common patterns](#6-common-patterns)
- [7. Validate](#7-validate)

## 1. Find the gateway

The router is almost always the default gateway. Ask the OS:

| OS | Command |
| --- | --- |
| Linux | `ip route show default` |
| macOS | `route -n get default` |
| Windows | `powershell -Command "(Get-NetRoute -DestinationPrefix '0.0.0.0/0').NextHop"` |

Or just run:

```bash
node scripts/discover.mjs
```

It probes both `https://<gateway>/` and `http://<gateway>/`, prints the page title, every input and button, and lists candidate reboot endpoints. Nothing is triggered.

## 2. Confirm it is your router

Open the gateway in a browser and check that it is the device you expect. The strongest confirmation is the network name: set `safety.wifiSsid` to the exact home SSID. The scripts then refuse to run on any other network.

Do not skip this. `192.168.1.1` is the same address in millions of homes.

## 3. Capture the reboot request

Preferred path: one request, replayed later.

1. Open the router page in Chrome or Edge.
2. Open DevTools, then the **Network** tab. Enable **Preserve log**.
3. Log in and navigate to the reboot button, but do not click it yet.
4. Clear the request list, click the reboot button, and confirm any dialog.
5. Find the request that actually sends the reboot. It is usually the last `POST` or `PUT` before the connection drops.
6. Right-click it, choose **Copy as cURL**, or read the method, path, and body from the **Headers** and **Payload** tabs.

Record three things:

| Field | Where it comes from |
| --- | --- |
| `method` | The request method, for example `POST` or `PUT` |
| `path` | The path only, for example `/api/devicectrl` |
| `body` | The payload, as JSON or a raw string |

If the request needs a session cookie, keep the `login` block. The request is replayed inside the logged-in browser page, so cookies are sent automatically.

## 4. Write HTTP mode

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

Notes:

- `login` may be `null` when the endpoint needs no session. The script still opens `baseUrl` first so the request has an origin.
- `contentType` can be omitted for a plain form post. Use `"application/x-www-form-urlencoded"` and a string body when the router expects a form.
- `successUrl` is a regular expression matched against the URL after login. Omit it if the router does not change pages.
- `body` may be an object (sent as JSON) or a string (sent as-is).
- If the request needs a CSRF token from the page, use UI mode instead, or add the token to the page first. Tokens change per session and cannot be hardcoded.

## 5. Write UI mode

Use UI mode when the reboot is behind a menu, a modal, or a JavaScript confirm dialog.

```json
"reboot": {
  "mode": "ui",
  "steps": [
    { "goto": "/pages.html" },
    { "click": "text=Maintenance" },
    { "hover": "text=Maintenance" },
    { "click": "text=Reboot Device" },
    { "waitForSelector": "input[name=reboot]" },
    { "click": "input[name=reboot]", "reboot": true },
    { "waitForText": "device is restarting", "timeoutMs": 10000 }
  ]
}
```

Step keys:

| Key | Value | Effect |
| --- | --- | --- |
| `goto` | path | Navigate relative to `router.baseUrl` |
| `click` | selector | Click the first match |
| `hover` | selector | Hover, for menus that open on hover |
| `fill` | selector | Type `value` into the field |
| `press` | key | Press a keyboard key, for example `Enter` |
| `waitForSelector` | selector | Wait until it is visible |
| `waitForText` | text | Wait until that text is visible |
| `waitMs` | number | Fixed pause |
| `timeoutMs` | number | Per-step timeout, default 20000 |
| `reboot` | `true` | Marks the step that actually reboots |

The `reboot` marker matters: `--dry-run` stops in front of it. Without the marker, a dry run stops before the final step.

`fill` supports `${username}`, `${password}`, and `${baseUrl}`.

### Selectors

Playwright selectors work as-is:

```text
input[name=reboot]          CSS
#reboot                     CSS id
text=Reboot Device          visible text, case-insensitive substring
role=button[name="Reboot"]  accessibility role
```

Prefer `role=` or stable `name`/`id` attributes. Text changes with firmware language packs.

## 6. Common patterns

**Menu opens only on hover.** Add both `click` and `hover` for the parent item, then click the child.

**Native confirm dialog.** Accepted automatically. Set `"acceptDialogs": false` if the dialog is the real safety question and you want the run to stop instead.

**Two-step confirmation.** Add the second click as another step.

**Login is a separate page.** Use `login.path` and `login.successUrl`. If the router redirects to a dashboard with a random path, omit `successUrl` and rely on the form disappearing.

**Reboot endpoint needs a token.** Log in with UI mode, then `fill` hidden fields is not possible. Instead capture the token with a step that reads the page, or use HTTP mode plus a `fill` on the form that submits the reboot.

**Router behind a different port.** Set `baseUrl` to include it, for example `http://192.168.1.1:8080`.

## 7. Validate

```bash
node scripts/doctor.mjs
node scripts/reboot-router.mjs --check
node scripts/reboot-router.mjs --dry-run
```

- `--check` proves the credentials and the login selectors.
- `--dry-run` proves the navigation and the step list.
- A failure writes a full-page screenshot to `artifacts/`. Open it and fix the selector that is highlighted by the last logged step.

Only after both pass, run the real reboot once and confirm the connection returns within about two minutes.
