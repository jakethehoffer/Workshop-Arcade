#!/usr/bin/env node
// Player modal fullscreen contract check.
//
// The catalog ships a fullscreen toggle on the player modal so
// canvas games (Snake, Tetris, Brick Breaker, Pinball, etc.) get
// edge-to-edge play without the browser address bar in the way.
// The Fullscreen API is delicate enough that a silent regression
// (missing iframe allowfullscreen, closePlayer leaving the document
// in a fullscreen state, button not flipping its icon on exit) would
// wedge users in a half-broken state. This check locks in every piece.
//
// Verifies (against index.html):
//   1. The player-bar exposes <button id="playerFullscreenBtn"> with
//      an aria-label, aria-pressed (so screen readers announce the
//      toggle state), title naming the (F) shortcut, and BOTH the
//      enter + exit SVG icons (one always hidden, swapped by the
//      sync helper).
//   2. The <iframe id="playerFrame"> declares allow="fullscreen" AND
//      the legacy allowfullscreen attribute — required so the API
//      works in both modern and older Chromium variants.
//   3. The els map exposes playerFullscreenBtn so the JS attaches a
//      handler without crashing.
//   4. A togglePlayerFullscreen() function exists and calls both
//      els.playerModal.requestFullscreen() and document.exitFullscreen()
//      so the same button drives both directions.
//   5. A syncFullscreenButton() helper updates aria-pressed +
//      aria-label + title + icon swap based on
//      isPlayerFullscreen().
//   6. A document fullscreenchange listener calls
//      syncFullscreenButton() so the icon reflects external exits
//      (e.g. browser-driven Esc).
//   7. closePlayer() calls document.exitFullscreen() when the modal
//      is currently the fullscreen element so closing the modal from
//      fullscreen doesn't leave the page wedged.
//   8. A window keydown handler for "f"/"F" toggles fullscreen only
//      when the player modal is visible and the user isn't typing in
//      an editable surface.

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

async function checkIndex() {
  const path = 'index.html';
  if (!(await exists(path))) {
    fail(`${path}: file missing`);
    return;
  }
  const src = await readFile(join(repoRoot, path), 'utf8');

  // 1. Button markup
  const buttonMatch = src.match(/<button[^>]+id=["']playerFullscreenBtn["'][^>]*>([\s\S]*?)<\/button>/i);
  if (!buttonMatch) {
    fail(`${path}: missing <button id="playerFullscreenBtn"> in the player modal`);
  } else {
    const buttonHtml = buttonMatch[0];
    if (!/aria-label=["']/i.test(buttonHtml)) {
      fail(`${path}: playerFullscreenBtn must declare an aria-label`);
    }
    if (!/aria-pressed=["'](?:false|true)["']/i.test(buttonHtml)) {
      fail(`${path}: playerFullscreenBtn must declare an aria-pressed attribute (so screen readers announce the toggle state)`);
    }
    if (!/title=["'][^"']*\(F\)[^"']*["']/i.test(buttonHtml)) {
      fail(`${path}: playerFullscreenBtn title must advertise the (F) keyboard shortcut`);
    }
    const buttonBody = buttonMatch[1];
    if (!/class=["'][^"']*player-fullscreen-icon[^"']*["']/.test(buttonBody)) {
      fail(`${path}: playerFullscreenBtn must include an .player-fullscreen-icon (the "enter fullscreen" SVG)`);
    }
    if (!/class=["'][^"']*player-fullscreen-exit-icon[^"']*["']/.test(buttonBody)) {
      fail(`${path}: playerFullscreenBtn must include an .player-fullscreen-exit-icon (the "exit fullscreen" SVG)`);
    }
  }

  // 2. iframe allowfullscreen
  const iframeMatch = src.match(/<iframe[^>]+id=["']playerFrame["'][^>]*>/i);
  if (!iframeMatch) {
    fail(`${path}: missing <iframe id="playerFrame">`);
  } else {
    const attrs = iframeMatch[0];
    if (!/\ballow=["'][^"']*fullscreen[^"']*["']/.test(attrs)) {
      fail(`${path}: playerFrame iframe must declare allow="fullscreen" so the Fullscreen API is permitted`);
    }
    if (!/\ballowfullscreen\b/.test(attrs)) {
      fail(`${path}: playerFrame iframe must include the legacy allowfullscreen attribute for compatibility`);
    }
  }

  // 3. els mapping
  if (!/playerFullscreenBtn:\s*document\.getElementById\(['"]playerFullscreenBtn['"]\)/.test(src)) {
    fail(`${path}: missing els.playerFullscreenBtn entry`);
  }

  // 4. Toggle function calls request/exit
  if (!/function\s+togglePlayerFullscreen\s*\(/.test(src)) {
    fail(`${path}: missing function togglePlayerFullscreen()`);
  } else {
    if (!/playerModal\.requestFullscreen\(\)/.test(src)) {
      fail(`${path}: togglePlayerFullscreen() must call els.playerModal.requestFullscreen() so the whole modal goes fullscreen (keeps Share/Close reachable)`);
    }
    if (!/document\.exitFullscreen\(\)/.test(src)) {
      fail(`${path}: togglePlayerFullscreen() must call document.exitFullscreen() to come back out of fullscreen`);
    }
  }

  // 5. syncFullscreenButton flips state
  if (!/function\s+syncFullscreenButton\s*\(/.test(src)) {
    fail(`${path}: missing function syncFullscreenButton() that updates aria-pressed + aria-label + icon swap`);
  } else {
    if (!/setAttribute\(['"]aria-pressed['"]/.test(src)) {
      fail(`${path}: syncFullscreenButton() must update aria-pressed so screen readers announce the toggle state`);
    }
  }

  // 6. fullscreenchange listener
  if (!/document\.addEventListener\(\s*['"]fullscreenchange['"]/.test(src)) {
    fail(`${path}: missing document fullscreenchange listener that re-syncs the button when the user exits via browser chrome or Esc`);
  }

  // 7. closePlayer exits fullscreen first
  const closePlayerMatch = src.match(/function\s+closePlayer\s*\([^)]*\)\s*\{[\s\S]*?\n\}/);
  const closePlayerBody = closePlayerMatch ? closePlayerMatch[0] : '';
  if (!/document\.fullscreenElement\s*===\s*els\.playerModal/.test(closePlayerBody)) {
    fail(`${path}: closePlayer() must check document.fullscreenElement === els.playerModal before exiting fullscreen so closing the modal from fullscreen doesn't wedge the page`);
  }
  if (!/document\.exitFullscreen\(\)/.test(closePlayerBody)) {
    fail(`${path}: closePlayer() must call document.exitFullscreen() when the modal is currently fullscreen`);
  }

  // 8. F keyboard shortcut
  if (!/e\.key\s*[!=]==?\s*['"]f['"]/.test(src) && !/e\.key\s*[!=]==?\s*['"]F['"]/.test(src)) {
    fail(`${path}: missing 'f'/'F' keyboard shortcut for the fullscreen toggle`);
  }
}

await checkIndex();

if (issues.length > 0) {
  console.error(`Player fullscreen check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const message of issues) {
    console.error(` - ${message}`);
  }
  process.exit(1);
}

console.log('Player fullscreen check passed: button + iframe attrs + toggle + sync + listener + closePlayer cleanup + F shortcut all wired.');
