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
//      that OMITS default values (no &tag=All / &sort=familiar / empty q),
//      and updates the URL via history.replaceState.
//   3. The search/category/sort handlers each call syncStateToUrl
//      after updating state, and a popstate listener re-applies URL
//      state when the user uses browser back/forward.
//   4. The sort allowlist (VALID_SORT_VALUES or equivalent) only
//      accepts the four known sort modes.

import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';

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
  // 'All' and state.sort to 'familiar' (the defaults).
  if (!/state\.category\s*!==\s*['"]All['"]/.test(src)) {
    fail(`${path}: syncStateToUrl() must skip writing ?tag= when state.category === 'All' so the canonical URL stays clean`);
  }
  if (!/state\.sort\s*!==\s*['"]familiar['"]/.test(src)) {
    fail(`${path}: syncStateToUrl() must omit the default familiar sort`);
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
    fail(`${path}: missing a VALID_SORT_VALUES (or similar) allowlist that constrains ?sort= to known modes`);
  }
  if (!/['"]new['"][\s\S]*['"]az['"][\s\S]*['"]pop['"]|['"]az['"][\s\S]*['"]new['"][\s\S]*['"]pop['"]|['"]pop['"][\s\S]*['"]new['"][\s\S]*['"]az['"]|['"]az['"][\s\S]*['"]pop['"][\s\S]*['"]new['"]/.test(src)) {
    fail(`${path}: sort allowlist must enumerate 'new', 'az', and 'pop' so an attacker-controlled ?sort= can't widen the surface`);
  }
  // Exercise the shipped URL helpers and editorial sort, not just their wiring.
  try {
    const manifest = JSON.parse(await readFile(join(repoRoot, 'websites/manifest.json'), 'utf8'));
    const context = { URLSearchParams, state: { games: manifest }, els: { q: {}, sort: {} },
      location: { pathname: '/Workshop-Arcade/', search: '', hash: '#play=snake' },
      history: { replaceState(_state, _title, url) { context.writtenUrl = url; } } };
    const names = ['sortFamiliar', 'syncStateToUrl', 'applyUrlStateFromLocation'];
    const helpers = names.map(name => src.match(new RegExp(`function ${name}\\([^)]*\\)\\{[\\s\\S]*?\\n\\}`))[0]);
    const constants = ['FAMILIAR_SLUGS', 'VALID_SORT_VALUES', 'CATEGORY_ORDER']
      .map(name => src.match(new RegExp(`const ${name} = [\\s\\S]*?;`))[0]);
    runInNewContext([...constants, ...helpers].join('\n'), context);
    for (const sort of ['familiar', 'new', 'az', 'pop', 'invalid', '']) {
      context.location.search = `?q=Snake&tag=Arcade&sort=${sort}`;
      context.applyUrlStateFromLocation();
      const expected = ['new', 'az', 'pop'].includes(sort) ? sort : 'familiar';
      assert.equal(context.state.sort, expected);
      assert.equal(context.els.sort.value, expected);
      context.syncStateToUrl();
      const url = new URL(context.writtenUrl, 'https://example.test');
      assert.equal(url.searchParams.get('sort'), expected === 'familiar' ? null : expected);
      assert.equal(url.searchParams.get('q'), 'snake');
      assert.equal(url.searchParams.get('tag'), 'Arcade');
      assert.equal(url.hash, '#play=snake');
    }
    const ordered = context.sortFamiliar(manifest);
    assert.deepEqual(Array.from(ordered.slice(0, 3), g => g.slug), ['snake', '2048', 'brick-breaker']);
    assert.equal(new Set(ordered.map(g => g.slug)).size, manifest.length);
    assert.deepEqual([...ordered.map(g => g.slug)].sort(), manifest.map(g => g.slug).sort());
    assert.equal(context.sortFamiliar([]).length, 0);
  } catch (error) { fail(`${path}: URL/default-sort behavior: ${error.message}`); }
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
