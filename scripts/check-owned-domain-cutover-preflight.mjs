#!/usr/bin/env node
// Fast contract check for the slow owned-domain cutover preflight.

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
if (scripts['test:owned-domain-cutover-preflight'] !== 'node scripts/run-owned-domain-cutover-preflight.mjs') {
  fail(`package.json: test:owned-domain-cutover-preflight must run scripts/run-owned-domain-cutover-preflight.mjs, got ${JSON.stringify(scripts['test:owned-domain-cutover-preflight'])}`);
}
if (scripts['test:owned-domain-cutover-preflight-contract'] !== 'node scripts/check-owned-domain-cutover-preflight.mjs') {
  fail(`package.json: test:owned-domain-cutover-preflight-contract must run scripts/check-owned-domain-cutover-preflight.mjs, got ${JSON.stringify(scripts['test:owned-domain-cutover-preflight-contract'])}`);
}

const runnerPath = 'scripts/run-owned-domain-cutover-preflight.mjs';
const runner = await readText(runnerPath);
requireText(runnerPath, runner, "import { collectEvidenceProvenance, formatEvidenceProvenance } from './evidence-provenance.mjs';", 'evidence provenance helper import');
requireText(runnerPath, runner, 'provenance: await collectEvidenceProvenance(repoRoot)', 'provenance summary field');
requireText(runnerPath, runner, '...formatEvidenceProvenance(summary.provenance)', 'provenance report lines');
for (const text of [
  'WORKSHOP_ARCADE_CUSTOM_DOMAIN',
  'arcade.example.test',
  'WORKSHOP_ARCADE_CHECK_DNS',
  'WORKSHOP_ARCADE_REQUIRE_PAGES_CNAME',
  'test-results',
  'owned-domain-cutover-preflight',
  'npm run test:owned-domain-rehearsal',
  'WORKSHOP_ARCADE_SITE_ORIGIN',
  'WORKSHOP_ARCADE_SITE_BASE_PATH',
  'gh api repos/${REPO_SLUG}/pages',
  'jakethehoffer.github.io',
  '185.199.108.153',
  '2606:50c0:8000::153',
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
requireMatch(runnerPath, runner, /validateHostname/, 'hostname validation helper');
requireMatch(runnerPath, runner, /placeholderMode/, 'placeholder mode');
requireMatch(runnerPath, runner, /windowsHide:\s*true/, 'hidden Windows child processes');
requireMatch(runnerPath, runner, /dns\.resolve4/, 'A-record DNS check');
requireMatch(runnerPath, runner, /dns\.resolveCname/, 'CNAME DNS check');
requireMatch(runnerPath, runner, /writeFile\(summaryPath,\s*`\$\{JSON\.stringify\(summary,\s*null,\s*2\)\}\\n`/, 'summary.json write');
requireMatch(runnerPath, runner, /writeFile\(reportPath,\s*buildReport\(\)/, 'report.md write');

const fastRunnerPath = 'scripts/run-fast-tests.mjs';
const fastRunner = await readText(fastRunnerPath);
requireText(fastRunnerPath, fastRunner, "'test:owned-domain-cutover-preflight'", 'test:owned-domain-cutover-preflight exclusion');
requireMatch(fastRunnerPath, fastRunner, /test:owned-domain-cutover-preflight[\s\S]*slow/i, 'explicit slow-runner exclusion reason');

const aggregatorPath = 'scripts/check-test-aggregator.mjs';
const aggregator = await readText(aggregatorPath);
requireText(aggregatorPath, aggregator, "'test:owned-domain-cutover-preflight'", 'allowed exclusion for test:owned-domain-cutover-preflight');

const docsDriftPath = 'scripts/check-docs-drift.mjs';
const docsDrift = await readText(docsDriftPath);
requireText(docsDriftPath, docsDrift, "'test:owned-domain-cutover-preflight'", 'docs drift fast-gate exclusion for slow cutover preflight');

const readmePath = 'README.md';
const readme = await readText(readmePath);
for (const text of [
  'npm run test:owned-domain-cutover-preflight-contract',
  'npm run test:owned-domain-cutover-preflight',
  '44 fast validators',
  'WORKSHOP_ARCADE_CUSTOM_DOMAIN',
  'WORKSHOP_ARCADE_CHECK_DNS',
  'WORKSHOP_ARCADE_REQUIRE_PAGES_CNAME',
  'test-results/owned-domain-cutover-preflight/<timestamp>/summary.json',
  'test-results/owned-domain-cutover-preflight/<timestamp>/report.md',
  'source revision provenance',
  'CNAME',
]) {
  requireText(readmePath, readme, text);
}

const architecturePath = 'ARCHITECTURE.md';
const architecture = await readText(architecturePath);
for (const text of [
  'test:owned-domain-cutover-preflight-contract',
  'npm run test:owned-domain-cutover-preflight',
  'WORKSHOP_ARCADE_CUSTOM_DOMAIN',
  'WORKSHOP_ARCADE_CHECK_DNS',
  'WORKSHOP_ARCADE_REQUIRE_PAGES_CNAME',
  'test-results/owned-domain-cutover-preflight/<timestamp>/summary.json',
  'source revision provenance',
  'CNAME',
]) {
  requireText(architecturePath, architecture, text);
}

const workflowPath = '.github/workflows/validate-catalog.yml';
const workflow = await readText(workflowPath);
requireText(workflowPath, workflow, 'npm run test:owned-domain-cutover-preflight-contract');
if (/run:\s*npm run test:owned-domain-cutover-preflight\s*(?:\r?\n|$)/.test(workflow)) {
  fail(`${workflowPath}: must not run slow npm run test:owned-domain-cutover-preflight inside Validate Catalog`);
}

if (issues.length) {
  console.error(`Owned-domain cutover preflight contract check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues) {
    console.error(` - ${issue}`);
  }
  process.exit(1);
}

console.log('Owned-domain cutover preflight contract check passed: slow domain-neutral cutover preflight, strict flags, docs, CI guard, and fast-runner exclusion are wired.');
