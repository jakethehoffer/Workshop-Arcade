#!/usr/bin/env node
// Per-game runtime/storage contract.
//
// Every catalog game should load workshop-runtime.js before game code that can
// touch storage. The runtime provides the sandbox-friendly localStorage shim,
// so this fast gate catches new pages that accidentally bypass it.

import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const issues = [];

function fail(message) {
  issues.push(message);
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

function scriptSrcs(html) {
  return [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]);
}

const manifest = JSON.parse(await readFile(join(repoRoot, 'websites', 'manifest.json'), 'utf8'));
if (!Array.isArray(manifest)) {
  fail('websites/manifest.json must be an array');
} else {
  for (const game of manifest) {
    const label = game?.slug || game?.id || game?.title || '<unknown>';
    if (!game?.url) {
      fail(`${label}: missing url`);
      continue;
    }

    const filePath = join(repoRoot, game.url);
    if (!(await exists(filePath))) {
      fail(`${game.url}: file missing on disk`);
      continue;
    }

    const html = await readFile(filePath, 'utf8');
    const runtimeIndex = html.indexOf('workshop-runtime.js');
    if (runtimeIndex === -1) {
      fail(`${game.url}: missing workshop-runtime.js`);
      continue;
    }

    const storageIndex = html.search(/\b(?:localStorage|sessionStorage)\b/);
    if (storageIndex !== -1 && runtimeIndex > storageIndex) {
      fail(`${game.url}: workshop-runtime.js must appear before storage access`);
    }

    const srcs = scriptSrcs(html);
    const runtimeSrcIndex = srcs.findIndex((src) => /(?:^|\/)workshop-runtime\.js(?:[?#].*)?$/.test(src));
    if (runtimeSrcIndex === -1) {
      fail(`${game.url}: workshop-runtime.js must be loaded by a script src tag`);
      continue;
    }

    const localScriptBeforeRuntime = srcs
      .slice(0, runtimeSrcIndex)
      .find((src) => !/^(?:https?:)?\/\//i.test(src));
    if (localScriptBeforeRuntime) {
      fail(`${game.url}: local script "${localScriptBeforeRuntime}" loads before workshop-runtime.js`);
    }
  }
}

if (issues.length) {
  console.error(`Storage/runtime contract failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues) console.error(` - ${issue}`);
  process.exit(1);
}

console.log(`Storage/runtime contract passed for ${manifest.length} games.`);
