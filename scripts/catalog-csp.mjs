#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CSP_META_PATTERN = /<meta\b[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/i;
const CONTENT_ATTRIBUTE_PATTERN = /\bcontent=(["'])(.*?)\1/i;
const JAVASCRIPT_MIME_TYPES = new Set([
  'application/ecmascript',
  'application/javascript',
  'application/x-ecmascript',
  'application/x-javascript',
  'text/ecmascript',
  'text/javascript',
  'text/javascript1.0',
  'text/javascript1.1',
  'text/javascript1.2',
  'text/javascript1.3',
  'text/javascript1.4',
  'text/javascript1.5',
  'text/jscript',
  'text/livescript',
  'text/x-ecmascript',
  'text/x-javascript',
]);

function hasAttribute(attributes, name) {
  return new RegExp(`(?:^|\\s)${name}(?=\\s|=|$)`, 'i').test(attributes);
}

function attributeValue(attributes, name) {
  const match = attributes.match(
    new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'),
  );
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : null;
}

export function parseCspDirectives(policy) {
  const directives = [];
  for (const raw of policy.split(';')) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const [name, ...values] = trimmed.split(/\s+/);
    directives.push({ name: name.toLowerCase(), values });
  }
  return directives;
}

export function extractCatalogCsp(html) {
  const metaMatch = html.match(CSP_META_PATTERN);
  if (!metaMatch) return null;
  const contentMatch = metaMatch[0].match(CONTENT_ATTRIBUTE_PATTERN);
  if (!contentMatch) return null;
  return {
    meta: metaMatch[0],
    policy: contentMatch[2],
  };
}

export function executableInlineScripts(html) {
  const scripts = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attributes = match[1] || '';
    if (hasAttribute(attributes, 'src')) continue;
    const type = (attributeValue(attributes, 'type') || '').split(';', 1)[0].trim().toLowerCase();
    if (type && type !== 'module' && !JAVASCRIPT_MIME_TYPES.has(type)) continue;
    scripts.push(match[2]);
  }
  return scripts;
}

export function scriptHashSource(script) {
  // HTML parsing normalizes CRLF/CR script text to LF before CSP hashing.
  // Mirror that behavior so Windows checkouts and Linux Pages builds agree.
  const normalized = script.replace(/\r\n?/g, '\n');
  const digest = createHash('sha256').update(normalized, 'utf8').digest('base64');
  return `'sha256-${digest}'`;
}

export function expectedCatalogScriptSources(html) {
  const hashes = executableInlineScripts(html).map(scriptHashSource);
  return ["'self'", ...new Set(hashes)];
}

export function refreshCatalogCsp(html) {
  const extracted = extractCatalogCsp(html);
  if (!extracted) {
    throw new Error('index.html: missing catalog Content-Security-Policy meta or content attribute');
  }

  const directives = parseCspDirectives(extracted.policy);
  const scriptIndexes = directives
    .map((directive, index) => directive.name === 'script-src' ? index : -1)
    .filter((index) => index !== -1);
  if (scriptIndexes.length === 0) {
    throw new Error('index.html: catalog Content-Security-Policy is missing script-src');
  }
  if (scriptIndexes.length > 1) {
    throw new Error('index.html: catalog Content-Security-Policy must contain exactly one script-src directive');
  }

  const executableScripts = executableInlineScripts(html);
  if (executableScripts.length === 0) {
    throw new Error('index.html: expected at least one executable inline script to hash-lock');
  }

  directives[scriptIndexes[0]] = {
    name: 'script-src',
    values: expectedCatalogScriptSources(html),
  };
  const policy = directives
    .map(({ name, values }) => [name, ...values].join(' '))
    .join('; ');
  const nextMeta = extracted.meta.replace(
    CONTENT_ATTRIBUTE_PATTERN,
    (_, quote) => `content=${quote}${policy}${quote}`,
  );
  return html.replace(extracted.meta, nextMeta);
}

export function catalogCspIssues(html) {
  const issues = [];
  const extracted = extractCatalogCsp(html);
  if (!extracted) {
    return ['missing catalog Content-Security-Policy meta or content attribute'];
  }

  const parsedDirectives = parseCspDirectives(extracted.policy);
  const directives = new Map();
  for (const { name, values } of parsedDirectives) {
    if (!directives.has(name)) directives.set(name, values);
  }
  const scriptDirectiveCount = parsedDirectives.filter(({ name }) => name === 'script-src').length;
  if (scriptDirectiveCount !== 1) {
    issues.push(`expected exactly one script-src directive, found ${scriptDirectiveCount}`);
  }
  const scriptSrc = directives.get('script-src') || [];
  const expectedSources = expectedCatalogScriptSources(html);
  const expectedHashes = expectedSources.slice(1);
  const actualHashes = scriptSrc.filter((entry) => /^'sha256-[A-Za-z0-9+/=]+'$/.test(entry));

  if (expectedHashes.length === 0) {
    issues.push('expected at least one executable inline script to hash-lock');
  }
  if (!scriptSrc.includes("'self'")) {
    issues.push("script-src must include 'self'");
  }
  if (scriptSrc.includes("'unsafe-inline'")) {
    issues.push("script-src must not include 'unsafe-inline'");
  }
  if (scriptSrc.includes("'unsafe-eval'")) {
    issues.push("script-src must not include 'unsafe-eval'");
  }

  const nonceSources = scriptSrc.filter((entry) => /^'nonce-/i.test(entry));
  if (nonceSources.length > 0) {
    issues.push(`script-src must not use nonces (${nonceSources.join(', ')})`);
  }
  const remoteSources = scriptSrc.filter((entry) => /^https?:\/\//i.test(entry));
  if (remoteSources.length > 0) {
    issues.push(`script-src must not declare remote origins (${remoteSources.join(', ')})`);
  }

  const missingHashes = expectedHashes.filter((entry) => !actualHashes.includes(entry));
  const unexpectedHashes = actualHashes.filter((entry) => !expectedHashes.includes(entry));
  if (missingHashes.length > 0) {
    issues.push(`script-src is missing ${missingHashes.length} executable inline-script hash${missingHashes.length === 1 ? '' : 'es'}`);
  }
  if (unexpectedHashes.length > 0) {
    issues.push(`script-src contains ${unexpectedHashes.length} stale or unexpected hash${unexpectedHashes.length === 1 ? '' : 'es'}`);
  }
  if (scriptSrc.length !== expectedSources.length || new Set(scriptSrc).size !== scriptSrc.length) {
    issues.push("script-src must contain exactly 'self' plus one unique SHA-256 source per executable inline script");
  }
  const unsupportedSources = scriptSrc.filter((entry) => !expectedSources.includes(entry));
  if (unsupportedSources.length > 0) {
    issues.push(`script-src contains unsupported sources (${unsupportedSources.join(', ')})`);
  }
  if (/<[a-z][^>]*\son[a-z]+\s*=/i.test(html)) {
    issues.push('inline event-handler attributes are incompatible with the hash-locked catalog policy');
  }

  return issues;
}

export function assertCatalogCsp(html, label = 'index.html') {
  const issues = catalogCspIssues(html);
  if (issues.length > 0) {
    throw new Error(`${label}: ${issues.join('; ')}`);
  }
}

async function main() {
  const requestedPath = process.argv[2];
  const indexPath = requestedPath ? resolve(requestedPath) : join(repoRoot, 'index.html');
  const html = await readFile(indexPath, 'utf8');
  const next = refreshCatalogCsp(html);
  assertCatalogCsp(next, indexPath);
  if (next === html) {
    console.log(`${indexPath}: catalog CSP already matches executable inline scripts.`);
    return;
  }
  await writeFile(indexPath, next, 'utf8');
  const scriptCount = executableInlineScripts(next).length;
  console.log(`${indexPath}: refreshed catalog CSP for ${scriptCount} executable inline script${scriptCount === 1 ? '' : 's'}.`);
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
