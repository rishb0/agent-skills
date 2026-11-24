import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// scripts/lib -> skill root
export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Logs, state, and screenshots go here. Defaults to the skill directory so a
// repo checkout and an installed copy behave the same; override with
// ROUTER_REBOOT_DATA to keep a checkout clean.
export const DATA_DIR = process.env.ROUTER_REBOOT_DATA
  ? path.resolve(process.env.ROUTER_REBOOT_DATA)
  : SKILL_DIR;
export const ARTIFACTS_DIR = path.join(DATA_DIR, 'artifacts');

// Bumped only when an existing config would need a manual change.
export const CONFIG_VERSION = 1;

export class ConfigError extends Error {}

export function skillVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'package.json'), 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export function versionLine() {
  return `router-reboot-skill ${skillVersion()} (config ${CONFIG_VERSION})`;
}

export function printVersionIfRequested(argv = process.argv.slice(2)) {
  if (!argv.includes('--version')) return false;
  console.log(versionLine());
  return true;
}

const DEFAULTS = {
  router: {
    baseUrl: 'https://192.168.1.1',
    username: 'admin',
    password: '',
    passwordEnv: 'ROUTER_PASSWORD',
    ignoreHttpsErrors: true,
    chromePath: '',
  },
  safety: {
    wifiSsid: '',
    guards: [],
    cooldownMinutes: 15,
  },
  reboot: {
    mode: 'ui',
    acceptDialogs: true,
    login: null,
    http: { method: 'PUT', path: '/', contentType: 'application/json', body: null },
    steps: [],
  },
  watch: {
    opencodeDb: '',
    logPath: '',
    pollSeconds: 3,
    batchSeconds: 15,
    maxSessions: 5,
    settleSeconds: 90,
  },
  resume: {
    enabled: false,
    gapSeconds: 20,
    attempts: 3,
    retrySeconds: 30,
  },
};

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function merge(base, extra) {
  if (Array.isArray(base) || Array.isArray(extra)) return extra === undefined ? base : extra;
  if (isObject(base) && isObject(extra)) {
    const out = { ...base };
    for (const [key, value] of Object.entries(extra)) out[key] = merge(base[key], value);
    return out;
  }
  return extra === undefined ? base : extra;
}

export function configFile() {
  return process.env.ROUTER_CONFIG || path.join(SKILL_DIR, 'router.config.json');
}

export function loadConfig() {
  const file = configFile();
  if (!fs.existsSync(file)) {
    throw new ConfigError(`missing ${file}. Copy config/router.config.example.json to router.config.json first.`);
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new ConfigError(`cannot parse ${file}: ${err.message}`);
  }

  const cfg = merge(DEFAULTS, raw);

  if (raw.configVersion !== undefined) {
    const found = Number(raw.configVersion);
    if (!Number.isFinite(found) || found < 1) {
      throw new ConfigError(`configVersion must be a positive number, got ${raw.configVersion}`);
    }
    if (found > CONFIG_VERSION) {
      throw new ConfigError(
        `configVersion ${found} is newer than this skill (${CONFIG_VERSION}). Update the skill instead of editing the config.`,
      );
    }
  }

  validate(cfg);
  cfg.file = file;
  return cfg;
}

function validate(cfg) {
  let url;
  try {
    url = new URL(cfg.router.baseUrl);
  } catch {
    throw new ConfigError(`router.baseUrl is not a URL: ${cfg.router.baseUrl}`);
  }
  if (!/^https?:$/.test(url.protocol)) {
    throw new ConfigError('router.baseUrl must start with http:// or https://');
  }

  if (!['ui', 'http'].includes(cfg.reboot.mode)) {
    throw new ConfigError(`reboot.mode must be "ui" or "http", got "${cfg.reboot.mode}"`);
  }
  if (!Array.isArray(cfg.reboot.steps)) throw new ConfigError('reboot.steps must be an array');
  if (!Array.isArray(cfg.safety.guards)) throw new ConfigError('safety.guards must be an array');

  if (cfg.reboot.mode === 'ui' && cfg.reboot.steps.length === 0) {
    throw new ConfigError('reboot.steps is empty. Run scripts/discover.mjs, then describe the clicks.');
  }
  if (cfg.reboot.mode === 'http' && !cfg.reboot.http?.path) {
    throw new ConfigError('reboot.http.path is empty');
  }

  for (const key of ['pollSeconds', 'batchSeconds', 'maxSessions', 'settleSeconds']) {
    const value = Number(cfg.watch[key]);
    if (!Number.isFinite(value) || value < 0) throw new ConfigError(`watch.${key} must be a number`);
  }
}

export function resolvePassword(cfg) {
  const direct = String(cfg.router.password || '').trim();
  if (direct) return direct;

  const envName = String(cfg.router.passwordEnv || '').trim();
  if (envName && process.env[envName]) return process.env[envName];
  if (process.env.ROUTER_PASSWORD) return process.env.ROUTER_PASSWORD;
  return '';
}

export function cooldownMs(cfg) {
  return Number(cfg.safety.cooldownMinutes) * 60 * 1000;
}
