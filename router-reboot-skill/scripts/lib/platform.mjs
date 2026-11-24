import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const isWin = process.platform === 'win32';
export const isMac = process.platform === 'darwin';
export const isLinux = process.platform === 'linux';

const IPV4 = /(\d{1,3}(?:\.\d{1,3}){3})/;

export function tryRun(cmd, args = [], options = {}) {
  try {
    return execFileSync(cmd, args, {
      encoding: 'utf8',
      timeout: options.timeout ?? 8000,
      windowsHide: true,
      ...options,
    }).trim();
  } catch {
    return '';
  }
}

export function which(cmd) {
  const extensions = isWin ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';') : [''];
  const dirs = (process.env.PATH || '').split(isWin ? ';' : ':');
  for (const dir of dirs) {
    if (!dir) continue;
    for (const ext of extensions) {
      const candidate = path.join(dir, cmd + ext);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return '';
}

// The router is almost always the default gateway, so ask the OS instead of
// guessing 192.168.1.1 and hoping.
export function defaultGateway() {
  if (isWin) {
    const out = tryRun('powershell', [
      '-NoProfile',
      '-Command',
      "(Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric | Select-Object -First 1).NextHop",
    ], { timeout: 15000 });
    return out.match(IPV4)?.[1] || '';
  }

  if (isMac) {
    const out = tryRun('route', ['-n', 'get', 'default']);
    return out.match(/gateway:\s*(\d{1,3}(?:\.\d{1,3}){3})/)?.[1] || '';
  }

  const ip = tryRun('ip', ['route', 'show', 'default']);
  const via = ip.match(/default via (\d{1,3}(?:\.\d{1,3}){3})/)?.[1];
  if (via) return via;

  const route = tryRun('route', ['-n']);
  return route.match(/^0\.0\.0\.0\s+(\d{1,3}(?:\.\d{1,3}){3})/m)?.[1] || '';
}

// Used as the safety gate: only reboot while connected to the home network.
export function currentSsid() {
  if (isWin) {
    const out = tryRun('netsh', ['wlan', 'show', 'interfaces']);
    return out.match(/^\s*SSID\s*:\s*(.+)$/mi)?.[1].trim() || '';
  }

  if (isMac) {
    const out = tryRun('networksetup', ['-getairportnetwork', 'en0']);
    return out.match(/Current Wi-Fi Network:\s*(.+)$/m)?.[1].trim() || '';
  }

  const iwgetid = tryRun('iwgetid', ['-r']);
  if (iwgetid) return iwgetid.trim();

  const nmcli = tryRun('nmcli', ['-t', '-f', 'ACTIVE,SSID', 'dev', 'wifi']);
  for (const line of nmcli.split('\n')) {
    const [active, ...rest] = line.split(':');
    if (active === 'yes') return rest.join(':').trim();
  }
  return '';
}

export function findBrowser(explicit) {
  const candidates = [];
  if (explicit) candidates.push(explicit);
  if (process.env.CHROME_PATH) candidates.push(process.env.CHROME_PATH);

  if (isWin) {
    const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
    const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
    const localAppData = process.env.LOCALAPPDATA || '';
    candidates.push(
      path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    );
  } else if (isMac) {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    );
  } else {
    candidates.push(
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/snap/bin/chromium',
      '/var/lib/flatpak/exports/bin/org.chromium.Chromium',
    );
  }

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return '';
}

// The router needs about a minute to boot. One successful ping right after the
// reboot click proves nothing: the old WAN is still answering. The caller
// requires several in a row.
export function pingOnce(host = '1.1.1.1') {
  const args = isWin ? ['-n', '1', '-w', '2000', host] : ['-c', '1', '-W', '2', host];
  try {
    execFileSync('ping', args, { stdio: 'ignore', timeout: 6000, windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

export function platformName() {
  if (isWin) return 'windows';
  if (isMac) return 'macos';
  if (isLinux) return 'linux';
  return process.platform;
}
