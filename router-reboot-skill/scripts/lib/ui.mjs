import { findBrowser } from './platform.mjs';
import { planSteps, substitute } from './steps.mjs';

const BASE_TIMEOUT = 30000;

export async function launch(cfg, { headful = false } = {}) {
  // Imported lazily so --version, discover, and doctor work before npm install.
  const { chromium } = await import('playwright-core');
  const executablePath = findBrowser(cfg.router.chromePath) || undefined;

  const browser = await chromium.launch({
    executablePath,
    headless: !headful,
    args: ['--no-sandbox', '--ignore-certificate-errors'],
  });

  const context = await browser.newContext({
    ignoreHTTPSErrors: cfg.router.ignoreHttpsErrors !== false,
  });
  const page = await context.newPage();

  // Routers love a native confirm() before rebooting. Accept it by default;
  // set reboot.acceptDialogs to false when a dialog is the safety question.
  if (cfg.reboot.acceptDialogs !== false) {
    page.on('dialog', (dialog) => dialog.accept().catch(() => {}));
  }

  return { browser, context, page };
}

function absolute(cfg, p) {
  const base = cfg.router.baseUrl.replace(/\/+$/, '');
  return new URL(p, `${base}/`).href;
}

export async function login(page, cfg, password) {
  const spec = cfg.reboot.login;
  if (!spec) return { loggedIn: false, reason: 'no login configured' };

  await page.goto(absolute(cfg, spec.path || '/'), {
    waitUntil: 'domcontentloaded',
    timeout: BASE_TIMEOUT,
  });
  await page.waitForTimeout(Number(spec.waitMs ?? 1500));

  if (spec.username) {
    const field = page.locator(spec.username).first();
    if (!(await field.count())) {
      // No form means the session is already authenticated, which is fine.
      return { loggedIn: true, reason: 'no login form, already authenticated' };
    }
    await field.fill(cfg.router.username);
  }
  if (spec.password) {
    await page.locator(spec.password).first().fill(password);
  }
  if (spec.submit) {
    await Promise.all([
      page.waitForLoadState('domcontentloaded', { timeout: BASE_TIMEOUT }).catch(() => {}),
      page.locator(spec.submit).first().click({ timeout: BASE_TIMEOUT }),
    ]);
  }

  await page.waitForTimeout(Number(spec.waitMs ?? 2000));

  if (spec.successUrl && !new RegExp(spec.successUrl).test(page.url())) {
    throw new Error(`login did not reach /${spec.successUrl}/ (still at ${page.url()})`);
  }
  return { loggedIn: true, reason: page.url() };
}

// Replays the request captured from the browser. One call, no UI to drift.
export async function httpReboot(page, cfg) {
  const spec = cfg.reboot.http || {};
  return page.evaluate(async (http) => {
    const init = {
      method: http.method || 'POST',
      credentials: 'include',
      headers: {},
    };
    if (http.contentType) init.headers['Content-Type'] = http.contentType;
    if (http.body !== null && http.body !== undefined) {
      init.body = typeof http.body === 'string' ? http.body : JSON.stringify(http.body);
    }

    const response = await fetch(http.path, init);
    const text = await response.text();
    return { status: response.status, body: text.slice(0, 300) };
  }, spec);
}

// A small declarative driver so any router UI can be described in JSON instead
// of forking the script for every firmware. Mark the step that actually sends
// the reboot with "reboot": true so --dry-run can stop in front of it.
export async function runSteps(page, cfg, password, { dryRun = false, log = () => {} } = {}) {
  const steps = cfg.reboot.steps || [];
  const { stopBefore } = planSteps(steps, dryRun);
  let rebooted = false;

  for (const [index, step] of steps.entries()) {
    const timeout = Number(step.timeoutMs ?? 20000);
    const label = `step ${index + 1}/${steps.length}`;

    if (dryRun && index >= stopBefore) {
      log(`dry run - stopping before ${label}${rebootIndex < 0 ? ' (last step)' : ''}`);
      break;
    }

    if (step.goto) {
      await page.goto(absolute(cfg, step.goto), { waitUntil: 'domcontentloaded', timeout });
      log(`${label}: opened ${step.goto}`);
    }
    if (step.click) {
      await page.locator(step.click).first().click({ timeout });
      log(`${label}: clicked ${step.click}`);
    }
    if (step.hover) {
      await page.locator(step.hover).first().hover({ timeout });
      log(`${label}: hovered ${step.hover}`);
    }
    if (step.fill) {
      await page.locator(step.fill).first().fill(substitute(step.value, cfg, password), { timeout });
      log(`${label}: filled ${step.fill}`);
    }
    if (step.press) {
      await page.keyboard.press(step.press);
      log(`${label}: pressed ${step.press}`);
    }
    if (step.waitForSelector) {
      await page.locator(step.waitForSelector).first().waitFor({ state: 'visible', timeout });
      log(`${label}: saw ${step.waitForSelector}`);
    }
    if (step.waitForText) {
      await page
        .getByText(step.waitForText, { exact: false })
        .first()
        .waitFor({ state: 'visible', timeout });
      log(`${label}: saw text "${step.waitForText}"`);
    }
    if (step.waitMs) {
      await page.waitForTimeout(Number(step.waitMs));
    }
    if (step.reboot === true) rebooted = true;
  }

  return { rebooted };
}
