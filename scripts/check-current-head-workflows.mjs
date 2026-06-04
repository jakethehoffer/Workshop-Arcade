#!/usr/bin/env node
// Verify that the required remote GitHub Actions workflows are green for HEAD.
//
// This is a local post-push release-readiness check. It intentionally depends
// on the GitHub CLI and remote Actions state, so it stays outside `npm test`.

import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectEvidenceProvenance, formatEvidenceProvenance } from './evidence-provenance.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const startedAt = new Date().toISOString();
const runId = startedAt.replace(/[:.]/g, '-');
const outputDir = join(repoRoot, 'test-results', 'current-head-workflows', runId);
const summaryPath = join(outputDir, 'summary.json');
const reportPath = join(outputDir, 'report.md');

const REQUIRED_WORKFLOWS = [
  'Validate Catalog',
  'Deploy Pages',
  'CodeQL',
  'Security Surfaces',
];

const repo = process.env.WORKSHOP_ARCADE_REPO || 'jakethehoffer/Workshop-Arcade';
const limit = Number.parseInt(process.env.WORKSHOP_ARCADE_WORKFLOW_LIMIT || '50', 10);
const workflowLimit = Number.isFinite(limit) && limit > 0 ? limit : 50;
const issues = [];

const summary = {
  status: 'running',
  passed: false,
  startedAt,
  finishedAt: null,
  durationMs: null,
  repoRoot,
  repo,
  provenance: await collectEvidenceProvenance(repoRoot),
  requiredWorkflows: REQUIRED_WORKFLOWS,
  command: null,
  rawRunCount: 0,
  runs: [],
  summaryPath,
  reportPath,
  error: null,
};

function durationLabel(ms) {
  if (!Number.isFinite(ms)) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fail(message) {
  issues.push(message);
}

function runGhList(branch) {
  const args = [
    'run',
    'list',
    '--repo',
    repo,
    '--branch',
    branch,
    '--limit',
    String(workflowLimit),
    '--json',
    'name,status,conclusion,headSha,url,createdAt,databaseId,displayTitle',
  ];
  summary.command = `gh ${args.join(' ')}`;
  const result = spawnSync('gh', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
  });

  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || result.error?.message || '').trim();
    throw new Error(detail || `gh run list exited ${result.status ?? 'with a spawn error'}`);
  }

  return JSON.parse(result.stdout || '[]');
}

function normalizeRun(workflow, run) {
  return {
    workflow,
    found: Boolean(run),
    passed: false,
    databaseId: run?.databaseId ?? null,
    displayTitle: run?.displayTitle ?? null,
    name: run?.name ?? null,
    headSha: run?.headSha ?? null,
    status: run?.status ?? null,
    conclusion: run?.conclusion ?? null,
    createdAt: run?.createdAt ?? null,
    url: run?.url ?? null,
    error: null,
  };
}

function evaluateRuns(rawRuns) {
  const commit = summary.provenance.commit;
  for (const workflow of REQUIRED_WORKFLOWS) {
    const run = rawRuns.find((candidate) => candidate?.name === workflow && candidate?.headSha === commit);
    const record = normalizeRun(workflow, run);

    if (!run) {
      record.error = `No ${workflow} run found for current HEAD ${commit}`;
      fail(record.error);
    } else if (run.status !== 'completed') {
      record.error = `${workflow} run for current HEAD is ${run.status || 'missing a status'}, not completed`;
      fail(record.error);
    } else if (run.conclusion !== 'success') {
      record.error = `${workflow} run for current HEAD concluded ${run.conclusion || 'without a conclusion'}, not success`;
      fail(record.error);
    } else {
      record.passed = true;
    }

    summary.runs.push(record);
  }
}

function buildReport() {
  const lines = [
    '# Current HEAD Workflow Status Report',
    '',
    `Status: ${summary.status.toUpperCase()}`,
    ...formatEvidenceProvenance(summary.provenance),
    `Repository: ${summary.repo}`,
    `Required workflows: ${summary.requiredWorkflows.join(', ')}`,
    `Command: ${summary.command ? `\`${summary.command}\`` : 'not run'}`,
    `Started: ${summary.startedAt}`,
    `Finished: ${summary.finishedAt || ''}`,
    `Duration: ${durationLabel(summary.durationMs)}`,
    `Error: ${summary.error || 'none'}`,
    '',
    '## Required Workflow Runs',
    '',
    '| Workflow | Passed | Status | Conclusion | Run | Head SHA |',
    '|----------|--------|--------|------------|-----|----------|',
  ];

  for (const run of summary.runs) {
    const runLabel = run.url ? `[${run.databaseId || run.workflow}](${run.url})` : 'not found';
    lines.push(`| ${run.workflow} | ${run.passed ? 'yes' : 'no'} | ${run.status || ''} | ${run.conclusion || ''} | ${runLabel} | ${run.headSha || ''} |`);
  }

  if (issues.length) {
    lines.push('');
    lines.push('## Issues');
    lines.push('');
    for (const issue of issues) {
      lines.push(`- ${issue}`);
    }
  }

  lines.push('');
  lines.push(summary.passed
    ? 'All required workflows completed successfully for the current clean HEAD.'
    : 'One or more required workflows are missing, incomplete, failing, or the local worktree is not clean.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function writeEvidence() {
  await mkdir(outputDir, { recursive: true });
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  await writeFile(reportPath, buildReport());
}

const startMs = Date.now();

try {
  const { provenance } = summary;
  if (provenance.error) {
    fail(`Provenance error is present: ${provenance.error}`);
  }
  if (!provenance.branch) {
    fail('Current git branch is empty; current-HEAD workflow status requires a named branch');
  }
  if (!provenance.commit) {
    fail('Current commit could not be resolved');
  }
  if (provenance.isDirty !== false) {
    fail(`Current worktree must be clean before checking remote workflow status; git status --short: ${JSON.stringify(provenance.statusShort)}`);
  }
  if (provenance.statusShort) {
    fail(`Current worktree statusShort must be empty, got ${JSON.stringify(provenance.statusShort)}`);
  }

  if (provenance.branch && provenance.commit && provenance.isDirty === false) {
    const rawRuns = runGhList(provenance.branch);
    if (!Array.isArray(rawRuns)) {
      throw new Error('gh run list did not return a JSON array');
    }
    summary.rawRunCount = rawRuns.length;
    evaluateRuns(rawRuns);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

summary.finishedAt = new Date().toISOString();
summary.durationMs = Date.now() - startMs;
summary.passed = issues.length === 0;
summary.status = summary.passed ? 'passed' : 'failed';
summary.error = issues.length ? issues.join('; ') : null;
await writeEvidence();

console.log(`Current HEAD workflow status report: ${reportPath}`);
if (summary.passed) {
  console.log(`Current HEAD workflow status passed for ${summary.provenance.branch} ${summary.provenance.shortCommit}; workflows: ${REQUIRED_WORKFLOWS.join(', ')}.`);
} else {
  console.error(`Current HEAD workflow status failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues) {
    console.error(` - ${issue}`);
  }
}

process.exit(summary.passed ? 0 : 1);
