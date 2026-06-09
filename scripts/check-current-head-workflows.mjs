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
  'CodeQL',
  'Security Surfaces',
];

const REQUIRED_VALIDATE_JOBS = [
  'Catalog, docs, and accessibility',
  'Game smoke tests',
  'Performance audit',
  'Render capture',
  'Build static artifact',
  'Deploy',
  'Live Pages smoke',
];

const VALIDATION_JOB_NAMES = REQUIRED_VALIDATE_JOBS.slice(0, 4);
const FORBIDDEN_WORKFLOWS = ['Deploy Pages'];

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
  forbiddenWorkflows: FORBIDDEN_WORKFLOWS,
  requiredValidateJobs: REQUIRED_VALIDATE_JOBS,
  command: null,
  validateJobsCommand: null,
  rawRunCount: 0,
  runs: [],
  validateJobs: [],
  deploymentGate: {
    passed: false,
    validationCompletedAt: null,
    buildStartedAt: null,
    buildCompletedAt: null,
    deployStartedAt: null,
    deployCompletedAt: null,
    liveSmokeStartedAt: null,
    liveSmokeCompletedAt: null,
  },
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

function runGhViewJobs(runDatabaseId) {
  const args = [
    'run',
    'view',
    String(runDatabaseId),
    '--repo',
    repo,
    '--json',
    'jobs',
  ];
  summary.validateJobsCommand = `gh ${args.join(' ')}`;
  const result = spawnSync('gh', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
  });

  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || result.error?.message || '').trim();
    throw new Error(detail || `gh run view exited ${result.status ?? 'with a spawn error'}`);
  }

  const payload = JSON.parse(result.stdout || '{}');
  if (!Array.isArray(payload.jobs)) {
    throw new Error('gh run view did not return a jobs array');
  }
  return payload.jobs;
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

function normalizeJob(name, job) {
  return {
    name,
    found: Boolean(job),
    passed: false,
    databaseId: job?.databaseId ?? null,
    status: job?.status ?? null,
    conclusion: job?.conclusion ?? null,
    startedAt: job?.startedAt ?? null,
    completedAt: job?.completedAt ?? null,
    url: job?.url ?? null,
    error: null,
  };
}

function parseTimestamp(label, value) {
  const timestamp = Date.parse(value || '');
  if (!Number.isFinite(timestamp)) {
    fail(`${label} is missing a valid timestamp, got ${JSON.stringify(value)}`);
    return null;
  }
  return timestamp;
}

function evaluateValidateJobs(jobs) {
  for (const name of REQUIRED_VALIDATE_JOBS) {
    const job = jobs.find((candidate) => candidate?.name === name);
    const record = normalizeJob(name, job);
    if (!job) {
      record.error = `Validate Catalog is missing required job "${name}"`;
      fail(record.error);
    } else if (job.status !== 'completed') {
      record.error = `Validate Catalog job "${name}" is ${job.status || 'missing a status'}, not completed`;
      fail(record.error);
    } else if (job.conclusion !== 'success') {
      record.error = `Validate Catalog job "${name}" concluded ${job.conclusion || 'without a conclusion'}, not success`;
      fail(record.error);
    } else {
      record.passed = true;
    }
    summary.validateJobs.push(record);
  }

  if (summary.validateJobs.some((job) => !job.passed)) {
    return;
  }

  const issueCountBeforeOrderingChecks = issues.length;
  const byName = new Map(summary.validateJobs.map((job) => [job.name, job]));
  const validationCompletionTimes = VALIDATION_JOB_NAMES.map((name) => ({
    name,
    value: parseTimestamp(`${name} completedAt`, byName.get(name)?.completedAt),
  }));
  const build = byName.get('Build static artifact');
  const deploy = byName.get('Deploy');
  const liveSmoke = byName.get('Live Pages smoke');
  const buildStarted = parseTimestamp('Build static artifact startedAt', build?.startedAt);
  const buildCompleted = parseTimestamp('Build static artifact completedAt', build?.completedAt);
  const deployStarted = parseTimestamp('Deploy startedAt', deploy?.startedAt);
  const deployCompleted = parseTimestamp('Deploy completedAt', deploy?.completedAt);
  const liveSmokeStarted = parseTimestamp('Live Pages smoke startedAt', liveSmoke?.startedAt);
  const liveSmokeCompleted = parseTimestamp('Live Pages smoke completedAt', liveSmoke?.completedAt);

  if (validationCompletionTimes.some((entry) => entry.value === null)
      || [buildStarted, buildCompleted, deployStarted, deployCompleted, liveSmokeStarted, liveSmokeCompleted].some((value) => value === null)) {
    return;
  }

  const validationCompleted = Math.max(...validationCompletionTimes.map((entry) => entry.value));
  summary.deploymentGate.validationCompletedAt = new Date(validationCompleted).toISOString();
  summary.deploymentGate.buildStartedAt = build.startedAt;
  summary.deploymentGate.buildCompletedAt = build.completedAt;
  summary.deploymentGate.deployStartedAt = deploy.startedAt;
  summary.deploymentGate.deployCompletedAt = deploy.completedAt;
  summary.deploymentGate.liveSmokeStartedAt = liveSmoke.startedAt;
  summary.deploymentGate.liveSmokeCompletedAt = liveSmoke.completedAt;

  if (buildStarted < validationCompleted) {
    fail(`Build static artifact started at ${build.startedAt} before all validation jobs completed at ${summary.deploymentGate.validationCompletedAt}`);
  }
  if (deployStarted < buildCompleted) {
    fail(`Deploy started at ${deploy.startedAt} before Build static artifact completed at ${build.completedAt}`);
  }
  if (liveSmokeStarted < deployCompleted) {
    fail(`Live Pages smoke started at ${liveSmoke.startedAt} before Deploy completed at ${deploy.completedAt}`);
  }

  summary.deploymentGate.passed = issues.length === issueCountBeforeOrderingChecks;
}

function evaluateRuns(rawRuns) {
  const commit = summary.provenance.commit;
  let validateRun = null;
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
    if (workflow === 'Validate Catalog') {
      validateRun = run;
    }
  }

  for (const workflow of FORBIDDEN_WORKFLOWS) {
    const run = rawRuns.find((candidate) => candidate?.name === workflow && candidate?.headSha === commit);
    if (run) {
      fail(`Unexpected standalone ${workflow} run found for current HEAD ${commit}; Pages must deploy inside Validate Catalog`);
    }
  }

  return validateRun;
}

function buildReport() {
  const lines = [
    '# Current HEAD Workflow Status Report',
    '',
    `Status: ${summary.status.toUpperCase()}`,
    ...formatEvidenceProvenance(summary.provenance),
    `Repository: ${summary.repo}`,
    `Required workflows: ${summary.requiredWorkflows.join(', ')}`,
    `Forbidden standalone workflows: ${summary.forbiddenWorkflows.join(', ')}`,
    `Required Validate Catalog jobs: ${summary.requiredValidateJobs.join(', ')}`,
    `Command: ${summary.command ? `\`${summary.command}\`` : 'not run'}`,
    `Validate jobs command: ${summary.validateJobsCommand ? `\`${summary.validateJobsCommand}\`` : 'not run'}`,
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

  lines.push('');
  lines.push('## Validate Catalog Jobs');
  lines.push('');
  lines.push('| Job | Passed | Status | Conclusion | Started | Completed |');
  lines.push('|-----|--------|--------|------------|---------|-----------|');
  for (const job of summary.validateJobs) {
    const jobLabel = job.url ? `[${job.name}](${job.url})` : job.name;
    lines.push(`| ${jobLabel} | ${job.passed ? 'yes' : 'no'} | ${job.status || ''} | ${job.conclusion || ''} | ${job.startedAt || ''} | ${job.completedAt || ''} |`);
  }

  lines.push('');
  lines.push('## Deployment Gate');
  lines.push('');
  lines.push(`- Passed: ${summary.deploymentGate.passed ? 'yes' : 'no'}`);
  lines.push(`- All validation jobs completed: ${summary.deploymentGate.validationCompletedAt || ''}`);
  lines.push(`- Artifact build: ${summary.deploymentGate.buildStartedAt || ''} to ${summary.deploymentGate.buildCompletedAt || ''}`);
  lines.push(`- Deploy: ${summary.deploymentGate.deployStartedAt || ''} to ${summary.deploymentGate.deployCompletedAt || ''}`);
  lines.push(`- Live smoke: ${summary.deploymentGate.liveSmokeStartedAt || ''} to ${summary.deploymentGate.liveSmokeCompletedAt || ''}`);

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
    const validateRun = evaluateRuns(rawRuns);
    if (validateRun?.databaseId) {
      evaluateValidateJobs(runGhViewJobs(validateRun.databaseId));
    }
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
  console.log(`Current HEAD workflow status passed for ${summary.provenance.branch} ${summary.provenance.shortCommit}; workflows: ${REQUIRED_WORKFLOWS.join(', ')}; validation-gated Pages jobs: ${REQUIRED_VALIDATE_JOBS.join(', ')}.`);
} else {
  console.error(`Current HEAD workflow status failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues) {
    console.error(` - ${issue}`);
  }
}

process.exit(summary.passed ? 0 : 1);
