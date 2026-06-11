#!/usr/bin/env node
// ARCHITECTURE.md contract check.
//
// The repo's quality bar has grown to ~30 scripts, 5 generators, many
// fast validators, and a validation-gated deployment workflow. ARCHITECTURE.md exists
// so new contributors (and AI agents) can find the right surface to
// change without reading every file. This check makes sure the doc
// stays current as that surface evolves: every generator script must
// be mentioned by filename, every section header must be present, and
// the dormant future-game recipe must walk through every generator's
// regeneration command.

import { readFile, readdir, stat } from 'node:fs/promises';
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

const REQUIRED_SECTIONS = [
  '## The manifest is the source of truth',
  '## Generators',
  '## Validators (the fast gates)',
  '## CI workflow structure',
  '## Content freeze and future game additions',
];

// Generators must be named explicitly so adding a new generator
// (build-feed sibling) forces a corresponding doc update.
const REQUIRED_GENERATORS = [
  'scripts/inject-game-meta.mjs',
  'scripts/build-sitemap.mjs',
  'scripts/build-feed.mjs',
  'scripts/build-og-images.mjs',
  'scripts/catalog-csp.mjs',
  'scripts/validate-catalog.ps1',
];

// The future-game recipe must walk through every regenerator
// command. If a future generator lands, the doc has to add it here
// before this check is happy.
const REQUIRED_RECIPE_COMMANDS = [
  'validate-catalog.ps1 -Fix',
  'npm run inject:meta',
  'npm run build:sitemap',
  'npm run build:feed',
  'npm run build:og-images',
  'npm test',
  'npm run test:games',
];

const REQUIRED_REFERENCES = [
  'websites/manifest.json',
  'schemas/manifest.schema.json',
  '.github/workflows/validate-catalog.yml',
];

async function checkArchitectureDoc() {
  const path = 'ARCHITECTURE.md';
  if (!(await exists(path))) {
    fail(`${path}: file missing — root-level architecture doc is required so contributors can find the right surface without reading every script`);
    return null;
  }
  const src = await readFile(join(repoRoot, path), 'utf8');

  for (const section of REQUIRED_SECTIONS) {
    if (!src.includes(section)) {
      fail(`${path}: missing required section "${section}"`);
    }
  }
  for (const generator of REQUIRED_GENERATORS) {
    if (!src.includes(generator)) {
      fail(`${path}: must mention the generator script ${generator} so the doc stays current as the script network grows`);
    }
  }
  for (const command of REQUIRED_RECIPE_COMMANDS) {
    if (!src.includes(command)) {
      fail(`${path}: future-game recipe must include the command \`${command}\``);
    }
  }
  for (const reference of REQUIRED_REFERENCES) {
    if (!src.includes(reference)) {
      fail(`${path}: must reference ${reference} so contributors can find it without searching the tree`);
    }
  }

  // Word count sanity — a one-paragraph stub doesn't count as docs.
  const words = src.split(/\s+/).filter(Boolean).length;
  if (words < 400) {
    fail(`${path}: too short (${words} words; expected >= 400) — a real architecture doc should walk through generators, validators, CI, and the add-a-game recipe`);
  }

  return src;
}

async function checkReadmeLink() {
  const readme = await readFile(join(repoRoot, 'README.md'), 'utf8');
  if (!/ARCHITECTURE\.md/.test(readme)) {
    fail('README.md: should link to ARCHITECTURE.md so contributors discover it on their first visit');
  }
}

// Make sure ARCHITECTURE.md doesn't mention generators that have been
// removed since the doc was written — drift in either direction is bad.
async function checkNoGhostGenerators(src) {
  if (!src) return;
  // Extract every `scripts/<name>.mjs` reference from the doc.
  const refs = [...src.matchAll(/scripts\/([a-z0-9-]+)\.(?:mjs|ps1)/g)].map((m) => m[0]);
  const scriptDir = join(repoRoot, 'scripts');
  const actual = new Set((await readdir(scriptDir)).map((entry) => `scripts/${entry}`));
  for (const ref of refs) {
    if (!actual.has(ref)) {
      fail(`ARCHITECTURE.md: references ${ref} but no such script exists — remove it from the doc or restore the script`);
    }
  }
}

const src = await checkArchitectureDoc();
await checkReadmeLink();
await checkNoGhostGenerators(src);

if (issues.length > 0) {
  console.error(`Architecture doc check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const message of issues) {
    console.error(` - ${message}`);
  }
  process.exit(1);
}

console.log('Architecture doc check passed: ARCHITECTURE.md covers required sections, every generator + recipe command, and the README links to it.');
