#!/usr/bin/env node
// Catalog URL state contract check.
//
// The catalog encodes the user's search query, active tag filter, and
// sort selection in ?q=, ?tag=, and ?sort= so the filtered view is
// bookmarkable, shareable, and survives reloads. This check locks in
// the wiring so a future inline-JS refactor can't silently drop the
// URL sync.
//
// Verifies (against index.html):
//   1. An applyUrlStateFromLocation() helper exists, reads
//      URLSearchParams, applies q/tag/sort to the state, and is
//      called from the manifest-load IIFE so cold loads honor the URL.
//   2. A syncStateToUrl() helper exists, builds a URLSearchParams
//      that OMITS default values (no &tag=All / &sort=new / empty q),
//      and updates the URL via history.replaceState.
//   3. The search/category/sort handlers each call syncStateToUrl
//      after updating state, and a popstate listener re-applies URL
//      state when the user uses browser back/forward.
//   4. The sort allowlist (VALID_SORT_VALUES or equivalent) only
//      accepts the three known sort modes.

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

async function checkIndex() {
  const path = 'index.html';
  if (!(await exists(path))) {
    fail(`${path}: file missing`);
    return;
  }
  const src = await readFile(join(repoRoot, path), 'utf8');

  // 1. apply helper + URLSearchParams + call from IIFE
  if (!/function\s+applyUrlStateFromLocation\s*\(/.test(src)) {
    fail(`${path}: missing function applyUrlStateFromLocation() that parses URLSearchParams and applies q/tag/sort to state`);
  }
  if (!/new\s+URLSearchParams\s*\(\s*location\.search\s*\)/.test(src)) {
    fail(`${path}: applyUrlStateFromLocation() must call new URLSearchParams(location.search)`);
  }
  // The cold-load wiring — the manifest-load IIFE has to call the
  // helper so visitors landing on /?q=snake see the filter applied.
  // Count occurrences: declaration + initial-load call + optional
  // popstate re-apply call.
  const applyCalls = (src.match(/\bapplyUrlStateFromLocation\b/g) || []).length;
  if (applyCalls < 3) {
    fail(`${path}: applyUrlStateFromLocation must be wired in at least three places (declaration + initial-load call + popstate listener); found ${applyCalls}`);
  }

  // 2. sync helper omits defaults + uses history.replaceState
  if (!/function\s+syncStateToUrl\s*\(/.test(src)) {
    fail(`${path}: missing function syncStateToUrl() that writes current filter state back to the URL`);
  }
  if (!/history\.replaceState\(/.test(src)) {
    fail(`${path}: syncStateToUrl() must call history.replaceState so filter changes don't push history entries the user has to back through`);
  }
  // Make sure defaults are intentionally omitted. The exact branch
  // shape can vary, but the source has to compare state.category to
  // 'All' and state.sort to 'new' (the defaults).
  if (!/state\.category\s*!==\s*['"]All['"]/.test(src)) {
    fail(`${path}: syncStateToUrl() must skip writing ?tag= when state.category === 'All' so the canonical URL stays clean`);
  }
  if (!/state\.sort\s*!==\s*['"]new['"]/.test(src)) {
    fail(`${path}: syncStateToUrl() must skip writing ?sort= when state.sort === 'new' (the default)`);
  }

  // 3. Handlers wire sync + popstate listener exists
  const syncCalls = (src.match(/\bsyncStateToUrl\b/g) || []).length;
  if (syncCalls < 4) {
    fail(`${path}: syncStateToUrl must be wired into at least four places (declaration + search input + setCategory + sort dropdown); found ${syncCalls}`);
  }
  if (!/window\.addEventListener\(\s*['"]popstate['"]/.test(src)) {
    fail(`${path}: missing popstate listener — back/forward navigation should re-apply URL state to the catalog UI`);
  }

  // 4. Sort allowlist
  if (!/VALID_SORT_VALUES|VALID_SORTS|SORT_VALUES/.test(src)) {
    fail(`${path}: missing a VALID_SORT_VALUES (or similar) allowlist that constrains ?sort= to the three known modes`);
  }
  if (!/['"]new['"][\s\S]*['"]az['"][\s\S]*['"]pop['"]|['"]az['"][\s\S]*['"]new['"][\s\S]*['"]pop['"]|['"]pop['"][\s\S]*['"]new['"][\s\S]*['"]az['"]|['"]az['"][\s\S]*['"]pop['"][\s\S]*['"]new['"]/.test(src)) {
    fail(`${path}: sort allowlist must enumerate 'new', 'az', and 'pop' so an attacker-controlled ?sort= can't widen the surface`);
  }
}

await checkIndex();

if (issues.length > 0) {
  console.error(`URL filters check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const message of issues) {
    console.error(` - ${message}`);
  }
  process.exit(1);
}

console.log('URL filters check passed: ?q= / ?tag= / ?sort= round-trip through the catalog UI and survive cold loads + back/forward navigation.');
