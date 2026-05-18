#!/usr/bin/env node
// Service-worker update toast contract check.
//
// The catalog ships a PWA service worker that updates its versioned
// shell cache whenever a new release lands. The browser fetches the
// new sw.js automatically, but the open tab continues running with
// the old HTML+JS already rendered — without a visible update prompt
// the user has no idea a newer version is available.
//
// This check locks in the small toast that surfaces when the
// registration's `updatefound` event fires alongside an existing
// `navigator.serviceWorker.controller` (the "this is an update, not
// a first install" signal) so PWA visitors aren't silently stuck on
// stale cache after a deploy.
//
// Verifies (against index.html):
//   1. Toast markup: <aside id="swUpdateToast" role="status"
//      aria-live="polite" hidden> with a Reload button
//      (#swUpdateReloadBtn) and a Dismiss button (#swUpdateDismissBtn).
//   2. CSS for .sw-update-toast (positioned, hidden by default).
//   3. SW registration uses the await result to attach an
//      `updatefound` listener.
//   4. The updatefound handler watches `installing.state === 'installed'`
//      and gates the toast on `navigator.serviceWorker.controller`
//      so the toast only fires for updates, not first installs.
//   5. The Reload button triggers window.location.reload().

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

  // 1. Toast markup
  const toastMatch = src.match(/<aside[^>]+id=["']swUpdateToast["'][^>]*>([\s\S]*?)<\/aside>/i);
  if (!toastMatch) {
    fail(`${path}: missing <aside id="swUpdateToast"> for the SW update notification`);
  } else {
    const toastHtml = toastMatch[0];
    if (!/role=["']status["']/i.test(toastHtml)) {
      fail(`${path}: swUpdateToast must declare role="status" so assistive tech announces it`);
    }
    if (!/aria-live=["']polite["']/i.test(toastHtml)) {
      fail(`${path}: swUpdateToast must declare aria-live="polite" so the update message is announced without interrupting`);
    }
    if (!/\bhidden\b/.test(toastHtml)) {
      fail(`${path}: swUpdateToast must start hidden so it only appears when an update is actually available`);
    }
    if (!/id=["']swUpdateReloadBtn["']/i.test(toastHtml)) {
      fail(`${path}: swUpdateToast must include a Reload button (#swUpdateReloadBtn)`);
    }
    if (!/id=["']swUpdateDismissBtn["']/i.test(toastHtml)) {
      fail(`${path}: swUpdateToast must include a Dismiss button (#swUpdateDismissBtn)`);
    }
  }

  // 2. CSS rule for .sw-update-toast positioned and hidden by default
  if (!/\.sw-update-toast\b[^}]*position\s*:\s*fixed/i.test(src)) {
    fail(`${path}: missing .sw-update-toast CSS rule with position: fixed (the toast must overlay the catalog without disrupting layout)`);
  }
  if (!/\.sw-update-toast\[hidden\]\s*\{\s*display\s*:\s*none/i.test(src)) {
    fail(`${path}: missing .sw-update-toast[hidden] { display: none } rule so the toast respects the hidden attribute`);
  }

  // 3. Registration awaits the result + 4. updatefound + controller gate
  if (!/navigator\.serviceWorker\.register\(['"]sw\.js['"]\)/.test(src)) {
    fail(`${path}: missing navigator.serviceWorker.register('sw.js') call`);
  }
  if (!/registration\.addEventListener\(['"]updatefound['"]/.test(src)) {
    fail(`${path}: registration must add an 'updatefound' listener so the page can react when a new SW is being installed`);
  }
  if (!/installing\.addEventListener\(['"]statechange['"]/.test(src)) {
    fail(`${path}: updatefound handler must add a 'statechange' listener on the installing worker`);
  }
  if (!/installing\.state\s*===\s*['"]installed['"]/.test(src)) {
    fail(`${path}: statechange handler must check installing.state === 'installed' so the toast fires once the new SW is ready`);
  }
  if (!/navigator\.serviceWorker\.controller/.test(src)) {
    fail(`${path}: the toast must be gated on navigator.serviceWorker.controller so first-time installs do not trigger an "update" notice`);
  }

  // 5. Reload action — the Reload button must trigger window.location.reload(),
  //    regardless of whether the JS attaches the handler via the literal id
  //    or via a captured local reference.
  if (!/window\.location\.reload\(\)/.test(src)) {
    fail(`${path}: Reload button handler must call window.location.reload() to swap to the new version`);
  }
  const hasReloadWiring = /swUpdateReloadBtn[^\n]*addEventListener\(\s*['"]click['"]/.test(src)
    || /(?:const|let|var)\s+\w*[rR]eloadBtn\s*=\s*document\.getElementById\(['"]swUpdateReloadBtn['"]\)[\s\S]*?\w*[rR]eloadBtn\.addEventListener\(\s*['"]click['"]/.test(src);
  if (!hasReloadWiring) {
    fail(`${path}: missing click wiring on #swUpdateReloadBtn (either swUpdateReloadBtn.addEventListener('click', ...) or via a captured reference)`);
  }
}

await checkIndex();

if (issues.length > 0) {
  console.error(`SW update toast check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const message of issues) {
    console.error(` - ${message}`);
  }
  process.exit(1);
}

console.log('SW update toast check passed: toast markup, CSS, update detection, and Reload wiring all in place.');
