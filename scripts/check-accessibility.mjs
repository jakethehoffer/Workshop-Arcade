#!/usr/bin/env node
// Static accessibility regression check.
//
// Scans index.html and every websites/*.html for a small set of high-signal
// a11y rules:
//   1. Every <canvas> must declare either aria-label or aria-hidden="true".
//   2. Every <iframe> must declare a non-empty title.
//   3. Every element with role="dialog" or role="alertdialog" must also set
//      aria-modal="true" and an accessible name via aria-labelledby or aria-label.
//
// The script is intentionally regex-based and dependency-free so it can run
// in CI without an HTML parser dep. <script> and <style> blocks plus HTML
// comments are stripped before scanning to avoid false positives from inline
// templates or JS strings.

import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function listHtmlFiles() {
  const files = ["index.html"];
  const websitesDir = join(repoRoot, "websites");
  for (const entry of readdirSync(websitesDir)) {
    if (entry.endsWith(".html")) files.push(`websites/${entry}`);
  }
  return files;
}

function stripNonMarkup(src) {
  // Replace script/style/comment bodies with blanks while preserving newlines
  // so byte offsets and line numbers stay aligned with the raw source.
  const blankPreservingNewlines = (s) => s.replace(/[^\n]/g, " ");
  return src
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (m) => blankPreservingNewlines(m))
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (m) => blankPreservingNewlines(m))
    .replace(/<!--[\s\S]*?-->/g, (m) => blankPreservingNewlines(m));
}

function lineOf(src, index) {
  // 1-based line number.
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (src.charCodeAt(i) === 10) line++;
  }
  return line;
}

function hasAttr(attrs, name) {
  return new RegExp(`\\b${name}\\s*=`).test(attrs);
}

function attrValue(attrs, name) {
  const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`));
  return m ? (m[1] ?? m[2] ?? m[3] ?? "") : null;
}

const findings = [];

function record(file, line, message) {
  findings.push({ file, line, message });
}

async function checkFile(rel) {
  const abs = join(repoRoot, rel);
  const rawSrc = await readFile(abs, "utf8");
  const src = stripNonMarkup(rawSrc);

  // Rule 1: <canvas> must have aria-label or aria-hidden="true".
  for (const match of src.matchAll(/<canvas\b([^>]*?)\/?>/gi)) {
    const attrs = match[1] || "";
    const hidden = attrValue(attrs, "aria-hidden");
    if (hidden && hidden.toLowerCase() === "true") continue;
    if (hasAttr(attrs, "aria-label") || hasAttr(attrs, "aria-labelledby")) continue;
    record(rel, lineOf(rawSrc, match.index), '<canvas> missing aria-label or aria-hidden="true"');
  }

  // Rule 2: <iframe> must have a non-empty title.
  for (const match of src.matchAll(/<iframe\b([^>]*?)\/?>/gi)) {
    const attrs = match[1] || "";
    const title = attrValue(attrs, "title");
    if (title === null || title.trim() === "") {
      record(rel, lineOf(rawSrc, match.index), "<iframe> missing non-empty title attribute");
    }
  }

  // Rule 3: role="dialog" / role="alertdialog" must have aria-modal="true" and an accessible name.
  for (const match of src.matchAll(/<[a-zA-Z][a-zA-Z0-9-]*\b([^>]*?)\/?>/g)) {
    const attrs = match[1] || "";
    const role = attrValue(attrs, "role");
    if (!role || !/^(dialog|alertdialog)$/i.test(role.trim())) continue;
    const ariaModal = attrValue(attrs, "aria-modal");
    if (!ariaModal || ariaModal.toLowerCase() !== "true") {
      record(rel, lineOf(rawSrc, match.index), `role="${role}" element missing aria-modal="true"`);
    }
    if (!hasAttr(attrs, "aria-labelledby") && !hasAttr(attrs, "aria-label")) {
      record(rel, lineOf(rawSrc, match.index), `role="${role}" element missing aria-labelledby or aria-label`);
    }
  }
}

const files = listHtmlFiles();
for (const rel of files) {
  await checkFile(rel);
}

if (findings.length > 0) {
  console.error(`Accessibility check failed with ${findings.length} finding${findings.length === 1 ? "" : "s"}:`);
  for (const f of findings) {
    console.error(` - ${f.file}:${f.line}  ${f.message}`);
  }
  process.exit(1);
}

console.log(`Accessibility check passed for ${files.length} HTML file${files.length === 1 ? "" : "s"}.`);
