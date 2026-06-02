#!/usr/bin/env node
// Assemble and verify the curated GitHub Pages artifact.
//
// The deploy workflow publishes only this explicit public surface, never the
// repository root. `--check` builds the same artifact into a temporary
// test-results path, verifies it, and removes it after a successful check.

import { cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const PUBLIC_PATHS = [
  'index.html',
  '404.html',
  'offline.html',
  'app.webmanifest',
  'sw.js',
  'robots.txt',
  'sitemap.xml',
  'feed.json',
  'humans.txt',
  'LICENSE',
  'README.md',
  'SECURITY.md',
  'package.json',
  'package-lock.json',
  'covers',
  'docs',
  'schemas',
  'scripts',
  'websites',
  '.well-known'
];

const REQUIRED_ARTIFACT_PATHS = [
  ...PUBLIC_PATHS,
  '.nojekyll',
  '.well-known/security.txt'
];

const FORBIDDEN_PATH_SEGMENTS = new Set([
  '.git',
  '.github',
  '.codex',
  '.ai-sync',
  '.devcontainer',
  '.vscode',
  'node_modules',
  'output',
  'test-results',
  '_site'
]);

function usage() {
  console.error([
    'Usage:',
    '  node scripts/build-pages-artifact.mjs --out _site',
    '  node scripts/build-pages-artifact.mjs --check [--keep]'
  ].join('\n'));
  process.exit(2);
}

function parseArgs(argv) {
  const options = {
    check: false,
    keep: false,
    out: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--check') {
      options.check = true;
    } else if (arg === '--keep') {
      options.keep = true;
    } else if (arg === '--out') {
      index += 1;
      if (!argv[index]) usage();
      options.out = argv[index];
    } else {
      usage();
    }
  }

  if (options.check && options.out) {
    console.error('Use either --check or --out, not both.');
    usage();
  }
  if (!options.check && !options.out) usage();
  if (options.keep && !options.check) {
    console.error('--keep is only valid with --check.');
    usage();
  }

  return options;
}

function repoRelative(absolutePath) {
  return relative(repoRoot, absolutePath).split(sep).join('/');
}

function resolveInsideRepo(pathArg) {
  const absolutePath = resolve(repoRoot, pathArg);
  const rel = relative(repoRoot, absolutePath);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Output path must be inside the repository: ${pathArg}`);
  }
  return absolutePath;
}

function assertSafeToRemove(absolutePath) {
  const rel = repoRelative(absolutePath);
  if (rel === '_site') return;
  if (rel.startsWith('test-results/pages-artifact-check/')) return;
  if (rel.startsWith('test-results/owned-domain-rehearsal/')) return;
  throw new Error(`Refusing to remove unmanaged output path: ${rel || absolutePath}`);
}

async function removeManagedOutput(absolutePath) {
  assertSafeToRemove(absolutePath);
  await rm(absolutePath, { recursive: true, force: true });
}

async function pathExists(absolutePath) {
  try {
    await stat(absolutePath);
    return true;
  } catch {
    return false;
  }
}

async function assembleArtifact(outDir) {
  await removeManagedOutput(outDir);
  await mkdir(outDir, { recursive: true });

  for (const publicPath of PUBLIC_PATHS) {
    try {
      await cp(join(repoRoot, publicPath), join(outDir, publicPath), {
        recursive: true,
        force: true,
        errorOnExist: false
      });
    } catch (error) {
      throw new Error(`Required public path is missing or unreadable: ${publicPath} (${error.message})`);
    }
  }

  await writeFile(join(outDir, '.nojekyll'), '');
}

async function* walkArtifact(rootDir, currentDir = rootDir) {
  for (const entry of await readdir(currentDir, { withFileTypes: true })) {
    const absolutePath = join(currentDir, entry.name);
    const rel = relative(rootDir, absolutePath).split(sep).join('/');
    yield { absolutePath, rel, entry };
    if (entry.isDirectory()) {
      yield* walkArtifact(rootDir, absolutePath);
    }
  }
}

async function verifyArtifact(outDir) {
  const issues = [];

  for (const requiredPath of REQUIRED_ARTIFACT_PATHS) {
    if (!(await pathExists(join(outDir, requiredPath)))) {
      issues.push(`Artifact missing required path: ${requiredPath}`);
    }
  }

  const securityTxt = join(outDir, '.well-known/security.txt');
  if (await pathExists(securityTxt)) {
    const securityStat = await stat(securityTxt);
    if (!securityStat.isFile()) {
      issues.push('Artifact .well-known/security.txt must be a file');
    }
  }

  let fileCount = 0;
  let directoryCount = 0;
  for await (const item of walkArtifact(outDir)) {
    const segments = item.rel.split('/');
    const forbiddenSegment = segments.find((segment) => FORBIDDEN_PATH_SEGMENTS.has(segment));
    if (forbiddenSegment) {
      issues.push(`Artifact includes forbidden internal path "${forbiddenSegment}" at ${item.rel}`);
    }
    if (item.entry.isDirectory()) {
      directoryCount += 1;
    } else if (item.entry.isFile()) {
      fileCount += 1;
    }
  }

  if (issues.length > 0) {
    throw new Error([
      `Pages artifact verification failed for ${repoRelative(outDir)}:`,
      ...issues.map((issue) => ` - ${issue}`)
    ].join('\n'));
  }

  return { fileCount, directoryCount };
}

function createCheckPaths() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runRoot = join(repoRoot, 'test-results/pages-artifact-check', `${stamp}-${process.pid}`);
  return {
    runRoot,
    outDir: join(runRoot, 'site')
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const checkPaths = options.check ? createCheckPaths() : null;
  const outDir = options.check ? checkPaths.outDir : resolveInsideRepo(options.out);

  await assembleArtifact(outDir);
  const { fileCount, directoryCount } = await verifyArtifact(outDir);

  const displayPath = repoRelative(outDir);
  console.log(`Pages artifact build passed: ${fileCount} files, ${directoryCount} directories in ${displayPath}; .well-known/security.txt included; internal paths absent.`);

  if (options.check && !options.keep) {
    await removeManagedOutput(checkPaths.runRoot);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
