#!/usr/bin/env node
// Fixture coverage for derive-live-smoke-slugs.mjs.
//
// Validate Catalog's gated deployment uses the helper to decide which direct
// game pages the post-deploy live smoke should open. These tests keep the
// mapping behavior local and fast so workflow-only checks are not first signal.

import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const helperPath = join(repoRoot, 'scripts', 'derive-live-smoke-slugs.mjs');
const livePagesPath = join(repoRoot, 'scripts', 'check-live-pages.mjs');
const issues = [];

function fail(message) {
  issues.push(message);
}

function runHelper(args, options = {}) {
  const result = spawnSync(process.execPath, [helperPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: '',
      GITHUB_EVENT_BEFORE: '',
      GITHUB_SHA: '',
      ...(options.env || {}),
    },
  });

  if (result.status !== 0) {
    throw new Error(`helper failed with exit ${result.status}: ${(result.stderr || result.stdout).trim()}`);
  }

  return {
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function assertEqualJson(name, actual, expected) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    fail(`${name}: expected ${expectedJson}, got ${actualJson}`);
  }
}

function deriveJson(name, args, expected) {
  try {
    const { stdout } = runHelper(['--format', 'json', ...args]);
    assertEqualJson(name, JSON.parse(stdout), expected);
  } catch (error) {
    fail(`${name}: ${error.message}`);
  }
}

async function readOptionalText(file) {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return '';
    throw error;
  }
}

async function checkLivePagesProvenanceContract() {
  const source = await readFile(livePagesPath, 'utf8');
  const requiredSnippets = [
    "import { collectEvidenceProvenance, formatEvidenceProvenance } from './evidence-provenance.mjs';",
    'provenance: await collectEvidenceProvenance(repoRoot)',
    'formatEvidenceProvenance(summary.provenance)',
  ];

  for (const snippet of requiredSnippets) {
    if (!source.includes(snippet)) {
      fail(`live pages provenance contract: missing ${JSON.stringify(snippet)}`);
    }
  }
}

deriveJson('direct game HTML maps to its slug', ['--file', 'websites/wordle.html'], ['wordle']);
deriveJson('regular cover maps to its slug', ['--file', 'covers/brick-breaker.svg'], ['brick-breaker']);
deriveJson('OG cover maps to its slug', ['--file', 'covers/og/doodle-jump.svg'], ['doodle-jump']);
deriveJson(
  'shared local script maps to every manifest game that loads it',
  ['--file', 'websites/fact-match-engine.js'],
  ['hero-fact-match', 'night-shift-fact-match', 'arena-legend-guesser', 'cosmic-fact-match'],
);
deriveJson('docs-only change emits no slugs', ['--file', 'README.md'], []);
deriveJson('workflow dispatch fallback emits no slugs', ['--event-name', 'workflow_dispatch'], []);
deriveJson(
  'multi-file input de-dupes and preserves manifest order',
  [
    '--files',
    [
      'websites/wordle.html',
      'covers/brick-breaker.svg',
      'websites\\wordle.html',
      'covers/og/doodle-jump.svg',
      'websites/fact-match-engine.js',
    ].join(','),
  ],
  ['brick-breaker', 'doodle-jump', 'wordle', 'hero-fact-match', 'night-shift-fact-match', 'arena-legend-guesser', 'cosmic-fact-match'],
);

const tempRoot = await mkdtemp(join(tmpdir(), 'workshop-live-smoke-slugs-'));
try {
  const envPath = join(tempRoot, 'github-env.txt');
  runHelper(['--file', 'websites/wordle.html', '--github-env', envPath]);
  const envText = await readOptionalText(envPath);
  if (envText !== 'WORKSHOP_ARCADE_TOUCHED_SLUGS=wordle\n') {
    fail(`github env write: expected WORKSHOP_ARCADE_TOUCHED_SLUGS=wordle, got ${JSON.stringify(envText)}`);
  }

  const noSlugEnvPath = join(tempRoot, 'github-env-no-slug.txt');
  runHelper(['--file', 'README.md', '--github-env', noSlugEnvPath]);
  const noSlugEnvText = await readOptionalText(noSlugEnvPath);
  if (noSlugEnvText !== '') {
    fail(`github env no-slug write: expected no env output, got ${JSON.stringify(noSlugEnvText)}`);
  }
} catch (error) {
  fail(`github env fixture: ${error.message}`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

await checkLivePagesProvenanceContract();

if (issues.length > 0) {
  console.error(`Live-smoke slug derivation fixtures failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const message of issues) {
    console.error(` - ${message}`);
  }
  process.exit(1);
}

console.log('Live-smoke slug derivation fixtures passed: direct pages, covers, OG covers, shared scripts, fallback, de-duping, GitHub env output, and live-smoke provenance wiring are covered.');
