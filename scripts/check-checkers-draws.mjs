#!/usr/bin/env node
// Static checkers draw-rule check.
//
// Like chess, a real game of checkers (draughts) ends on more than a win: a dead
// position must draw, or the game never ends. websites/checkers.html shipped with
// only one terminal — "the side to move has no legal move loses" — and no draw
// detection at all. So a lone-king-vs-lone-king endgame (a canonical, frequently
// reached position) loops forever: neither side can force a capture, generateMoves
// always returns a king shuffle, and the game can never conclude. The Game Over
// overlay even has a "Draw" branch that no code path could ever reach.
//
// The fix adds the two standard automatic draws, paralleling scripts/
// check-chess-draws.mjs: threefold repetition and a no-progress clock (no capture
// and no man move). websites/checkers.html carries the pure pieces in a delimited
// `>>> checkers-draw-rules` block. This gate extracts that exact block, evaluates
// it in Node (the functions are side-effect-free), and asserts:
//   * boardSignature distinguishes the board layout and the side to move, and is
//     stable for an identical position.
//   * drawByCounters fires at the right thresholds — threefold at 3 repetitions,
//     the no-progress clock at its limit, and repetition takes precedence.
// It also asserts both move-commit paths (endTurn and aiMove) actually invoke the
// draw check, so the logic can never silently exist while unwired.

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const issues = [];
const check = (label, ok) => { if (!ok) issues.push(label); };

function extractDrawRules(src) {
  const match = src.match(/\/\/\s*>>> checkers-draw-rules[^\n]*\n([\s\S]*?)\/\/\s*<<< checkers-draw-rules/);
  if (!match) throw new Error('websites/checkers.html: could not locate the `>>> checkers-draw-rules` block (draw detection missing)');
  // eslint-disable-next-line no-new-func
  return new Function(`"use strict"; ${match[1]}; return { NO_PROGRESS_LIMIT, boardSignature, drawByCounters };`)();
}

function functionBody(src, name) {
  const re = new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\}`);
  const m = src.match(re);
  return m ? m[1] : '';
}

try {
  const src = await readFile(join(repoRoot, 'websites/checkers.html'), 'utf8');
  const { NO_PROGRESS_LIMIT, boardSignature, drawByCounters } = extractDrawRules(src);

  // --- boardSignature ----------------------------------------------------
  const boardA = [[0, 1], [-1, 0]];
  const boardB = [[0, 2], [-1, 0]]; // a man promoted to a king in one cell
  check('signature is stable for an identical position + side', boardSignature(boardA, true) === boardSignature(boardA, true));
  check('signature distinguishes the side to move', boardSignature(boardA, true) !== boardSignature(boardA, false));
  check('signature distinguishes the board layout', boardSignature(boardA, true) !== boardSignature(boardB, true));

  // --- drawByCounters ----------------------------------------------------
  check('no-progress limit is a positive integer', Number.isInteger(NO_PROGRESS_LIMIT) && NO_PROGRESS_LIMIT > 0);
  check('one below the no-progress limit is not yet a draw', drawByCounters(NO_PROGRESS_LIMIT - 1, 1) === null);
  check('reaching the no-progress limit is a fifty-move draw', drawByCounters(NO_PROGRESS_LIMIT, 1) === 'fifty-move');
  check('two repetitions is not yet a draw', drawByCounters(0, 2) === null);
  check('three repetitions is a threefold draw', drawByCounters(0, 3) === 'threefold');
  check('repetition takes precedence over the clock', drawByCounters(NO_PROGRESS_LIMIT, 3) === 'threefold');

  // --- wiring: both move-commit paths must run the draw check ------------
  const endTurnBody = functionBody(src, 'endTurn');
  const aiMoveBody = functionBody(src, 'aiMove');
  check('endTurn must call registerPlyAndCheckDraw', /registerPlyAndCheckDraw\s*\(/.test(endTurnBody));
  check('aiMove must call registerPlyAndCheckDraw', /registerPlyAndCheckDraw\s*\(/.test(aiMoveBody));
  check('a draw must surface through showGameOver(\'Draw\')', /showGameOver\(\s*['"]Draw['"]\s*\)/.test(src));
  check('registerPlyAndCheckDraw must use drawByCounters + boardSignature', /registerPlyAndCheckDraw[\s\S]*?drawByCounters\s*\(/.test(src) && /registerPlyAndCheckDraw[\s\S]*?boardSignature\s*\(/.test(src));
  check('newGame must reset the draw trackers', /noProgressPlies\s*=\s*0/.test(src) && /positionCounts\s*=\s*new Map\(\)/.test(src));
} catch (error) {
  issues.push(error instanceof Error ? error.message : String(error));
}

if (issues.length) {
  console.error(`Checkers draw-rule check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues) console.error(` - ${issue}`);
  process.exit(1);
}

console.log('Checkers draw-rule check passed: threefold repetition and the no-progress clock are detected and wired into both endTurn and aiMove.');
