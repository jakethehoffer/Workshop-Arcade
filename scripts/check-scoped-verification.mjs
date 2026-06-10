#!/usr/bin/env node
// Scoped-verification contract probe.
//
// `smoke-games.mjs` and `capture-games.mjs` accept `--slug <a,b>` so a change
// to one game can be verified in a couple of minutes instead of re-running
// the full 100-game battery. This probe proves the contract around that
// fast path:
//   1. The CI rendered-quality gate cannot be scoped: `--ci --slug` is
//      refused quickly with a clear error.
//   2. Unknown slugs are refused quickly instead of silently running the
//      full catalog.
//   3. A scoped smoke run covers only the requested game and writes a
//      summary that says so (`scope.slugs`), so a scoped run can never
//      masquerade as full-catalog evidence.
//   4. A scoped capture run covers exactly the requested surfaces and marks
//      its summary the same way.

import { spawn, spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GAME_SLUG = 'echo-mimic';
const REJECT_TIMEOUT_MS = 30000;
const SCOPED_RUN_TIMEOUT_MS = 300000;

const issues = [];

function fail(message) {
  issues.push(message);
}

function killTree(child) {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
  } else {
    try { child.kill('SIGKILL'); } catch {}
  }
}

function runNode(args, timeoutMs) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolveRun({ code, output, timedOut });
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolveRun({ code: null, output: `${output}\nspawn error: ${error.message}`, timedOut });
    });
  });
}

async function listRunDirs(root) {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return new Set(entries.filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}T/.test(e.name)).map((e) => e.name));
  } catch {
    return new Set();
  }
}

async function newRunSummary(root, before, label) {
  const after = await listRunDirs(root);
  const created = [...after].filter((name) => !before.has(name)).sort();
  const newest = created.at(-1);
  if (!newest) {
    fail(`${label}: no new run directory appeared under ${root}`);
    return null;
  }
  try {
    return JSON.parse(await readFile(join(root, newest, 'summary.json'), 'utf8'));
  } catch (error) {
    fail(`${label}: unable to read summary.json in ${newest} (${error.message})`);
    return null;
  }
}

function describe(result) {
  if (result.timedOut) return 'timed out (was not refused quickly)';
  return `exit ${result.code}`;
}

// 1. The CI gate must refuse scoping.
const ciReject = await runNode(['scripts/capture-games.mjs', '--ci', '--slug', GAME_SLUG], REJECT_TIMEOUT_MS);
if (ciReject.timedOut || ciReject.code === 0) {
  fail(`capture-games --ci --slug must be refused with a nonzero exit (${describe(ciReject)})`);
} else if (!/full catalog/i.test(ciReject.output)) {
  fail(`capture-games --ci --slug refusal must explain the CI gate covers the full catalog (got: ${ciReject.output.trim().slice(0, 200)})`);
}

// 2. Unknown slugs must be refused, not ignored.
const unknownSmoke = await runNode(['scripts/smoke-games.mjs', '--slug', 'definitely-not-a-real-game'], REJECT_TIMEOUT_MS);
if (unknownSmoke.timedOut || unknownSmoke.code === 0) {
  fail(`smoke-games --slug with an unknown slug must be refused with a nonzero exit (${describe(unknownSmoke)})`);
} else if (!/unknown slug/i.test(unknownSmoke.output)) {
  fail(`smoke-games unknown-slug refusal must name the problem (got: ${unknownSmoke.output.trim().slice(0, 200)})`);
}

const unknownCapture = await runNode(['scripts/capture-games.mjs', '--slug', 'definitely-not-a-real-game'], REJECT_TIMEOUT_MS);
if (unknownCapture.timedOut || unknownCapture.code === 0) {
  fail(`capture-games --slug with an unknown slug must be refused with a nonzero exit (${describe(unknownCapture)})`);
}

if (issues.length === 0) {
  // 3. Scoped smoke run: only the requested game, summary marked as scoped.
  const manifest = JSON.parse(await readFile(join(repoRoot, 'websites', 'manifest.json'), 'utf8'));
  const smokeRoot = join(repoRoot, 'test-results', 'smoke-games');
  const smokeBefore = await listRunDirs(smokeRoot);
  const scopedSmoke = await runNode(['scripts/smoke-games.mjs', '--slug', GAME_SLUG], SCOPED_RUN_TIMEOUT_MS);
  if (scopedSmoke.timedOut || scopedSmoke.code !== 0) {
    fail(`scoped smoke run failed (${describe(scopedSmoke)}): ${scopedSmoke.output.trim().slice(-400)}`);
  } else {
    const summary = await newRunSummary(smokeRoot, smokeBefore, 'scoped smoke');
    if (summary) {
      if (summary.passed !== true) fail(`scoped smoke summary must be passed (got ${JSON.stringify(summary.passed)})`);
      if (summary.scope?.type !== 'slugs' || JSON.stringify(summary.scope?.slugs) !== JSON.stringify([GAME_SLUG])) {
        fail(`scoped smoke summary must record scope {type:"slugs", slugs:["${GAME_SLUG}"]} (got ${JSON.stringify(summary.scope)})`);
      }
      if (summary.targetCount !== 1) fail(`scoped smoke summary must record targetCount 1 (got ${JSON.stringify(summary.targetCount)})`);
      if (summary.manifestCount !== manifest.length) {
        fail(`scoped smoke summary must keep manifestCount ${manifest.length} (got ${JSON.stringify(summary.manifestCount)})`);
      }
    }
  }

  // 4. Scoped capture run: exactly the requested surfaces, summary marked.
  const captureRoot = join(repoRoot, 'test-results', 'render-ranking');
  const captureBefore = await listRunDirs(captureRoot);
  const scopedCapture = await runNode(['scripts/capture-games.mjs', '--slug', GAME_SLUG], SCOPED_RUN_TIMEOUT_MS);
  if (scopedCapture.timedOut || scopedCapture.code !== 0) {
    fail(`scoped capture run failed (${describe(scopedCapture)}): ${scopedCapture.output.trim().slice(-400)}`);
  } else {
    const summary = await newRunSummary(captureRoot, captureBefore, 'scoped capture');
    if (summary) {
      if (summary.passed !== true) fail(`scoped capture summary must be passed (got ${JSON.stringify(summary.passed)})`);
      if (summary.scope?.type !== 'slugs' || JSON.stringify(summary.scope?.slugs) !== JSON.stringify([GAME_SLUG])) {
        fail(`scoped capture summary must record scope {type:"slugs", slugs:["${GAME_SLUG}"]} (got ${JSON.stringify(summary.scope)})`);
      }
      if (summary.expectedSurfaceCount !== 2) {
        fail(`scoped capture summary must expect 2 surfaces (got ${JSON.stringify(summary.expectedSurfaceCount)})`);
      }
      if (summary.capturedSurfaceCount !== 2) {
        fail(`scoped capture summary must capture 2 surfaces (got ${JSON.stringify(summary.capturedSurfaceCount)})`);
      }
    }
  }
} else {
  fail('skipped scoped smoke/capture runs because the fast refusal contract already failed');
}

if (issues.length) {
  console.error(`Scoped verification check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues) console.error(` - ${issue}`);
  process.exit(1);
}

console.log(`Scoped verification check passed: --ci refuses scoping, unknown slugs are refused, and scoped smoke/capture runs cover exactly ${GAME_SLUG} with scope-marked summaries.`);
