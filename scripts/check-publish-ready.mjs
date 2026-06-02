#!/usr/bin/env node
// Publish-readiness runner contract check.
//
// The slow publish runner is intentionally outside `npm test`, but its wiring
// should still be guarded by a fast check so launch-QA drift is caught early.

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
if (scripts['test:publish-ready'] !== 'node scripts/run-publish-ready.mjs') {
  fail(`package.json: test:publish-ready must run scripts/run-publish-ready.mjs, got ${JSON.stringify(scripts['test:publish-ready'])}`);
}
if (scripts['test:publish-ready-contract'] !== 'node scripts/check-publish-ready.mjs') {
  fail(`package.json: test:publish-ready-contract must run scripts/check-publish-ready.mjs, got ${JSON.stringify(scripts['test:publish-ready-contract'])}`);
}

const runnerPath = 'scripts/run-publish-ready.mjs';
const runner = await readText(runnerPath);
requireText(runnerPath, runner, "import { collectEvidenceProvenance, formatEvidenceProvenance } from './evidence-provenance.mjs';", 'evidence provenance helper import');
requireText(runnerPath, runner, 'provenance: await collectEvidenceProvenance(repoRoot)', 'provenance summary field');
requireText(runnerPath, runner, '...formatEvidenceProvenance(summary.provenance)', 'provenance report lines');
for (const command of [
  'validate-catalog.ps1',
  'npm test',
  'npm run test:pwa-runtime',
  'npm run test:runtime-storage',
  'npm run test:live-canvas-evidence',
  'npm run test:games',
  'npm run capture:games:ci',
  'npm run audit:perf:local',
  'git diff --check',
]) {
  requireText(runnerPath, runner, command, `publish stack command "${command}"`);
}
requireText(runnerPath, runner, "join(repoRoot, 'test-results', 'publish-ready', runId)", 'publish-ready evidence directory');
requireText(runnerPath, runner, "const summaryPath = join(outputDir, 'summary.json')", 'summary.json output path');
requireText(runnerPath, runner, "const reportPath = join(outputDir, 'report.md')", 'report.md output path');
requireMatch(runnerPath, runner, /writeFile\(summaryPath,\s*`\$\{JSON\.stringify\(summary,\s*null,\s*2\)\}\\n`\)/, 'summary.json write');
requireMatch(runnerPath, runner, /writeFile\(reportPath,\s*buildReport\(\)\)/, 'report.md write');
requireMatch(runnerPath, runner, /if\s*\(exitCode !== 0\)\s*\{[\s\S]*summary\.failedStep\s*=\s*step\.id[\s\S]*status\s*=\s*['"]skipped['"][\s\S]*break;/, 'fail-fast behavior with skipped remaining commands');
requireMatch(runnerPath, runner, /commands:\s*PUBLISH_READY_STEPS\.map\(\(step\) => step\.displayCommand\)/, 'command order recorded in summary');
requireMatch(runnerPath, runner, /durationMs/, 'duration fields in evidence');
requireMatch(runnerPath, runner, /windowsHide:\s*true/, 'hidden Windows child processes');

const provenancePath = 'scripts/evidence-provenance.mjs';
const provenance = await readText(provenancePath);
for (const text of [
  'collectEvidenceProvenance',
  'formatEvidenceProvenance',
  'branch',
  'commit',
  'shortCommit',
  'isDirty',
  'statusShort',
  'manifestGameCount',
  'newestSlugs',
  'collectedAt',
  'error',
  'websites',
  'manifest.json',
]) {
  requireText(provenancePath, provenance, text, `provenance field ${text}`);
}
requireMatch(provenancePath, provenance, /catch\s*\(error\)/, 'best-effort non-throwing provenance collection');

const fastRunnerPath = 'scripts/run-fast-tests.mjs';
const fastRunner = await readText(fastRunnerPath);
requireText(fastRunnerPath, fastRunner, "'test:publish-ready'", 'test:publish-ready exclusion');
requireMatch(fastRunnerPath, fastRunner, /test:publish-ready[\s\S]*slow local publish-readiness/i, 'explicit slow-runner exclusion reason');

const aggregatorPath = 'scripts/check-test-aggregator.mjs';
const aggregator = await readText(aggregatorPath);
requireText(aggregatorPath, aggregator, "'test:publish-ready'", 'allowed exclusion for test:publish-ready');

const docsDriftPath = 'scripts/check-docs-drift.mjs';
const docsDrift = await readText(docsDriftPath);
requireText(docsDriftPath, docsDrift, "'test:publish-ready'", 'docs drift fast-gate exclusion for slow publish runner');

const readmePath = 'README.md';
const readme = await readText(readmePath);
requireText(readmePath, readme, 'npm run test:publish-ready-contract');
requireText(readmePath, readme, 'npm run test:publish-ready');
requireText(readmePath, readme, '43 fast validators');
requireText(readmePath, readme, 'test-results/publish-ready/<timestamp>/summary.json');
requireText(readmePath, readme, 'test-results/publish-ready/<timestamp>/report.md');
requireText(readmePath, readme, 'source revision provenance');

const architecturePath = 'ARCHITECTURE.md';
const architecture = await readText(architecturePath);
requireText(architecturePath, architecture, 'test:publish-ready-contract');
requireText(architecturePath, architecture, 'npm run test:publish-ready');
requireText(architecturePath, architecture, 'test-results/publish-ready/<timestamp>/summary.json');
requireText(architecturePath, architecture, 'source revision provenance');

const workflowPath = '.github/workflows/validate-catalog.yml';
const workflow = await readText(workflowPath);
requireText(workflowPath, workflow, 'npm run test:publish-ready-contract');
if (/run:\s*npm run test:publish-ready\s*(?:\r?\n|$)/.test(workflow)) {
  fail(`${workflowPath}: must not run slow npm run test:publish-ready inside Validate Catalog`);
}

if (issues.length) {
  console.error(`Publish-ready contract check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues) {
    console.error(` - ${issue}`);
  }
  process.exit(1);
}

console.log('Publish-ready contract check passed: slow launch-QA runner, evidence output, docs, CI guard, and fast-runner exclusion are wired.');
