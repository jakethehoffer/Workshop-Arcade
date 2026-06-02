#!/usr/bin/env node
// Run the full local publish-readiness stack and leave compact evidence.
//
// `npm test` stays fast by excluding browser/perf/deploy-facing checks.
// This runner is the intentional slow path for a release handoff: it runs
// the current local equivalents of Validate Catalog's slow jobs in order,
// stops on the first failure, and writes a JSON + Markdown report before
// exiting.

import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectEvidenceProvenance, formatEvidenceProvenance } from './evidence-provenance.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const startedAt = new Date().toISOString();
const runId = startedAt.replace(/[:.]/g, '-');
const outputDir = join(repoRoot, 'test-results', 'publish-ready', runId);
const summaryPath = join(outputDir, 'summary.json');
const reportPath = join(outputDir, 'report.md');
const powershellCmd = process.platform === 'win32'
  ? 'powershell.exe'
  : (process.env.WORKSHOP_ARCADE_POWERSHELL || 'pwsh');

const PUBLISH_READY_STEPS = [
  {
    id: 'catalog-validator',
    label: 'Catalog validator',
    shellCommand: `${powershellCmd} -NoProfile -ExecutionPolicy Bypass -File ./scripts/validate-catalog.ps1`,
    displayCommand: 'powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/validate-catalog.ps1',
  },
  {
    id: 'fast-gates',
    label: 'Fast gates',
    shellCommand: 'npm test',
    displayCommand: 'npm test',
  },
  {
    id: 'pwa-runtime',
    label: 'PWA runtime probe',
    shellCommand: 'npm run test:pwa-runtime',
    displayCommand: 'npm run test:pwa-runtime',
  },
  {
    id: 'runtime-storage',
    label: 'Sandboxed storage runtime probe',
    shellCommand: 'npm run test:runtime-storage',
    displayCommand: 'npm run test:runtime-storage',
  },
  {
    id: 'live-canvas-evidence',
    label: 'Live-smoke canvas evidence fixture',
    shellCommand: 'npm run test:live-canvas-evidence',
    displayCommand: 'npm run test:live-canvas-evidence',
  },
  {
    id: 'game-smoke',
    label: 'Game smoke tests',
    shellCommand: 'npm run test:games',
    displayCommand: 'npm run test:games',
  },
  {
    id: 'render-capture',
    label: 'Strict render capture',
    shellCommand: 'npm run capture:games:ci',
    displayCommand: 'npm run capture:games:ci',
  },
  {
    id: 'local-performance-audit',
    label: 'Strict local performance audit',
    shellCommand: 'npm run audit:perf:local',
    displayCommand: 'npm run audit:perf:local',
  },
  {
    id: 'diff-check',
    label: 'Whitespace diff check',
    shellCommand: 'git diff --check',
    displayCommand: 'git diff --check',
  },
];

const summary = {
  status: 'running',
  startedAt,
  finishedAt: null,
  durationMs: null,
  repoRoot,
  provenance: await collectEvidenceProvenance(repoRoot),
  summaryPath,
  reportPath,
  failedStep: null,
  commands: PUBLISH_READY_STEPS.map((step) => step.displayCommand),
  steps: PUBLISH_READY_STEPS.map((step, index) => ({
    id: step.id,
    label: step.label,
    order: index + 1,
    command: step.displayCommand,
    status: 'pending',
    exitCode: null,
    signal: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    durationMs: null,
  })),
};

function durationLabel(ms) {
  if (!Number.isFinite(ms)) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function runStep(step, record) {
  console.log(`\n=== ${record.order}. ${step.label} ===`);
  console.log(step.displayCommand);
  record.status = 'running';
  record.startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const result = spawnSync(step.shellCommand, {
    cwd: repoRoot,
    stdio: 'inherit',
    windowsHide: true,
    shell: true,
  });
  record.finishedAt = new Date().toISOString();
  record.durationMs = Date.now() - startedMs;
  record.exitCode = result.status ?? (result.error ? 1 : 0);
  record.signal = result.signal || null;
  record.error = result.error?.message || null;
  record.status = record.exitCode === 0 ? 'passed' : 'failed';
  console.log(`${step.label}: ${record.status.toUpperCase()} ${durationLabel(record.durationMs)}`);
  if (record.error) console.error(record.error);
  return record.exitCode;
}

function buildReport() {
  const lines = [
    '# Publish Readiness Report',
    '',
    `Status: ${summary.status.toUpperCase()}`,
    ...formatEvidenceProvenance(summary.provenance),
    `Started: ${summary.startedAt}`,
    `Finished: ${summary.finishedAt || ''}`,
    `Duration: ${durationLabel(summary.durationMs)}`,
    `Failed step: ${summary.failedStep || 'none'}`,
    '',
    '| # | Step | Status | Exit | Duration | Command |',
    '|---:|------|--------|------|----------|---------|',
  ];

  for (const step of summary.steps) {
    lines.push(`| ${step.order} | ${step.label} | ${step.status} | ${step.exitCode ?? ''} | ${durationLabel(step.durationMs)} | \`${step.command.replaceAll('`', '\\`')}\` |`);
  }

  lines.push('');
  lines.push(summary.status === 'passed'
    ? 'All publish-readiness checks passed.'
    : 'Publish-readiness checks stopped at the first failing command.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function writeEvidence() {
  await mkdir(outputDir, { recursive: true });
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  await writeFile(reportPath, buildReport());
}

const startMs = Date.now();
let exitCode = 0;

for (let index = 0; index < PUBLISH_READY_STEPS.length; index += 1) {
  const step = PUBLISH_READY_STEPS[index];
  const record = summary.steps[index];
  exitCode = runStep(step, record);
  if (exitCode !== 0) {
    summary.failedStep = step.id;
    for (let skipIndex = index + 1; skipIndex < summary.steps.length; skipIndex += 1) {
      summary.steps[skipIndex].status = 'skipped';
    }
    break;
  }
}

summary.finishedAt = new Date().toISOString();
summary.durationMs = Date.now() - startMs;
summary.status = exitCode === 0 ? 'passed' : 'failed';
await writeEvidence();

console.log(`\nPublish readiness report: ${reportPath}`);
process.exit(exitCode);
