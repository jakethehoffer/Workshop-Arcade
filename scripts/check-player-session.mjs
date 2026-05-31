#!/usr/bin/env node
// Player session continuity contract.
//
// The catalog player should not be a dead end once a game opens. This fast
// check locks in the static wiring for Save, Next, and More-like-this controls
// without launching a browser; Playwright smoke tests exercise the runtime path.

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const issues = [];

function fail(message) {
  issues.push(message);
}

function requireMatch(path, src, pattern, label) {
  if (!pattern.test(src)) {
    fail(`${path}: missing ${label}`);
  }
}

const path = 'index.html';
const src = await readFile(join(repoRoot, path), 'utf8');

for (const [id, label] of [
  ['sessionRail', 'Continue playing session rail'],
  ['sessionRailList', 'session rail item list'],
  ['playerSave', 'Save button in the player modal'],
  ['playerNext', 'Next button in the player modal'],
  ['playerMore', 'More button in the player modal'],
  ['playerRelatedPanel', 'related-games panel'],
  ['playerRelatedList', 'related-games list'],
]) {
  requireMatch(path, src, new RegExp(`id=["']${id}["']`), label);
  requireMatch(path, src, new RegExp(`${id}:\\s*document\\.getElementById\\(['"]${id}['"]\\)`), `els.${id} mapping`);
}

requireMatch(path, src, /id=["']playerSave["'][^>]+aria-pressed=["']false["']/, 'playerSave aria-pressed state');
requireMatch(path, src, /id=["']playerMore["'][^>]+aria-expanded=["']false["'][^>]+aria-controls=["']playerRelatedPanel["']/, 'playerMore aria-expanded/controls wiring');
requireMatch(path, src, /id=["']playerRelatedPanel["'][^>]+aria-labelledby=["']playerRelatedTitle["'][^>]+hidden/, 'hidden related panel with accessible name');
requireMatch(path, src, /id=["']sessionRail["'][^>]+aria-labelledby=["']sessionRailTitle["'][^>]+hidden/, 'hidden Continue playing rail with accessible name');
requireMatch(path, src, /id=["']catalogDiscovery["'][\s\S]*id=["']sessionRail["'][\s\S]*id=["']grid["']/, 'Continue playing rail between discovery shortcuts and the catalog grid');

for (const fn of [
  'firstGameFromSlugs',
  'buildSessionRailItems',
  'makeSessionRailItem',
  'renderSessionRail',
  'sharedTagCount',
  'rankedRelatedGames',
  'nextSessionGame',
  'renderRelatedPanel',
  'toggleRelatedPanel',
  'syncPlayerSaveButton',
  'syncPlayerSessionControls',
]) {
  requireMatch(path, src, new RegExp(`function\\s+${fn}\\s*\\(`), `${fn}() helper`);
}

requireMatch(path, src, /state\.activeGameSlug/, 'active player slug state');
requireMatch(path, src, /state\.recentPlays[\s\S]*state\.favorites/, 'session rail reuses existing recent/favorites state');
requireMatch(path, src, /if\(!recentGame && !favoriteGame\) return \[\]/, 'session rail stays hidden for first-time visitors without recent or favorite state');
requireMatch(path, src, /action:\s*['"]Resume['"][\s\S]*action:\s*['"]Saved['"][\s\S]*action:\s*['"]Next for you['"]/, 'session rail exposes Resume, Saved, and Next for you slots');
requireMatch(path, src, /const nextPool = recentGame \? rankedRelatedGames\(recentGame\) : sortPopular\(state\.games\)/, 'session rail next slot ranks from the most recent game or popular fallback');
requireMatch(path, src, /nextPool\.find\(g => g && !shown\.has\(g\.slug\)\)/, 'session rail next slot excludes already-shown games');
requireMatch(path, src, /return items\.slice\(0,\s*3\)/, 'session rail is capped at three actions');
requireMatch(path, src, /els\.sessionRail\.hidden\s*=\s*items\.length\s*===\s*0/, 'session rail hides when it has no actions');
requireMatch(path, src, /sessionRailList\.addEventListener\(\s*['"]click['"][\s\S]*openPlayer\(game,\s*button\)/, 'session rail clicks reuse openPlayer()');
requireMatch(path, src, /renderSessionRail\(\)/, 'render path refreshes the session rail');
requireMatch(path, src, /state\.filtered[\s\S]*findIndex\([\s\S]*current\.slug[\s\S]*filtered\[\(index \+ 1\) % filtered\.length\]/, 'Next candidate prefers the current filtered list');
requireMatch(path, src, /sharedTagCount\(current,\s*b\)\s*-\s*sharedTagCount\(current,\s*a\)/, 'related ranking by shared tags');
requireMatch(path, src, /\(b\.popularity \|\| 0\)\s*-\s*\(a\.popularity \|\| 0\)/, 'related ranking popularity tiebreak');
requireMatch(path, src, /compareNewest\(a,\s*b\)/, 'related ranking newest/title tiebreak');
requireMatch(path, src, /filter\(g => g && g\.slug !== current\.slug\)/, 'related candidates exclude the current game');
requireMatch(path, src, /rankedRelatedGames\(current\)\.slice\(0,\s*4\)/, 'related panel capped at four games');

requireMatch(path, src, /toggleFavorite\(g\.slug\)/, 'player Save reuses existing favorites toggle');
requireMatch(path, src, /pushRecentPlay\(g\.slug\)/, 'openPlayer continues updating recent plays');
requireMatch(path, src, /syncPlayerSessionControls\(g\)/, 'openPlayer refreshes session controls');
requireMatch(path, src, /history\.replaceState\(null,\s*'',\s*`#play=\$\{encodeURIComponent\(g\.slug\)\}`\)/, 'openPlayer keeps #play deep link in sync');
requireMatch(path, src, /playerSave\.addEventListener\(\s*['"]click['"]/, 'playerSave click handler');
requireMatch(path, src, /playerNext\.addEventListener\(\s*['"]click['"]/, 'playerNext click handler');
requireMatch(path, src, /playerMore\.addEventListener\(\s*['"]click['"]/, 'playerMore click handler');
requireMatch(path, src, /playerRelatedList\.addEventListener\(\s*['"]click['"]/, 'playerRelatedList click handler');

requireMatch(path, src, /\.player-actions\{[^}]*flex-wrap:wrap/, 'wrapping player actions for narrow viewports');
requireMatch(path, src, /@media \(max-width:\s*560px\)[\s\S]*\.player-related-list\{grid-template-columns:1fr 1fr\}/, 'compact mobile related panel grid');
requireMatch(path, src, /@media \(max-width:\s*820px\)[\s\S]*\.session-rail-list\{grid-template-columns:1fr\}/, 'compact mobile session rail grid');
requireMatch(path, src, /\.player-related\[hidden\]\{display:none\}/, 'collapsed related panel stays out of the iframe area');
requireMatch(path, src, /\.session-rail\[hidden\]\{display:none\}/, 'empty session rail stays out of the first-visit catalog');

if (issues.length) {
  console.error(`Player-session check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues) {
    console.error(` - ${issue}`);
  }
  process.exit(1);
}

console.log('Player-session check passed: Continue rail plus Save, Next, and More-like-this controls are wired to deterministic player-session state.');
