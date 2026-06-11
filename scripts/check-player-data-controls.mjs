#!/usr/bin/env node
// Player data controls contract.
//
// Workshop Arcade stores favorites, recent plays, Workshop drafts, and
// sandbox-player saves locally. Players need one accessible surface to see
// those counts and clear each store without weakening the iframe sandbox or
// adding a backend.

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const path = 'index.html';
const src = await readFile(join(repoRoot, path), 'utf8');
const issues = [];

function fail(message) {
  issues.push(`${path}: ${message}`);
}

function requireMatch(pattern, description) {
  if (!pattern.test(src)) fail(`missing ${description}`);
}

function sliceBetween(start, stop) {
  const from = src.indexOf(start);
  if (from === -1) return '';
  const to = src.indexOf(stop, from + start.length);
  return to === -1 ? src.slice(from) : src.slice(from, to);
}

function requireInBlock(block, pattern, description) {
  if (!block || !pattern.test(block)) fail(`missing ${description}`);
}

for (const [id, label] of [
  ['playerDataBtn', 'footer Player data button'],
  ['playerDataModal', 'Player data modal'],
  ['playerDataClose', 'Player data close button'],
  ['playerDataStatus', 'Player data live status'],
  ['playerDataFavoritesCount', 'favorites count'],
  ['playerDataRecentCount', 'recent-play count'],
  ['playerDataDraftsCount', 'feedback-draft count'],
  ['playerDataSavesCount', 'sandbox-player save count'],
  ['clearFavoritesBtn', 'Clear favorites action'],
  ['clearRecentBtn', 'Clear recent action'],
  ['clearDraftsBtn', 'Clear drafts action'],
  ['clearGameSavesBtn', 'Clear game saves action'],
  ['clearAllPlayerDataBtn', 'guarded full reset action'],
]) {
  requireMatch(new RegExp(`id=["']${id}["']`), label);
  requireMatch(new RegExp(`${id}:\\s*document\\.getElementById\\(['"]${id}['"]\\)`), `els.${id} mapping`);
}

requireMatch(/id=["']playerDataModal["'][^>]+role=["']dialog["'][^>]+aria-modal=["']true["'][^>]+aria-labelledby=["']playerDataTitle["'][^>]+hidden/, 'hidden, accessibly named Player data dialog');
requireMatch(/All player data stays in this browser/, 'plain-language local-only privacy note');
requireMatch(/Clear all local data/, 'full local reset label');
requireMatch(/Click again to confirm/, 'two-step full reset confirmation copy');

for (const fn of [
  'playerDataSummary',
  'renderPlayerDataSummary',
  'openPlayerData',
  'closePlayerData',
  'removeStoredGameMirrors',
  'refreshCatalogAfterDataChange',
  'clearPlayerDataKind',
  'clearAllPlayerData',
  'armPlayerDataReset',
]) {
  requireMatch(new RegExp(`function\\s+${fn}\\s*\\(`), `${fn}() helper`);
}

const summaryBlock = sliceBetween('function playerDataSummary', 'function renderPlayerDataSummary');
requireInBlock(summaryBlock, /state\.favorites\.length/, 'summary reading favorite count');
requireInBlock(summaryBlock, /state\.recentPlays\.length/, 'summary reading recent-play count');
requireInBlock(summaryBlock, /state\.drafts\.filter\(isValidDraft\)\.length/, 'summary reading valid draft count');
requireInBlock(summaryBlock, /GAME_STORAGE_PREFIX/, 'summary counting sandbox-player saves by storage prefix');

const mirrorBlock = sliceBetween('function removeStoredGameMirrors', 'function refreshCatalogAfterDataChange');
requireInBlock(mirrorBlock, /key\.startsWith\(GAME_STORAGE_PREFIX\)/, 'game-save removal scoped to sandbox-player mirror keys');
requireInBlock(mirrorBlock, /localStorage\.removeItem\(key\)/, 'scoped game-save removal');

const kindBlock = sliceBetween('function clearPlayerDataKind', 'function clearAllPlayerData');
requireInBlock(kindBlock, /localStorage\.removeItem\(FAVORITES_KEY\)/, 'selective favorites removal');
requireInBlock(kindBlock, /localStorage\.removeItem\(RECENT_PLAYS_KEY\)/, 'selective recent-play removal');
requireInBlock(kindBlock, /localStorage\.removeItem\(DRAFTS_KEY\)/, 'selective draft removal');
requireInBlock(kindBlock, /removeStoredGameMirrors\(\)/, 'selective sandbox-player save removal');
requireInBlock(kindBlock, /refreshCatalogAfterDataChange\(\)/, 'catalog refresh after selective removal');

const clearAllBlock = sliceBetween('function clearAllPlayerData', 'function armPlayerDataReset');
requireInBlock(clearAllBlock, /localStorage\.clear\(\)/, 'full reset clearing all origin localStorage');
requireInBlock(clearAllBlock, /refreshCatalogAfterDataChange\(\)/, 'catalog refresh after full reset');

const armBlock = sliceBetween('function armPlayerDataReset', 'function setPlayerDataStatus');
requireInBlock(armBlock, /dataset\.confirm/, 'full reset confirmation state');
requireInBlock(armBlock, /clearAllPlayerData\(\)/, 'second activation invoking full reset');
requireInBlock(armBlock, /setTimeout\(/, 'full reset confirmation expiry');

requireMatch(/modal === els\.playerDataModal\) closePlayerData\(\)/, 'Escape closing the Player data modal through the shared focus trap');
requireMatch(/els\.playerModal\.hidden && els\.workshopModal\.hidden && els\.playerDataModal\.hidden/, 'page chrome restoration waiting for every managed modal');
requireMatch(/playerDataBtn\.addEventListener\(\s*['"]click['"][\s\S]*openPlayerData\(e\.currentTarget\)/, 'Player data button opening the modal');
requireMatch(/playerDataClose\.addEventListener\(\s*['"]click['"][\s\S]*closePlayerData\(\)/, 'Player data close button wiring');
requireMatch(/clearAllPlayerDataBtn\.addEventListener\(\s*['"]click['"][\s\S]*armPlayerDataReset\(\)/, 'guarded full reset click wiring');

if (issues.length) {
  console.error(`Player-data controls check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues) console.error(` - ${issue}`);
  process.exit(1);
}

console.log('Player-data controls check passed: local counts, selective clearing, guarded full reset, and managed-modal wiring are present.');
