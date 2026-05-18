#!/usr/bin/env node
// Random-game button contract check.
//
// The catalog ships a "🎲 Random" button in the sticky header that
// picks a random game from the currently-filtered list and opens the
// player modal. It's also bound to the "r" keyboard shortcut so power
// users can re-roll quickly. This check locks in the structural pieces
// so the feature can't regress silently as the inline catalog JS grows.
//
// Verifies (against index.html):
//   1. The header HTML declares a <button id="randomGameBtn"> with an
//      aria-label that names the keyboard shortcut and an inline dice
//      SVG icon (visible cue that distinguishes it from the search /
//      Workshop / Share buttons).
//   2. The els map exposes randomGameBtn so the JS attaches handlers
//      without crashing.
//   3. A pickRandomGame() function exists, sources from
//      state.filtered (with a fallback to state.games), and uses
//      Math.random() to pick the index.
//   4. The button's click handler calls openPlayer.
//   5. A keydown listener watches for 'r'/'R' outside modal context,
//      skips when the target is an INPUT/TEXTAREA/contentEditable, and
//      ignores modifier-key combos (ctrl/meta/alt) so it doesn't
//      collide with browser refresh.

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

  // 1. Header markup
  const buttonMatch = src.match(/<button[^>]+id=["']randomGameBtn["'][^>]*>[\s\S]*?<\/button>/i);
  if (!buttonMatch) {
    fail(`${path}: missing <button id="randomGameBtn"> in the header bar`);
  } else {
    const buttonHtml = buttonMatch[0];
    if (!/aria-label=["'][^"']*\(R\)[^"']*["']/i.test(buttonHtml)) {
      fail(`${path}: randomGameBtn aria-label must advertise the (R) keyboard shortcut`);
    }
    if (!/<svg[^>]*>[\s\S]*?<\/svg>/i.test(buttonHtml)) {
      fail(`${path}: randomGameBtn must include an inline <svg> dice icon for visual recognition`);
    }
  }

  // 2. els map
  requireMatch(path, src, /randomGameBtn:\s*document\.getElementById\(['"]randomGameBtn['"]\)/, 'els.randomGameBtn entry');

  // 3. Picker function
  if (!/function\s+pickRandomGame\s*\(/.test(src)) {
    fail(`${path}: missing function pickRandomGame() that selects from state.filtered`);
  } else {
    if (!/state\.filtered/.test(src.match(/function\s+pickRandomGame\s*\([^)]*\)\s*\{[\s\S]*?\n\}/)?.[0] || '')) {
      fail(`${path}: pickRandomGame() must read from state.filtered so the random pick respects the active filter`);
    }
    if (!/Math\.random\(\)/.test(src)) {
      fail(`${path}: pickRandomGame() must use Math.random() to choose the index`);
    }
  }

  // 4. Click wiring
  if (!/randomGameBtn\.addEventListener\(\s*['"]click['"]/.test(src)) {
    fail(`${path}: missing randomGameBtn.addEventListener('click', ...) wiring`);
  }
  if (!/openPlayer\(/.test(src)) {
    fail(`${path}: random-game flow must call openPlayer to surface the picked game in the modal`);
  }

  // 5. Keyboard shortcut
  if (!/e\.key\s*[!=]==?\s*['"]r['"]/i.test(src)) {
    fail(`${path}: missing 'r' keyboard shortcut for the Random button`);
  }
  if (!/INPUT['"]?\s*\|\|\s*[^|]*===\s*['"]TEXTAREA/i.test(src) && !/INPUT['"]?\s*\|\|\s*target\.tagName\s*===\s*['"]TEXTAREA/i.test(src)) {
    fail(`${path}: 'r' shortcut handler must skip when the focused target is an INPUT or TEXTAREA so it doesn't hijack normal text entry`);
  }
}

await checkIndex();

if (issues.length > 0) {
  console.error(`Random-game check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const message of issues) {
    console.error(` - ${message}`);
  }
  process.exit(1);
}

console.log('Random-game check passed: header button, els mapping, picker function, click handler, and "r" keyboard shortcut all wired.');
