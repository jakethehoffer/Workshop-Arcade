#!/usr/bin/env node
// Supply-chain hygiene contract check.
//
// Locks in the two security-adjacent workflows the repo ships:
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
//
// The check is intentionally structural (file presence + required
// directives) rather than semantic — Dependabot and CodeQL evolve their
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
  if (!/uses:\s*github\/codeql-action\/init@v3/.test(src)) {
    fail(`${path}: must use github/codeql-action/init@v3 (the current major)`);
  }
  if (!/uses:\s*github\/codeql-action\/analyze@v3/.test(src)) {
    fail(`${path}: must use github/codeql-action/analyze@v3`);
  }
  if (!/javascript-typescript/.test(src)) {
    fail(`${path}: must analyze the "javascript-typescript" language (covers both inline JS and .mjs tooling)`);
  }
  if (!/queries:\s*security-extended/.test(src)) {
    fail(`${path}: should opt into "security-extended" queries so XSS/SSRF/prototype-pollution patterns surface`);
  }
}

await checkDependabot();
await checkCodeql();

if (issues.length > 0) {
  console.error(`Security workflows check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const message of issues) {
    console.error(` - ${message}`);
  }
  process.exit(1);
}

console.log('Security workflows check passed: .github/dependabot.yml + .github/workflows/codeql.yml both intact.');
