#!/usr/bin/env node
// Workshop feedback draft-resume contract.
//
// The catalog keeps player feedback lightweight and local-only. This check
// locks in the static wiring for the Player picks resume affordance so saved
// feedback drafts can be resumed without adding startup GitHub calls, backend
// state, or a second storage key.

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const issues = [];
const path = 'index.html';
const src = await readFile(join(repoRoot, path), 'utf8');

function fail(message) {
  issues.push(message);
}

function requireMatch(pattern, description) {
  if (!pattern.test(src)) {
    fail(`${path}: missing ${description}`);
  }
}

function sliceBetween(start, stop) {
  const from = src.indexOf(start);
  if (from === -1) return '';
  const to = src.indexOf(stop, from + start.length);
  return to === -1 ? src.slice(from) : src.slice(from, to);
}

function requireInBlock(block, pattern, description) {
  if (!block || !pattern.test(block)) {
    fail(`${path}: missing ${description}`);
  }
}

requireMatch(/const\s+DRAFTS_KEY\s*=\s*["']workshop_arcade_drafts_v1["']/, 'existing local draft storage key');
const localDraftKeys = new Set([...src.matchAll(/["'](workshop_arcade_[^"']+)["']/g)].map((match) => match[1]));
if (localDraftKeys.size !== 1 || !localDraftKeys.has('workshop_arcade_drafts_v1')) {
  fail(`${path}: feedback drafts must keep using only workshop_arcade_drafts_v1, found ${[...localDraftKeys].join(', ') || 'none'}`);
}

for (const [id, label] of [
  ['suggestImprovementBtn', 'quiet Suggest improvement action'],
  ['resumeDraftBtn', 'Resume draft action'],
  ['workshopDraftStatus', 'saved draft count text'],
]) {
  requireMatch(new RegExp(`id=["']${id}["']`), label);
  requireMatch(new RegExp(`${id}:\\s*document\\.getElementById\\(['"]${id}['"]\\)`), `els.${id} mapping`);
}

requireMatch(/id=["']resumeDraftBtn["'][^>]+hidden[^>]*>Resume draft<\/button>/, 'Resume draft button hidden by default');
requireMatch(/id=["']workshopDraftStatus["'][^>]+aria-live=["']polite["'][^>]+hidden/, 'polite saved-draft count hidden by default');
requireMatch(/\.draft-count\[hidden\]\{display:none\}/, 'hidden draft-count CSS');

for (const fn of [
  'isValidDraft',
  'sanitizeDrafts',
  'newestWorkshopDraft',
  'syncDraftResumeAction',
  'resumeLatestDraft',
  'loadDrafts',
  'saveDraft',
  'loadDraft',
  'deleteDraft',
]) {
  requireMatch(new RegExp(`function\\s+${fn}\\s*\\(`), `${fn}() helper`);
}

const suggestBlock = sliceBetween('if(els.suggestImprovementBtn)', 'if(els.resumeDraftBtn)');
requireInBlock(suggestBlock, /openWorkshop\(['"]__new__['"],\s*e\.currentTarget\)/, 'Suggest improvement opening the local Workshop modal');
requireInBlock(suggestBlock, /addEventListener\(\s*['"]click['"]/, 'Suggest improvement click handler');
requireInBlock(suggestBlock, /^(?![\s\S]*(window\.open|openGitHubIssue|GITHUB_ISSUE_URL))[\s\S]*$/, 'Suggest improvement staying quiet until the player explicitly opens an issue draft');

const resumeBlock = sliceBetween('function resumeLatestDraft', 'function loadDrafts');
requireInBlock(resumeBlock, /newestWorkshopDraft\(\)/, 'Resume draft selecting the newest saved draft');
requireInBlock(resumeBlock, /openWorkshop\(draft\.gameId \|\| ['"]__new__['"],\s*trigger\)/, 'Resume draft opening the Workshop modal');
requireInBlock(resumeBlock, /loadDraft\(draft\.id,\s*\{\s*focusGoal:\s*true\s*\}\)/, 'Resume draft loading the saved draft and focusing the request field');

const syncBlock = sliceBetween('function syncDraftResumeAction', 'function resumeLatestDraft');
requireInBlock(syncBlock, /state\.drafts\.filter\(isValidDraft\)\.length/, 'draft count based only on valid drafts');
requireInBlock(syncBlock, /resumeDraftBtn\.hidden\s*=\s*hidden/, 'Resume draft visibility toggle');
requireInBlock(syncBlock, /workshopDraftStatus\.textContent\s*=\s*hidden \? ['"]['"] : `\$\{count\} saved draft/, 'visible saved-draft count text');

const loadDraftsBlock = sliceBetween('function loadDrafts', 'function persistDrafts');
requireInBlock(loadDraftsBlock, /localStorage\.getItem\(DRAFTS_KEY\)/, 'loadDrafts reading existing local draft store');
requireInBlock(loadDraftsBlock, /sanitizeDrafts\(/, 'loadDrafts validating stored draft data');
requireInBlock(loadDraftsBlock, /syncDraftResumeAction\(\)/, 'loadDrafts refreshing the resume affordance');

const saveBlock = sliceBetween('function saveDraft', 'function renderDrafts');
requireInBlock(saveBlock, /persistDrafts\(\)/, 'saveDraft keeping existing persistence flow');
requireInBlock(saveBlock, /renderDrafts\(\)/, 'saveDraft refreshing the modal draft list');
requireInBlock(saveBlock, /syncDraftResumeAction\(\)/, 'saveDraft refreshing the resume affordance');

const renderBlock = sliceBetween('function renderDrafts', 'function loadDraft');
requireInBlock(renderBlock, /load\.addEventListener\(['"]click['"],\s*\(\)\s*=>\s*loadDraft\(draft\.id\)\)/, 'saved draft Load button wiring');
requireInBlock(renderBlock, /del\.addEventListener\(['"]click['"],\s*\(\)\s*=>\s*deleteDraft\(draft\.id\)\)/, 'saved draft Delete button wiring');

const loadBlock = sliceBetween('function loadDraft', 'function deleteDraft');
requireInBlock(loadBlock, /els\.workshopGoal\.value\s*=\s*draft\.goal \|\| ['"]['"]/, 'loadDraft restoring request text');
requireInBlock(loadBlock, /els\.briefOutput\.value\s*=\s*draft\.brief \|\| ['"]['"]/, 'loadDraft restoring generated brief');
requireInBlock(loadBlock, /if\(options\.focusGoal\) setTimeout\(\(\) => els\.workshopGoal\.focus\(\{\s*preventScroll:\s*true\s*\}\),\s*0\)/, 'loadDraft optional request-field focus');

const deleteBlock = sliceBetween('function deleteDraft', 'async function copyBrief');
requireInBlock(deleteBlock, /state\.drafts\s*=\s*state\.drafts\.filter/, 'deleteDraft removing the selected draft');
requireInBlock(deleteBlock, /persistDrafts\(\)/, 'deleteDraft keeping existing persistence flow');
requireInBlock(deleteBlock, /syncDraftResumeAction\(\)/, 'deleteDraft refreshing the resume affordance');

const resumeListenerBlock = sliceBetween('if(els.resumeDraftBtn)', 'if(els.footerSuggestBtn)');
requireInBlock(resumeListenerBlock, /resumeLatestDraft\(e\.currentTarget\)/, 'Resume draft button click handler');

const startupMatch = src.match(/\(async function load\(\)\{([\s\S]*?)\}\)\(\);/);
if (!startupMatch) {
  fail(`${path}: unable to locate startup load() block`);
} else if (/(api\.github\.com|GITHUB_ISSUE_URL|openGitHubIssue|issues\/new)/.test(startupMatch[1])) {
  fail(`${path}: startup load() must not fetch or prepare GitHub issue surfaces`);
}

if (issues.length) {
  console.error(`Workshop-feedback check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues) {
    console.error(` - ${issue}`);
  }
  process.exit(1);
}

console.log('Workshop-feedback check passed: local draft resume affordance, draft count, modal load path, and no-startup-GitHub contract are wired.');
