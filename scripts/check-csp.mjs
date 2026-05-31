#!/usr/bin/env node
// Content Security Policy contract check.
//
// The catalog ships a <meta http-equiv="Content-Security-Policy"> in
// index.html so even if an attacker manages to inject markup (e.g. via
// the Workshop brief form), they can't smuggle in a
// <script src="https://evil.com/..."> or exfiltrate to a non-allowlisted
// origin. The policy intentionally allows 'unsafe-inline' for scripts
// and styles — refactoring the catalog's ~1900 lines of inline JS + CSS
// to nonces or hashes is a much bigger pass — but the rest of the
// directives are tight.
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
//      - script-src and style-src include 'self' (not just
//        'unsafe-inline' — so accidentally adding a remote script
//        tag without updating the policy still gets caught)
//
// Limitations: <meta http-equiv> CSP can't set frame-ancestors (that
// directive only works as an HTTP response header). GitHub Pages
// doesn't let us set headers, so clickjacking protection has to live
// at the application layer if it ever becomes a real concern.

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

function parseDirectives(policy) {
  const map = new Map();
  for (const raw of policy.split(';')) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const [name, ...values] = trimmed.split(/\s+/);
    if (!name) continue;
    map.set(name.toLowerCase(), values);
  }
  return map;
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
  const directives = parseDirectives(policy);

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
  // <script src=...> requires an explicit CSP update.
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

  // Sanity: the catalog has no scheme-bearing script-src entries (e.g.
  // https://cdn.example.com). If a future change adds one, that's worth
  // surfacing in CI so the maintainer can confirm the dependency is
  // intentional.
  const scriptSrc = directives.get('script-src') || [];
  const remoteScriptHosts = scriptSrc.filter((entry) => /^https?:\/\//i.test(entry));
  if (remoteScriptHosts.length > 0) {
    fail(`${path}: CSP script-src declares remote script hosts (${remoteScriptHosts.join(', ')}). Please confirm this is intentional and document the dependency.`);
  }
}

await checkIndex();

if (issues.length > 0) {
  console.error(`CSP check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const message of issues) {
    console.error(` - ${message}`);
  }
  process.exit(1);
}

console.log('CSP check passed: index.html ships a strict-by-default meta CSP with allowlists matching the catalog runtime.');
