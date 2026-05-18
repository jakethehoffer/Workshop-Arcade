#!/usr/bin/env node
// Catalog manifest JSON Schema contract check.
//
// websites/manifest.json is the single source of truth — every
// generator and every validator pulls from it. schemas/manifest.schema.json
// documents the expected shape so editors (VS Code via
// .vscode/settings.json, IntelliJ via JSON Schema Mapping) provide
// autocomplete + inline validation while a contributor edits the
// manifest. This script enforces the same contract in CI so a typo
// like `tagss: [...]` can never slip past PR review.
//
// To keep the dependency surface tiny (the repo has exactly one npm
// dep — Playwright), this validator hand-rolls the subset of JSON
// Schema draft-07 the manifest schema uses: type, required,
// additionalProperties, properties, items, minItems, maxItems,
// uniqueItems, minLength, maxLength, minimum, maximum, pattern. The
// schema file itself stays editor-friendly and ajv-compatible if a
// future contributor wants to swap in a full validator.
//
// Verifies:
//   1. schemas/manifest.schema.json parses and uses draft-07.
//   2. .vscode/settings.json maps the schema to websites/manifest.json
//      so the editor surface keeps working.
//   3. websites/manifest.json validates against the schema entry-by-entry,
//      reporting the offending path (e.g. items[3].tags[1]) on failure.

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

async function loadJson(relative, { stripJsonc = false } = {}) {
  let raw = await readFile(join(repoRoot, relative), 'utf8');
  if (stripJsonc) {
    // Strip // line comments so VS Code's JSON-with-Comments files
    // parse with the standard parser. Keep this regex conservative —
    // it must not eat URLs containing "//".
    raw = raw.replace(/(^|[^:])\/\/[^\n]*$/gm, '$1');
  }
  return JSON.parse(raw);
}

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function validate(value, schema, path) {
  // Required type — accepts either a single type string or an array of types.
  if (schema.type) {
    const expected = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = typeOf(value);
    if (!expected.includes(actual) && !(expected.includes('number') && actual === 'integer')) {
      fail(`${path}: expected type ${expected.join('|')}, got ${actual}`);
      return; // can't keep validating with the wrong type
    }
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      fail(`${path}: string length ${value.length} below minLength ${schema.minLength}`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      fail(`${path}: string length ${value.length} above maxLength ${schema.maxLength}`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      fail(`${path}: ${JSON.stringify(value)} does not match pattern ${schema.pattern}`);
    }
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      fail(`${path}: ${value} below minimum ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      fail(`${path}: ${value} above maximum ${schema.maximum}`);
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      fail(`${path}: array length ${value.length} below minItems ${schema.minItems}`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      fail(`${path}: array length ${value.length} above maxItems ${schema.maxItems}`);
    }
    if (schema.uniqueItems) {
      const seen = new Set();
      for (const item of value) {
        const key = JSON.stringify(item);
        if (seen.has(key)) {
          fail(`${path}: array contains duplicate ${JSON.stringify(item)} (uniqueItems)`);
          break;
        }
        seen.add(key);
      }
    }
    if (schema.items) {
      value.forEach((item, index) => validate(item, schema.items, `${path}[${index}]`));
    }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const properties = schema.properties || {};
    if (schema.required) {
      for (const key of schema.required) {
        if (!(key in value)) {
          fail(`${path}: missing required property "${key}"`);
        }
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) {
          fail(`${path}: unknown property "${key}" (additionalProperties: false)`);
        }
      }
    }
    for (const [key, subSchema] of Object.entries(properties)) {
      if (key in value) {
        validate(value[key], subSchema, `${path}.${key}`);
      }
    }
  }
}

async function checkSchema() {
  const path = 'schemas/manifest.schema.json';
  if (!(await exists(path))) {
    fail(`${path}: file missing`);
    return null;
  }
  let schema;
  try {
    schema = await loadJson(path);
  } catch (error) {
    fail(`${path}: failed to parse: ${error.message}`);
    return null;
  }
  if (schema.$schema !== 'http://json-schema.org/draft-07/schema#') {
    fail(`${path}: must declare "$schema": "http://json-schema.org/draft-07/schema#" (other drafts may parse but editor support is best on draft-07)`);
  }
  if (schema.type !== 'array') {
    fail(`${path}: top-level type must be "array" — the catalog manifest is a JSON array of game objects`);
  }
  if (!schema.items || typeof schema.items !== 'object') {
    fail(`${path}: must define "items" so each manifest entry is validated`);
  }
  return schema;
}

async function checkVscodeMapping() {
  const path = '.vscode/settings.json';
  if (!(await exists(path))) {
    fail(`${path}: file missing — without it editors won't auto-validate manifest entries`);
    return;
  }
  let settings;
  try {
    settings = await loadJson(path, { stripJsonc: true });
  } catch (error) {
    fail(`${path}: failed to parse: ${error.message}`);
    return;
  }
  const mappings = settings['json.schemas'];
  if (!Array.isArray(mappings)) {
    fail(`${path}: must declare a "json.schemas" array mapping the schema to websites/manifest.json`);
    return;
  }
  const found = mappings.find((entry) => Array.isArray(entry?.fileMatch) && entry.fileMatch.some((pattern) => pattern.endsWith('websites/manifest.json')) && typeof entry?.url === 'string' && entry.url.endsWith('schemas/manifest.schema.json'));
  if (!found) {
    fail(`${path}: "json.schemas" must contain an entry that maps fileMatch including "websites/manifest.json" to url "./schemas/manifest.schema.json"`);
  }
}

async function checkManifestAgainstSchema(schema) {
  if (!schema) return;
  const path = 'websites/manifest.json';
  let manifest;
  try {
    manifest = await loadJson(path);
  } catch (error) {
    fail(`${path}: failed to parse: ${error.message}`);
    return;
  }
  validate(manifest, schema, 'manifest');
}

const schema = await checkSchema();
await checkVscodeMapping();
await checkManifestAgainstSchema(schema);

if (issues.length > 0) {
  console.error(`Manifest schema check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const message of issues) {
    console.error(` - ${message}`);
  }
  process.exit(1);
}

const manifest = await loadJson('websites/manifest.json');
console.log(`Manifest schema check passed: ${manifest.length} games validated against schemas/manifest.schema.json.`);
