#!/usr/bin/env node
// Content Security Policy contract check.
//
// The catalog ships a <meta http-equiv="Content-Security-Policy"> in
// index.html so even if an attacker manages to inject markup (e.g. via
// the Workshop brief form), they can't smuggle in a
// <script src="https://evil.com/..."> or exfiltrate to a non-allowlisted
// origin. The catalog's executable inline script is authorized by its
// exact SHA-256 hash; inline styles remain allowed because the catalog CSS
// is intentionally embedded in index.html.
//
// This check locks in:
//   1. A meta CSP exists in index.html.
//   2. Each critical directive is present (default-src, script-src,
//      style-src, img-src, connect-src, frame-src, object-src,
//      base-uri, form-action).
//   3. Specific allowlist entries match the catalog's runtime contract:
//      - connect-src is same-origin only (manifest / PWA shell fetches)
//      - object-src is 'none' (block legacy plugins)
//      - base-uri is 'self' (block <base> hijacking)
//      - frame-src includes 'self' (the player modal iframes
//        same-origin websites/*.html files)
//      - script-src is exactly 'self' plus the hashes of every executable
//        inline script; inert application/ld+json blocks are excluded
//      - style-src includes 'self' and 'unsafe-inline'
//
// Limitations: <meta http-equiv> CSP can't set frame-ancestors (that
// directive only works as an HTTP response header). GitHub Pages
// doesn't let us set headers, so clickjacking protection has to live
// at the application layer if it ever becomes a real concern.
//
// Game pages: every websites/<slug>.html is directly reachable
// (sitemapped, SEO'd, shareable), so each one must carry its own meta
// CSP too — injected by scripts/inject-game-meta.mjs inside the
// workshop-meta block. The game policy is tighter than the catalog's
// because the corpus is fully self-contained (no audio elements,
// workers, iframes, fetch calls, or remote subresources): frame-src
// is 'none'. img-src allows data: because many pages suppress the
// browser's /favicon.ico request with a blank `data:,` icon link, and
// favicons are governed by img-src. The meta must appear before the
// first <script> tag because a meta CSP only governs what the parser
// sees after it.

import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  catalogCspIssues,
  executableInlineScripts,
  parseCspDirectives,
} from './catalog-csp.mjs';

const repoRoot = process.env.WORKSHOP_ARCADE_REPO_ROOT
  ? resolve(process.env.WORKSHOP_ARCADE_REPO_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..');
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

  // Match either `content="…"` or `content='…'` so single-quoted CSP
  // values (which contain "'self'" etc.) parse correctly. The capture
  // group only excludes the OUTER quote character.
  const match = src.match(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*content=(?:"([^"]+)"|'([^']+)')/i);
  if (!match) {
    fail(`${path}: missing <meta http-equiv="Content-Security-Policy"> in <head>`);
    return;
  }
  const policy = match[1] || match[2];
  const directives = new Map(
    parseCspDirectives(policy).map(({ name, values }) => [name, values]),
  );

  const required = [
    'default-src',
    'script-src',
    'style-src',
    'img-src',
    'connect-src',
    'frame-src',
    'object-src',
    'base-uri',
    'form-action',
  ];
  for (const directive of required) {
    if (!directives.has(directive)) {
      fail(`${path}: CSP must declare a "${directive}" directive`);
    }
  }

  function directiveIncludes(directive, value) {
    const values = directives.get(directive) || [];
    return values.includes(value);
  }

  // script-src + style-src must include 'self' so any future remote
  // dependency requires an explicit CSP update.
  if (!directiveIncludes('script-src', "'self'")) {
    fail(`${path}: script-src must include 'self' so accidentally adding a remote <script> requires an explicit CSP update`);
  }
  if (!directiveIncludes('style-src', "'self'")) {
    fail(`${path}: style-src must include 'self'`);
  }

  if (!directiveIncludes('connect-src', "'self'")) {
    fail(`${path}: connect-src must include 'self' so the manifest + sw.js + app.webmanifest fetches succeed`);
  }
  const connectSrc = directives.get('connect-src') || [];
  const remoteConnectHosts = connectSrc.filter((entry) => /^https?:\/\//i.test(entry));
  if (remoteConnectHosts.length > 0) {
    fail(`${path}: connect-src should stay same-origin for the player catalog, got remote hosts (${remoteConnectHosts.join(', ')})`);
  }

  // frame-src must allow same-origin so the player modal's iframe
  // (websites/*.html) loads.
  if (!directiveIncludes('frame-src', "'self'")) {
    fail(`${path}: frame-src must include 'self' so the player modal's iframe to websites/*.html succeeds`);
  }

  // img-src must allow data: so the inline favicon (data:image/svg+xml,...)
  // renders. blob: covers any future image downloads via URL.createObjectURL.
  if (!directiveIncludes('img-src', 'data:')) {
    fail(`${path}: img-src must allow data: so the inline favicon URL is allowed`);
  }

  // Defensive minimums.
  if (!directiveIncludes('object-src', "'none'")) {
    fail(`${path}: object-src should be 'none' to block legacy <object>/<embed> plugin surfaces`);
  }
  if (!directiveIncludes('base-uri', "'self'")) {
    fail(`${path}: base-uri must be 'self' to prevent <base> hijacking that would relocate every relative URL`);
  }
  if (!directiveIncludes('form-action', "'self'")) {
    fail(`${path}: form-action must include 'self' (the Workshop form posts to GitHub via a click navigation, not a form submit, so 'self' is sufficient)`);
  }

  for (const issue of catalogCspIssues(src)) {
    fail(`${path}: ${issue}${/hash/.test(issue) ? '; run npm run build:csp' : ''}`);
  }
}

function extractMetaCsp(src) {
  const match = src.match(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*content=(?:"([^"]+)"|'([^']+)')/i);
  if (!match) return null;
  return { policy: match[1] || match[2], index: match.index };
}

async function checkGamePages() {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(repoRoot, 'websites', 'manifest.json'), 'utf8'));
  } catch (error) {
    fail(`websites/manifest.json: unable to read (${error.message})`);
    return 0;
  }
  if (!Array.isArray(manifest)) {
    fail('websites/manifest.json: expected an array');
    return 0;
  }

  let checked = 0;
  for (const game of manifest) {
    const path = game?.url;
    if (!path) continue;
    let src;
    try {
      src = await readFile(join(repoRoot, path), 'utf8');
    } catch (error) {
      fail(`${path}: unable to read (${error.message})`);
      continue;
    }
    checked += 1;

    const meta = extractMetaCsp(src);
    if (!meta) {
      fail(`${path}: missing <meta http-equiv="Content-Security-Policy"> — run npm run inject:meta`);
      continue;
    }
    const firstScript = src.search(/<script\b/i);
    if (firstScript !== -1 && meta.index > firstScript) {
      fail(`${path}: the CSP meta must appear before the first <script> tag (a meta CSP only governs markup after it)`);
    }

    const directives = new Map(
      parseCspDirectives(meta.policy).map(({ name, values }) => [name, values]),
    );
    const get = (name) => directives.get(name) || [];
    const expectExact = (name, values) => {
      const actual = get(name);
      if (actual.length !== values.length || values.some((value) => !actual.includes(value))) {
        fail(`${path}: CSP ${name} must be exactly "${values.join(' ')}" (got "${actual.join(' ') || '<missing>'}")`);
      }
    };

    expectExact('default-src', ["'self'"]);
    expectExact('script-src', ["'self'", "'unsafe-inline'"]);
    expectExact('style-src', ["'self'", "'unsafe-inline'"]);
    expectExact('img-src', ["'self'", 'data:']);
    expectExact('connect-src', ["'self'"]);
    expectExact('frame-src', ["'none'"]);
    expectExact('object-src', ["'none'"]);
    expectExact('base-uri', ["'self'"]);
    expectExact('form-action', ["'self'"]);
  }
  return checked;
}

await checkIndex();
const gamePagesChecked = await checkGamePages();

if (issues.length > 0) {
  console.error(`CSP check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const message of issues) {
    console.error(` - ${message}`);
  }
  process.exit(1);
}

const catalogScriptCount = executableInlineScripts(await readFile(join(repoRoot, 'index.html'), 'utf8')).length;
console.log(`CSP check passed: index.html hash-locks ${catalogScriptCount} executable inline script${catalogScriptCount === 1 ? '' : 's'}, and ${gamePagesChecked} game pages carry the tight self-contained game policy before their first script.`);
