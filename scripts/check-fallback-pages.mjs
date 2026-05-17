#!/usr/bin/env node
// Static fallback-page contract check.
//
// Verifies that 404.html and offline.html exist, parse as well-formed
// minimal HTML, share the catalog's theme tokens, are marked noindex (we
// never want them ranking for catalog queries), and provide a back link
// to the home catalog. 404.html additionally must include a search form
// and a manifest fetch so the did-you-mean flow can work.

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

async function checkSharedContract(label) {
  if (!(await exists(label))) {
    fail(`${label}: file missing`);
    return null;
  }
  const src = await readFile(join(repoRoot, label), 'utf8');
  requireMatch(label, src, /<!doctype html>/i, '<!doctype html>');
  requireMatch(label, src, /<html[^>]*\blang=["']en["']/i, 'html lang="en"');
  requireMatch(label, src, /<meta[^>]+name=["']viewport["']/i, 'viewport meta');
  requireMatch(label, src, /<meta[^>]+name=["']theme-color["'][^>]+content=["']#0b0f14["']/i, 'theme-color #0b0f14');
  requireMatch(label, src, /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex[^"']*["']/i, 'noindex robots meta');
  requireMatch(label, src, /<link[^>]+rel=["']canonical["']/i, 'canonical link');
  requireMatch(label, src, /href=["']\.\/["']/, 'link back to the catalog home (href="./")');
  return src;
}

async function check404() {
  const src = await checkSharedContract('404.html');
  if (!src) return;
  requireMatch('404.html', src, /<title>[^<]*404|404[^<]*<\/title>|Not Found/i, 'title mentioning 404 / Not Found');
  requireMatch('404.html', src, /<form[^>]*\brole=["']search["']/i, '<form role="search"> for the did-you-mean flow');
  requireMatch('404.html', src, /<input[^>]+type=["']search["']/i, '<input type="search"> for the did-you-mean query');
  requireMatch('404.html', src, /<button[^>]+type=["']submit["']/i, 'submit button with explicit type');
  requireMatch('404.html', src, /fetch\(['"`]\.\/websites\/manifest\.json['"`]/, 'manifest fetch for suggestions');
}

async function checkOffline() {
  const src = await checkSharedContract('offline.html');
  if (!src) return;
  requireMatch('offline.html', src, /Offline/, 'visible "Offline" copy');
  requireMatch('offline.html', src, /navigator\.onLine/, 'navigator.onLine usage so the status reflects connectivity');
  requireMatch('offline.html', src, /addEventListener\(['"`]online['"`]/, 'online event listener for live status updates');
  requireMatch('offline.html', src, /addEventListener\(['"`]offline['"`]/, 'offline event listener for live status updates');
  requireMatch('offline.html', src, /<button[^>]+type=["']button["']/i, 'retry button with explicit type');
}

await check404();
await checkOffline();

if (issues.length > 0) {
  console.error(`Fallback page check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const message of issues) {
    console.error(` - ${message}`);
  }
  process.exit(1);
}

console.log('Fallback page check passed: 404.html and offline.html both meet the contract.');
