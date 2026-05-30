#!/usr/bin/env node
// Supply-chain hygiene contract check.
//
// Locks in the security-adjacent automation the repo ships:
//
//   1. .github/dependabot.yml — keeps the small dependency surface
//      (Playwright + GitHub Actions) automatically up to date so the
//      maintainer never has to manually chase npm advisories or
//      action version drift.
//   2. .github/workflows/codeql.yml — runs CodeQL static analysis on
//      every push/PR to main plus a weekly schedule, with hardened
//      least-privilege permissions and the security-extended query
//      pack so XSS/SSRF/prototype-pollution patterns surface as PR
//      checks instead of going to production.
//   3. .github/workflows/deploy-pages.yml — deploys GitHub Pages from
//      a curated Actions artifact so the public site is explicit,
//      least-privilege, and free of generated legacy Pages workflows.
//
// The check is intentionally structural (file presence + required
// directives) rather than semantic — GitHub's workflow schemas evolve their
// own schemas, and we want to update tooling configs without having to
// rewrite the validator at the same time.

import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const issues = [];

function fail(message) {
  issues.push(message);
}

async function exists(relative) {
  try {
    await stat(join(repoRoot, relative));
    return true;
  } catch {
    return false;
  }
}

async function checkDependabot() {
  const path = '.github/dependabot.yml';
  if (!(await exists(path))) {
    fail(`${path}: file missing — Dependabot needs this exact path under .github/`);
    return;
  }
  const src = await readFile(join(repoRoot, path), 'utf8');
  if (!/^version:\s*2\b/m.test(src)) {
    fail(`${path}: must declare "version: 2" so Dependabot uses the modern config schema`);
  }
  if (!/package-ecosystem:\s*["']?npm["']?/.test(src)) {
    fail(`${path}: must register an "npm" package-ecosystem so Playwright + future deps are tracked`);
  }
  if (!/package-ecosystem:\s*["']?github-actions["']?/.test(src)) {
    fail(`${path}: must register a "github-actions" package-ecosystem so workflow action versions stay current`);
  }
  if (!/interval:\s*["']?weekly["']?/.test(src)) {
    fail(`${path}: should run on a "weekly" schedule (daily is noisy for a small dep surface; monthly misses CVE windows)`);
  }
}

async function checkCodeql() {
  const path = '.github/workflows/codeql.yml';
  if (!(await exists(path))) {
    fail(`${path}: file missing — security analysis workflow is required`);
    return;
  }
  const src = await readFile(join(repoRoot, path), 'utf8');

  if (!/^name:\s*CodeQL\b/m.test(src)) {
    fail(`${path}: workflow name must be "CodeQL" so the Actions tab and required-status-check API can target it`);
  }

  // Triggers
  if (!/on:\s*[\s\S]*?\bpush:\s*[\s\S]*?branches:\s*\[\s*main\s*\]/m.test(src)) {
    fail(`${path}: must trigger on push: branches: [main]`);
  }
  if (!/pull_request:\s*[\s\S]*?branches:\s*\[\s*main\s*\]/m.test(src)) {
    fail(`${path}: must trigger on pull_request: branches: [main]`);
  }
  if (!/schedule:\s*[\s\S]*?cron:\s*["'][^"']+["']/m.test(src)) {
    fail(`${path}: must declare a schedule: cron entry so new rule packs catch issues even when no code changed`);
  }

  // Permissions hardening
  const topPermissions = src.match(/^permissions:\s*([\s\S]*?)(?=^\S|\Z)/m);
  if (!topPermissions || !/contents:\s*read/.test(topPermissions[1])) {
    fail(`${path}: top-level "permissions:" must default to "contents: read" so non-analyze jobs run least-privilege`);
  }
  if (!/security-events:\s*write/.test(src)) {
    fail(`${path}: analyze job must grant "security-events: write" so SARIF uploads succeed`);
  }

  // CodeQL actions + language coverage
  // Accept any non-deprecated codeql-action major. Pinning a single
  // major (e.g. only v3) makes the Dependabot upgrade PR fail this
  // check, which is exactly the wrong signal — Dependabot is the
  // intended driver of these bumps. v3 and v4 are both currently
  // supported by GitHub; older majors are out of support.
  const supportedMajors = ['v3', 'v4'];
  const initMatch = src.match(/uses:\s*github\/codeql-action\/init@(v\d+)/);
  const analyzeMatch = src.match(/uses:\s*github\/codeql-action\/analyze@(v\d+)/);
  if (!initMatch) {
    fail(`${path}: must use github/codeql-action/init@<major>`);
  } else if (!supportedMajors.includes(initMatch[1])) {
    fail(`${path}: codeql-action/init pinned to ${initMatch[1]}, which is outside the supported majors (${supportedMajors.join(', ')}). Bump it or extend the allowlist.`);
  }
  if (!analyzeMatch) {
    fail(`${path}: must use github/codeql-action/analyze@<major>`);
  } else if (!supportedMajors.includes(analyzeMatch[1])) {
    fail(`${path}: codeql-action/analyze pinned to ${analyzeMatch[1]}, which is outside the supported majors (${supportedMajors.join(', ')}). Bump it or extend the allowlist.`);
  }
  if (initMatch && analyzeMatch && initMatch[1] !== analyzeMatch[1]) {
    fail(`${path}: codeql-action/init (${initMatch[1]}) and codeql-action/analyze (${analyzeMatch[1]}) must be pinned to the same major so init's output matches what analyze expects`);
  }
  if (!/javascript-typescript/.test(src)) {
    fail(`${path}: must analyze the "javascript-typescript" language (covers both inline JS and .mjs tooling)`);
  }
  if (!/queries:\s*security-extended/.test(src)) {
    fail(`${path}: should opt into "security-extended" queries so XSS/SSRF/prototype-pollution patterns surface`);
  }
}

async function checkPagesDeploy() {
  const path = '.github/workflows/deploy-pages.yml';
  if (!(await exists(path))) {
    fail(`${path}: file missing — GitHub Pages must deploy from the repo-owned Actions workflow`);
    return;
  }
  const src = await readFile(join(repoRoot, path), 'utf8');
  const builderPath = 'scripts/build-pages-artifact.mjs';
  const builderSrc = await exists(builderPath)
    ? await readFile(join(repoRoot, builderPath), 'utf8')
    : '';
  if (!builderSrc) {
    fail(`${builderPath}: file missing — Deploy Pages artifact assembly must live in a shared local checker`);
  }

  if (!/^name:\s*Deploy Pages\b/m.test(src)) {
    fail(`${path}: workflow name must be "Deploy Pages" so the Actions tab and Pages deployment history are easy to target`);
  }
  if (!/on:\s*[\s\S]*?\bpush:\s*[\s\S]*?branches:\s*\[\s*main\s*\]/m.test(src)) {
    fail(`${path}: must trigger on push: branches: [main] so every main commit can publish`);
  }
  if (!/\bworkflow_dispatch:\s*/.test(src)) {
    fail(`${path}: must include workflow_dispatch so a Pages deploy can be retried without a content change`);
  }

  const topPermissions = src.match(/^permissions:\s*([\s\S]*?)(?=^\S|\Z)/m);
  const permissionBlock = topPermissions?.[1] || '';
  for (const permission of ['contents: read', 'pages: write', 'id-token: write']) {
    if (!permissionBlock.includes(permission)) {
      fail(`${path}: top-level permissions must include "${permission}" for least-privilege Pages deployment`);
    }
  }

  if (!/concurrency:\s*[\s\S]*?group:\s*pages/.test(src) || !/cancel-in-progress:\s*false/.test(src)) {
    fail(`${path}: must serialize Pages deploys with concurrency group "pages" and cancel-in-progress: false`);
  }

  const requiredActions = [
    'actions/checkout@v6',
    'actions/configure-pages@v6',
    'actions/setup-node@v6',
    'actions/upload-pages-artifact@v5',
    'actions/deploy-pages@v5'
  ];
  for (const action of requiredActions) {
    if (!src.includes(`uses: ${action}`)) {
      fail(`${path}: must use ${action}`);
    }
  }
  if (!/node-version:\s*24\b/.test(src)) {
    fail(`${path}: must run the Pages artifact builder under Node 24`);
  }
  if (!/run:\s*node scripts\/build-pages-artifact\.mjs --out _site\b/.test(src)) {
    fail(`${path}: must assemble Pages with "node scripts/build-pages-artifact.mjs --out _site"`);
  }
  if (!/path:\s*_site\b/.test(src)) {
    fail(`${path}: upload-pages-artifact must publish the curated "_site" directory, not the repo root`);
  }
  if (!/include-hidden-files:\s*true\b/.test(src)) {
    fail(`${path}: upload-pages-artifact must set include-hidden-files: true so .well-known/security.txt reaches the live site`);
  }
  if (!/environment:\s*[\s\S]*?name:\s*github-pages/.test(src)) {
    fail(`${path}: deploy job must target the "github-pages" environment`);
  }

  const requiredPublicPaths = [
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
  for (const publicPath of requiredPublicPaths) {
    if (!builderSrc.includes(publicPath)) {
      fail(`${builderPath}: static artifact assembly must include "${publicPath}"`);
    }
  }
  for (const artifactPath of ['.nojekyll', '.well-known/security.txt', '--check']) {
    if (!builderSrc.includes(artifactPath)) {
      fail(`${builderPath}: static artifact checker must include "${artifactPath}"`);
    }
  }

  const forbiddenRootPublishPatterns = [
    /\bpath:\s*\.\s*$/m,
    /\bcp\s+-R\s+\\?\s*\.\s/m,
    /\brsync\b[\s\S]*\s\.\s+_site\b/
  ];
  if (forbiddenRootPublishPatterns.some((pattern) => pattern.test(src))) {
    fail(`${path}: must not publish the repository root; publish only the curated "_site" artifact`);
  }

  for (const internalPath of ['.git', '.github', '.codex', '.ai-sync', '.devcontainer', '.vscode', 'node_modules', 'output', 'test-results', '_site']) {
    if (!builderSrc.includes(internalPath)) {
      fail(`${builderPath}: artifact assembly must explicitly guard against publishing "${internalPath}"`);
    }
  }
}

await checkDependabot();
await checkCodeql();
await checkPagesDeploy();

if (issues.length > 0) {
  console.error(`Security workflows check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const message of issues) {
    console.error(` - ${message}`);
  }
  process.exit(1);
}

console.log('Security workflows check passed: Dependabot, CodeQL, and Deploy Pages automation are intact.');
