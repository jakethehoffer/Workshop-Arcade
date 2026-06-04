#!/usr/bin/env node
// Refresh local launch evidence for the current clean HEAD, then verify it.
//
// This is intentionally excluded from `npm test`: it runs the slow
// publish-ready stack, deployed Pages smoke, and the local freshness checker.

import { spawnSync } from 'node:child_process';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectEvidenceProvenance, formatEvidenceProvenance } from './evidence-provenance.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const startedAt = new Date().toISOString();
const runId = startedAt.replace(/[:.]/g, '-');
const outputDir = join(repoRoot, 'test-results', 'launch-evidence-refresh', runId);
const summaryPath = join(outputDir, 'summary.json');
const reportPath = join(outputDir, 'report.md');

const REFRESH_STEPS = [
  {
    id: 'publish-ready',
    label: 'Publish-ready evidence',
    command: 'npm run test:publish-ready',
  },
  {
    id: 'live-pages',
    label: 'Live Pages evidence',
    command: 'npm run test:live-pages',
  },
  {
    id: 'launch-evidence-current',
    label: 'Launch evidence freshness check',
    command: 'npm run test:launch-evidence-current',
  },
];

const evidenceTargets = [
  {
    id: 'publish-ready',
    label: 'Publish-ready',
    root: join(repoRoot, 'test-results', 'publish-ready'),
  },
  {
    id: 'live-pages-smoke',
    label: 'Live Pages smoke',
    root: join(repoRoot, 'test-results', 'live-pages-smoke'),
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
  error: null,
  preflight: {
    command: 'git status --short',
    status: 'pending',
    statusShort: null,
    error: null,
  },
  commands: REFRESH_STEPS.map((step) => step.command),
  steps: REFRESH_STEPS.map((step, index) => ({
    id: step.id,
    label: step.label,
    order: index + 1,
    command: step.command,
    status: 'pending',
    exitCode: null,
    signal: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    durationMs: null,
  })),
  evidence: Object.fromEntries(evidenceTargets.map((target) => [
    target.id,
    {
      label: target.label,
      root: target.root,
      latestDir: null,
      summaryPath: null,
      reportPath: null,
      exists: false,
      error: null,
    },
  ])),
};

function durationLabel(ms) {
  if (!Number.isFinite(ms)) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function runGit(args) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(detail || `git ${args.join(' ')} exited ${result.status}`);
  }
  return (result.stdout || '').trim();
}

function runStep(step, record) {
  console.log(`\n=== ${record.order}. ${step.label} ===`);
  console.log(step.command);
  record.status = 'running';
  record.startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const result = spawnSync(step.command, {
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

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function latestTimestampedDirectory(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const latest = entries
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}T/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .at(-1);
  return latest ? join(root, latest) : null;
}

async function collectEvidenceDirectories() {
  for (const target of evidenceTargets) {
    const entry = summary.evidence[target.id];
    try {
      const latestDir = await latestTimestampedDirectory(target.root);
      if (!latestDir) {
        entry.error = `No timestamped evidence directories found under ${target.root}`;
        continue;
      }
      const childSummaryPath = join(latestDir, 'summary.json');
      const childReportPath = join(latestDir, 'report.md');
      entry.latestDir = latestDir;
      entry.summaryPath = childSummaryPath;
      entry.reportPath = childReportPath;
      entry.exists = (await pathExists(childSummaryPath)) && (await pathExists(childReportPath));
      if (!entry.exists) {
        entry.error = 'Newest evidence directory is missing summary.json or report.md';
      }
    } catch (error) {
      entry.error = error instanceof Error ? error.message : String(error);
    }
  }
}

function buildReport() {
  const lines = [
    '# Launch Evidence Refresh Report',
    '',
    `Status: ${summary.status.toUpperCase()}`,
    ...formatEvidenceProvenance(summary.provenance),
    `Started: ${summary.startedAt}`,
    `Finished: ${summary.finishedAt || ''}`,
    `Duration: ${durationLabel(summary.durationMs)}`,
    `Failed step: ${summary.failedStep || 'none'}`,
    `Error: ${summary.error || 'none'}`,
    '',
    '## Preflight',
    '',
    `- Command: \`${summary.preflight.command}\``,
    `- Status: ${summary.preflight.status}`,
    `- Status short: ${summary.preflight.statusShort ? JSON.stringify(summary.preflight.statusShort) : 'clean'}`,
    `- Error: ${summary.preflight.error || 'none'}`,
    '',
    '## Commands',
    '',
    '| # | Step | Status | Exit | Duration | Command |',
    '|---:|------|--------|------|----------|---------|',
  ];

  for (const step of summary.steps) {
    lines.push(`| ${step.order} | ${step.label} | ${step.status} | ${step.exitCode ?? ''} | ${durationLabel(step.durationMs)} | \`${step.command.replaceAll('`', '\\`')}\` |`);
  }

  lines.push('');
  lines.push('## Refreshed Evidence');
  lines.push('');
  for (const entry of Object.values(summary.evidence)) {
    lines.push(`- ${entry.label}: ${entry.latestDir || 'not found'}`);
    if (entry.summaryPath) lines.push(`  - summary.json: ${entry.summaryPath}`);
    if (entry.reportPath) lines.push(`  - report.md: ${entry.reportPath}`);
    if (entry.error) lines.push(`  - error: ${entry.error}`);
  }

  lines.push('');
  lines.push(summary.status === 'passed'
    ? 'Launch evidence was refreshed and verified for the current clean HEAD.'
    : 'Launch evidence refresh stopped before a verified clean-HEAD result.');
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

try {
  const statusShort = runGit(['status', '--short']);
  summary.preflight.statusShort = statusShort;
  if (statusShort) {
    summary.preflight.status = 'failed';
    summary.failedStep = 'clean-worktree-preflight';
    summary.error = `Current worktree must be clean before refreshing launch evidence; git status --short: ${JSON.stringify(statusShort)}`;
    for (const step of summary.steps) {
      step.status = 'skipped';
    }
    exitCode = 1;
  } else {
    summary.preflight.status = 'passed';
  }
} catch (error) {
  summary.preflight.status = 'failed';
  summary.preflight.error = error instanceof Error ? error.message : String(error);
  summary.failedStep = 'clean-worktree-preflight';
  summary.error = summary.preflight.error;
  for (const step of summary.steps) {
    step.status = 'skipped';
  }
  exitCode = 1;
}

if (exitCode === 0) {
  for (let index = 0; index < REFRESH_STEPS.length; index += 1) {
    const step = REFRESH_STEPS[index];
    const record = summary.steps[index];
    exitCode = runStep(step, record);
    if (exitCode !== 0) {
      summary.failedStep = step.id;
      summary.error = record.error || `${step.command} exited ${exitCode}`;
      for (let skipIndex = index + 1; skipIndex < summary.steps.length; skipIndex += 1) {
        summary.steps[skipIndex].status = 'skipped';
      }
      break;
    }
  }
}

await collectEvidenceDirectories();
summary.finishedAt = new Date().toISOString();
summary.durationMs = Date.now() - startMs;
summary.status = exitCode === 0 ? 'passed' : 'failed';
await writeEvidence();

console.log(`\nLaunch evidence refresh report: ${reportPath}`);
process.exit(exitCode);
