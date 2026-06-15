#!/usr/bin/env node
// Static sudoku-uniqueness check for grid-number games.
//
// A well-formed sudoku has exactly ONE solution. volt-sudoku stage 2 (PRISM)
// shipped an under-constrained puzzle with TWO solutions — a deadly {1,8}
// rectangle at r7c5/r7c8/r9c5/r9c8 — so a player who entered the OTHER perfectly
// valid solution was flagged "mistake", penalized, and the stage stalled. No
// render/smoke gate can see this. This gate parses each stage's puzzle and
// asserts it has a unique solution equal to the stage's declared solution.

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const issues = [];

const SUDOKU_GAMES = [{ file: 'websites/volt-sudoku.html', expectStages: 4 }];

// Backtracking solver that collects up to `limit` solutions (early-exits at the
// cap, so detecting non-uniqueness is cheap).
function solutions(puzzle, limit) {
  const grid = puzzle.split('').map((ch) => (ch === '0' ? 0 : Number(ch)));
  const found = [];
  function fits(index, value) {
    const r = Math.floor(index / 9);
    const c = index % 9;
    for (let k = 0; k < 9; k += 1) {
      if (grid[r * 9 + k] === value) return false;
      if (grid[k * 9 + c] === value) return false;
    }
    const br = Math.floor(r / 3) * 3;
    const bc = Math.floor(c / 3) * 3;
    for (let dr = 0; dr < 3; dr += 1) {
      for (let dc = 0; dc < 3; dc += 1) {
        if (grid[(br + dr) * 9 + (bc + dc)] === value) return false;
      }
    }
    return true;
  }
  function solve() {
    if (found.length >= limit) return;
    const index = grid.indexOf(0);
    if (index === -1) {
      found.push(grid.join(''));
      return;
    }
    for (let value = 1; value <= 9; value += 1) {
      if (fits(index, value)) {
        grid[index] = value;
        solve();
        grid[index] = 0;
        if (found.length >= limit) return;
      }
    }
  }
  solve();
  return found;
}

function extractConsts(src) {
  const map = {};
  for (const match of src.matchAll(/const\s+(\w+)\s*=\s*"(\d{81})"/g)) map[match[1]] = match[2];
  return map;
}

function extractStagePairs(src) {
  // stage("name", "copy", PUZZLE_CONST, SOLUTION_CONST, ...)
  const pairs = [];
  for (const match of src.matchAll(/stage\(\s*"([^"]*)"\s*,\s*"[^"]*"\s*,\s*(\w+)\s*,\s*(\w+)/g)) {
    pairs.push({ name: match[1], puzzle: match[2], solution: match[3] });
  }
  return pairs;
}

for (const game of SUDOKU_GAMES) {
  let src;
  try {
    src = await readFile(join(repoRoot, game.file), 'utf8');
  } catch (error) {
    issues.push(`${game.file}: unreadable (${error.message})`);
    continue;
  }
  const consts = extractConsts(src);
  const pairs = extractStagePairs(src);
  if (game.expectStages && pairs.length !== game.expectStages) {
    issues.push(`${game.file}: expected ${game.expectStages} stage() pairs, parsed ${pairs.length}`);
  }
  if (!pairs.length) {
    issues.push(`${game.file}: no stage() puzzle/solution pairs found`);
    continue;
  }
  pairs.forEach((pair, index) => {
    const stage = index + 1;
    const puzzle = consts[pair.puzzle];
    const solution = consts[pair.solution];
    if (!puzzle || !solution) {
      issues.push(`${game.file} stage ${stage} (${pair.name}): missing ${!puzzle ? `puzzle const ${pair.puzzle}` : `solution const ${pair.solution}`} (or not 81 digits)`);
      return;
    }
    const sols = solutions(puzzle, 2);
    if (sols.length === 0) {
      issues.push(`${game.file} stage ${stage} (${pair.name}): puzzle has NO solution`);
    } else if (sols.length > 1) {
      issues.push(`${game.file} stage ${stage} (${pair.name}): puzzle is under-constrained (multiple solutions) — a logically-correct entry can be wrongly rejected and the stage stalls`);
    } else if (sols[0] !== solution) {
      issues.push(`${game.file} stage ${stage} (${pair.name}): the unique solution does not match the declared solution constant ${pair.solution}`);
    }
  });
}

if (issues.length) {
  console.error(`Sudoku uniqueness check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues) console.error(` - ${issue}`);
  process.exit(1);
}

const stageTotal = SUDOKU_GAMES.reduce((sum, g) => sum + (g.expectStages || 0), 0);
console.log(`Sudoku uniqueness check passed: every stage puzzle has exactly one solution matching its declared solution (${SUDOKU_GAMES.length} game(s), ${stageTotal} stages).`);
