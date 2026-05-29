#!/usr/bin/env node
// Favorites contract check.
//
// The catalog lets a visitor star games into a device-local "Favorites" set
// that surfaces as a dynamic filter chip (only when non-empty), mirroring the
// existing "Recently" pseudo-category. The feature is plain inline JS + a per
// card toggle button, so a refactor of index.html could silently drop a piece
// (the chip, the persistence, the URL state, the per-card button). This fast
// gate locks every piece in place.
//
// Verifies (against index.html):
//   1. A per-card <button class="fav"> toggle in the card template with
//      type="button" + aria-pressed (so screen readers announce the state).
//   2. CSS styles the .fav button and its pressed state.
//   3. A versioned FAVORITES_KEY + loadFavorites/isFavorite/toggleFavorite
//      helpers that persist through localStorage.
//   4. state.favorites exists and the loader hydrates it on startup.
//   5. categoryCount() counts Favorites, buildFilters() inserts the chip,
//      update() filters by it, and applyUrlStateFromLocation() accepts it as
//      a bookmarkable ?tag= value.
//   6. render() wires the per-card button to toggleFavorite().

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

function requireMatch(src, pattern, description) {
  if (!pattern.test(src)) {
    fail(`index.html: missing ${description}`);
  }
}

async function checkIndex() {
  const path = 'index.html';
  if (!(await exists(path))) {
    fail(`${path}: file missing`);
    return;
  }
  const src = await readFile(join(repoRoot, path), 'utf8');

  // 1. Per-card toggle button in the template.
  const favBtn = src.match(/<button[^>]*class=["']fav["'][^>]*>[\s\S]*?<\/button>/i);
  if (!favBtn) {
    fail(`${path}: missing <button class="fav"> favorite toggle in the card template`);
  } else {
    const html = favBtn[0];
    if (!/type=["']button["']/i.test(html)) {
      fail(`${path}: .fav button must declare type="button"`);
    }
    if (!/aria-pressed=/i.test(html)) {
      fail(`${path}: .fav button must declare aria-pressed so screen readers announce the favorite state`);
    }
  }

  // 2. CSS for the button + pressed state.
  requireMatch(src, /\.fav\s*\{/, 'CSS rule for the .fav favorite button');
  requireMatch(src, /\.fav\[aria-pressed=["']true["']\]/, 'CSS rule styling the pressed (favorited) .fav state');

  // 3. Persistence helpers.
  requireMatch(src, /const\s+FAVORITES_KEY\s*=\s*['"][^'"]+['"]/, 'a versioned FAVORITES_KEY constant');
  requireMatch(src, /function\s+loadFavorites\s*\(/, 'a loadFavorites() helper that reads persisted favorites');
  requireMatch(src, /function\s+isFavorite\s*\(/, 'an isFavorite() helper');
  requireMatch(src, /function\s+toggleFavorite\s*\(/, 'a toggleFavorite() helper');
  requireMatch(src, /localStorage\.setItem\(\s*FAVORITES_KEY/, 'toggleFavorite() must persist via localStorage.setItem(FAVORITES_KEY, ...)');

  // 4. State + hydration.
  requireMatch(src, /favorites\s*:\s*\[\s*\]/, 'state.favorites initialized to an empty array');
  requireMatch(src, /state\.favorites\s*=\s*loadFavorites\(\)/, 'startup hydration of state.favorites = loadFavorites()');

  // 5. Filtering + chip + URL state.
  requireMatch(src, /category\s*===\s*['"]Favorites['"]/, "categoryCount() must handle the 'Favorites' category");
  requireMatch(src, /categoryCount\(\s*['"]Favorites['"]\s*\)/, "buildFilters() must insert the Favorites chip via categoryCount('Favorites')");
  requireMatch(src, /cat\s*===\s*['"]Favorites['"]/, "update() must filter the visible list when the 'Favorites' category is active");
  requireMatch(src, /tag\s*===\s*['"]Favorites['"]/, "applyUrlStateFromLocation() must accept ?tag=Favorites as a valid bookmarkable category");

  // 6. Render wiring.
  requireMatch(src, /querySelector\(\s*['"]\.fav['"]\s*\)/, 'render() must select the per-card .fav button');
  requireMatch(src, /toggleFavorite\(/, 'render() must wire the .fav button click to toggleFavorite()');

  // 7. Discovery-row quick-view — the prominent entry point alongside
  //    Newest/Popular/Continue, revealed only when favorites exist.
  const favViewBtn = src.match(/<button[^>]*data-view=["']fav["'][^>]*>/i);
  if (!favViewBtn) {
    fail(`${path}: missing discovery-row <button data-view="fav"> Favorites quick-view`);
  } else if (!/id=["']favoriteViewBtn["']/i.test(favViewBtn[0])) {
    fail(`${path}: the Favorites discovery quick-view button must declare id="favoriteViewBtn"`);
  }
  requireMatch(src, /favoriteViewBtn:\s*document\.getElementById\(['"]favoriteViewBtn['"]\)/, 'els.favoriteViewBtn mapping');
  requireMatch(src, /view\s*===\s*['"]fav['"]/, "setDiscoveryView() must handle the 'fav' quick-view (sets the Favorites category)");
  requireMatch(src, /els\.favoriteViewBtn\.hidden\s*=/, 'syncDiscoveryActions() must hide the Favorites quick-view when there are no favorites');
}

await checkIndex();

if (issues.length > 0) {
  console.error(`Favorites check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const message of issues) {
    console.error(` - ${message}`);
  }
  process.exit(1);
}

console.log('Favorites check passed: per-card toggle, persistence, dynamic chip, filtering, and URL state all wired.');
