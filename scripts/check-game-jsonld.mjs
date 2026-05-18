#!/usr/bin/env node
// Per-game JSON-LD contract check.
//
// Verifies that every manifest game file contains the JSON-LD marker block
// emitted by scripts/inject-game-meta.mjs, that the block parses as JSON,
// uses the schema.org context with @type "VideoGame", and that key fields
// (name, url, image) match the canonical values derived from the manifest.
//
// Drift means a contributor edited a manifest entry or game file without
// rerunning `npm run inject:meta`.

import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildGameJsonLd,
  JSONLD_MARK_START,
  JSONLD_MARK_END,
} from './inject-game-meta.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://jakethehoffer.github.io/Workshop-Arcade';
const RAW = 'https://raw.githubusercontent.com/jakethehoffer/Workshop-Arcade/main';
const issues = [];

function fail(message) {
  issues.push(message);
}

function normalizeNewlines(value) {
  return String(value).replace(/\r\n/g, '\n');
}

async function exists(absolute) {
  try {
    await stat(absolute);
    return true;
  } catch {
    return false;
  }
}

async function loadManifest() {
  const raw = await readFile(join(repoRoot, 'websites', 'manifest.json'), 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('websites/manifest.json must be an array');
  }
  return parsed;
}

async function checkGame(game) {
  if (!game.url) {
    fail(`manifest entry ${game.id || game.title || '<unknown>'} is missing url`);
    return;
  }
  const filePath = join(repoRoot, game.url);
  if (!(await exists(filePath))) {
    fail(`${game.url}: file missing on disk`);
    return;
  }

  const html = await readFile(filePath, 'utf8');
  const startIndex = html.indexOf(JSONLD_MARK_START);
  const endIndex = html.indexOf(JSONLD_MARK_END);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    fail(`${game.url}: missing JSON-LD marker block — run \`npm run inject:meta\``);
    return;
  }

  const committed = html.slice(startIndex, endIndex + JSONLD_MARK_END.length);
  const expected = buildGameJsonLd(game);
  if (normalizeNewlines(committed) !== normalizeNewlines(expected)) {
    fail(`${game.url}: JSON-LD drifted from manifest — run \`npm run inject:meta\` to refresh`);
  }

  const scriptMatch = committed.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!scriptMatch) {
    fail(`${game.url}: marker block missing <script type="application/ld+json">`);
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(scriptMatch[1].trim());
  } catch (error) {
    fail(`${game.url}: JSON-LD block does not parse: ${error.message}`);
    return;
  }

  if (parsed['@context'] !== 'https://schema.org') {
    fail(`${game.url}: JSON-LD @context must be "https://schema.org"`);
  }
  if (parsed['@type'] !== 'VideoGame') {
    fail(`${game.url}: JSON-LD @type must be "VideoGame", got "${parsed['@type']}"`);
  }
  if (parsed.name !== game.title) {
    fail(`${game.url}: JSON-LD name must be "${game.title}", got "${parsed.name}"`);
  }
  const expectedUrl = `${SITE}/${game.url}`;
  if (parsed.url !== expectedUrl) {
    fail(`${game.url}: JSON-LD url must be "${expectedUrl}", got "${parsed.url}"`);
  }
  const expectedImage = `${RAW}/${game.cover}`;
  if (parsed.image !== expectedImage) {
    fail(`${game.url}: JSON-LD image must be "${expectedImage}", got "${parsed.image}"`);
  }
}

const manifest = await loadManifest();
for (const game of manifest) {
  await checkGame(game);
}

if (issues.length > 0) {
  console.error(`Per-game JSON-LD check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const message of issues) {
    console.error(` - ${message}`);
  }
  process.exit(1);
}

console.log(`Per-game JSON-LD check passed for ${manifest.length} games.`);
