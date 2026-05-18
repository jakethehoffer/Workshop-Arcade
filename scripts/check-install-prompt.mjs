#!/usr/bin/env node
// PWA "Install app" prompt contract check.
//
// Browsers that support the BeforeInstallPromptEvent (Chrome desktop,
// Edge, Chrome Android) fire it once when the catalog meets the PWA
// install criteria. By default the event surfaces as a small browser
// chrome banner or hides behind the address bar menu — which most
// visitors never notice. The catalog captures the event and exposes
// an explicit header "Install" button so the install flow is
// discoverable from the page itself.
//
// This check locks in the wiring so a future inline-JS refactor can't
// silently drop the button (which would also leave a stale
// deferredInstallPrompt holding a now-orphaned event reference).
//
// Verifies (against index.html):
//   1. The header HTML declares <button id="installAppBtn" ... hidden>
//      with an aria-label naming the install action and an inline SVG
//      icon so it's visually distinguishable from the other header
//      buttons.
//   2. els.installAppBtn is mapped so the JS attaches handlers
//      without crashing.
//   3. A deferredInstallPrompt module-level variable exists to hold
//      the cached event between the browser firing it and the user
//      tapping Install.
//   4. The catalog listens for the 'beforeinstallprompt' window event,
//      calls event.preventDefault() to suppress the legacy mini-
//      infobar, and reveals the button.
//   5. The catalog listens for 'appinstalled' to hide the button (so
//      users who already installed don't see the prompt again).
//   6. The button's click handler calls .prompt() on the cached event
//      and clears the cached reference so the listener can't run a
//      stale prompt twice.

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

  // 1. Header markup
  const buttonMatch = src.match(/<button[^>]+id=["']installAppBtn["'][^>]*>[\s\S]*?<\/button>/i);
  if (!buttonMatch) {
    fail(`${path}: missing <button id="installAppBtn"> in the header bar`);
  } else {
    const buttonHtml = buttonMatch[0];
    if (!/\bhidden\b/.test(buttonHtml)) {
      fail(`${path}: installAppBtn must declare the "hidden" attribute so the button stays invisible until beforeinstallprompt fires`);
    }
    if (!/aria-label=["'][^"']*[Ii]nstall[^"']*["']/.test(buttonHtml)) {
      fail(`${path}: installAppBtn aria-label must name the install action`);
    }
    if (!/<svg[^>]*>[\s\S]*?<\/svg>/i.test(buttonHtml)) {
      fail(`${path}: installAppBtn must include an inline <svg> icon so it's visually distinguishable from the other header buttons`);
    }
  }

  // 2. els map
  if (!/installAppBtn:\s*document\.getElementById\(['"]installAppBtn['"]\)/.test(src)) {
    fail(`${path}: missing els.installAppBtn entry`);
  }

  // 3. Cached event variable
  if (!/let\s+deferredInstallPrompt\s*=\s*null/.test(src)) {
    fail(`${path}: missing "let deferredInstallPrompt = null" — needed to hold the cached BeforeInstallPromptEvent between fire and click`);
  }

  // 4. beforeinstallprompt listener with preventDefault + reveal
  if (!/window\.addEventListener\(\s*['"]beforeinstallprompt['"]/.test(src)) {
    fail(`${path}: missing window.addEventListener('beforeinstallprompt', ...) listener`);
  } else {
    const beforeMatch = src.match(/window\.addEventListener\(\s*['"]beforeinstallprompt['"][\s\S]*?\}\s*\)\s*;?/);
    const beforeBody = beforeMatch ? beforeMatch[0] : '';
    if (!/\.preventDefault\s*\(\s*\)/.test(beforeBody)) {
      fail(`${path}: beforeinstallprompt handler must call event.preventDefault() to suppress the legacy mini-infobar`);
    }
    if (!/deferredInstallPrompt\s*=\s*event\b/.test(beforeBody)) {
      fail(`${path}: beforeinstallprompt handler must stash the event on deferredInstallPrompt`);
    }
  }

  // 5. appinstalled listener
  if (!/window\.addEventListener\(\s*['"]appinstalled['"]/.test(src)) {
    fail(`${path}: missing window.addEventListener('appinstalled', ...) listener — needed so the button hides itself after a successful install`);
  }

  // 6. Click handler invokes .prompt() and clears the cached event
  if (!/installAppBtn\.addEventListener\(\s*['"]click['"]/.test(src)) {
    fail(`${path}: missing installAppBtn.addEventListener('click', ...) wiring`);
  }
  if (!/deferredInstallPrompt\.prompt\(\s*\)|prompt\s*=\s*deferredInstallPrompt[\s\S]{0,200}\bprompt\.prompt\s*\(\s*\)/.test(src)) {
    fail(`${path}: click handler must call .prompt() on the cached BeforeInstallPromptEvent`);
  }
  if (!/deferredInstallPrompt\s*=\s*null/.test(src.split('let deferredInstallPrompt = null')[1] || '')) {
    fail(`${path}: click handler must clear deferredInstallPrompt after .prompt() so a stale event can't be re-prompted`);
  }
}

await checkIndex();

if (issues.length > 0) {
  console.error(`Install prompt check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const message of issues) {
    console.error(` - ${message}`);
  }
  process.exit(1);
}

console.log('Install prompt check passed: header Install button + beforeinstallprompt capture + appinstalled cleanup all wired.');
