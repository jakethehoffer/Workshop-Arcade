#!/usr/bin/env node
// Static chess draw-rule check.
//
// A canonical chess game must end on more than checkmate and stalemate. Without
// the three automatic draws a real game misbehaves badly: a King-vs-King
// endgame can NEVER finish (no move ever ends it), and a dead, shuffling game
// drags on forever. None of the render/smoke gates can see this — the board
// still draws fine, it just won't stop.
//
// websites/chess.html carries the draw logic in a self-contained, side-effect-
// free block delimited by `>>> chess-draw-rules` / `<<< chess-draw-rules`. This
// gate extracts that exact block, evaluates it in Node (the functions only read
// the plain state object — no DOM), and asserts:
//   * insufficient material — KK, K+minor vs K, and KB vs KB on the same color
//     are draws; opposite-color bishops, two knights, and any pawn/rook/queen
//     are NOT (mate stays possible).
//   * fifty-move rule — fires at 100 half-moves, not 99.
//   * threefold repetition — counts the live position plus prior snapshots, and
//     the position signature ignores the move clocks but distinguishes side to
//     move, castling rights, and the en-passant target.
// It also asserts postMoveChecks() actually CALLS all three, so the logic can
// never silently exist while unwired.

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const issues = [];

function check(label, condition) {
  if (!condition) issues.push(label);
}

// Minimal FEN -> state, mirroring the shape websites/chess.html's loadFEN()
// produces (board[row][col] of {type,color}|null, turn, castling booleans,
// enPassant {col,row}|null, halfmove). Test scaffolding only — the functions
// under test are the real extracted ones.
function mkState(fen) {
  const [placement, turn = 'w', castling = '-', ep = '-', halfmove = '0'] = fen.split(/\s+/);
  const board = placement.split('/').map((line) => {
    const row = [];
    for (const ch of line) {
      if (/\d/.test(ch)) {
        for (let k = 0; k < Number(ch); k += 1) row.push(null);
      } else {
        row.push({ type: ch.toLowerCase(), color: ch === ch.toUpperCase() ? 'w' : 'b' });
      }
    }
    return row;
  });
  let enPassant = null;
  if (ep !== '-') {
    enPassant = { col: ep.charCodeAt(0) - 97, row: 8 - Number(ep[1]) };
  }
  return {
    board,
    turn: turn === 'b' ? 'b' : 'w',
    castling: {
      K: castling.includes('K'),
      Q: castling.includes('Q'),
      k: castling.includes('k'),
      q: castling.includes('q'),
    },
    enPassant,
    halfmove: Number(halfmove),
  };
}

function extractDrawRules(src) {
  const match = src.match(/\/\/\s*>>> chess-draw-rules[^\n]*\n([\s\S]*?)\/\/\s*<<< chess-draw-rules/);
  if (!match) {
    throw new Error('websites/chess.html: could not locate the `>>> chess-draw-rules` block (draw detection missing)');
  }
  // The block is our own trusted, side-effect-free source. Evaluating it keeps
  // the gate testing the EXACT shipped functions with no reimplementation.
  // eslint-disable-next-line no-new-func
  const factory = new Function(
    `"use strict"; ${match[1]}; return { positionSignature, repetitionCount, hasInsufficientMaterial, fiftyMoveDraw };`,
  );
  return factory();
}

function postMoveChecksBody(src) {
  const match = src.match(/function\s+postMoveChecks\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  return match ? match[1] : '';
}

try {
  const src = await readFile(join(repoRoot, 'websites/chess.html'), 'utf8');
  const { positionSignature, repetitionCount, hasInsufficientMaterial, fiftyMoveDraw } = extractDrawRules(src);

  // --- Insufficient material ---------------------------------------------
  const insufficient = {
    'K vs K': '4k3/8/8/8/8/8/8/4K3 w - -',
    'K+B vs K': '4k3/8/8/8/8/8/8/4KB2 w - -',
    'K+N vs K': '4k3/8/8/8/8/8/8/4KN2 w - -',
    'KB vs KB same color': '2b1k3/8/8/8/8/8/8/4KB2 w - -', // c8 light, f1 light
  };
  const sufficient = {
    'KB vs KB opposite color': '1b2k3/8/8/8/8/8/8/4KB2 w - -', // b8 dark, f1 light
    'K+N+N vs K': '4k3/8/8/8/8/8/8/3NKN2 w - -',
    'K+P vs K': '4k3/8/8/8/8/4P3/8/4K3 w - -',
    'K+R vs K': '4k3/8/8/8/8/8/8/4KR2 w - -',
    'K+Q vs K': '4k3/8/8/8/8/8/8/4KQ2 w - -',
    'start position': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -',
  };
  for (const [label, fen] of Object.entries(insufficient)) {
    check(`insufficient material should be a draw: ${label}`, hasInsufficientMaterial(mkState(fen)) === true);
  }
  for (const [label, fen] of Object.entries(sufficient)) {
    check(`should NOT be an insufficient-material draw: ${label}`, hasInsufficientMaterial(mkState(fen)) === false);
  }

  // --- Fifty-move rule ----------------------------------------------------
  check('fifty-move: 99 half-moves is not yet a draw', fiftyMoveDraw(mkState('4k3/8/8/8/8/8/8/4K3 w - - 99')) === false);
  check('fifty-move: 100 half-moves is a draw', fiftyMoveDraw(mkState('4k3/8/8/8/8/8/8/4K3 w - - 100')) === true);
  check('fifty-move: 150 half-moves is a draw', fiftyMoveDraw(mkState('4k3/8/8/8/8/8/8/4K3 w - - 150')) === true);

  // --- Position signature -------------------------------------------------
  const base = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
  const sigA = positionSignature(mkState(`${base} 0`));
  const sigClock = positionSignature(mkState(`${base} 40`));
  check('signature ignores the half-move clock', sigA === sigClock);
  check('signature distinguishes side to move',
    positionSignature(mkState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq -')) !== sigA);
  check('signature distinguishes castling rights',
    positionSignature(mkState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w Kkq -')) !== sigA);
  check('signature distinguishes en-passant target',
    positionSignature(mkState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq e3')) !== sigA);

  // --- Threefold repetition count ----------------------------------------
  const cur = mkState(base);
  const same1 = mkState(`${base} 10`);
  const same2 = mkState(`${base} 20`);
  const diff = mkState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq -');
  check('repetition: lone position counts once', repetitionCount(cur, []) === 1);
  check('repetition: two prior identical snapshots make three', repetitionCount(cur, [same1, same2]) === 3);
  check('repetition: differing snapshots are not counted', repetitionCount(cur, [diff, diff]) === 1);
  check('repetition: mixed history counts only matches', repetitionCount(cur, [same1, diff]) === 2);

  // --- Wiring: postMoveChecks must invoke all three draws -----------------
  const body = postMoveChecksBody(src);
  check('postMoveChecks must call hasInsufficientMaterial', /hasInsufficientMaterial\s*\(/.test(body));
  check('postMoveChecks must call fiftyMoveDraw', /fiftyMoveDraw\s*\(/.test(body));
  check('postMoveChecks must call repetitionCount', /repetitionCount\s*\(/.test(body));
} catch (error) {
  issues.push(error instanceof Error ? error.message : String(error));
}

if (issues.length) {
  console.error(`Chess draw-rule check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues) console.error(` - ${issue}`);
  process.exit(1);
}

console.log('Chess draw-rule check passed: insufficient material, fifty-move, and threefold repetition all detected and wired into postMoveChecks.');
