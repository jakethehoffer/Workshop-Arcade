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

  // Native loading="lazy" is a Chromium hint that pre-fetches anyway, so
  // below-the-fold covers must additionally route through an
  // IntersectionObserver that swaps a placeholder src to the real cover URL
  // only when the card scrolls into view. Without this, the catalog quietly
  // regresses back toward the pre-observer baseline (40 cover requests on
  // first paint) — the perf audit's request budget would catch it eventually,
  // but a fast-gate assertion catches it earlier and with a clearer message.
  if (!/new\s+IntersectionObserver\s*\(/.test(src)) {
    fail(`${indexPath}: render() must wire below-the-fold covers through an IntersectionObserver so native loading="lazy" hint pre-fetching does not bypass deferral`);
  }
  if (!/\.observe\s*\(\s*img\s*\)/.test(src)) {
    fail(`${indexPath}: render() must call observer.observe(img) on each below-the-fold cover so the observer actually wakes up when the card scrolls into view`);
  }
  if (!/dataset\.lazySrc\s*=/.test(src)) {
    fail(`${indexPath}: render() must stash the real cover URL on img.dataset.lazySrc so the IntersectionObserver can swap it in on intersection`);
  }
  if (!/COVER_LAZY_PLACEHOLDER|data:image\/svg\+xml[^"']*width=['"]?640/.test(src)) {
    fail(`${indexPath}: render() must set a placeholder src (e.g. COVER_LAZY_PLACEHOLDER) on below-the-fold cards so the layout box is reserved without a broken-image flash before the observer swaps the real cover in`);
  }

  // Product shelves are generated locally from the manifest, favorites, and
  // recent-play state. Repository issue/commit widgets must not return to the
  // player-facing catalog because remote API widgets cost first paint and move
  // the page away from arcade discovery.
  const startupMatch = src.match(/\(async function load\(\)\{([\s\S]*?)\}\)\(\);/);
  if (!startupMatch) {
    fail(`${indexPath}: unable to locate startup load() block for product-shelf check`);
  } else {
    const startupSrc = startupMatch[1];
    if (/loadIssueQueue\s*\(|loadRecentUpdates\s*\(|primeIssueQueue\s*\(|primeRecentUpdates\s*\(/.test(startupSrc)) {
      fail(`${indexPath}: startup load() must not initialize repository issue/commit widgets`);
    }
  }
  const forbiddenRepoWidgets = [
    'api.github.com',
    'ISSUE_QUEUE_API',
    'UPDATES_API',
    'refreshQueueBtn',
    'loadUpdatesBtn',
    'Improvement Queue',
    'Recent Updates',
  ];
  for (const needle of forbiddenRepoWidgets) {
    if (src.includes(needle)) {
      fail(`${indexPath}: repository widget surface "${needle}" should not appear in the player catalog`);
    }
  }
  if (/id=["']catalogDiscovery["']/.test(src) || /\bdata-view=["'](?:new|pop|recent|fav)["']/.test(src)) {
    fail(`${indexPath}: redundant Browse shortcut strip should not reappear ahead of player shelves`);
  }
  if (!/id=["']playerShelvesList["']/.test(src)) {
    fail(`${indexPath}: missing player shelves list for featured / quick-play / newest sections`);
  }
  const sessionRailIndex = src.search(/id=["']sessionRail["']/);
  const playerShelvesIndex = src.search(/id=["']playerShelvesList["']/);
  const gridIndex = src.search(/id=["']grid["']/);
  if (sessionRailIndex < 0 || playerShelvesIndex < 0 || gridIndex < 0) {
    fail(`${indexPath}: unable to locate session rail, player shelves, and grid for first-viewport ordering check`);
  } else if (!(sessionRailIndex < playerShelvesIndex && playerShelvesIndex < gridIndex)) {
    fail(`${indexPath}: player shelves must appear after the Continue rail and before the full catalog grid`);
  }
  if (!/function\s+buildPlayerShelves\s*\(/.test(src) || !/Featured games/.test(src) || !/Quick plays/.test(src) || !/Newest arrivals/.test(src)) {
    fail(`${indexPath}: product shelves must be generated from manifest data with featured, quick-play, and newest lanes`);
  }
  if (!/dataset\.shelfPick\s*=/.test(src) || !/dataset\.slug\s*=\s*game\.slug/.test(src)) {
    fail(`${indexPath}: player shelves must expose direct game pick buttons with game slugs`);
  }
  if (!/openPlayer\(game,\s*pick\)/.test(src)) {
    fail(`${indexPath}: direct player shelf picks must reuse openPlayer()`);
  }
  if (!/dataset\.shelfAction\s*=/.test(src) || !/openShelf\(action\.dataset\.shelfAction/.test(src)) {
    fail(`${indexPath}: player shelves must keep separate browse action buttons for featured / quick-play / newest views`);
  }
  if (!/function\s+pickUniqueGames\s*\(/.test(src) || !/const\s+usedShelfPicks\s*=\s*new\s+Set\(\)/.test(src)) {
    fail(`${indexPath}: player shelves must de-dupe first-visit picks with deterministic shared state`);
  }
  if (!/featuredPicks\s*=\s*pickUniqueGames\(popular,\s*3,\s*usedShelfPicks\)/.test(src)
    || !/quickPicks\s*=\s*pickUniqueGames\(quick,\s*3,\s*usedShelfPicks\)/.test(src)
    || !/newestPicks\s*=\s*pickUniqueGames\(newest,\s*3,\s*usedShelfPicks\)/.test(src)) {
    fail(`${indexPath}: featured, quick-play, and newest shelves must each carry three de-duped direct picks`);
  }
  if (!/\.queue-picks\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/.test(src)) {
    fail(`${indexPath}: player shelf picks must use the compact three-column text-pill layout`);
  }
  if (!/renderPlayerShelves\s*\(\s*\)/.test(src)) {
    fail(`${indexPath}: render() must refresh player shelves when catalog state changes`);
  }
  if (!/id=["']suggestImprovementBtn["']/.test(src)) {
    fail(`${indexPath}: missing quiet Suggest improvement action near player shelves`);
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
