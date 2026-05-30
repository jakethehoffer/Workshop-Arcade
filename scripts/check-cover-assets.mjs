#!/usr/bin/env node
// Manifest cover asset contract.
//
// Catalog covers are loaded on the first user-facing surface, so keep them
// small, local, script-free SVGs. This deliberately checks only manifest
// covers; generated OG cards and app icons have different dimensions.

import { open, readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(repoRoot, 'websites', 'manifest.json');
const MAX_COVER_BYTES = 10 * 1024;
const issues = [];

function fail(message) {
  issues.push(message);
}

function isInsideRoot(absolutePath) {
  const relative = normalize(absolutePath).startsWith(normalize(repoRoot + '\\')) ||
    normalize(absolutePath).startsWith(normalize(repoRoot + '/'));
  return absolutePath === repoRoot || relative;
}

function parseViewBox(svg, cover) {
  const match = svg.match(/\bviewBox\s*=\s*["']\s*([0-9.\-]+)\s+([0-9.\-]+)\s+([0-9.\-]+)\s+([0-9.\-]+)\s*["']/i);
  if (!match) {
    fail(`${cover}: missing viewBox`);
    return null;
  }
  return match.slice(1).map(Number);
}

function checkSvgSafety(svg, cover) {
  const banned = [
    [/<script\b/i, '<script>'],
    [/<foreignObject\b/i, '<foreignObject>'],
    [/\bxlink:href\s*=\s*["']https?:\/\//i, 'remote xlink:href'],
    [/\bhref\s*=\s*["']https?:\/\//i, 'remote href'],
    [/\b(?:href|xlink:href)\s*=\s*["']data:image\//i, 'embedded raster data URL'],
    [/<image\b/i, '<image>'],
  ];

  for (const [pattern, label] of banned) {
    if (pattern.test(svg)) {
      fail(`${cover}: contains disallowed ${label}`);
    }
  }
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (!Array.isArray(manifest)) {
  fail('websites/manifest.json must be an array');
} else {
  for (const game of manifest) {
    const label = game?.slug || game?.id || game?.title || '<unknown>';
    const cover = game?.cover;
    if (typeof cover !== 'string' || !cover.trim()) {
      fail(`${label}: missing cover path`);
      continue;
    }
    if (cover.startsWith('/') || /^[a-z]+:/i.test(cover)) {
      fail(`${label}: cover must be a local relative path, got ${cover}`);
      continue;
    }
    if (extname(cover).toLowerCase() !== '.svg') {
      fail(`${label}: cover must be SVG, got ${cover}`);
      continue;
    }

    const absolute = resolve(repoRoot, cover);
    if (!isInsideRoot(absolute)) {
      fail(`${label}: cover escapes repo root (${cover})`);
      continue;
    }

    let info;
    let svg;
    try {
      const handle = await open(absolute, 'r');
      try {
        info = await handle.stat();
        if (!info.isFile()) {
          fail(`${cover}: cover path is not a file`);
          continue;
        }
        svg = await handle.readFile('utf8');
      } finally {
        await handle.close();
      }
    } catch (error) {
      fail(`${label}: unable to read ${cover} (${error.message})`);
      continue;
    }
    if (info.size > MAX_COVER_BYTES) {
      fail(`${cover}: ${info.size} bytes exceeds ${MAX_COVER_BYTES} byte cover budget`);
    }
    if (!/<svg\b/i.test(svg)) {
      fail(`${cover}: missing <svg> root`);
    }

    const viewBox = parseViewBox(svg, cover);
    if (viewBox) {
      const [, , width, height] = viewBox;
      const ratio = width / Math.max(1, height);
      if (Math.abs(ratio - (16 / 9)) > 0.001) {
        fail(`${cover}: viewBox must be 16:9, got ${viewBox.join(' ')}`);
      }
    }
    checkSvgSafety(svg, cover);
  }
}

if (issues.length) {
  console.error(`Cover asset check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues) console.error(` - ${issue}`);
  process.exit(1);
}

console.log(`Cover asset check passed for ${manifest.length} manifest covers.`);
