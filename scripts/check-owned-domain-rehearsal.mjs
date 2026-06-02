#!/usr/bin/env node
// Fast contract check for the slow owned-domain rehearsal runner.

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const issues = [];

function fail(message) {
  issues.push(message);
}

async function readText(path) {
  return readFile(join(repoRoot, path), 'utf8');
}

function requireText(path, src, text, label = text) {
  if (!src.includes(text)) {
    fail(`${path}: missing ${label}`);
  }
}

function requireMatch(path, src, pattern, label) {
  if (!pattern.test(src)) {
    fail(`${path}: missing ${label}`);
  }
}

const packageJson = JSON.parse(await readText('package.json'));
const scripts = packageJson.scripts || {};
if (scripts['test:owned-domain-rehearsal'] !== 'node scripts/run-owned-domain-rehearsal.mjs') {
  fail(`package.json: test:owned-domain-rehearsal must run scripts/run-owned-domain-rehearsal.mjs, got ${JSON.stringify(scripts['test:owned-domain-rehearsal'])}`);
}
if (scripts['test:owned-domain-rehearsal-contract'] !== 'node scripts/check-owned-domain-rehearsal.mjs') {
  fail(`package.json: test:owned-domain-rehearsal-contract must run scripts/check-owned-domain-rehearsal.mjs, got ${JSON.stringify(scripts['test:owned-domain-rehearsal-contract'])}`);
}

const runnerPath = 'scripts/run-owned-domain-rehearsal.mjs';
const runner = await readText(runnerPath);
requireText(runnerPath, runner, "import { collectEvidenceProvenance, formatEvidenceProvenance } from './evidence-provenance.mjs';", 'evidence provenance helper import');
requireText(runnerPath, runner, 'provenance: await collectEvidenceProvenance(repoRoot)', 'provenance summary field');
requireText(runnerPath, runner, '...formatEvidenceProvenance(summary.provenance)', 'provenance report lines');
for (const text of [
  'test-results',
  'owned-domain-rehearsal',
  'build-pages-artifact.mjs',
  'WORKSHOP_ARCADE_SITE_ORIGIN',
  'WORKSHOP_ARCADE_SITE_BASE_PATH',
  'buildSitemap',
  'buildFeed',
  'buildBlock',
  'buildGameJsonLd',
  'buildOgSvg',
  'buildSiteOgSvg',
  '.well-known/security.txt',
  'WORKSHOP_ARCADE_EXPECTED_ROOT',
  'WORKSHOP_ARCADE_EXPECTED_SITE_URL',
  'WORKSHOP_ARCADE_EXPECTED_SECURITY_CANONICAL',
  'npm run test:live-pages',
  'npm run audit:perf:ci',
  'summary.json',
  'report.md',
]) {
  requireText(runnerPath, runner, text);
}
const provenancePath = 'scripts/evidence-provenance.mjs';
const provenance = await readText(provenancePath);
for (const text of [
  'branch',
  'commit',
  'shortCommit',
  'isDirty',
  'statusShort',
  'manifestGameCount',
  'newestSlugs',
  'collectedAt',
  'error',
]) {
  requireText(provenancePath, provenance, text, `provenance field ${text}`);
}
requireMatch(runnerPath, runner, /windowsHide:\s*true/, 'hidden Windows child processes');
requireMatch(runnerPath, runner, /publicBasePath\s*!==\s*['"]\/['"]/, 'root-domain base-path guard');
requireMatch(runnerPath, runner, /serverProcess\.kill\(\)/, 'server cleanup');

const livePagesPath = 'scripts/check-live-pages.mjs';
const livePages = await readText(livePagesPath);
for (const text of [
  'WORKSHOP_ARCADE_EXPECTED_ROOT',
  'WORKSHOP_ARCADE_EXPECTED_SITE_URL',
  'WORKSHOP_ARCADE_EXPECTED_SECURITY_CANONICAL',
  'expectedRoot',
  'expectedSecurityCanonicalUrl',
]) {
  requireText(livePagesPath, livePages, text);
}
requireMatch(livePagesPath, livePages, /readFile\(resolve\(expectedRoot,\s*localPath\)/, 'content hashes read from expected root');
requireMatch(livePagesPath, livePages, /acceptableRoots/, 'sitemap canonical-root override');

const artifactPath = 'scripts/build-pages-artifact.mjs';
const artifact = await readText(artifactPath);
requireText(artifactPath, artifact, 'test-results/owned-domain-rehearsal/', 'managed rehearsal output path');

const fastRunnerPath = 'scripts/run-fast-tests.mjs';
const fastRunner = await readText(fastRunnerPath);
requireText(fastRunnerPath, fastRunner, "'test:owned-domain-rehearsal'", 'test:owned-domain-rehearsal exclusion');
requireMatch(fastRunnerPath, fastRunner, /test:owned-domain-rehearsal[\s\S]*slow/i, 'explicit slow-runner exclusion reason');

const aggregatorPath = 'scripts/check-test-aggregator.mjs';
const aggregator = await readText(aggregatorPath);
requireText(aggregatorPath, aggregator, "'test:owned-domain-rehearsal'", 'allowed exclusion for test:owned-domain-rehearsal');

const docsDriftPath = 'scripts/check-docs-drift.mjs';
const docsDrift = await readText(docsDriftPath);
requireText(docsDriftPath, docsDrift, "'test:owned-domain-rehearsal'", 'docs drift fast-gate exclusion for slow owned-domain runner');
for (const text of [
  'WORKSHOP_ARCADE_EXPECTED_ROOT',
  'WORKSHOP_ARCADE_EXPECTED_SITE_URL',
  'WORKSHOP_ARCADE_EXPECTED_SECURITY_CANONICAL',
]) {
  requireText(docsDriftPath, docsDrift, text, `docs drift live-smoke contract text ${text}`);
}

const readmePath = 'README.md';
const readme = await readText(readmePath);
for (const text of [
  'npm run test:owned-domain-rehearsal-contract',
  'npm run test:owned-domain-rehearsal',
  '43 fast validators',
  'test-results/owned-domain-rehearsal/<timestamp>/summary.json',
  'test-results/owned-domain-rehearsal/<timestamp>/report.md',
  'WORKSHOP_ARCADE_EXPECTED_ROOT',
  'WORKSHOP_ARCADE_EXPECTED_SITE_URL',
  'WORKSHOP_ARCADE_EXPECTED_SECURITY_CANONICAL',
  'source revision provenance',
]) {
  requireText(readmePath, readme, text);
}

const architecturePath = 'ARCHITECTURE.md';
const architecture = await readText(architecturePath);
for (const text of [
  'test:owned-domain-rehearsal-contract',
  'npm run test:owned-domain-rehearsal',
  'test-results/owned-domain-rehearsal/<timestamp>/summary.json',
  'WORKSHOP_ARCADE_EXPECTED_ROOT',
  'WORKSHOP_ARCADE_EXPECTED_SITE_URL',
  'WORKSHOP_ARCADE_EXPECTED_SECURITY_CANONICAL',
  'source revision provenance',
]) {
  requireText(architecturePath, architecture, text);
}

const workflowPath = '.github/workflows/validate-catalog.yml';
const workflow = await readText(workflowPath);
requireText(workflowPath, workflow, 'npm run test:owned-domain-rehearsal-contract');
if (/run:\s*npm run test:owned-domain-rehearsal\s*(?:\r?\n|$)/.test(workflow)) {
  fail(`${workflowPath}: must not run slow npm run test:owned-domain-rehearsal inside Validate Catalog`);
}

if (issues.length) {
  console.error(`Owned-domain rehearsal contract check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues) {
    console.error(` - ${issue}`);
  }
  process.exit(1);
}

console.log('Owned-domain rehearsal contract check passed: slow root-domain rehearsal, live-smoke overrides, docs, CI guard, and fast-runner exclusion are wired.');
