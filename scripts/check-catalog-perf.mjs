#!/usr/bin/env node
// Catalog performance contract check.
//
// Locks in the cover-image perf hints that keep the catalog's LCP fast and
// CLS stable as the grid grows:
//
//   1. The card template's <img> declares explicit width + height so the
//      layout reserves space before the cover finishes decoding (zero CLS).
//   2. The template's <img> declares decoding="async" so cover decoding
//      never blocks the main thread.
//   3. The render() function tags the first N cards with loading="eager"
//      and fetchpriority="high" so the LCP-candidate cover is fetched
//      immediately, and lazy-loads the rest so off-screen covers don't
//      compete for bandwidth on first paint.
//
// Regressing any of these silently would slow the catalog as the manifest
// grows, so the contract is enforced in CI.

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

function requireMatch(label, src, pattern, description) {
  if (!pattern.test(src)) {
    fail(`${label}: missing ${description}`);
  }
}

async function checkCatalog() {
  const indexPath = 'index.html';
  if (!(await exists(indexPath))) {
    fail(`${indexPath}: file missing`);
    return;
  }
  const src = await readFile(join(repoRoot, indexPath), 'utf8');

  // Locate the card template so the image-attribute assertions only inspect
  // its <img>, not the unrelated images elsewhere on the page.
  const templateMatch = src.match(/<template[^>]+id=["']cardT["'][^>]*>([\s\S]*?)<\/template>/i);
  if (!templateMatch) {
    fail(`${indexPath}: missing <template id="cardT"> card template`);
    return;
  }
  const templateSrc = templateMatch[1];

  const imgMatch = templateSrc.match(/<img\b([^>]*)>/i);
  if (!imgMatch) {
    fail(`${indexPath}: card template missing <img> element`);
    return;
  }
  const imgAttrs = imgMatch[1];

  requireMatch(`${indexPath} cardT <img>`, imgAttrs, /\bwidth=["']\d+["']/, 'explicit width attribute (prevents CLS)');
  requireMatch(`${indexPath} cardT <img>`, imgAttrs, /\bheight=["']\d+["']/, 'explicit height attribute (prevents CLS)');
  requireMatch(`${indexPath} cardT <img>`, imgAttrs, /\bdecoding=["']async["']/, 'decoding="async" (avoids main-thread decode blocking)');

  // The render() function must opt the first cards into eager + high
  // fetchpriority and the rest into lazy + low. The threshold can be a
  // viewport-aware helper (preferred — adjusts the eager count to the
  // actual screen size) or a numeric constant (legacy form).
  const hasFunction = /function\s+aboveFoldCoverCount\s*\(/.test(src);
  const hasConstant = /const\s+ABOVE_FOLD_COVERS\s*=\s*\d+/.test(src);
  if (!hasFunction && !hasConstant) {
    fail(`${indexPath}: missing viewport-aware aboveFoldCoverCount() helper or ABOVE_FOLD_COVERS constant in render() logic`);
  }
  if (hasFunction) {
    // The viewport helper should return different counts for different
    // viewport widths so mobile does not pay for desktop's eager budget.
    if (!/window\.innerWidth/.test(src)) {
      fail(`${indexPath}: aboveFoldCoverCount() must read window.innerWidth to scale to the viewport`);
    }
  }
  if (!/img\.loading\s*=\s*['"]eager['"]/.test(src)) {
    fail(`${indexPath}: render() must set img.loading="eager" for above-the-fold cards`);
  }
  if (!/img\.loading\s*=\s*['"]lazy['"]/.test(src)) {
    fail(`${indexPath}: render() must set img.loading="lazy" for below-the-fold cards`);
  }
  if (!/setAttribute\(['"]fetchpriority['"]\s*,\s*['"]high['"]\)/.test(src)) {
    fail(`${indexPath}: render() must set fetchpriority="high" on above-the-fold cards`);
  }
  if (!/setAttribute\(['"]fetchpriority['"]\s*,\s*['"]low['"]\)/.test(src)) {
    fail(`${indexPath}: render() must set fetchpriority="low" on below-the-fold cards`);
  }
}

await checkCatalog();

if (issues.length > 0) {
  console.error(`Catalog perf check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const message of issues) {
    console.error(` - ${message}`);
  }
  process.exit(1);
}

console.log('Catalog perf check passed: card template + render() apply the expected loading/fetchpriority/dimensions contract.');
