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

import { createHash } from 'node:crypto';
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

async function expectedShellRevision(coverPrefetchCount) {
  const manifestRaw = await readFile(join(repoRoot, 'websites/manifest.json'), 'utf8');
  const manifest = JSON.parse(manifestRaw);
  const coverFiles = Array.isArray(manifest)
    ? [...manifest]
      .sort((a, b) => String(b?.addedAt || '').localeCompare(String(a?.addedAt || '')))
      .slice(0, coverPrefetchCount)
      .map((game) => game?.cover)
      .filter((cover) => typeof cover === 'string' && cover.length > 0)
    : [];
  const shellFiles = [
    'index.html',
    'websites/manifest.json',
    'covers/app-icon.svg',
    'app.webmanifest',
    'offline.html',
    '404.html',
    ...coverFiles,
  ];
  const hash = createHash('sha256');

  for (const relative of shellFiles) {
    const content = await readFile(join(repoRoot, relative), 'utf8');
    hash.update(relative);
    hash.update('\0');
    hash.update(content.replace(/\r\n?/g, '\n'));
    hash.update('\0');
  }

  return `shell-${hash.digest('hex').slice(0, 12)}`;
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

  const versionMatch = src.match(/const\s+VERSION\s*=\s*['"`]([^'"`]+)['"`]/);
  if (!versionMatch) {
    fail(`${swPath}: missing a versioned cache key (expected const VERSION = '...')`);
  }
  const revisionMatch = src.match(/const\s+SHELL_REVISION\s*=\s*['"`]([^'"`]+)['"`]/);
  if (!revisionMatch) {
    fail(`${swPath}: missing SHELL_REVISION constant for deterministic shell cache freshness`);
  } else if (!/^shell-[a-f0-9]{12}$/.test(revisionMatch[1])) {
    fail(`${swPath}: SHELL_REVISION must look like shell-<12 hex chars>, got "${revisionMatch[1]}"`);
  } else if (versionMatch && !versionMatch[1].includes(revisionMatch[1])) {
    fail(`${swPath}: VERSION "${versionMatch[1]}" must include SHELL_REVISION "${revisionMatch[1]}"`);
  }
  if (!/caches\.keys\(\)/.test(src) || !/caches\.delete\(/.test(src)) {
    fail(`${swPath}: must clean up old caches on activate (caches.keys() + caches.delete)`);
  }
  const runtimeCapMatch = src.match(/const\s+RUNTIME_CACHE_MAX_ENTRIES\s*=\s*(\d+)/);
  if (!runtimeCapMatch) {
    fail(`${swPath}: missing RUNTIME_CACHE_MAX_ENTRIES cap for same-origin runtime cache growth`);
  } else {
    const runtimeCap = parseInt(runtimeCapMatch[1], 10);
    if (runtimeCap < 32 || runtimeCap > 256) {
      fail(`${swPath}: RUNTIME_CACHE_MAX_ENTRIES = ${runtimeCap} is outside the expected range (32..256)`);
    }
  }
  if (!/function\s+trimRuntimeCache\s*\(/.test(src)) {
    fail(`${swPath}: missing trimRuntimeCache() helper to prune runtime cache overflow`);
  }
  if (!/function\s+putRuntime\s*\(/.test(src)) {
    fail(`${swPath}: missing putRuntime() helper so all runtime writes share pruning behavior`);
  }
  if (!/trimRuntimeCache\(runtimeCache\)/.test(src)) {
    fail(`${swPath}: activate handler must trim the existing runtime cache`);
  }
  if (!/putRuntime\(request,\s*fresh\)/.test(src) || !/putRuntime\(request,\s*response\)/.test(src)) {
    fail(`${swPath}: navigation and static fetch handlers must write through putRuntime()`);
  }
  if (/addEventListener\(['"`]message['"`]/.test(src) && !/event\.origin\s*!==\s*self\.location\.origin/.test(src)) {
    fail(`${swPath}: message handler must ignore messages whose origin does not match self.location.origin`);
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

  // Cover pre-cache contract: at install time the SW reads the manifest
  // and pre-caches a small newest-cover set. Keep this lower than the
  // desktop eager-cover count so PWA install stays comfortably below the
  // catalog payload budget; runtime caching fills the rest after use.
  let coverPrefetchCount = 0;
  if (!/const\s+COVER_PREFETCH_COUNT\s*=\s*(\d+)/.test(src)) {
    fail(`${swPath}: missing COVER_PREFETCH_COUNT constant — needed to pre-cache the newest catalog covers on install`);
  } else {
    const match = src.match(/const\s+COVER_PREFETCH_COUNT\s*=\s*(\d+)/);
    coverPrefetchCount = match ? parseInt(match[1], 10) : 0;
    if (coverPrefetchCount < 1 || coverPrefetchCount > 12) {
      fail(`${swPath}: COVER_PREFETCH_COUNT = ${coverPrefetchCount} is outside the sane range (1..12). Keep it small enough that the install payload stays within the Catalog budget.`);
    }
  }
  if (revisionMatch && /^shell-[a-f0-9]{12}$/.test(revisionMatch[1]) && coverPrefetchCount > 0) {
    const expected = await expectedShellRevision(coverPrefetchCount);
    if (revisionMatch[1] !== expected) {
      fail(`${swPath}: SHELL_REVISION is ${revisionMatch[1]}, expected ${expected} from current install-time shell assets`);
    }
  }
  if (!/function\s+newestCoverUrls\s*\(/.test(src)) {
    fail(`${swPath}: missing newestCoverUrls() helper that picks the newest covers from the manifest`);
  } else {
    // The helper must fetch the manifest and sort by addedAt so the pre-cache
    // matches what index.html's default 'newest first' sort surfaces.
    const helperMatch = src.match(/function\s+newestCoverUrls\s*\([^)]*\)\s*\{[\s\S]*?\n\}/);
    const helperSrc = helperMatch ? helperMatch[0] : '';
    if (!/fetch\(MANIFEST_URL/.test(helperSrc) && !/fetch\(['"`]websites\/manifest\.json['"`]/.test(helperSrc)) {
      fail(`${swPath}: newestCoverUrls() must fetch the manifest (via MANIFEST_URL or 'websites/manifest.json')`);
    }
    if (!/addedAt/.test(helperSrc)) {
      fail(`${swPath}: newestCoverUrls() must sort by addedAt so the pre-cache mirrors index.html's default 'newest first' sort`);
    }
    if (!/\.cover/.test(helperSrc)) {
      fail(`${swPath}: newestCoverUrls() must read the .cover field from each manifest entry`);
    }
  }
  if (!/newestCoverUrls\(\)/.test(src)) {
    fail(`${swPath}: install handler must invoke newestCoverUrls() and pre-cache the result`);
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
