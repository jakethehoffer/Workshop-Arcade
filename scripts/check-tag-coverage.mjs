#!/usr/bin/env node
// Catalog tag coverage contract.
//
// The catalog currently has enough breadth that every public tag should
// represent a real shelf/filter, not a one-off label. This fast gate keeps
// future manifest edits from quietly dropping a category below the floor or
// introducing a tag that the catalog chip ordering does not know about.

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIN_TAG_COUNT = 3;
const issues = [];

function fail(message) {
  issues.push(message);
}

async function readText(relative) {
  try {
    return await readFile(join(repoRoot, relative), 'utf8');
  } catch (error) {
    fail(`${relative}: unable to read (${error.message})`);
    return '';
  }
}

async function loadManifest() {
  const raw = await readText('websites/manifest.json');
  if (!raw) return [];

  try {
    const manifest = JSON.parse(raw);
    if (!Array.isArray(manifest)) {
      fail('websites/manifest.json: expected a top-level array of games');
      return [];
    }
    return manifest;
  } catch (error) {
    fail(`websites/manifest.json: unable to parse JSON (${error.message})`);
    return [];
  }
}

function parseCategoryOrder(indexSource) {
  const match = indexSource.match(/const\s+CATEGORY_ORDER\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) {
    fail('index.html: missing CATEGORY_ORDER array');
    return [];
  }

  try {
    const categoryOrder = JSON.parse(match[1]);
    if (!Array.isArray(categoryOrder)) {
      fail('index.html: CATEGORY_ORDER must parse to an array');
      return [];
    }
    return categoryOrder;
  } catch (error) {
    fail(`index.html: unable to parse CATEGORY_ORDER (${error.message})`);
    return [];
  }
}

function sortedCounts(counts) {
  return [...counts.entries()].sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]));
}

const manifest = await loadManifest();
const indexSource = await readText('index.html');
const categoryOrder = parseCategoryOrder(indexSource);
const categoryOrderSet = new Set(categoryOrder.filter((tag) => tag !== 'All'));
const duplicateCategories = categoryOrder.filter((tag, index) => categoryOrder.indexOf(tag) !== index);

for (const tag of duplicateCategories) {
  fail(`index.html: CATEGORY_ORDER repeats "${tag}"`);
}

const tagCounts = new Map();

for (const game of manifest) {
  const label = game?.slug || game?.id || game?.title || '<unknown>';
  if (!Array.isArray(game?.tags)) {
    fail(`${label}: tags must be an array`);
    continue;
  }

  for (const tag of game.tags) {
    if (typeof tag !== 'string' || tag.trim() === '') {
      fail(`${label}: tag values must be non-empty strings`);
      continue;
    }
    tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
  }
}

if (tagCounts.size === 0) {
  fail('websites/manifest.json: no public tags found');
}

for (const [tag, count] of sortedCounts(tagCounts)) {
  if (count < MIN_TAG_COUNT) {
    fail(`manifest tag "${tag}" appears in ${count} game${count === 1 ? '' : 's'}; minimum is ${MIN_TAG_COUNT}`);
  }
  if (!categoryOrderSet.has(tag)) {
    fail(`manifest tag "${tag}" is missing from index.html CATEGORY_ORDER`);
  }
}

if (issues.length > 0) {
  console.error(`Tag coverage check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues) {
    console.error(` - ${issue}`);
  }
  if (tagCounts.size > 0) {
    console.error('\nCurrent manifest tag counts:');
    for (const [tag, count] of sortedCounts(tagCounts)) {
      console.error(` - ${tag}: ${count}`);
    }
  }
  process.exit(1);
}

const weakest = sortedCounts(tagCounts)[0];
console.log(`Tag coverage check passed: ${tagCounts.size} public tags across ${manifest.length} games; weakest tag is "${weakest[0]}" with ${weakest[1]} games (minimum ${MIN_TAG_COUNT}).`);
