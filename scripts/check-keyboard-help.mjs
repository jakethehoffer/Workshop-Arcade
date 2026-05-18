#!/usr/bin/env node
// Keyboard shortcuts help-overlay contract check.
//
// The catalog advertises the (R) random shortcut on the Random
// button's aria-label, (Ctrl+/) in the search placeholder, and Esc
// elsewhere, but those hints were scattered and easy to miss. A
// dedicated help overlay opened by clicking the header "?" button or
// pressing the "?" key keeps the discovery surface in one place.
//
// Verifies (against index.html):
//   1. Header markup exposes <button id="helpBtn"> with an aria-label
//      naming the "?" shortcut and a recognizable "?" glyph.
//   2. A native <dialog id="helpDialog"> exists with a heading, a
//      <dl class="help-list"> documenting each shortcut, and at
//      minimum advertises ?, R, Ctrl+/, and Esc.
//   3. The els map exposes both helpBtn and helpDialog.
//   4. JS wires a toggleHelpDialog() that calls showModal()/close(),
//      a button click handler, and a window keydown listener that
//      accepts both "?" and Shift+"/", skips while typing in an
//      INPUT/TEXTAREA/contentEditable surface, and ignores modifier
//      combos so it doesn't collide with browser shortcuts.

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

  // 1. Help button
  const buttonMatch = src.match(/<button[^>]+id=["']helpBtn["'][^>]*>([\s\S]*?)<\/button>/i);
  if (!buttonMatch) {
    fail(`${path}: missing <button id="helpBtn"> in the header bar`);
  } else {
    const buttonHtml = buttonMatch[0];
    if (!/aria-label=["'][^"']*\?[^"']*["']/i.test(buttonHtml)) {
      fail(`${path}: helpBtn aria-label must mention the "?" keyboard shortcut`);
    }
    const buttonBody = buttonMatch[1].trim();
    if (!/\?/.test(buttonBody) && !/<svg[\s\S]*<\/svg>/i.test(buttonBody)) {
      fail(`${path}: helpBtn must render a visible "?" glyph or an inline SVG icon`);
    }
  }

  // 2. Help dialog
  const dialogMatch = src.match(/<dialog[^>]+id=["']helpDialog["'][^>]*>([\s\S]*?)<\/dialog>/i);
  if (!dialogMatch) {
    fail(`${path}: missing <dialog id="helpDialog"> for the keyboard-shortcuts overlay`);
  } else {
    const dialogHtml = dialogMatch[1];
    if (!/<dl[^>]*class=["'][^"']*help-list[^"']*["']/i.test(dialogHtml)) {
      fail(`${path}: helpDialog must include <dl class="help-list"> documenting the shortcuts`);
    }
    const requiredShortcuts = [
      { token: '?', label: '"?" toggle entry' },
      { token: 'R', label: '"R" random-game entry' },
      { token: 'Ctrl', label: '"Ctrl" search shortcut entry' },
      { token: 'Esc', label: '"Esc" close entry' },
    ];
    for (const { token, label } of requiredShortcuts) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`<kbd[^>]*>\\s*${escaped}\\s*<\\/kbd>`, 'i');
      if (!pattern.test(dialogHtml)) {
        fail(`${path}: helpDialog must include a <kbd>${token}</kbd> ${label}`);
      }
    }
  }

  // 3. els mappings
  if (!/helpBtn:\s*document\.getElementById\(['"]helpBtn['"]\)/.test(src)) {
    fail(`${path}: missing els.helpBtn entry`);
  }
  if (!/helpDialog:\s*document\.getElementById\(['"]helpDialog['"]\)/.test(src)) {
    fail(`${path}: missing els.helpDialog entry`);
  }

  // 4. Toggle function + click handler + key handler
  if (!/function\s+toggleHelpDialog\s*\(/.test(src)) {
    fail(`${path}: missing function toggleHelpDialog() that opens or closes the dialog`);
  } else {
    if (!/\.showModal\(\)/.test(src) || !/\.close\(\)/.test(src)) {
      fail(`${path}: toggleHelpDialog() must call dialog.showModal() and dialog.close()`);
    }
  }
  if (!/helpBtn\.addEventListener\(\s*['"]click['"]/.test(src)) {
    fail(`${path}: missing helpBtn.addEventListener('click', ...) wiring`);
  }
  // "?" key handler — should accept both '?' and Shift+'/' so different
  // keyboard layouts work, and skip modifier-key combos.
  if (!/e\.key\s*[!=]==?\s*['"]\?['"]/.test(src)) {
    fail(`${path}: missing keyboard handler that accepts e.key === '?'`);
  }
  if (!/e\.key\s*[!=]==?\s*['"]\/['"][^\n]*e\.shiftKey/.test(src) && !/e\.shiftKey[^\n]*e\.key\s*[!=]==?\s*['"]\/['"]/.test(src)) {
    fail(`${path}: keyboard handler should also accept Shift+/ so layouts that require Shift produce a working "?" shortcut`);
  }
  if (!/isTypingInEditableSurface\s*\(/.test(src) && !/INPUT[^|]*\|\|[^|]*TEXTAREA/i.test(src)) {
    fail(`${path}: "?" key handler must skip when an INPUT/TEXTAREA/contentEditable surface has focus`);
  }
}

await checkIndex();

if (issues.length > 0) {
  console.error(`Keyboard help check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const message of issues) {
    console.error(` - ${message}`);
  }
  process.exit(1);
}

console.log('Keyboard help check passed: header button, help <dialog>, shortcut list, and "?" key handler all wired.');
