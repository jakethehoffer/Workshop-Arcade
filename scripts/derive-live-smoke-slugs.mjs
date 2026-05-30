#!/usr/bin/env node
// Derive WORKSHOP_ARCADE_TOUCHED_SLUGS from a push diff.
//
// The Deploy Pages workflow uses this to point the post-deploy live smoke at
// game pages affected by a commit. With no game-related change, it emits no
// environment override so check-live-pages.mjs keeps its newest-game default.

import { spawnSync } from 'node:child_process';
import { appendFile, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = resolve(repoRoot, 'websites', 'manifest.json');
const ZERO_SHA = /^0{40}$/;
const LOCAL_SCRIPT_SRC = /<script\b[^>]*\bsrc\s*=\s*["']([^"':]+\.js(?:[?#][^"']*)?)["'][^>]*>/gi;

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const { pathToSlugs, manifestSlugs } = await buildPathIndex(manifest);
const changedFiles = args.files.length > 0
  ? args.files
  : deriveChangedFilesFromGit(args);
const touched = new Set(changedFiles.map(normalizeRepoPath).filter(Boolean));
const touchedSlugs = new Set();

for (const file of touched) {
  for (const slug of pathToSlugs.get(file) || []) {
    touchedSlugs.add(slug);
  }
}

const slugs = manifestSlugs.filter((slug) => touchedSlugs.has(slug));

if (args.githubEnv) {
  if (slugs.length > 0) {
    await appendFile(args.githubEnv, `WORKSHOP_ARCADE_TOUCHED_SLUGS=${slugs.join(',')}\n`, 'utf8');
  }
}

printResult(slugs, touched.size, args.format, Boolean(args.githubEnv));

function parseArgs(argv) {
  const parsed = {
    base: '',
    eventName: process.env.GITHUB_EVENT_NAME || '',
    files: [],
    format: 'text',
    githubEnv: '',
    head: '',
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--base') {
      parsed.base = argv[++index] || '';
    } else if (arg === '--event-name') {
      parsed.eventName = argv[++index] || '';
    } else if (arg === '--file') {
      parsed.files.push(argv[++index] || '');
    } else if (arg === '--files') {
      parsed.files.push(...String(argv[++index] || '').split(/[,\n]/));
    } else if (arg === '--format') {
      parsed.format = argv[++index] || 'text';
    } else if (arg === '--github-env') {
      parsed.githubEnv = argv[++index] || '';
    } else if (arg === '--head') {
      parsed.head = argv[++index] || '';
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      parsed.files.push(arg);
    }
  }

  if (!['env', 'json', 'text'].includes(parsed.format)) {
    throw new Error(`Unsupported --format "${parsed.format}"`);
  }

  return parsed;
}

function printHelp() {
  console.log(`Usage: node scripts/derive-live-smoke-slugs.mjs [options]

Options:
  --base <sha>         Base commit for git diff
  --head <sha>         Head commit for git diff
  --event-name <name>  GitHub event name; non-push events emit no slugs
  --file <path>        Add one changed file path; repeatable
  --files <list>       Comma- or newline-separated changed file paths
  --github-env <path>  Append WORKSHOP_ARCADE_TOUCHED_SLUGS when slugs exist
  --format <kind>      text, json, or env output (default: text)`);
}

async function buildPathIndex(entries) {
  const pathToSlugs = new Map();
  const manifestSlugs = [];

  for (const entry of entries) {
    const slug = entry?.slug || entry?.id;
    if (!slug) continue;
    manifestSlugs.push(slug);

    addPath(pathToSlugs, entry.url, slug);
    addPath(pathToSlugs, entry.cover, slug);
    addPath(pathToSlugs, `covers/og/${slug}.svg`, slug);

    if (entry.url) {
      await indexLocalScripts(pathToSlugs, entry.url, slug);
    }
  }

  return { pathToSlugs, manifestSlugs };
}

async function indexLocalScripts(pathToSlugs, gameUrl, slug) {
  const gamePath = resolve(repoRoot, gameUrl);
  let html = '';
  try {
    html = await readFile(gamePath, 'utf8');
  } catch {
    return;
  }

  LOCAL_SCRIPT_SRC.lastIndex = 0;
  let match;
  while ((match = LOCAL_SCRIPT_SRC.exec(html)) !== null) {
    const scriptPath = resolveRepoPathFrom(gameUrl, match[1]);
    addPath(pathToSlugs, scriptPath, slug);
  }
}

function addPath(pathToSlugs, file, slug) {
  const normalized = normalizeRepoPath(file);
  if (!normalized) return;
  if (!pathToSlugs.has(normalized)) {
    pathToSlugs.set(normalized, new Set());
  }
  pathToSlugs.get(normalized).add(slug);
}

function resolveRepoPathFrom(fromRepoPath, rawRelativePath) {
  const clean = String(rawRelativePath || '').split(/[?#]/)[0];
  const resolved = resolve(repoRoot, dirname(normalizeRepoPath(fromRepoPath)), clean);
  return relative(repoRoot, resolved).replace(/\\/g, '/');
}

function normalizeRepoPath(file) {
  let value = String(file || '').trim();
  if (!value) return '';
  if (isAbsolute(value)) {
    value = relative(repoRoot, value);
  }
  value = value.replace(/\\/g, '/').replace(/^\.\/+/, '');
  while (value.startsWith('/')) value = value.slice(1);
  return value;
}

function deriveChangedFilesFromGit(options) {
  if (options.eventName && options.eventName !== 'push') {
    return [];
  }

  const base = options.base || process.env.GITHUB_EVENT_BEFORE || '';
  const head = options.head || process.env.GITHUB_SHA || 'HEAD';
  if (!isUsableSha(base) || !head || base === head) {
    return [];
  }

  const result = spawnSync('git', ['diff', '--name-only', `${base}..${head}`], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim() || `exit ${result.status}`;
    throw new Error(`Unable to derive changed files with git diff: ${detail}`);
  }

  return result.stdout.split(/\r?\n/);
}

function isUsableSha(value) {
  const sha = String(value || '').trim();
  return Boolean(sha) && !ZERO_SHA.test(sha);
}

function printResult(slugs, changedCount, format, wroteGithubEnv) {
  if (format === 'json') {
    console.log(JSON.stringify(slugs));
    return;
  }

  if (format === 'env') {
    if (slugs.length > 0) {
      console.log(`WORKSHOP_ARCADE_TOUCHED_SLUGS=${slugs.join(',')}`);
    }
    return;
  }

  if (slugs.length > 0) {
    const envNote = wroteGithubEnv ? '; wrote WORKSHOP_ARCADE_TOUCHED_SLUGS to GITHUB_ENV' : '';
    console.log(`Derived live-smoke slugs from ${changedCount} changed file${changedCount === 1 ? '' : 's'}: ${slugs.join(', ')}${envNote}.`);
  } else {
    console.log(`No touched game slugs derived from ${changedCount} changed file${changedCount === 1 ? '' : 's'}; live smoke will use its newest-entry default.`);
  }
}
