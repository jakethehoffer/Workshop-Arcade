#!/usr/bin/env node
// Generate a 1200x630 Open Graph share card per manifest game.
//
// The previous per-game OG image was the game's 640x360 cover SVG —
// which works but renders poorly on Twitter, Slack, Discord, etc.
// because those platforms target 1200x630 and crop or upscale anything
// smaller. This script produces a proper 1200x630 share card per game
// that mirrors the catalog's design tokens (dark gradient, teal accent
// dot, schema.org-aligned typography) plus the game title, subtitle,
// and tag pills derived from websites/manifest.json.
//
// Output: covers/og/<slug>.svg, one per manifest entry. Idempotent
// byte-for-byte so npm run test:og-images can compare committed
// output against a fresh generation.

import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR = join(repoRoot, 'covers', 'og');

export async function loadManifest() {
  const raw = await readFile(join(repoRoot, 'websites', 'manifest.json'), 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('websites/manifest.json must be an array');
  }
  return parsed;
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Wrap a subtitle into lines that fit a target pixel width assuming
// the average character of the catalog's sans-serif at the target
// font-size is roughly avgCharWidth wide. We don't have access to a
// font metrics layer in plain SVG generation, so this is a heuristic
// that's good enough for a 1200x630 card with a 1080px content column.
function wrapText(text, maxCharsPerLine = 56, maxLines = 3) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
    if (lines.length === maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && words.length > lines.join(' ').split(/\s+/).length) {
    const last = lines[lines.length - 1];
    if (last.length > 3) {
      lines[lines.length - 1] = last.slice(0, Math.max(0, last.length - 1)) + '…';
    }
  }
  return lines;
}

const PILL_FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

function renderTagPills(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return '';
  let xOffset = 0;
  const pillHeight = 44;
  const pillGap = 12;
  const fontSize = 18;
  const charWidth = 11; // approximate
  return tags
    .slice(0, 4)
    .map((tag) => {
      const label = String(tag || '').trim().toUpperCase();
      if (!label) return null;
      const padding = 22;
      const width = Math.max(110, Math.round(label.length * charWidth + padding * 2));
      const pill = [
        `<rect x="${xOffset}" y="0" rx="22" ry="22" width="${width}" height="${pillHeight}" fill="#0f1522" stroke="#5eead4" stroke-opacity="0.55" stroke-width="1"/>`,
        `<text x="${xOffset + width / 2}" y="${Math.round(pillHeight / 2 + fontSize / 3)}" text-anchor="middle" fill="#e6edf3" font-size="${fontSize}" font-weight="700" letter-spacing="3" font-family='${PILL_FONT}'>${escapeXml(label)}</text>`,
      ].join('\n  ');
      xOffset += width + pillGap;
      return pill;
    })
    .filter(Boolean)
    .join('\n  ');
}

// Site-level OG share card used when someone shares the catalog root
// URL itself (https://jakethehoffer.github.io/Workshop-Arcade/) on
// Twitter/Slack/Discord/Facebook/LinkedIn. The previous version was
// hand-written and froze at "20 GAMES"; this generator derives the
// count from the live manifest so the preview stays current as games
// land. Output is byte-deterministic so check-og-images.mjs can
// detect drift.
export function buildSiteOgSvg(manifest) {
  const count = Array.isArray(manifest) ? manifest.length : 0;
  const countLabel = `${count} GAMES`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0b0f14"/>
      <stop offset="1" stop-color="#070b12"/>
    </linearGradient>
    <radialGradient id="glow-teal" cx="0.12" cy="0.05" r="0.55">
      <stop offset="0" stop-color="#5eead4" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#5eead4" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow-indigo" cx="0.92" cy="0.1" r="0.45">
      <stop offset="0" stop-color="#7c9eff" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#7c9eff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="dot" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2cf8e2"/>
      <stop offset="0.33" stop-color="#53d7ff"/>
      <stop offset="0.66" stop-color="#7c9eff"/>
      <stop offset="1" stop-color="#2cf8e2"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow-teal)"/>
  <rect width="1200" height="630" fill="url(#glow-indigo)"/>
  <g transform="translate(110 230)">
    <circle cx="22" cy="22" r="22" fill="url(#dot)"/>
    <text x="68" y="14" font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="28" letter-spacing="10" fill="#5eead4" font-weight="700">PLAY &amp; WORKSHOP</text>
    <text x="68" y="78" font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="92" letter-spacing="14" fill="#e6edf3" font-weight="800">WORKSHOP ARCADE</text>
  </g>
  <text x="110" y="400" font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="32" fill="#9fb0c8">A clean, fast catalog of HTML5 browser games.</text>
  <text x="110" y="448" font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="32" fill="#9fb0c8">Search, filter, and play instantly in your browser.</text>
  <g transform="translate(110 510)" font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="700" font-size="20" letter-spacing="4">
    <rect x="0" y="0" rx="22" ry="22" width="160" height="44" fill="#0f1522" stroke="#5eead4" stroke-opacity="0.55" stroke-width="1"/>
    <text x="80" y="29" text-anchor="middle" fill="#e6edf3">${countLabel}</text>
    <rect x="176" y="0" rx="22" ry="22" width="180" height="44" fill="#0f1522" stroke="#5eead4" stroke-opacity="0.55" stroke-width="1"/>
    <text x="266" y="29" text-anchor="middle" fill="#e6edf3">AI WORKSHOP</text>
    <rect x="372" y="0" rx="22" ry="22" width="200" height="44" fill="#0f1522" stroke="#5eead4" stroke-opacity="0.55" stroke-width="1"/>
    <text x="472" y="29" text-anchor="middle" fill="#e6edf3">OPEN SOURCE</text>
  </g>
</svg>
`;
}

export function buildOgSvg(game) {
  const title = String(game.title || game.id || 'Untitled game');
  const subtitle = String(game.subtitle || 'A standalone HTML5 game from the Workshop Arcade catalog.');
  const subtitleLines = wrapText(subtitle, 56, 3);
  const titleFontSize = title.length > 22 ? 76 : 92;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0b0f14"/>
      <stop offset="1" stop-color="#070b12"/>
    </linearGradient>
    <radialGradient id="glow-teal" cx="0.12" cy="0.05" r="0.55">
      <stop offset="0" stop-color="#5eead4" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#5eead4" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow-indigo" cx="0.92" cy="0.1" r="0.45">
      <stop offset="0" stop-color="#7c9eff" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#7c9eff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="dot" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2cf8e2"/>
      <stop offset="0.33" stop-color="#53d7ff"/>
      <stop offset="0.66" stop-color="#7c9eff"/>
      <stop offset="1" stop-color="#2cf8e2"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow-teal)"/>
  <rect width="1200" height="630" fill="url(#glow-indigo)"/>
  <g transform="translate(110 110)">
    <circle cx="20" cy="20" r="20" fill="url(#dot)"/>
    <text x="56" y="12" font-family='${PILL_FONT}' font-size="22" letter-spacing="8" fill="#5eead4" font-weight="700">WORKSHOP ARCADE</text>
    <text x="56" y="38" font-family='${PILL_FONT}' font-size="14" letter-spacing="6" fill="#9fb0c8" font-weight="600" text-transform="uppercase">PLAY &amp; WORKSHOP</text>
  </g>
  <text x="110" y="320" font-family='${PILL_FONT}' font-size="${titleFontSize}" letter-spacing="2" fill="#e6edf3" font-weight="800">${escapeXml(title)}</text>
  ${subtitleLines
    .map((line, index) => `<text x="110" y="${380 + index * 44}" font-family='${PILL_FONT}' font-size="28" fill="#9fb0c8">${escapeXml(line)}</text>`)
    .join('\n  ')}
  <g transform="translate(110 530)" font-family='${PILL_FONT}'>
    ${renderTagPills(game.tags)}
  </g>
</svg>
`;
  return svg;
}

async function writeOgImages(manifest) {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const expectedNames = new Set(manifest
    .map((game) => (game.slug && typeof game.slug === 'string' ? `${game.slug}.svg` : null))
    .filter(Boolean));
  for (const entry of await readdir(OUTPUT_DIR, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.svg') && !expectedNames.has(entry.name)) {
      await unlink(join(OUTPUT_DIR, entry.name));
      console.log(`Removed orphan OG image covers/og/${entry.name}.`);
    }
  }
  let written = 0;
  for (const game of manifest) {
    if (!game.slug || typeof game.slug !== 'string') {
      console.warn(`skip (no slug): ${game.id || game.title || '<unknown>'}`);
      continue;
    }
    const svg = buildOgSvg(game);
    await writeFile(join(OUTPUT_DIR, `${game.slug}.svg`), svg, 'utf8');
    written += 1;
  }
  console.log(`Wrote ${written} OG images to covers/og/.`);

  // Site-level OG image — used when the catalog root URL itself is
  // shared. Keep it derived from the manifest count so it can't go
  // stale as games are added.
  const siteSvg = buildSiteOgSvg(manifest);
  await writeFile(join(repoRoot, 'covers', 'og-image.svg'), siteSvg, 'utf8');
  console.log(`Wrote covers/og-image.svg (site-level, ${manifest.length} games).`);
}

const invokedDirectly = process.argv[1]?.endsWith('build-og-images.mjs');
if (invokedDirectly) {
  const manifest = await loadManifest();
  await writeOgImages(manifest);
}
