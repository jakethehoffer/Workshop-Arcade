#!/usr/bin/env node
// Game deep-link + Share contract check.
//
// The catalog supports per-game deep-links (the URL hash `#play=<slug>`
// auto-opens the sandboxed player modal) and a Share button inside the
// modal that copies that same deep-link via the Web Share API with a
// clipboard fallback. This script locks in the structural pieces so
// neither path regresses silently as the inline catalog JS evolves.
//
// Verifies (against index.html):
//   1. The player modal HTML declares a #playerShare button and a
//      #playerStatus live region for transient feedback.
//   2. The els map exposes playerShare and playerStatus so the JS can
//      attach handlers without crashing.
//   3. A `function syncHash()` exists that parses /#play=([^&]+) and
//      calls openPlayer on the matching manifest entry.
//   4. syncHash is invoked at least once outside its declaration so the
//      cold-load case (visiting /#play=slug directly) works, not just
//      hashchange.
//   5. openPlayer writes the deep-link hash via history.{replace,push}State
//      so the URL stays in sync with the open game.
//   6. The Share handler uses navigator.share for the primary path and
//      navigator.clipboard.writeText as the fallback, and is registered
//      on the playerShare button via addEventListener('click', ...).

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
  const indexPath = 'index.html';
  if (!(await exists(indexPath))) {
    fail(`${indexPath}: file missing`);
    return;
  }
  const src = await readFile(join(repoRoot, indexPath), 'utf8');

  // 1. Player modal HTML pieces
  requireMatch(indexPath, src, /<button[^>]+id=["']playerShare["']/, '<button id="playerShare"> in the player modal');
  requireMatch(indexPath, src, /id=["']playerStatus["'][^>]*aria-live=["']polite["']/, '#playerStatus live region (aria-live="polite") next to the Share button');

  // 2. els map exposure
  requireMatch(indexPath, src, /playerShare:\s*document\.getElementById\(['"]playerShare['"]\)/, 'els.playerShare entry');
  requireMatch(indexPath, src, /playerStatus:\s*document\.getElementById\(['"]playerStatus['"]\)/, 'els.playerStatus entry');

  // 3. syncHash function
  if (!/function\s+syncHash\s*\(/.test(src)) {
    fail(`${indexPath}: missing function syncHash() that handles #play= deep-links`);
  } else {
    if (!/location\.hash\.match\(\s*\/play=\(/.test(src)) {
      fail(`${indexPath}: syncHash() must parse location.hash with /play=([^&]+)/`);
    }
  }

  // 4. syncHash called at least once OUTSIDE its declaration so cold-load
  //    visitors of /#play=slug actually get the modal. Count occurrences:
  //    one is the declaration, one is the hashchange listener arg, and one
  //    must be the explicit call site in the manifest-load IIFE.
  const callMatches = src.match(/\bsyncHash\b/g) || [];
  if (callMatches.length < 3) {
    fail(`${indexPath}: syncHash must be wired in at least three places (declaration + hashchange listener + initial-load call); found ${callMatches.length} reference(s)`);
  }

  // 5. openPlayer keeps the URL hash in sync
  if (!/history\.(replaceState|pushState)\([^)]*play=/.test(src)) {
    fail(`${indexPath}: openPlayer must call history.replaceState or history.pushState with a "play=" hash so the URL reflects the open game`);
  }

  // 6. Share handler structure
  if (!/navigator\.share/.test(src)) {
    fail(`${indexPath}: share handler must call navigator.share for the primary share path`);
  }
  if (!/navigator\.clipboard\.writeText/.test(src)) {
    fail(`${indexPath}: share handler must fall back to navigator.clipboard.writeText when Web Share is unavailable`);
  }
  if (!/playerShare\.addEventListener\(\s*['"]click['"]/.test(src)) {
    fail(`${indexPath}: missing playerShare.addEventListener('click', ...) to wire the Share button`);
  }
}

await checkIndex();

if (issues.length > 0) {
  console.error(`Deep-link / Share check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const message of issues) {
    console.error(` - ${message}`);
  }
  process.exit(1);
}

console.log('Deep-link / Share check passed: #play= deep-links and Share button wiring both intact.');
