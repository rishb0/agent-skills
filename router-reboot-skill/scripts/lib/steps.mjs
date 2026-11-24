// Pure helpers for the declarative UI driver. Kept free of Playwright imports
// so they can be tested without a browser.

export function substitute(value, cfg, password) {
  return String(value ?? '')
    .replace(/\$\{username\}/g, cfg.router.username)
    .replace(/\$\{password\}/g, password)
    .replace(/\$\{baseUrl\}/g, cfg.router.baseUrl);
}

// Decides where a dry run must stop. The step marked "reboot": true is the one
// that actually reboots; without a marker, the last step is assumed to be it.
export function planSteps(steps = [], dryRun = false) {
  const rebootIndex = steps.findIndex((step) => step && step.reboot === true);
  const stopBefore = dryRun ? (rebootIndex >= 0 ? rebootIndex : Math.max(0, steps.length - 1)) : -1;
  return { rebootIndex, stopBefore };
}
