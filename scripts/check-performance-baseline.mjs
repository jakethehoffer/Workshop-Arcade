#!/usr/bin/env node
// Performance-baseline truth check.
//
// docs/performance-baseline.md is intentionally historical, but its latest
// pass and CI budget table should not drift from the current manifest and
// scripts/audit-pagespeed.mjs. This check complements test:docs with
// baseline-specific assertions.

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
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

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readBudget(source, key) {
  const property = key === 'default'
    ? 'default'
    : `(?:"${escapeRegex(key)}"|${escapeRegex(key)})`;
  const match = source.match(new RegExp(`${property}:\\s*\\{\\s*transferKb:\\s*(\\d+),\\s*requests:\\s*(\\d+)\\s*\\}`));
  if (!match) {
    fail(`scripts/audit-pagespeed.mjs: unable to parse ${key} budget`);
    return null;
  }
  return { transferKb: Number(match[1]), requests: Number(match[2]) };
}

function latestPassSection(markdown) {
  const firstHeading = markdown.match(/^## .+$/m);
  if (!firstHeading) {
    fail('docs/performance-baseline.md: missing pass heading');
    return '';
  }
  const start = firstHeading.index;
  const rest = markdown.slice(start);
  const next = rest.slice(firstHeading[0].length).match(/\n## /);
  return next ? rest.slice(0, firstHeading[0].length + next.index) : rest;
}

const manifest = JSON.parse(await readText('websites/manifest.json'));
const perfDoc = await readText('docs/performance-baseline.md');
const auditSource = await readText('scripts/audit-pagespeed.mjs');

if (!Array.isArray(manifest)) {
  fail('websites/manifest.json: expected an array');
}

const budgetRows = [
  ['Catalog', 'Catalog'],
  ['Lexica', 'Lexica'],
  ['Idle Tycoon', 'Idle Tycoon'],
  ['Arcade Jump', 'Arcade Jump'],
  ['Brick Breaker', 'Brick Breaker'],
  ['default', 'Other manifest games'],
];

for (const [key, label] of budgetRows) {
  const budget = readBudget(auditSource, key);
  if (!budget) continue;
  const row = `| ${label} | ${budget.transferKb} KB | ${budget.requests} |`;
  if (!perfDoc.includes(row)) {
    fail(`docs/performance-baseline.md: CI budget table must include "${row}"`);
  }
}

const latest = latestPassSection(perfDoc);
const expectedPages = Array.isArray(manifest) ? manifest.length + 1 : 0;
if (latest && Array.isArray(manifest)) {
  const manifestPattern = new RegExp(`\\b${manifest.length}\\s+manifest games\\b`, 'i');
  const pagePattern = new RegExp(`\\b${expectedPages}\\s+pages total\\b`, 'i');
  if (!manifestPattern.test(latest)) {
    fail(`docs/performance-baseline.md: latest pass must cite ${manifest.length} manifest games`);
  }
  if (!pagePattern.test(latest)) {
    fail(`docs/performance-baseline.md: latest pass must cite ${expectedPages} pages total`);
  }
  for (const title of ['Catalog', 'Lexica', 'Idle Tycoon', 'Arcade Jump', 'Brick Breaker']) {
    if (!new RegExp(`\\|\\s*${escapeRegex(title)}\\s*\\|`).test(latest)) {
      fail(`docs/performance-baseline.md: latest pass table must include ${title}`);
    }
  }
}

if (issues.length > 0) {
  console.error(`Performance-baseline check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const message of issues) {
    console.error(` - ${message}`);
  }
  process.exit(1);
}

console.log(`Performance-baseline check passed: latest pass matches ${manifest.length} manifest games / ${expectedPages} pages and CI budgets match audit-pagespeed.mjs.`);
