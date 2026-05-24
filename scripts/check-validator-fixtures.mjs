#!/usr/bin/env node
// Validator fixture checks.
//
// The validator scripts are themselves part of the product contract. These
// fixtures run selected validators against tiny throwaway repo trees so we
// know their negative paths still fail with useful messages, without
// mutating tracked files in the real checkout.

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const issues = [];

function fail(message) {
  issues.push(message);
}

async function writeFixture(root, relative, text) {
  const target = join(root, relative);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, text, 'utf8');
}

function runValidator(script, fixtureRoot) {
  return spawnSync(process.execPath, [join(repoRoot, script)], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, WORKSHOP_ARCADE_REPO_ROOT: fixtureRoot },
  });
}

async function withFixture(name, callback) {
  const root = await mkdtemp(join(tmpdir(), `workshop-${name}-`));
  try {
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function checkGeneratedSurfaceNegative() {
  await withFixture('generated-surfaces', async (root) => {
    const manifest = [{
      id: 'fixture-game',
      slug: 'fixture-game',
      title: 'Fixture Game',
      subtitle: 'Fixture.',
      url: 'websites/fixture-game.html',
      cover: 'covers/fixture-game.svg',
      tags: ['Puzzle'],
      addedAt: '2026-05-21',
      popularity: 1,
    }];
    await writeFixture(root, 'websites/manifest.json', JSON.stringify(manifest, null, 2));
    await writeFixture(root, 'websites/fixture-game.html', '<!-- workshop-meta:start --><!-- workshop-meta:end --><!-- workshop-jsonld:start --><!-- workshop-jsonld:end -->');
    await writeFixture(root, 'websites/orphan-game.html', '<!doctype html><title>Orphan</title>');
    await writeFixture(root, 'covers/og/fixture-game.svg', '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    await writeFixture(root, 'covers/og/orphan-game.svg', '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    await writeFixture(root, 'sitemap.xml', '<urlset><url><loc>https://jakethehoffer.github.io/Workshop-Arcade/websites/fixture-game.html</loc></url></urlset>');
    await writeFixture(root, 'feed.json', JSON.stringify({
      version: 'https://jsonfeed.org/version/1.1',
      items: [{ url: 'https://jakethehoffer.github.io/Workshop-Arcade/websites/fixture-game.html' }],
    }));
    await writeFixture(root, 'scripts/capture-games.mjs', 'const recipes = { "fixture-game": async () => {} };');

    const result = runValidator('scripts/check-generated-surfaces.mjs', root);
    const combined = `${result.stdout}\n${result.stderr}`;
    if (result.status === 0) {
      fail('check-generated-surfaces fixture: expected failure for orphan HTML/OG surfaces, got success');
    }
    if (!/orphan-game\.html/.test(combined) || !/orphan generated OG image/.test(combined)) {
      fail(`check-generated-surfaces fixture: expected orphan HTML and OG messages, got ${JSON.stringify(combined.trim())}`);
    }
  });
}

async function checkPerformanceBaselineNegative() {
  await withFixture('performance-baseline', async (root) => {
    await writeFixture(root, 'websites/manifest.json', JSON.stringify([
      { id: 'fixture-game', slug: 'fixture-game', title: 'Fixture Game', url: 'websites/fixture-game.html' },
      { id: 'second-game', slug: 'second-game', title: 'Second Game', url: 'websites/second-game.html' },
    ]));
    await writeFixture(root, 'scripts/audit-pagespeed.mjs', `
const BUDGETS = {
  Catalog: { transferKb: 200, requests: 18 },
  Lexica: { transferKb: 160, requests: 4 },
  "Idle Tycoon": { transferKb: 170, requests: 4 },
  "Arcade Jump": { transferKb: 110, requests: 4 },
  "Brick Breaker": { transferKb: 120, requests: 4 },
  default: { transferKb: 100, requests: 3 }
};
`);
    await writeFixture(root, 'docs/performance-baseline.md', `
## May 20, 2026 Local Strict Audit

Latest pass covered 1 manifest games and 2 pages total.

| Target | Transfer | Requests |
| Catalog | 250 KB | 40 |
| Lexica | 300 KB | 8 |
| Idle Tycoon | 225 KB | 8 |
| Arcade Jump | 150 KB | 8 |
| Brick Breaker | 150 KB | 8 |
| Other manifest games | 150 KB | 8 |
`);

    const result = runValidator('scripts/check-performance-baseline.mjs', root);
    const combined = `${result.stdout}\n${result.stderr}`;
    if (result.status === 0) {
      fail('check-performance-baseline fixture: expected failure for stale counts/budgets, got success');
    }
    if (!/200 KB/.test(combined) || !/2 manifest games/.test(combined) || !/3 pages total/.test(combined)) {
      fail(`check-performance-baseline fixture: expected stale budget/count messages, got ${JSON.stringify(combined.trim())}`);
    }
  });
}

async function checkPageWeightNegative() {
  await withFixture('page-weight', async (root) => {
    await writeFixture(root, 'websites/manifest.json', JSON.stringify([{
      id: 'fixture-game',
      slug: 'fixture-game',
      title: 'Fixture Game',
      subtitle: 'Fixture.',
      url: 'websites/fixture-game.html',
      cover: 'covers/fixture-game.svg',
      tags: ['Puzzle'],
      addedAt: '2026-05-23',
      popularity: 1,
    }], null, 2));
    await writeFixture(root, 'scripts/audit-pagespeed.mjs', `
const BUDGETS = {
  Catalog: { transferKb: 200, requests: 18 },
  Lexica: { transferKb: 160, requests: 4 },
  "Idle Tycoon": { transferKb: 170, requests: 4 },
  "Arcade Jump": { transferKb: 110, requests: 4 },
  "Brick Breaker": { transferKb: 120, requests: 4 },
  default: { transferKb: 1, requests: 3 }
};
`);
    await writeFixture(root, 'index.html', '<!doctype html><script>function aboveFoldCoverCount() { return 6; // desktop\\n}</script>');
    await writeFixture(root, 'sw.js', 'self.addEventListener("install", () => {});');
    await writeFixture(root, 'app.webmanifest', '{"name":"Fixture"}');
    await writeFixture(root, 'covers/app-icon.svg', '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    await writeFixture(root, 'covers/fixture-game.svg', '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    await writeFixture(root, 'websites/fixture-game.html', '<!doctype html><title>Fixture</title><link rel="stylesheet" href="fixture.css"><main style="background-image:url(heavy-inline.dat)">Fixture</main>');
    await writeFixture(root, 'websites/fixture.css', 'body { background-image: url("heavy-bg.dat"); }');
    await writeFixture(root, 'websites/heavy-inline.dat', 'i'.repeat(80));
    await writeFixture(root, 'websites/heavy-bg.dat', 'x'.repeat(1800));

    const result = runValidator('scripts/check-page-weight.mjs', root);
    const combined = `${result.stdout}\n${result.stderr}`;
    if (result.status === 0) {
      fail('check-page-weight fixture: expected failure for oversized static payload, got success');
    }
    if (!/Fixture Game/.test(combined) || !/static page weight/.test(combined)) {
      fail(`check-page-weight fixture: expected oversized Fixture Game payload message, got ${JSON.stringify(combined.trim())}`);
    }
  });
}

await checkGeneratedSurfaceNegative();
await checkPerformanceBaselineNegative();
await checkPageWeightNegative();

if (issues.length > 0) {
  console.error(`Validator fixture check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues) console.error(` - ${issue}`);
  process.exit(1);
}

console.log('Validator fixture check passed: generated-surface, performance-baseline, and page-weight negative paths fail on throwaway fixtures.');
