import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

function runGit(repoRoot, args) {
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

function envValue(names) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function normalizeBranchName(value) {
  return value
    .replace(/^refs\/heads\//, '')
    .replace(/^refs\/pull\//, 'pull/');
}

function shortCommit(value) {
  return /^[0-9a-f]{12,40}$/i.test(value) ? value.slice(0, 12) : null;
}

async function readManifestProvenance(repoRoot, newestCount) {
  const raw = await readFile(join(repoRoot, 'websites', 'manifest.json'), 'utf8');
  const manifest = JSON.parse(raw);
  if (!Array.isArray(manifest)) {
    throw new Error('websites/manifest.json is not an array');
  }
  return {
    manifestGameCount: manifest.length,
    newestSlugs: manifest
      .slice(-newestCount)
      .map((game) => game?.slug)
      .filter(Boolean),
  };
}

export async function collectEvidenceProvenance(repoRoot, options = {}) {
  const newestCount = Number.isInteger(options.newestCount) ? options.newestCount : 3;
  const provenance = {
    branch: null,
    commit: null,
    shortCommit: null,
    isDirty: null,
    statusShort: null,
    manifestGameCount: null,
    newestSlugs: [],
    collectedAt: new Date().toISOString(),
    error: null,
  };
  const errors = [];

  try {
    provenance.branch = runGit(repoRoot, ['branch', '--show-current']) || null;
    provenance.commit = runGit(repoRoot, ['rev-parse', 'HEAD']) || null;
    provenance.shortCommit = runGit(repoRoot, ['rev-parse', '--short=12', 'HEAD']) || null;
    provenance.statusShort = runGit(repoRoot, ['status', '--short']);
    provenance.isDirty = provenance.statusShort.length > 0;
  } catch (error) {
    errors.push(`git: ${error instanceof Error ? error.message : String(error)}`);
  }

  const ciBranch = envValue(['GITHUB_HEAD_REF', 'GITHUB_REF_NAME']);
  if (!provenance.branch && ciBranch) {
    provenance.branch = normalizeBranchName(ciBranch);
  }

  const ciCommit = envValue(['GITHUB_SHA']);
  if (!provenance.commit && ciCommit) {
    provenance.commit = ciCommit;
  }
  if (!provenance.shortCommit && provenance.commit) {
    provenance.shortCommit = shortCommit(provenance.commit);
  }

  try {
    Object.assign(provenance, await readManifestProvenance(repoRoot, newestCount));
  } catch (error) {
    errors.push(`manifest: ${error instanceof Error ? error.message : String(error)}`);
  }

  provenance.error = errors.length ? errors.join('; ') : null;
  return provenance;
}

export function formatEvidenceProvenance(provenance) {
  const commitLabel = provenance?.shortCommit
    ? `${provenance.shortCommit}${provenance.commit ? ` (${provenance.commit})` : ''}`
    : 'unknown';
  const dirtyLabel = provenance?.isDirty === null
    ? 'unknown'
    : (provenance.isDirty ? 'yes' : 'no');
  const status = provenance?.statusShort ? provenance.statusShort.replace(/\r?\n/g, '; ') : 'none';
  const newest = Array.isArray(provenance?.newestSlugs) && provenance.newestSlugs.length
    ? provenance.newestSlugs.join(', ')
    : 'none';

  const lines = [
    `Branch: ${provenance?.branch || 'unknown'}`,
    `Commit: ${commitLabel}`,
    `Dirty: ${dirtyLabel}`,
    `Status short: ${status}`,
    `Manifest games: ${provenance?.manifestGameCount ?? 'unknown'}`,
    `Newest slugs: ${newest}`,
  ];

  if (provenance?.error) {
    lines.push(`Provenance warning: ${provenance.error}`);
  }

  return lines;
}
