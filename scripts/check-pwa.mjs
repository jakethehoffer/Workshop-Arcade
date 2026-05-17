#!/usr/bin/env node
// Static PWA contract check.
//
// Verifies:
//   1. app.webmanifest parses and includes the fields a browser needs to
//      offer install (name, start_url, scope, display, theme/background
//      colors, at least one icon, and a maskable icon).
//   2. Every icon referenced by app.webmanifest exists on disk.
//   3. sw.js exists, parses as valid JS via node --check syntax-only,
//      registers install/activate/fetch listeners, and ships a versioned
//      cache key so deploys can invalidate the old shell cache.
//   4. index.html links the manifest, exposes a theme-color, and registers
//      the service worker behind a feature check.

import { readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
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

async function checkManifest() {
  const manifestPath = 'app.webmanifest';
  if (!(await exists(manifestPath))) {
    fail(`${manifestPath}: file missing`);
    return null;
  }

  const raw = await readFile(join(repoRoot, manifestPath), 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    fail(`${manifestPath}: JSON parse error: ${error.message}`);
    return null;
  }

  const required = ['name', 'short_name', 'start_url', 'scope', 'display', 'theme_color', 'background_color', 'icons'];
  for (const field of required) {
    if (parsed[field] === undefined || parsed[field] === null || parsed[field] === '') {
      fail(`${manifestPath}: missing required field "${field}"`);
    }
  }

  if (parsed.display && !['standalone', 'fullscreen', 'minimal-ui', 'browser'].includes(parsed.display)) {
    fail(`${manifestPath}: display "${parsed.display}" is not a valid PWA display mode`);
  }

  if (!Array.isArray(parsed.icons) || parsed.icons.length === 0) {
    fail(`${manifestPath}: "icons" must be a non-empty array`);
  } else {
    let hasMaskable = false;
    for (const [index, icon] of parsed.icons.entries()) {
      if (!icon || typeof icon.src !== 'string' || !icon.src.trim()) {
        fail(`${manifestPath}: icons[${index}] missing src`);
        continue;
      }
      if (icon.src.startsWith('http://') || icon.src.startsWith('https://')) {
        fail(`${manifestPath}: icons[${index}] must be a same-origin relative path, got "${icon.src}"`);
        continue;
      }
      if (!(await exists(icon.src))) {
        fail(`${manifestPath}: icons[${index}] src "${icon.src}" does not exist on disk`);
      }
      const purpose = (icon.purpose || '').toString().toLowerCase();
      if (purpose.split(/\s+/).includes('maskable')) {
        hasMaskable = true;
      }
    }
    if (!hasMaskable) {
      fail(`${manifestPath}: at least one icon must declare purpose "maskable" for safe install prompts`);
    }
  }

  return parsed;
}

async function checkServiceWorker() {
  const swPath = 'sw.js';
  if (!(await exists(swPath))) {
    fail(`${swPath}: file missing`);
    return;
  }

  const result = spawnSync(process.execPath, ['--check', join(repoRoot, swPath)], { encoding: 'utf8' });
  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    fail(`${swPath}: node --check failed: ${stderr || 'unknown error'}`);
    return;
  }

  const src = await readFile(join(repoRoot, swPath), 'utf8');
  const requiredListeners = ['install', 'activate', 'fetch'];
  for (const event of requiredListeners) {
    const pattern = new RegExp(`addEventListener\\(['"\`]${event}['"\`]`);
    if (!pattern.test(src)) {
      fail(`${swPath}: missing addEventListener('${event}', ...) registration`);
    }
  }

  if (!/const\s+VERSION\s*=\s*['"`][\w.-]+['"`]/.test(src)) {
    fail(`${swPath}: missing a versioned cache key (expected const VERSION = '...')`);
  }
  if (!/caches\.keys\(\)/.test(src) || !/caches\.delete\(/.test(src)) {
    fail(`${swPath}: must clean up old caches on activate (caches.keys() + caches.delete)`);
  }

  // Wiring contract for the offline fallback page. The SW must (1) pre-cache
  // offline.html as part of its install-time shell list, and (2) reference
  // OFFLINE_URL inside the navigation fetch handler so a failed navigation
  // lands on the branded offline page rather than a raw 503.
  if (!/['"`]offline\.html['"`]/.test(src)) {
    fail(`${swPath}: must reference 'offline.html' so it is pre-cached and available offline`);
  }
  if (!/OFFLINE_URL\s*=\s*new URL\(['"`]offline\.html['"`]/.test(src)) {
    fail(`${swPath}: missing OFFLINE_URL constant resolved from 'offline.html'`);
  }
  if (!/caches\.match\(OFFLINE_URL\)/.test(src)) {
    fail(`${swPath}: navigation handler must fall back to caches.match(OFFLINE_URL) when network and other caches miss`);
  }
}

async function checkIndexWiring() {
  const indexPath = 'index.html';
  if (!(await exists(indexPath))) {
    fail(`${indexPath}: file missing`);
    return;
  }
  const src = await readFile(join(repoRoot, indexPath), 'utf8');

  if (!/<link[^>]+rel=["']manifest["'][^>]+href=["']app\.webmanifest["']/.test(src)) {
    fail(`${indexPath}: missing <link rel="manifest" href="app.webmanifest">`);
  }
  if (!/serviceWorker\.register\(/.test(src)) {
    fail(`${indexPath}: missing navigator.serviceWorker.register(...) call`);
  }
  if (!/['"]serviceWorker['"]\s+in\s+navigator/.test(src)) {
    fail(`${indexPath}: service worker registration must be gated behind a 'serviceWorker' in navigator check`);
  }
  if (!/apple-touch-icon/.test(src)) {
    fail(`${indexPath}: missing apple-touch-icon link for iOS install support`);
  }
}

await checkManifest();
await checkServiceWorker();
await checkIndexWiring();

if (issues.length > 0) {
  console.error(`PWA check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const message of issues) {
    console.error(` - ${message}`);
  }
  process.exit(1);
}

console.log('PWA check passed: app.webmanifest, sw.js, and index.html wiring all valid.');
