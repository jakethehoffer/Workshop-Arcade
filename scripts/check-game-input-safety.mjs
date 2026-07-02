#!/usr/bin/env node
// Game-page input-safety gate.
//
// Security invariant (see SECURITY.md "Game page security invariant"):
// a game page is only sandboxed when it runs inside the catalog player
// iframe. It is *also* reachable as a real same-origin document via the
// "Open in new tab" link and direct navigation to websites/<slug>.html —
// and on that path there is NO sandbox and NO opaque origin. The game then
// runs with full access to the shared catalog origin (every game's saved
// state, the Cache/SW APIs, etc.). Because every game page also ships a CSP
// with script-src 'unsafe-inline' (required by the self-contained inline-JS
// design), CSP provides ZERO defense-in-depth against script injection.
//
// The one thing that keeps this safe today is that no game ingests
// untrusted input: no game reads location.hash / location.search /
// document.referrer / window.name, and no game listens for postMessage.
// A single future game that reads its own URL/hash (or a window message)
// and feeds it into a DOM sink would become same-origin XSS across the
// whole catalog. This gate locks that invariant in so it cannot regress
// silently — the security-critical property is enforced, not documented.
//
// The shared runtime shim (websites/workshop-runtime.js) legitimately reads
// location.hash to bootstrap the sandboxed storage bridge; it is the audited
// exception and is NOT a game page, so it is not scanned here.
//
// Dependency-free and regex-based so it runs in CI without an HTML parser.
// Only executable <script> bodies are scanned (inert application/ld+json
// data blocks and external `src` scripts are skipped), and JS comments +
// string/template literals are blanked first so a URL string or an
// explanatory comment can never be a false positive.

import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const websitesDir = join(repoRoot, "websites");

// Untrusted-input reads a sandboxed-only game page must never perform.
// `view: "code"` patterns match identifiers, so they run against the fully
// stripped code (comments AND string/template literals blanked) to rule out
// false positives from strings/comments. The addEventListener listener
// pattern depends on its 'message' string argument, so it runs against the
// comment-stripped-but-string-preserved view instead — otherwise blanking
// string literals would erase the very token it looks for.
const FORBIDDEN_PATTERNS = [
  { id: "location.hash", view: "code", re: /\blocation\s*\.\s*hash\b/ },
  { id: "location.search", view: "code", re: /\blocation\s*\.\s*search\b/ },
  { id: "document.referrer", view: "code", re: /\bdocument\s*\.\s*referrer\b/ },
  { id: "window.name", view: "code", re: /\bwindow\s*\.\s*name\b/ },
  { id: "postMessage listener (onmessage=)", view: "code", re: /\bonmessage\s*=/ },
  { id: "postMessage listener (addEventListener('message'))", view: "strings", re: /addEventListener\s*\(\s*['"`]message['"`]/ },
];

function listGamePages() {
  return readdirSync(websitesDir)
    .filter((entry) => entry.endsWith(".html"))
    .sort()
    .map((entry) => `websites/${entry}`);
}

// Extract executable <script> bodies (skip inert JSON-LD and external src),
// preserving newlines so reported line numbers match the source file.
function extractScriptBodies(src) {
  const lower = src.toLowerCase();
  const blanks = (s) => s.replace(/[^\n]/g, " ");
  let cursor = 0;
  let out = "";
  while (cursor < src.length) {
    const open = lower.indexOf("<script", cursor);
    if (open === -1) {
      out += blanks(src.slice(cursor));
      break;
    }
    const openEnd = src.indexOf(">", open);
    if (openEnd === -1) {
      out += blanks(src.slice(cursor));
      break;
    }
    const openTag = src.slice(open, openEnd + 1);
    const closeStart = lower.indexOf("</script", openEnd + 1);
    const closeEnd = closeStart === -1 ? src.length : lower.indexOf(">", closeStart);
    const bodyStart = openEnd + 1;
    const bodyEnd = closeStart === -1 ? src.length : closeStart;

    out += blanks(src.slice(cursor, bodyStart));

    const isJsonLd = /type\s*=\s*['"]application\/(ld\+json|json)['"]/i.test(openTag);
    const isExternal = /\bsrc\s*=/i.test(openTag);
    const body = src.slice(bodyStart, bodyEnd);
    out += isJsonLd || isExternal ? blanks(body) : body;

    out += closeStart === -1 ? "" : blanks(src.slice(bodyEnd, closeEnd + 1));
    cursor = closeEnd === -1 ? src.length : closeEnd + 1;
  }
  return out;
}

// Single-pass tokenizer that always blanks JS comments and, when
// blankStrings is true, also blanks string/template literals. It tracks
// string context correctly so a "//" inside a string is not treated as a
// comment and a quote inside a comment is not treated as a string. Newlines
// are preserved so reported line numbers stay aligned with the source.
function sanitize(src, { blankStrings }) {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === "/" && c2 === "/") {
      while (i < n && src[i] !== "\n") { out += " "; i += 1; }
      continue;
    }
    if (c === "/" && c2 === "*") {
      out += "  "; i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { out += src[i] === "\n" ? "\n" : " "; i += 1; }
      if (i < n) { out += "  "; i += 2; }
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      const blank = blankStrings ? " " : c;
      out += blank; i += 1;
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\") { out += blankStrings ? "  " : src.slice(i, i + 2); i += 2; continue; }
        out += blankStrings ? (src[i] === "\n" ? "\n" : " ") : src[i]; i += 1;
      }
      if (i < n) { out += blank; i += 1; }
      continue;
    }
    out += c; i += 1;
  }
  return out;
}

function lineOf(src, index) {
  let line = 1;
  for (let i = 0; i < index && i < src.length; i += 1) {
    if (src[i] === "\n") line += 1;
  }
  return line;
}

const issues = [];

for (const file of listGamePages()) {
  const raw = await readFile(join(repoRoot, file), "utf8");
  const scripts = extractScriptBodies(raw);
  const views = {
    code: sanitize(scripts, { blankStrings: true }),
    strings: sanitize(scripts, { blankStrings: false }),
  };
  for (const { id, view, re } of FORBIDDEN_PATTERNS) {
    const source = views[view];
    const globalRe = new RegExp(re.source, "g");
    let match;
    while ((match = globalRe.exec(source)) !== null) {
      issues.push(`${file}:${lineOf(source, match.index)}: game page reads untrusted input (${id}); games run unsandboxed on direct navigation — this is a same-origin XSS surface. Route it through the audited workshop-runtime.js shim or remove it.`);
    }
  }
}

if (issues.length) {
  console.error(`Game input-safety check failed with ${issues.length} issue${issues.length === 1 ? "" : "s"}:`);
  for (const issue of issues) console.error(` - ${issue}`);
  process.exit(1);
}

console.log(`Game input-safety check passed: ${listGamePages().length} game pages read no untrusted URL/window input.`);
