#!/usr/bin/env node
// Contributor-onboarding contract check.
//
// First-time contributors clone the repo, run `npm ci`, then try
// `npm test` — and the slow `npm run test:games` Playwright suite
// breaks silently because nothing tells them to download the browser
// first. This check locks in the small onboarding surface that fixes
// it:
//
//   1. package.json exposes `npm run setup` that downloads the
//      Playwright chromium binary.
//   2. .devcontainer/devcontainer.json exists with Microsoft's
//      Playwright image (so Codespaces users skip the download
//      entirely), a `postCreateCommand` that runs `npm ci` +
//      `npm run setup`, and a forwarded port matching the local
//      static-server defaults.
//   3. README.md mentions both `npm run setup` and the devcontainer
//      so contributors can discover them without reading the source.

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

async function loadJson(relative) {
  const raw = await readFile(join(repoRoot, relative), 'utf8');
  // Strip JSON-with-Comments style // comments so devcontainer.json
  // parses with the standard JSON parser.
  const stripped = raw.replace(/(^|\s)\/\/[^\n]*$/gm, '$1');
  return JSON.parse(stripped);
}

async function checkPackageJson() {
  const pkg = await loadJson('package.json');
  const setupScript = pkg.scripts?.setup;
  if (!setupScript) {
    fail('package.json: missing "setup" npm script — contributors need a one-liner to install Playwright browsers');
  } else if (!/playwright\s+install/.test(setupScript)) {
    fail(`package.json: "setup" script must run \`npx playwright install\` (got: ${setupScript})`);
  } else if (!/chromium/.test(setupScript)) {
    fail(`package.json: "setup" script should pin chromium (the only browser used by tests) instead of installing all browsers (got: ${setupScript})`);
  }
}

async function checkDevcontainer() {
  const path = '.devcontainer/devcontainer.json';
  if (!(await exists(path))) {
    fail(`${path}: file missing — contributors opening the repo in Codespaces get a generic container`);
    return;
  }
  let cfg;
  try {
    cfg = await loadJson(path);
  } catch (error) {
    fail(`${path}: failed to parse: ${error.message}`);
    return;
  }
  if (!cfg.image || !/playwright/i.test(cfg.image)) {
    fail(`${path}: "image" must use a Playwright base image (e.g. mcr.microsoft.com/playwright:...) so chromium is preinstalled`);
  }
  if (!cfg.postCreateCommand || !/npm\s+ci/.test(cfg.postCreateCommand)) {
    fail(`${path}: "postCreateCommand" must run "npm ci" so the container is usable after build`);
  }
  if (!cfg.postCreateCommand || !/npm\s+run\s+setup/.test(cfg.postCreateCommand)) {
    fail(`${path}: "postCreateCommand" must run "npm run setup" so Playwright stays in sync when contributors bump the version`);
  }
  if (!Array.isArray(cfg.forwardPorts) || !cfg.forwardPorts.some((p) => [3000, 4173, 8000].includes(p))) {
    fail(`${path}: "forwardPorts" must include at least one of [3000, 4173, 8000] so the static-server previews are reachable`);
  }
}

async function checkReadme() {
  const src = await readFile(join(repoRoot, 'README.md'), 'utf8');
  if (!/npm run setup/.test(src)) {
    fail('README.md: must mention `npm run setup` so first-time contributors discover the Playwright install step');
  }
  if (!/(Codespaces|devcontainer)/i.test(src)) {
    fail('README.md: must mention Codespaces or the devcontainer so contributors know they can skip local setup entirely');
  }
}

await checkPackageJson();
await checkDevcontainer();
await checkReadme();

if (issues.length > 0) {
  console.error(`Contributor onboarding check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const message of issues) {
    console.error(` - ${message}`);
  }
  process.exit(1);
}

console.log('Contributor onboarding check passed: npm run setup, .devcontainer/devcontainer.json, and README mentions all in place.');
