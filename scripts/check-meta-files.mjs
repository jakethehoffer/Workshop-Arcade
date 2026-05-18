#!/usr/bin/env node
// OSS hygiene contract check.
//
// Verifies that the repo ships the three "every public OSS project should
// have these" files at the standard locations, with the minimum fields
// each spec requires:
//
//   1. LICENSE      — names the license (MIT) and carries a copyright year
//                     ending in the current year so contributors know the
//                     terms are still current.
//   2. .well-known/security.txt (RFC 9116) — has at least one Contact:
//                     line, a future Expires: timestamp, and a Canonical:
//                     pointing at the live deploy.
//   3. humans.txt   — humanstxt.org format with a /* TEAM */ section.
//   4. package.json — declares "license": "MIT" so npm tooling and the
//                     GitHub language detector reflect the LICENSE file.

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

async function checkLicense() {
  const path = 'LICENSE';
  if (!(await exists(path))) {
    fail(`${path}: file missing`);
    return;
  }
  const text = await readFile(join(repoRoot, path), 'utf8');
  if (!/MIT License/i.test(text)) {
    fail(`${path}: must name the license (expected "MIT License" in the header)`);
  }
  if (!/Copyright \(c\)\s+\d{4}/i.test(text)) {
    fail(`${path}: must include a "Copyright (c) <year>" line`);
  }
  const currentYear = String(new Date().getFullYear());
  if (!text.includes(currentYear)) {
    fail(`${path}: copyright range must include the current year (${currentYear})`);
  }
  if (!/Permission is hereby granted, free of charge/i.test(text)) {
    fail(`${path}: missing the standard MIT permission grant clause`);
  }
}

async function checkSecurityTxt() {
  const path = '.well-known/security.txt';
  if (!(await exists(path))) {
    fail(`${path}: file missing — RFC 9116 expects the file at /.well-known/security.txt`);
    return;
  }
  const text = await readFile(join(repoRoot, path), 'utf8');

  const contactLines = text.split(/\r?\n/).filter((line) => /^Contact:\s+\S+/.test(line));
  if (contactLines.length === 0) {
    fail(`${path}: must contain at least one "Contact: <url-or-mailto>" line (RFC 9116)`);
  }

  const expiresMatch = text.match(/^Expires:\s*([0-9T:\-Z]+)/m);
  if (!expiresMatch) {
    fail(`${path}: must contain an "Expires: <ISO 8601 timestamp>" line (RFC 9116)`);
  } else {
    const expires = new Date(expiresMatch[1]);
    if (Number.isNaN(expires.getTime())) {
      fail(`${path}: Expires "${expiresMatch[1]}" is not a parseable ISO 8601 timestamp`);
    } else if (expires.getTime() <= Date.now()) {
      fail(`${path}: Expires "${expiresMatch[1]}" is in the past — refresh the contact policy and bump the timestamp`);
    }
  }

  if (!/^Canonical:\s+https?:\/\/[^\s]+\/\.well-known\/security\.txt/m.test(text)) {
    fail(`${path}: must include a "Canonical: <https-url>/.well-known/security.txt" line so consumers can verify origin`);
  }
}

async function checkHumansTxt() {
  const path = 'humans.txt';
  if (!(await exists(path))) {
    fail(`${path}: file missing`);
    return;
  }
  const text = await readFile(join(repoRoot, path), 'utf8');
  if (!/\/\*\s*TEAM\s*\*\//i.test(text)) {
    fail(`${path}: humanstxt.org format requires a "/* TEAM */" section header`);
  }
  if (!/Maintainer:|Owner:|Lead:/i.test(text)) {
    fail(`${path}: must name at least one Maintainer/Owner/Lead under /* TEAM */`);
  }
}

async function checkPackageJsonLicense() {
  const path = 'package.json';
  if (!(await exists(path))) {
    fail(`${path}: file missing`);
    return;
  }
  const raw = await readFile(join(repoRoot, path), 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    fail(`${path}: JSON parse error: ${error.message}`);
    return;
  }
  if (parsed.license !== 'MIT') {
    fail(`${path}: "license" field must be "MIT" to match the LICENSE file, got ${JSON.stringify(parsed.license)}`);
  }
}

async function checkSecurityMd() {
  const path = 'SECURITY.md';
  if (!(await exists(path))) {
    fail(`${path}: file missing — GitHub's "Report a vulnerability" button looks for SECURITY.md at the repo root`);
    return;
  }
  const text = await readFile(join(repoRoot, path), 'utf8');
  if (!/^#\s*Security Policy/im.test(text)) {
    fail(`${path}: must start with a "# Security Policy" heading so GitHub's Security tab parses it correctly`);
  }
  if (!/security\/advisories\/new/.test(text)) {
    fail(`${path}: must include a link to github.com/.../security/advisories/new so reporters can file a private advisory`);
  }
  if (!/\.well-known\/security\.txt/.test(text)) {
    fail(`${path}: must reference .well-known/security.txt so RFC 9116 consumers find the same disclosure policy`);
  }
}

async function checkReadmeBadges() {
  const path = 'README.md';
  if (!(await exists(path))) {
    fail(`${path}: file missing`);
    return;
  }
  const text = await readFile(join(repoRoot, path), 'utf8');
  // Look only at the README's intro slab (before the first "## " section
  // heading) so a future contributor can't pass the check by hiding the
  // badges deep in the doc — they have to be near the top where they're
  // actually visible.
  const intro = text.split(/^## /m)[0];

  const requiredBadges = [
    { label: 'Validate Catalog CI', pattern: /workflows\/validate-catalog\.yml\/badge\.svg/ },
    { label: 'CodeQL CI', pattern: /workflows\/codeql\.yml\/badge\.svg/ },
    { label: 'License: MIT', pattern: /License-MIT-/i },
  ];
  for (const { label, pattern } of requiredBadges) {
    if (!pattern.test(intro)) {
      fail(`${path}: missing ${label} badge in the README intro (before the first "## " section)`);
    }
  }
}

await checkLicense();
await checkSecurityTxt();
await checkSecurityMd();
await checkHumansTxt();
await checkPackageJsonLicense();
await checkReadmeBadges();

if (issues.length > 0) {
  console.error(`Meta-files check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const message of issues) {
    console.error(` - ${message}`);
  }
  process.exit(1);
}

console.log('Meta-files check passed: LICENSE, .well-known/security.txt, SECURITY.md, humans.txt, package.json license, and README badge row all valid.');
