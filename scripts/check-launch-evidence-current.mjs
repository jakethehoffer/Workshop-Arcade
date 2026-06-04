#!/usr/bin/env node
// Verify that the newest local launch evidence identifies the current clean HEAD.
//
// This intentionally reads gitignored test-results output. It is a local
// release-readiness check, not a fast CI gate for fresh checkouts.

import { spawnSync } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const issues = [];

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

function fail(message) {
  issues.push(message);
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

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function latestTimestampedDirectory(root, label) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    fail(`${label}: evidence directory is missing or unreadable at ${root} (${error.message})`);
    return null;
  }

  const candidates = entries
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}T/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const latest = candidates.at(-1);
  if (!latest) {
    fail(`${label}: no timestamped evidence directories found under ${root}`);
    return null;
  }

  return join(root, latest);
}

function isPassed(summary) {
  return summary?.status === 'passed' || summary?.passed === true;
}

function sameList(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function requireReportText(label, report, fragment) {
  if (!report.includes(fragment)) {
    fail(`${label}: report.md is missing ${JSON.stringify(fragment)}`);
  }
}

async function expectedManifestState() {
  const manifest = await readJson(join(repoRoot, 'websites', 'manifest.json'));
  if (!Array.isArray(manifest)) {
    throw new Error('websites/manifest.json is not an array');
  }
  return {
    manifestGameCount: manifest.length,
    newestSlugs: manifest.slice(-3).map((game) => game?.slug).filter(Boolean),
  };
}

async function checkEvidenceTarget(target, expected) {
  const latestDir = await latestTimestampedDirectory(target.root, target.label);
  if (!latestDir) return null;

  const summaryPath = join(latestDir, 'summary.json');
  const reportPath = join(latestDir, 'report.md');
  if (!(await pathExists(summaryPath))) {
    fail(`${target.label}: missing summary.json at ${summaryPath}`);
    return { target, latestDir, summaryPath, reportPath };
  }
  if (!(await pathExists(reportPath))) {
    fail(`${target.label}: missing report.md at ${reportPath}`);
    return { target, latestDir, summaryPath, reportPath };
  }

  let summary;
  let report;
  try {
    summary = await readJson(summaryPath);
  } catch (error) {
    fail(`${target.label}: summary.json is not valid JSON (${error.message})`);
    return { target, latestDir, summaryPath, reportPath };
  }
  try {
    report = await readFile(reportPath, 'utf8');
  } catch (error) {
    fail(`${target.label}: report.md is unreadable (${error.message})`);
    return { target, latestDir, summaryPath, reportPath };
  }

  if (!isPassed(summary)) {
    fail(`${target.label}: newest summary is not passed (status=${JSON.stringify(summary?.status)}, passed=${JSON.stringify(summary?.passed)})`);
  }

  const provenance = summary.provenance;
  if (!provenance || typeof provenance !== 'object') {
    fail(`${target.label}: summary is missing top-level provenance`);
  } else {
    if (provenance.error) {
      fail(`${target.label}: provenance error is present: ${provenance.error}`);
    }
    if (provenance.branch !== expected.branch) {
      fail(`${target.label}: provenance branch ${JSON.stringify(provenance.branch)} does not match current branch ${JSON.stringify(expected.branch)}`);
    }
    if (provenance.commit !== expected.commit) {
      fail(`${target.label}: provenance commit ${JSON.stringify(provenance.commit)} does not match current HEAD ${expected.commit}`);
    }
    if (provenance.shortCommit !== expected.shortCommit) {
      fail(`${target.label}: provenance shortCommit ${JSON.stringify(provenance.shortCommit)} does not match current HEAD ${expected.shortCommit}`);
    }
    if (provenance.isDirty !== false) {
      fail(`${target.label}: provenance isDirty must be false, got ${JSON.stringify(provenance.isDirty)}`);
    }
    if (provenance.statusShort !== '') {
      fail(`${target.label}: provenance statusShort must be empty, got ${JSON.stringify(provenance.statusShort)}`);
    }
    if (provenance.manifestGameCount !== expected.manifestGameCount) {
      fail(`${target.label}: provenance manifestGameCount ${JSON.stringify(provenance.manifestGameCount)} does not match current manifest count ${expected.manifestGameCount}`);
    }
    if (!sameList(provenance.newestSlugs, expected.newestSlugs)) {
      fail(`${target.label}: provenance newestSlugs ${JSON.stringify(provenance.newestSlugs)} does not match current manifest tail ${JSON.stringify(expected.newestSlugs)}`);
    }
  }

  requireReportText(target.label, report, `Branch: ${expected.branch}`);
  requireReportText(target.label, report, `Commit: ${expected.shortCommit} (${expected.commit})`);
  requireReportText(target.label, report, 'Dirty: no');
  requireReportText(target.label, report, `Manifest games: ${expected.manifestGameCount}`);
  requireReportText(target.label, report, `Newest slugs: ${expected.newestSlugs.join(', ')}`);

  return { target, latestDir, summaryPath, reportPath };
}

let expected;
try {
  const statusShort = runGit(['status', '--short']);
  expected = {
    branch: runGit(['branch', '--show-current']),
    commit: runGit(['rev-parse', 'HEAD']),
    shortCommit: runGit(['rev-parse', '--short=12', 'HEAD']),
    statusShort,
    ...(await expectedManifestState()),
  };
  if (!expected.branch) {
    fail('Current git branch is empty; launch evidence freshness requires a named branch');
  }
  if (statusShort) {
    fail(`Current worktree must be clean before checking clean-HEAD launch evidence; git status --short: ${JSON.stringify(statusShort)}`);
  }
} catch (error) {
  fail(`Unable to collect current repo state: ${error instanceof Error ? error.message : String(error)}`);
}

const checked = [];
if (expected) {
  for (const target of evidenceTargets) {
    checked.push(await checkEvidenceTarget(target, expected));
  }
}

if (issues.length) {
  console.error(`Launch evidence freshness check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues) {
    console.error(` - ${issue}`);
  }
  process.exit(1);
}

console.log(`Launch evidence freshness check passed for ${expected.branch} ${expected.shortCommit} (${expected.commit}); manifest games ${expected.manifestGameCount}; newest slugs ${expected.newestSlugs.join(', ')}.`);
for (const entry of checked.filter(Boolean)) {
  console.log(` - ${entry.target.label}: ${entry.latestDir}`);
}
