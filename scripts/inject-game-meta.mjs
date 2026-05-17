#!/usr/bin/env node
// Inject (or refresh) a per-game social/SEO meta block into every game HTML
// file using data from websites/manifest.json. Idempotent: replaces an
// existing injected block between marker comments so re-running just updates
// the tags in place if the manifest changes.
//
// Tags injected per game:
//   - meta description (from manifest.subtitle)
//   - meta theme-color
//   - link rel="canonical" to the live Pages URL
//   - Open Graph: type, site_name, title, description, url, image (+ alt)
//   - Twitter Card: summary_large_image, title, description, image (+ alt)
//
// Run after editing manifest.json. The check below also lets CI verify that
// each game page contains the injected block (lightweight regression guard).

import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://jakethehoffer.github.io/Workshop-Arcade";
const RAW = "https://raw.githubusercontent.com/jakethehoffer/Workshop-Arcade/main";
const MARK_START = "<!-- workshop-meta:start -->";
const MARK_END = "<!-- workshop-meta:end -->";
const JSONLD_MARK_START = "<!-- workshop-jsonld:start -->";
const JSONLD_MARK_END = "<!-- workshop-jsonld:end -->";

export { JSONLD_MARK_START, JSONLD_MARK_END };

function escapeAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildBlock(game) {
  const title = game.title + " — Workshop Arcade";
  const desc = game.subtitle || "A standalone HTML5 game from the Workshop Arcade catalog.";
  const canonical = SITE + "/" + game.url;
  const ogImage = RAW + "/" + game.cover;
  const lines = [];
  lines.push(MARK_START);
  lines.push('<meta name="description" content="' + escapeAttr(desc) + '" />');
  lines.push('<meta name="theme-color" content="#0b0f14" />');
  lines.push('<link rel="canonical" href="' + escapeAttr(canonical) + '" />');
  lines.push('<meta property="og:type" content="website" />');
  lines.push('<meta property="og:site_name" content="Workshop Arcade" />');
  lines.push('<meta property="og:title" content="' + escapeAttr(title) + '" />');
  lines.push('<meta property="og:description" content="' + escapeAttr(desc) + '" />');
  lines.push('<meta property="og:url" content="' + escapeAttr(canonical) + '" />');
  lines.push('<meta property="og:image" content="' + escapeAttr(ogImage) + '" />');
  lines.push('<meta property="og:image:alt" content="' + escapeAttr(game.title) + ' cover art" />');
  lines.push('<meta name="twitter:card" content="summary_large_image" />');
  lines.push('<meta name="twitter:title" content="' + escapeAttr(title) + '" />');
  lines.push('<meta name="twitter:description" content="' + escapeAttr(desc) + '" />');
  lines.push('<meta name="twitter:image" content="' + escapeAttr(ogImage) + '" />');
  lines.push(MARK_END);
  return lines.join("\n");
}

function injectBlock(html, block) {
  // If marker block already exists, replace it.
  const reBlock = new RegExp(
    MARK_START.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&") +
      "[\\s\\S]*?" +
      MARK_END.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"),
    "g"
  );
  if (reBlock.test(html)) return html.replace(reBlock, block);
  // Else insert right after the closing </title>.
  return html.replace(/<\/title>/i, "</title>\n" + block);
}

function escapeForScriptBlock(json) {
  // </script> inside a JSON string literal would close the surrounding
  // <script> tag and break the page. Escape the forward slash so the parser
  // still sees valid JSON.
  return json.replace(/<\/script/gi, "<\\/script");
}

export function buildGameJsonLd(game) {
  const description = game.subtitle || "A standalone HTML5 game from the Workshop Arcade catalog.";
  const canonical = SITE + "/" + game.url;
  const image = RAW + "/" + game.cover;
  const tags = Array.isArray(game.tags) ? game.tags.filter((tag) => typeof tag === "string" && tag.trim()) : [];
  const data = {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: game.title,
    description,
    url: canonical,
    image,
    applicationCategory: "Game",
    operatingSystem: "Any",
    gamePlatform: "Web Browser",
    inLanguage: "en",
    author: {
      "@type": "Organization",
      name: "Workshop Arcade",
      url: SITE + "/",
    },
    publisher: {
      "@type": "Organization",
      name: "Workshop Arcade",
      url: SITE + "/",
    },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
  };
  if (tags.length) {
    data.genre = tags;
  }
  const json = JSON.stringify(data, null, 2);
  return [
    JSONLD_MARK_START,
    '<script type="application/ld+json">',
    escapeForScriptBlock(json),
    "</script>",
    JSONLD_MARK_END,
  ].join("\n");
}

function injectJsonLd(html, block) {
  const escapedStart = JSONLD_MARK_START.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
  const escapedEnd = JSONLD_MARK_END.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
  const reBlock = new RegExp(escapedStart + "[\\s\\S]*?" + escapedEnd, "g");
  if (reBlock.test(html)) return html.replace(reBlock, block);
  // First insertion: place the JSON-LD block immediately after the existing
  // workshop-meta block if present (so all SEO-related blocks live together
  // in the head); otherwise fall back to after </title>.
  const escMetaEnd = MARK_END.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
  const reMetaEnd = new RegExp(escMetaEnd);
  if (reMetaEnd.test(html)) {
    return html.replace(reMetaEnd, MARK_END + "\n" + block);
  }
  return html.replace(/<\/title>/i, "</title>\n" + block);
}

async function main() {
  const manifestPath = join(repoRoot, "websites", "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  let touched = 0;
  for (const game of manifest) {
    if (!game.url) continue;
    const filePath = join(repoRoot, game.url);
    let html;
    try { html = await readFile(filePath, "utf8"); } catch {
      console.warn("skip (no file): " + game.url);
      continue;
    }
    const block = buildBlock(game);
    const jsonLdBlock = buildGameJsonLd(game);
    let next = injectBlock(html, block);
    next = injectJsonLd(next, jsonLdBlock);
    if (next !== html) {
      await writeFile(filePath, next);
      touched++;
      console.log("updated " + game.url);
    }
  }
  console.log("\nUpdated " + touched + " game file" + (touched === 1 ? "" : "s") + " of " + manifest.length + " manifest entries.");
}

// Only run the injector when this file is invoked directly (e.g. via
// `npm run inject:meta`). Importing the module for its exported helpers
// — as scripts/check-game-jsonld.mjs does — must not rewrite game files
// as a side effect.
const invokedDirectly = process.argv[1]?.endsWith("inject-game-meta.mjs");
if (invokedDirectly) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
