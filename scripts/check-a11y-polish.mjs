#!/usr/bin/env node
// Accessibility polish contract check.
//
// The catalog's static a11y check (scripts/check-accessibility.mjs)
// covers the high-signal rules (canvas labels, iframe titles, dialog
// modality, button types). This check covers the next tier of polish
// that's easy to regress when index.html grows but matters for users
// who depend on it:
//
//   1. A visually-hidden-until-focused skip link at the top of <body>
//      that points at #grid, so keyboard and screen-reader users can
//      jump past the sticky header straight to the game catalog.
//   2. A <noscript> fallback explaining why the page is empty when JS
//      is disabled — without it the grid sits forever on aria-busy="true".
//   3. A `@media (prefers-reduced-motion: reduce)` block that collapses
//      animation/transition durations and the card hover transform, so
//      visitors with vestibular sensitivities aren't forced through the
//      catalog's transitions.

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

  // 1. Skip link
  requireMatch(path, src, /<a[^>]+class=["']skip-to-content["'][^>]+href=["']#grid["']/, '<a class="skip-to-content" href="#grid"> skip link');
  requireMatch(path, src, /\.skip-to-content\b[^}]*position\s*:\s*absolute/m, 'CSS rule positioning .skip-to-content off-screen by default');
  requireMatch(path, src, /\.skip-to-content:focus-visible\b/, 'CSS rule revealing .skip-to-content on :focus-visible');

  // The skip target must exist for the link to mean anything.
  if (!/id=["']grid["']/.test(src)) {
    fail(`${path}: skip link points at #grid but no element with id="grid" was found`);
  }

  // 2. Noscript fallback
  if (!/<noscript>[\s\S]*?<\/noscript>/.test(src)) {
    fail(`${path}: missing <noscript> fallback for users with JavaScript disabled`);
  } else {
    const noscriptBlock = src.match(/<noscript>([\s\S]*?)<\/noscript>/)[1];
    if (!/JavaScript|javascript/i.test(noscriptBlock)) {
      fail(`${path}: <noscript> block must mention JavaScript so visitors understand why the catalog is empty`);
    }
    if (!/browse|play|games/i.test(noscriptBlock)) {
      fail(`${path}: <noscript> block must explain that JavaScript is required to browse/play the arcade`);
    }
  }

  // 3. Reduced-motion media query
  const motionMatch = src.match(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/);
  if (!motionMatch) {
    fail(`${path}: missing @media (prefers-reduced-motion: reduce) block`);
  } else {
    // Walk forward from the @media match to find the matching closing
    // brace, balancing through any nested rule braces, so the assertions
    // below see the full block body rather than just the first nested
    // rule.
    const startBrace = src.indexOf('{', motionMatch.index);
    if (startBrace === -1) {
      fail(`${path}: @media (prefers-reduced-motion: reduce) declaration is missing its opening brace`);
      return;
    }
    let depth = 1;
    let cursor = startBrace + 1;
    while (cursor < src.length && depth > 0) {
      const ch = src[cursor];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      cursor += 1;
    }
    if (depth !== 0) {
      fail(`${path}: @media (prefers-reduced-motion: reduce) block is missing its closing brace`);
      return;
    }
    const body = src.slice(startBrace + 1, cursor - 1);
    if (!/transition-duration\s*:\s*0/i.test(body) && !/transition\s*:\s*none/i.test(body)) {
      fail(`${path}: reduced-motion block must collapse transition-duration (e.g. transition-duration: 0.001ms !important)`);
    }
    if (!/animation-duration\s*:\s*0/i.test(body) && !/animation\s*:\s*none/i.test(body)) {
      fail(`${path}: reduced-motion block must collapse animation-duration (e.g. animation-duration: 0.001ms !important)`);
    }
    if (!/\.card:hover\s*\{[^}]*transform\s*:\s*none/i.test(body)) {
      fail(`${path}: reduced-motion block must neutralize .card:hover transform (transform: none)`);
    }
  }
}

await checkIndex();

if (issues.length > 0) {
  console.error(`A11y polish check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const message of issues) {
    console.error(` - ${message}`);
  }
  process.exit(1);
}

console.log('A11y polish check passed: skip link, <noscript> fallback, and prefers-reduced-motion block all in place.');
