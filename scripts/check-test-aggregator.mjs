#!/usr/bin/env node
// Test-aggregator contract check.
//
// `npm test` exists for a reason — it's the universal Node convention
// for "run the project's validation suite". Workshop Arcade wires it
// to scripts/run-fast-tests.mjs, which auto-discovers every "test:*"
// npm script and runs it in sequence. This check makes sure the wiring
// stays intact so new contributors (and CI) don't silently miss gates.
//
// Verifies:
//   1. package.json exposes "test" → scripts/run-fast-tests.mjs and
//      "test:all" → fast runner + test:games.
//   2. scripts/run-fast-tests.mjs exists, syntax-checks via
//      `node --check`, and reads package.json (so it picks up new
//      gates automatically).
//   3. The runner's exclusion list explicitly cites the browser-backed
//      slow gates and "test:all" — the entries that should NOT run from
//      the fast aggregate path.
//   4. For every "test:*" script in package.json that is NOT in the
//      exclusion list, the runner will pick it up. This guards against
//      accidentally widening the exclusion list and silently dropping
//      gates from `npm test`.

import { readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const issues = [];

function fail(message) {
  issues.push(message);
}

async function exists(relative) {
  try {
    await stat(join(repoRoot, relative));
    return true;
  } catch {
    return false;
  }
}

async function loadPackageJson() {
  const raw = await readFile(join(repoRoot, 'package.json'), 'utf8');
  return JSON.parse(raw);
}

async function checkPackageJson(pkg) {
  const scripts = pkg.scripts || {};
  if (scripts.test !== 'node scripts/run-fast-tests.mjs') {
    fail(`package.json: "test" script must be "node scripts/run-fast-tests.mjs", got ${JSON.stringify(scripts.test)}`);
  }
  if (!scripts['test:all'] || !/run-fast-tests\.mjs/.test(scripts['test:all']) || !/test:games/.test(scripts['test:all'])) {
    fail(`package.json: "test:all" must compose the fast runner with test:games (e.g. "node scripts/run-fast-tests.mjs && npm run test:games"), got ${JSON.stringify(scripts['test:all'])}`);
  }
}

async function checkRunner() {
  const path = 'scripts/run-fast-tests.mjs';
  if (!(await exists(path))) {
    fail(`${path}: file missing`);
    return null;
  }
  const result = spawnSync(process.execPath, ['--check', join(repoRoot, path)], { encoding: 'utf8' });
  if (result.status !== 0) {
    fail(`${path}: node --check failed: ${(result.stderr || '').trim()}`);
    return null;
  }
  const src = await readFile(join(repoRoot, path), 'utf8');
  if (!/package\.json/.test(src)) {
    fail(`${path}: must read package.json so new test:* scripts are picked up automatically`);
  }
  if (!/EXCLUDED_SCRIPTS/.test(src)) {
    fail(`${path}: must declare an EXCLUDED_SCRIPTS map naming the gates that should NOT run`);
  }
  return src;
}

function extractExcludedScripts(runnerSrc) {
  const match = runnerSrc.match(/EXCLUDED_SCRIPTS\s*=\s*new\s+Map\(\s*\[([\s\S]*?)\]\s*\)/);
  if (!match) return new Set();
  const entries = [...match[1].matchAll(/\[\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  return new Set(entries);
}

async function checkCoverage(pkg, runnerSrc) {
  const excluded = extractExcludedScripts(runnerSrc);
  const allowedExcluded = new Set(['test:github-security-settings', 'test:games', 'test:live-canvas-evidence', 'test:pwa-runtime', 'test:runtime-storage', 'test:live-pages', 'test:all']);
  for (const required of allowedExcluded) {
    if (!excluded.has(required)) {
      fail(`scripts/run-fast-tests.mjs: EXCLUDED_SCRIPTS must list "${required}" (explicit remote/browser-backed gate or recursive aggregate)`);
    }
  }
  const candidates = Object.keys(pkg.scripts || {}).filter((name) => name.startsWith('test:'));
  const willRun = candidates.filter((name) => !excluded.has(name));
  if (willRun.length === 0) {
    fail('scripts/run-fast-tests.mjs: exclusion list swallows every test:* script — nothing would run under `npm test`');
  }
  // Defensive: make sure no NEW exclusion sneaks in beyond the gates we
  // sanctioned above. If a future change needs to exclude something
  // else, the author should update this validator too.
  for (const name of excluded) {
    if (!allowedExcluded.has(name)) {
      fail(`scripts/run-fast-tests.mjs: unexpected EXCLUDED_SCRIPTS entry "${name}" — add it to this validator's allowlist if intentional`);
    }
  }
}

const pkg = await loadPackageJson();
await checkPackageJson(pkg);
const runnerSrc = await checkRunner();
if (runnerSrc) await checkCoverage(pkg, runnerSrc);

if (issues.length > 0) {
  console.error(`Test-aggregator check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const message of issues) {
    console.error(` - ${message}`);
  }
  process.exit(1);
}

const total = Object.keys(pkg.scripts || {}).filter((name) => name.startsWith('test:')).length;
const excludedCount = [...extractExcludedScripts(await readFile(join(repoRoot, 'scripts/run-fast-tests.mjs'), 'utf8'))]
  .filter((name) => (pkg.scripts || {})[name]).length;
console.log(`Test-aggregator check passed: \`npm test\` runs ${total - excludedCount} fast gates (${excludedCount} explicit exclusions).`);
