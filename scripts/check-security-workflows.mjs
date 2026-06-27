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
//   3. .github/workflows/validate-catalog.yml — gates GitHub Pages behind
//      every validation job, deploys a curated Actions artifact, then runs
//      the deployed-site smoke with no independent publish bypass.
//   4. .github/workflows/security-surfaces.yml — periodically checks the
//      GitHub-native security settings and alert backlogs that cannot be
//      represented by repository files alone.
//   5. Every external action use is pinned to an immutable full commit SHA,
//      with a same-line release comment so Dependabot can keep the pin current.
//
// The check is intentionally structural (file presence + required
// directives) rather than semantic — GitHub's workflow schemas evolve their
// own schemas, and we want to update tooling configs without having to
// rewrite the validator at the same time.

import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const issues = [];
let pinnedActionUseCount = 0;

const EXPECTED_ACTION_MAJORS = new Map([
  ['actions/checkout', 7],
  ['actions/setup-node', 6],
  ['actions/upload-artifact', 7],
  ['actions/configure-pages', 6],
  ['actions/upload-pages-artifact', 5],
  ['actions/deploy-pages', 5],
  ['actions/github-script', 9],
  ['github/codeql-action', 4],
]);

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

function getWorkflowJobBlock(src, jobId) {
  const lines = src.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `  ${jobId}:`);
  if (start === -1) {
    return '';
  }

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^  [A-Za-z0-9_-]+:\s*$/.test(lines[index])) {
      end = index;
      break;
    }
  }

  return lines.slice(start, end).join('\n');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findPinnedAction(src, actionPath) {
  const pattern = new RegExp(
    `uses:\\s*${escapeRegExp(actionPath)}@([0-9a-f]{40})\\s+#\\s+(v\\d+\\.\\d+\\.\\d+)`
  );
  const match = src.match(pattern);
  return match ? { sha: match[1], version: match[2] } : null;
}

function requirePinnedAction(src, workflowPath, actionPath, expectedMajor) {
  const pin = findPinnedAction(src, actionPath);
  if (!pin) {
    fail(`${workflowPath}: must use ${actionPath}@<40-character commit SHA> # v${expectedMajor}.x.y`);
    return null;
  }
  const major = Number.parseInt(pin.version.slice(1).split('.')[0], 10);
  if (major !== expectedMajor) {
    fail(`${workflowPath}: ${actionPath} must stay on major v${expectedMajor}, got ${pin.version}`);
  }
  return pin;
}

async function checkActionPins() {
  const workflowDir = join(repoRoot, '.github', 'workflows');
  let names;
  try {
    names = (await readdir(workflowDir))
      .filter((name) => /\.ya?ml$/i.test(name))
      .sort();
  } catch (error) {
    fail(`.github/workflows: unable to enumerate workflow files (${error.message})`);
    return;
  }

  const repositoryPins = new Map();
  for (const name of names) {
    const workflowPath = `.github/workflows/${name}`;
    const src = await readFile(join(workflowDir, name), 'utf8');
    const lines = src.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      const match = lines[index].match(/^\s*(?:-\s*)?uses:\s*([^\s#]+)(?:\s+#\s*(.*?))?\s*$/);
      if (!match) continue;

      const target = match[1];
      if (target.startsWith('./') || target.startsWith('docker://')) continue;

      const atIndex = target.lastIndexOf('@');
      if (atIndex <= 0) {
        fail(`${workflowPath}:${index + 1}: external action use must include @<40-character commit SHA>`);
        continue;
      }

      const actionPath = target.slice(0, atIndex);
      const sha = target.slice(atIndex + 1);
      const version = match[2] || '';
      const repository = actionPath.split('/').slice(0, 2).join('/');

      if (!/^[0-9a-f]{40}$/.test(sha)) {
        fail(`${workflowPath}:${index + 1}: ${actionPath} must be pinned to a full 40-character lowercase commit SHA, got "${sha}"`);
        continue;
      }
      if (!/^v\d+\.\d+\.\d+$/.test(version)) {
        fail(`${workflowPath}:${index + 1}: ${actionPath}@${sha} must have a same-line "# vX.Y.Z" release comment`);
        continue;
      }

      pinnedActionUseCount += 1;
      const expectedMajor = EXPECTED_ACTION_MAJORS.get(repository);
      const actualMajor = Number.parseInt(version.slice(1).split('.')[0], 10);
      if (expectedMajor !== undefined && actualMajor !== expectedMajor) {
        fail(`${workflowPath}:${index + 1}: ${repository} must stay on major v${expectedMajor}, got ${version}`);
      }

      const existing = repositoryPins.get(repository);
      if (existing && (existing.sha !== sha || existing.version !== version)) {
        fail(
          `${workflowPath}:${index + 1}: ${repository} uses ${sha} # ${version}, but ${existing.workflowPath}:${existing.line} uses ${existing.sha} # ${existing.version}; keep one release per action repository`
        );
      } else if (!existing) {
        repositoryPins.set(repository, {
          sha,
          version,
          workflowPath,
          line: index + 1,
        });
      }
    }
  }

  for (const repository of EXPECTED_ACTION_MAJORS.keys()) {
    if (!repositoryPins.has(repository)) {
      fail(`.github/workflows: expected at least one pinned use of ${repository}`);
    }
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
  const initPin = requirePinnedAction(src, path, 'github/codeql-action/init', 4);
  const analyzePin = requirePinnedAction(src, path, 'github/codeql-action/analyze', 4);
  if (initPin && analyzePin && (initPin.sha !== analyzePin.sha || initPin.version !== analyzePin.version)) {
    fail(`${path}: codeql-action/init and codeql-action/analyze must use the same immutable release pin`);
  }
  if (!/javascript-typescript/.test(src)) {
    fail(`${path}: must analyze the "javascript-typescript" language (covers both inline JS and .mjs tooling)`);
  }
  if (!/queries:\s*security-extended/.test(src)) {
    fail(`${path}: should opt into "security-extended" queries so XSS/SSRF/prototype-pollution patterns surface`);
  }
}

async function checkPagesDeploy() {
  const path = '.github/workflows/validate-catalog.yml';
  const legacyPath = '.github/workflows/deploy-pages.yml';
  if (await exists(legacyPath)) {
    fail(`${legacyPath}: independent Pages workflow must stay removed so main cannot publish before validation completes`);
  }
  if (!(await exists(path))) {
    fail(`${path}: file missing — validation-gated GitHub Pages deployment is required`);
    return;
  }
  const src = await readFile(join(repoRoot, path), 'utf8');
  const pagesBuildJob = getWorkflowJobBlock(src, 'pages-build');
  const deployJob = getWorkflowJobBlock(src, 'pages-deploy');
  const liveSmokeJob = getWorkflowJobBlock(src, 'live-smoke');
  const builderPath = 'scripts/build-pages-artifact.mjs';
  const smokeSlugHelperPath = 'scripts/derive-live-smoke-slugs.mjs';
  const builderSrc = await exists(builderPath)
    ? await readFile(join(repoRoot, builderPath), 'utf8')
    : '';
  const smokeSlugHelperSrc = await exists(smokeSlugHelperPath)
    ? await readFile(join(repoRoot, smokeSlugHelperPath), 'utf8')
    : '';
  if (!builderSrc) {
    fail(`${builderPath}: file missing — Pages artifact assembly must live in a shared local checker`);
  }
  if (!smokeSlugHelperSrc) {
    fail(`${smokeSlugHelperPath}: file missing — Pages live smoke must derive touched game slugs with a shared helper`);
  }

  if (!/^name:\s*Validate Catalog\b/m.test(src)) {
    fail(`${path}: workflow name must remain "Validate Catalog" so validation and deployment evidence share one run`);
  }
  for (const trigger of ['push:', 'pull_request:', 'workflow_dispatch:']) {
    if (!src.includes(trigger)) {
      fail(`${path}: must include the ${trigger} trigger`);
    }
  }

  const topPermissions = src.match(/^permissions:\s*([\s\S]*?)(?=^\S|\Z)/m);
  const permissionBlock = topPermissions?.[1] || '';
  if (!permissionBlock.includes('contents: read')) {
    fail(`${path}: top-level permissions must default to "contents: read"`);
  }
  for (const forbiddenPermission of ['contents: write', 'pages: write', 'id-token: write']) {
    if (permissionBlock.includes(forbiddenPermission)) {
      fail(`${path}: top-level permissions must not include "${forbiddenPermission}"; grant deploy privileges only to pages-deploy`);
    }
  }

  if (!/concurrency:\s*[\s\S]*?group:\s*validate-catalog-\$\{\{\s*github\.ref\s*\}\}/.test(src) || !/cancel-in-progress:\s*true/.test(src)) {
    fail(`${path}: must cancel obsolete same-ref runs with validate-catalog-\${{ github.ref }} concurrency`);
  }

  if (!pagesBuildJob) {
    fail(`${path}: must include a "pages-build" job after validation`);
  } else {
    const requiredNeeds = ['catalog-docs-a11y', 'game-smoke', 'performance-audit', 'render-capture'];
    for (const requiredNeed of requiredNeeds) {
      if (!new RegExp(`^      - ${requiredNeed}$`, 'm').test(pagesBuildJob)) {
        fail(`${path}: pages-build must need "${requiredNeed}" so every validation surface gates publication`);
      }
    }
    const deployCondition = "success() && github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch')";
    if (!pagesBuildJob.includes(`if: ${deployCondition}`)) {
      fail(`${path}: pages-build must use the main-only push/workflow_dispatch condition "${deployCondition}"`);
    }
    if (!pagesBuildJob.includes('ref: ${{ github.sha }}') || !/fetch-depth:\s*0\b/.test(pagesBuildJob)) {
      fail(`${path}: pages-build checkout must pin github.sha with fetch-depth: 0`);
    }
  }

  const requiredActions = [
    ['actions/checkout', 7],
    ['actions/configure-pages', 6],
    ['actions/setup-node', 6],
    ['actions/upload-pages-artifact', 5],
    ['actions/deploy-pages', 5],
    ['actions/upload-artifact', 7],
  ];
  for (const [actionPath, major] of requiredActions) {
    requirePinnedAction(src, path, actionPath, major);
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
    fail(`${path}: pages-deploy job must target the "github-pages" environment`);
  }
  if (!deployJob) {
    fail(`${path}: must include a "pages-deploy" job`);
  } else {
    if (!/\n    needs:\s*pages-build\b/.test(deployJob)) {
      fail(`${path}: pages-deploy must depend on pages-build`);
    }
    const deployPermissions = deployJob.match(/^    permissions:\s*([\s\S]*?)(?=^    [^\s]|\Z)/m)?.[1] || '';
    for (const permission of ['contents: read', 'pages: write', 'id-token: write']) {
      if (!deployPermissions.includes(permission)) {
        fail(`${path}: pages-deploy permissions must include "${permission}"`);
      }
    }
    if (!deployJob.includes('outputs:') || !deployJob.includes('page_url: ${{ steps.deployment.outputs.page_url }}')) {
      fail(`${path}: pages-deploy must expose the Pages deployment page_url output for post-deploy smoke tests`);
    }
  }

  if (!liveSmokeJob) {
    fail(`${path}: must include a "live-smoke" job that verifies the deployed Pages URL`);
  } else {
    if (!/\n    needs:\s*pages-deploy\b/.test(liveSmokeJob)) {
      fail(`${path}: live-smoke job must depend on pages-deploy`);
    }

    const livePermissions = liveSmokeJob.match(/^    permissions:\s*([\s\S]*?)(?=^    [^\s]|\Z)/m)?.[1] || '';
    if (!livePermissions.includes('contents: read')) {
      fail(`${path}: live-smoke job permissions must include "contents: read"`);
    }
    for (const forbiddenPermission of ['pages: write', 'id-token: write']) {
      if (livePermissions.includes(forbiddenPermission)) {
        fail(`${path}: live-smoke job must not grant "${forbiddenPermission}"`);
      }
    }

    for (const [actionPath, major] of [
      ['actions/checkout', 7],
      ['actions/setup-node', 6],
      ['actions/upload-artifact', 7],
    ]) {
      requirePinnedAction(liveSmokeJob, `${path} live-smoke job`, actionPath, major);
    }
    if (!/fetch-depth:\s*0\b/.test(liveSmokeJob)) {
      fail(`${path}: live-smoke checkout must use fetch-depth: 0 so push diffs can derive touched slugs across multi-commit pushes`);
    }
    if (!liveSmokeJob.includes('ref: ${{ github.sha }}')) {
      fail(`${path}: live-smoke checkout must pin the deployed github.sha`);
    }
    if (!/node-version:\s*24\b/.test(liveSmokeJob)) {
      fail(`${path}: live-smoke job must run under Node 24`);
    }
    if (!/\bcache:\s*npm\b/.test(liveSmokeJob)) {
      fail(`${path}: live-smoke job should enable setup-node npm cache for post-deploy checks`);
    }
    if (!/run:\s*npm ci\b/.test(liveSmokeJob)) {
      fail(`${path}: live-smoke job must install dependencies with npm ci`);
    }
    if (!liveSmokeJob.includes('node scripts/derive-live-smoke-slugs.mjs')) {
      fail(`${path}: live-smoke job must derive touched game slugs before running test:live-pages`);
    }
    for (const helperArg of [
      '--event-name "${{ github.event_name }}"',
      '--base "${{ github.event.before }}"',
      '--head "${{ github.sha }}"',
      '--github-env "$GITHUB_ENV"'
    ]) {
      if (!liveSmokeJob.includes(helperArg)) {
        fail(`${path}: live-smoke slug helper call must include ${helperArg}`);
      }
    }
    if (!/run:\s*npx playwright install --with-deps chromium\b/.test(liveSmokeJob)) {
      fail(`${path}: live-smoke job must install Playwright Chromium before running the deployed-site smoke`);
    }
    if (!liveSmokeJob.includes('WORKSHOP_ARCADE_URL: ${{ needs.pages-deploy.outputs.page_url }}')) {
      fail(`${path}: live-smoke job must pass WORKSHOP_ARCADE_URL from needs.pages-deploy.outputs.page_url`);
    }
    if (!liveSmokeJob.includes('npm run test:live-pages')) {
      fail(`${path}: live-smoke job must run npm run test:live-pages`);
    }
    if (!liveSmokeJob.includes('for attempt in 1 2 3') || !liveSmokeJob.includes('sleep 15') || !liveSmokeJob.includes('Live smoke failed after 3 attempts.')) {
      fail(`${path}: live-smoke job must retry live smoke before failing to absorb short Pages propagation delays`);
    }
    if (!liveSmokeJob.includes('if: always()')) {
      fail(`${path}: live-smoke job must upload report artifacts even when live smoke fails`);
    }
    if (!/name:\s*live-pages-smoke\b/.test(liveSmokeJob)) {
      fail(`${path}: live-smoke artifact must be named "live-pages-smoke"`);
    }
    if (!/path:\s*test-results\/live-pages-smoke\/\*\*/.test(liveSmokeJob)) {
      fail(`${path}: live-smoke artifact must upload test-results/live-pages-smoke/**`);
    }
    if (!/if-no-files-found:\s*ignore\b/.test(liveSmokeJob)) {
      fail(`${path}: live-smoke artifact upload must ignore missing files so setup failures still surface clearly`);
    }
    if (!/retention-days:\s*14\b/.test(liveSmokeJob)) {
      fail(`${path}: live-smoke artifact retention must be 14 days`);
    }
  }

  if (smokeSlugHelperSrc) {
    for (const helperNeedle of [
      'WORKSHOP_ARCADE_TOUCHED_SLUGS',
      'GITHUB_ENV',
      'git',
      'diff',
      'LOCAL_SCRIPT_SRC',
      'covers/og/${slug}.svg',
      'format === \'json\''
    ]) {
      if (!smokeSlugHelperSrc.includes(helperNeedle)) {
        fail(`${smokeSlugHelperPath}: helper must contain "${helperNeedle}" so touched game slug derivation stays testable and deploy-aware`);
      }
    }
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

async function checkSecuritySurfaces() {
  const path = '.github/workflows/security-surfaces.yml';
  const checkerPath = 'scripts/check-github-security-settings.mjs';
  if (!(await exists(path))) {
    fail(`${path}: file missing — GitHub-native security settings need an authenticated drift workflow`);
    return;
  }
  if (!(await exists(checkerPath))) {
    fail(`${checkerPath}: file missing — GitHub-native security settings need a local authenticated checker`);
    return;
  }

  const src = await readFile(join(repoRoot, path), 'utf8');
  const checkerSrc = await readFile(join(repoRoot, checkerPath), 'utf8');

  if (!/^name:\s*Security Surfaces\b/m.test(src)) {
    fail(`${path}: workflow name must be "Security Surfaces" so GitHub-native settings drift is easy to find`);
  }
  if (!/on:\s*[\s\S]*?\bpush:\s*[\s\S]*?branches:\s*\[\s*main\s*\]/m.test(src)) {
    fail(`${path}: must trigger on push: branches: [main] so settings drift is checked after every main publish`);
  }
  if (!/schedule:\s*[\s\S]*?cron:\s*["'][^"']+["']/m.test(src)) {
    fail(`${path}: must declare a schedule: cron entry so GitHub-native settings drift is checked even when code is quiet`);
  }
  if (!/\bworkflow_dispatch:\s*/.test(src)) {
    fail(`${path}: must include workflow_dispatch so security-surface checks can be retried manually`);
  }

  const topPermissions = src.match(/^permissions:\s*([\s\S]*?)(?=^\S|\Z)/m);
  const permissions = topPermissions?.[1] || '';
  for (const permission of ['contents: read', 'security-events: read']) {
    if (!permissions.includes(permission)) {
      fail(`${path}: top-level permissions must include "${permission}"`);
    }
  }
  for (const forbiddenPermission of ['contents: write', 'security-events: write', 'pages: write', 'id-token: write']) {
    if (permissions.includes(forbiddenPermission)) {
      fail(`${path}: top-level permissions must not include "${forbiddenPermission}"`);
    }
  }

  for (const [actionPath, major] of [
    ['actions/checkout', 7],
    ['actions/setup-node', 6],
  ]) {
    requirePinnedAction(src, path, actionPath, major);
  }
  if (!/node-version:\s*24\b/.test(src)) {
    fail(`${path}: must run the GitHub-native security checker under Node 24`);
  }
  if (!/GH_TOKEN:\s*\$\{\{\s*secrets\.SECURITY_SURFACES_TOKEN\s*\}\}/.test(src)) {
    fail(`${path}: must pass GH_TOKEN from \${{ secrets.SECURITY_SURFACES_TOKEN }} for the strict remote gate when configured`);
  }
  if (!/GH_TOKEN:\s*\$\{\{\s*github\.token\s*\}\}/.test(src)) {
    fail(`${path}: must also probe GH_TOKEN from \${{ github.token }} so CI records GitHub's default-token limitation when no maintainer token is configured`);
  }
  if (!/WORKSHOP_ARCADE_REPO:\s*\$\{\{\s*github\.repository\s*\}\}/.test(src)) {
    fail(`${path}: must pass WORKSHOP_ARCADE_REPO from \${{ github.repository }} to the checker`);
  }
  if (!/HAS_SECURITY_SURFACES_TOKEN:\s*\$\{\{\s*secrets\.SECURITY_SURFACES_TOKEN\s*!=\s*''\s*\}\}/.test(src)) {
    fail(`${path}: must derive HAS_SECURITY_SURFACES_TOKEN from SECURITY_SURFACES_TOKEN presence because secrets cannot be used directly in step if expressions`);
  }
  if (!/HAS_SECURITY_SURFACES_TOKEN\s*==\s*'true'/.test(src) || !/HAS_SECURITY_SURFACES_TOKEN\s*!=\s*'true'/.test(src)) {
    fail(`${path}: must branch on HAS_SECURITY_SURFACES_TOKEN so a maintainer token makes the workflow strict and default-token limits are explicit`);
  }
  if (!/continue-on-error:\s*true\b/.test(src) || !/steps\.github-token-probe\.outcome\s*!=\s*'success'/.test(src)) {
    fail(`${path}: must allow the default GITHUB_TOKEN probe to record API limitations without making main red when no maintainer token is configured`);
  }
  if (!/::warning title=GitHub security settings token limitation::/.test(src)) {
    fail(`${path}: must emit an Actions warning that records the exact GITHUB_TOKEN limitation and SECURITY_SURFACES_TOKEN follow-up`);
  }
  if (!/run:\s*npm run test:github-security-settings\b/.test(src)) {
    fail(`${path}: must run npm run test:github-security-settings`);
  }

  for (const checkerNeedle of [
    'GH_TOKEN',
    'GITHUB_TOKEN',
    'auth',
    'token',
    '/vulnerability-alerts',
    '/automated-security-fixes',
    '/private-vulnerability-reporting',
    'secret_scanning_push_protection',
    '/dependabot/alerts',
    '/secret-scanning/alerts',
    '/code-scanning/alerts',
    'secret_scanning_non_provider_patterns',
    'secret_scanning_validity_checks'
  ]) {
    if (!checkerSrc.includes(checkerNeedle)) {
      fail(`${checkerPath}: checker must contain "${checkerNeedle}" so GitHub-native security settings and alert backlogs stay covered`);
    }
  }
}

async function checkCurrentHeadWorkflowStatusChecker() {
  const checkerPath = 'scripts/check-current-head-workflows.mjs';
  if (!(await exists(checkerPath))) {
    fail(`${checkerPath}: file missing — current-HEAD workflow status needs a local remote checker`);
    return;
  }

  const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
  const scripts = packageJson.scripts || {};
  if (scripts['test:current-head-workflows'] !== 'node scripts/check-current-head-workflows.mjs') {
    fail(`package.json: test:current-head-workflows must run scripts/check-current-head-workflows.mjs, got ${JSON.stringify(scripts['test:current-head-workflows'])}`);
  }

  const checkerSrc = await readFile(join(repoRoot, checkerPath), 'utf8');
  for (const checkerNeedle of [
    'collectEvidenceProvenance',
    'formatEvidenceProvenance',
    'test-results',
    'current-head-workflows',
    'summary.json',
    'report.md',
    'gh',
    'run',
    'list',
    'runGhViewJobs',
    'headSha',
    'Validate Catalog',
    'CodeQL',
    'Security Surfaces',
    'requiredValidateJobs',
    'validateJobs',
    'deploymentGate',
    'Build static artifact',
    'Live Pages smoke',
    "const FORBIDDEN_WORKFLOWS = ['Deploy Pages']",
    'provenance.commit',
    'provenance.isDirty !== false',
    "run.status !== 'completed'",
    "run.conclusion !== 'success'",
    'windowsHide: true'
  ]) {
    if (!checkerSrc.includes(checkerNeedle)) {
      fail(`${checkerPath}: checker must contain "${checkerNeedle}" so current clean HEAD workflow status evidence stays guarded`);
    }
  }

  const fastRunnerPath = 'scripts/run-fast-tests.mjs';
  const fastRunnerSrc = await readFile(join(repoRoot, fastRunnerPath), 'utf8');
  if (!fastRunnerSrc.includes("'test:current-head-workflows'")) {
    fail(`${fastRunnerPath}: must exclude test:current-head-workflows from npm test because it depends on remote authenticated Actions state`);
  }
  if (!/test:current-head-workflows[\s\S]*remote workflow status/i.test(fastRunnerSrc)) {
    fail(`${fastRunnerPath}: test:current-head-workflows exclusion must name the remote workflow status reason`);
  }

  const aggregatorPath = 'scripts/check-test-aggregator.mjs';
  const aggregatorSrc = await readFile(join(repoRoot, aggregatorPath), 'utf8');
  if (!aggregatorSrc.includes("'test:current-head-workflows'")) {
    fail(`${aggregatorPath}: must allow the intentional test:current-head-workflows fast-runner exclusion`);
  }

  const docsDriftPath = 'scripts/check-docs-drift.mjs';
  const docsDriftSrc = await readFile(join(repoRoot, docsDriftPath), 'utf8');
  for (const docsNeedle of [
    "'test:current-head-workflows'",
    'npm run test:current-head-workflows',
    'test-results/current-head-workflows/<timestamp>/summary.json'
  ]) {
    if (!docsDriftSrc.includes(docsNeedle)) {
      fail(`${docsDriftPath}: missing current-HEAD workflow status docs contract text "${docsNeedle}"`);
    }
  }

  for (const docsPath of ['README.md', 'ARCHITECTURE.md']) {
    const docsSrc = await readFile(join(repoRoot, docsPath), 'utf8');
    for (const docsNeedle of [
      'npm run test:current-head-workflows',
      'test-results/current-head-workflows/<timestamp>/summary.json',
      'Validate Catalog',
      'CodeQL',
      'Security Surfaces',
      'Build static artifact',
      'Live Pages smoke',
      'validation-gated',
      'current clean HEAD'
    ]) {
      if (!docsSrc.includes(docsNeedle)) {
        fail(`${docsPath}: missing current-HEAD workflow status documentation "${docsNeedle}"`);
      }
    }
  }
}

await checkActionPins();
await checkDependabot();
await checkCodeql();
await checkPagesDeploy();
await checkSecuritySurfaces();
await checkCurrentHeadWorkflowStatusChecker();

if (issues.length > 0) {
  console.error(`Security workflows check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const message of issues) {
    console.error(` - ${message}`);
  }
  process.exit(1);
}

console.log(`Security workflows check passed: ${pinnedActionUseCount} immutable action uses, Dependabot, CodeQL, validation-gated Pages, Security Surfaces, and current-HEAD workflow status automation are intact.`);
