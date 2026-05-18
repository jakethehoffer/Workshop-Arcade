#!/usr/bin/env node
// Per-game diagnostic-hook contract check.
//
// Every catalog game must expose `window.render_game_to_text()` and
// `window.advanceTime(ms)` (see docs/game-contract.md). The rendered-quality
// harness (`npm run capture:games:ci`) and the Playwright smoke suite
// (`npm run test:games`) catch missing hooks at runtime, but only after
// booting a browser per game — a 40-game catalog regression would take
// minutes to surface. This fast gate static-checks every manifest game's
// HTML for the two hook assignments and reports per-file misses up-front so
// contributors see the contract violation in seconds, not minutes.
//
// The check is intentionally syntactic (regex against the file text). It is
// not trying to verify the hooks behave correctly — only that the
// assignments exist. The slow gates remain the source of truth for
// behaviour.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(repoRoot, 'websites', 'manifest.json');

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (error) {
  console.error(`Game-contract check failed: unable to read ${manifestPath}: ${error.message}`);
  process.exit(1);
}

if (!Array.isArray(manifest) || manifest.length === 0) {
  console.error(`Game-contract check failed: ${manifestPath} did not contain a non-empty array`);
  process.exit(1);
}

// `window.render_game_to_text = ...` OR `window["render_game_to_text"] = ...`
// also accepts assignment via `window.render_game_to_text = function ...` etc.
const RENDER_HOOK = /window\s*(?:\.\s*render_game_to_text|\[\s*["']render_game_to_text["']\s*\])\s*=/;
// `window.advanceTime = ...` OR `window["advanceTime"] = ...`
const ADVANCE_HOOK = /window\s*(?:\.\s*advanceTime|\[\s*["']advanceTime["']\s*\])\s*=/;
// Pull every <script src="path.js"></script> (relative paths only — remote
// scripts are independently banned by validate-catalog.ps1).
const LOCAL_SCRIPT_SRC = /<script\b[^>]*\bsrc\s*=\s*["']([^"':]+\.js)["'][^>]*>/gi;

function gatherSources(gamePath, gameSource) {
  const gameDir = path.dirname(gamePath);
  const sources = [{ label: path.relative(repoRoot, gamePath).replace(/\\/g, '/'), text: gameSource }];
  const seen = new Set([gamePath]);
  let match;
  LOCAL_SCRIPT_SRC.lastIndex = 0;
  while ((match = LOCAL_SCRIPT_SRC.exec(gameSource)) !== null) {
    const scriptPath = path.resolve(gameDir, match[1]);
    if (seen.has(scriptPath)) continue;
    seen.add(scriptPath);
    try {
      const scriptText = fs.readFileSync(scriptPath, 'utf8');
      sources.push({ label: path.relative(repoRoot, scriptPath).replace(/\\/g, '/'), text: scriptText });
    } catch {
      // Missing scripts are flagged elsewhere (validate-catalog.ps1).
    }
  }
  return sources;
}

const issues = [];

for (const entry of manifest) {
  if (!entry || typeof entry.url !== 'string') {
    issues.push(`manifest entry "${entry?.id || '<unknown>'}": missing or invalid url`);
    continue;
  }
  const gamePath = path.join(repoRoot, entry.url);
  let source;
  try {
    source = fs.readFileSync(gamePath, 'utf8');
  } catch (error) {
    issues.push(`${entry.url}: unable to read game file (${error.message})`);
    continue;
  }

  // A game can register the hooks inline OR via a shared engine script
  // loaded with <script src="..."></script> (e.g. fact-match-engine.js for
  // the four fact-match games). Walk both surfaces and accept the hook
  // wherever it lands.
  const sources = gatherSources(gamePath, source);
  const inAny = (pattern) => sources.some((s) => pattern.test(s.text));

  if (!inAny(RENDER_HOOK)) {
    issues.push(`${entry.url}: missing window.render_game_to_text assignment (checked ${sources.map((s) => s.label).join(', ')}) — see docs/game-contract.md`);
  }
  if (!inAny(ADVANCE_HOOK)) {
    issues.push(`${entry.url}: missing window.advanceTime assignment (checked ${sources.map((s) => s.label).join(', ')}) — see docs/game-contract.md`);
  }
}

if (issues.length > 0) {
  console.error(`Game-contract check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const message of issues) {
    console.error(` - ${message}`);
  }
  process.exit(1);
}

console.log(`Game-contract check passed: ${manifest.length} games expose render_game_to_text + advanceTime.`);
