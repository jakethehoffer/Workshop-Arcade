#!/usr/bin/env node
// Run every fast `npm run test:*` gate in sequence.
//
// The repo's quality bar has grown to ~17 distinct test:* scripts, each
// guarding one concern (PWA, SEO, perf, a11y, deep-links, etc.). Before
// this runner, a contributor running validation had to invoke every
// script by name — easy to forget one and ship a regression.
//
// `npm test` invokes this script. It:
//   1. Reads package.json.
//   2. Picks every "test:*" entry EXCEPT the explicit slow/excluded
//      ones (Playwright/browser-backed probes need browsers installed
//      and can take minutes; run them via their explicit scripts or
//      CI jobs).
//   3. Runs each script sequentially with the inherited stdio so the
//      individual checks' output streams unchanged.
//   4. Prints a per-script PASS/FAIL summary at the end and exits
//      non-zero if any script failed, so CI / pre-commit hooks can
//      gate on `npm test` alone.

import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Scripts that should NOT run as part of the fast aggregator. Each entry
// needs a short reason so it's obvious why and a follow-up author can
// add or remove entries deliberately.
const EXCLUDED_SCRIPTS = new Map([
  ['test:github-security-settings', 'Authenticated remote GitHub API drift check — requires maintainer/security settings access. Run via `npm run test:github-security-settings`.'],
  ['test:games', 'Playwright smoke test — needs browsers installed and takes minutes. Run via `npm run test:games` or `npm run test:all`.'],
  ['test:live-canvas-evidence', 'Browser-backed live-smoke canvas evidence fixture — needs Chromium. Run via `npm run test:live-canvas-evidence`.'],
  ['test:owned-domain-cutover-preflight', 'Slow custom-domain cutover preflight — runs the root-domain rehearsal and optional remote DNS / Pages checks. Run via `npm run test:owned-domain-cutover-preflight`.'],
  ['test:owned-domain-rehearsal', 'Slow root-domain release rehearsal — builds, serves, smokes, and audits a temporary owned-domain artifact. Run via `npm run test:owned-domain-rehearsal`.'],
  ['test:pwa-runtime', 'Browser-backed PWA runtime probe — needs Chromium/service worker support. Run via `npm run test:pwa-runtime`.'],
  ['test:publish-ready', 'Slow local publish-readiness aggregate — runs browser, render, and performance gates. Run via `npm run test:publish-ready`.'],
  ['test:runtime-storage', 'Browser-backed sandboxed runtime storage probe — needs Chromium. Run via `npm run test:runtime-storage`.'],
  ['test:live-pages', 'Post-deploy smoke test — hits GitHub Pages or WORKSHOP_ARCADE_URL. Run after Pages deploys via `npm run test:live-pages`.'],
  ['test:launch-evidence-current', 'Local launch-evidence freshness check — depends on gitignored test-results evidence. Run after publish-ready + live-pages evidence via `npm run test:launch-evidence-current`.'],
  ['test:launch-evidence-refresh', 'Slow local launch-evidence refresh — runs publish-ready, live-pages, and freshness verification. Run post-commit via `npm run test:launch-evidence-refresh`.'],
  ['test:all', 'Composite that calls this runner + test:games; running it from inside the runner would recurse.'],
]);

async function loadPackageJson() {
  const raw = await readFile(join(repoRoot, 'package.json'), 'utf8');
  return JSON.parse(raw);
}

function pickTestScripts(scripts) {
  return Object.keys(scripts)
    .filter((name) => name.startsWith('test:') && !EXCLUDED_SCRIPTS.has(name))
    .sort();
}

function runScript(scriptName, command) {
  // The "shell: true with args array" form is now deprecated (Node
  // DEP0190) because the args aren't escaped. Since we control both
  // the script names (alphanumeric + dashes + colons) and the npm
  // invocation (constant prefix), it's safe and warning-free to pass
  // the whole thing as one string. We re-resolve via the recorded
  // package.json command (e.g. "node scripts/check-pwa.mjs") so this
  // runner short-circuits the npm layer entirely — faster startup and
  // no Windows/POSIX npm.cmd vs npm shim divergence.
  const start = Date.now();
  const result = spawnSync(command, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: true,
  });
  const elapsedMs = Date.now() - start;
  return {
    name: scriptName,
    exitCode: result.status,
    elapsedMs,
    error: result.error?.message,
  };
}

const pkg = await loadPackageJson();
const scripts = pkg.scripts || {};
const names = pickTestScripts(scripts);

if (names.length === 0) {
  console.error('No test:* scripts found in package.json. Nothing to run.');
  process.exit(2);
}

const skipped = [...EXCLUDED_SCRIPTS.entries()].filter(([name]) => scripts[name]);

console.log(`Running ${names.length} fast gate${names.length === 1 ? '' : 's'} (${skipped.length} excluded).\n`);
const results = [];
let anyFailed = false;

for (const name of names) {
  console.log(`\n=== ${name} ===`);
  const result = runScript(name, scripts[name]);
  if (result.exitCode !== 0) anyFailed = true;
  results.push(result);
}

console.log('\n──────────────────────────────────────────────');
console.log('Fast-gate summary:');
for (const result of results) {
  const status = result.exitCode === 0 ? 'PASS' : `FAIL (${result.exitCode ?? 'spawn error'})`;
  console.log(` - ${status.padEnd(20)} ${result.name.padEnd(28)} ${result.elapsedMs}ms`);
}
if (skipped.length > 0) {
  console.log('\nExcluded from `npm test`:');
  for (const [name, reason] of skipped) {
    console.log(` - ${name}: ${reason}`);
  }
}

if (anyFailed) {
  console.error(`\n${results.filter((r) => r.exitCode !== 0).length} of ${results.length} fast gates failed.`);
  process.exit(1);
}

console.log(`\nAll ${results.length} fast gates passed.`);
