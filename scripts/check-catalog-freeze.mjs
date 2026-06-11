#!/usr/bin/env node
// Enforce the user-directed Workshop Arcade content freeze.
//
// Existing games may be repaired, polished, or rebalanced. The catalog's
// identity set may not gain, lose, or rename a game until the user explicitly
// changes the policy in catalog-freeze.json.

import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const issues = [];

function fail(message) {
  issues.push(message);
}

function sortedStrings(values) {
  return [...values].map(String).sort((a, b) => a.localeCompare(b));
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return sortedStrings(repeated);
}

function compareSets(label, expected, actual) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const added = actual.filter((value) => !expectedSet.has(value));
  const removed = expected.filter((value) => !actualSet.has(value));
  if (added.length) fail(`${label}: additions are blocked by the content freeze: ${added.join(', ')}`);
  if (removed.length) fail(`${label}: removals or renames are blocked by the content freeze: ${removed.join(', ')}`);
}

const policy = JSON.parse(await readFile(join(repoRoot, 'catalog-freeze.json'), 'utf8'));
const manifest = JSON.parse(await readFile(join(repoRoot, 'websites', 'manifest.json'), 'utf8'));

if (policy.active !== true) {
  console.log('Catalog freeze is inactive. No frozen identity-set check was applied.');
  process.exit(0);
}

if (!Array.isArray(policy.frozenSlugs) || policy.frozenSlugs.length === 0) {
  fail('catalog-freeze.json: active policy must define a non-empty frozenSlugs array');
}
if (!Number.isInteger(policy.baselineGameCount) || policy.baselineGameCount < 1) {
  fail('catalog-freeze.json: active policy must define a positive baselineGameCount');
}
if (!/explicit user instruction/i.test(policy.changeRequires || '')) {
  fail('catalog-freeze.json: changeRequires must state that an explicit user instruction is required');
}
if (!Array.isArray(manifest)) {
  fail('websites/manifest.json: expected an array');
}

const frozenSlugs = sortedStrings(Array.isArray(policy.frozenSlugs) ? policy.frozenSlugs : []);
const manifestSlugs = sortedStrings(Array.isArray(manifest) ? manifest.map((game) => game?.slug || '') : []);
const fileAliases = policy.fileAliases && typeof policy.fileAliases === 'object' ? policy.fileAliases : {};
const frozenGameFiles = sortedStrings(frozenSlugs.map((slug) => fileAliases[slug] || `${slug}.html`));
const manifestGameFiles = sortedStrings(
  Array.isArray(manifest)
    ? manifest.map((game) => String(game?.url || '').replace(/^websites\//, ''))
    : []
);
const htmlGameFiles = sortedStrings(
  (await readdir(join(repoRoot, 'websites'), { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => entry.name)
);

for (const [label, values] of [
  ['catalog-freeze.json frozenSlugs', frozenSlugs],
  ['websites/manifest.json slugs', manifestSlugs],
  ['catalog-freeze.json game files', frozenGameFiles],
  ['websites/manifest.json game files', manifestGameFiles],
  ['websites/*.html game files', htmlGameFiles],
]) {
  const repeated = duplicates(values);
  if (repeated.length) fail(`${label}: duplicate values: ${repeated.join(', ')}`);
  if (values.some((value) => !value)) fail(`${label}: blank slug detected`);
}

if (frozenSlugs.length !== policy.baselineGameCount) {
  fail(`catalog-freeze.json: baselineGameCount is ${policy.baselineGameCount}, but frozenSlugs contains ${frozenSlugs.length}`);
}
if (manifestSlugs.length !== policy.baselineGameCount) {
  fail(`websites/manifest.json: content freeze requires exactly ${policy.baselineGameCount} games, found ${manifestSlugs.length}`);
}
if (htmlGameFiles.length !== policy.baselineGameCount) {
  fail(`websites/: content freeze requires exactly ${policy.baselineGameCount} game HTML files, found ${htmlGameFiles.length}`);
}

compareSets('websites/manifest.json', frozenSlugs, manifestSlugs);
compareSets('websites/manifest.json game files', frozenGameFiles, manifestGameFiles);
compareSets('websites/*.html', frozenGameFiles, htmlGameFiles);

if (issues.length) {
  console.error(`Catalog freeze check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues) console.error(` - ${issue}`);
  console.error('Only an explicit user instruction may lift or change catalog-freeze.json.');
  process.exit(1);
}

console.log(`Catalog freeze check passed: the exact ${policy.baselineGameCount}-game slug and HTML-file set is unchanged.`);
