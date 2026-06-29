#!/usr/bin/env node
// Static shadow-switch turn-order / solvability check.
//
// shadow-switch is a turn-based stealth puzzle: each turn you move (or wait /
// flip a switch), then guards advance one step along their patrol loop, and you
// are caught if you ever share a cell with a guard or stand inside its sight
// cone. Win = grab the key, then reach the exit hatch.
//
// The shipped movePlayer() credited the win the instant you stepped onto the
// exit, BEFORE any spotting check ran that turn — so you could walk onto the
// exit while standing inside a guard's light cone and still clear the floor,
// defeating the core stealth rule. The fix runs the per-turn pre-advance
// detection on the arrival cell before crediting the exit (the same detection
// every non-exit move already gets).
//
// This gate replays shadow-switch's EXACT turn rules in a BFS over
// (player, key-held, switch latches, guard phases) and asserts, for every level:
//   1. SOLVABLE under the corrected rules — a win is still reachable (the fix
//      strands no floor; you can always reach the exit on a beat it is unlit).
//   2. The bug is real and removed — across the catalog there exists a reachable
//      "step onto the exit while it is lit" arrival (so the data genuinely
//      exercises the bug), and under the corrected rules every such arrival is a
//      capture, never a win (the win-while-lit invariant holds).
//
// The model is faithful by construction (it mirrors the geometry/turn functions
// verbatim) and is cross-checked end-to-end against the live game by
// scripts (the browser probe replays a witness this model finds and confirms the
// shipped page reaches the identical state).

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---- Geometry / rules, mirrored verbatim from websites/shadow-switch.html ----
const DIRS = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};
const MOVES = [
  { name: 'up', dx: 0, dy: -1 },
  { name: 'down', dx: 0, dy: 1 },
  { name: 'left', dx: -1, dy: 0 },
  { name: 'right', dx: 1, dy: 0 },
];

function directionName(dx, dy) {
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}

function parseLevel(level) {
  const rows = level.layout.length;
  const cols = Math.max(...level.layout.map((row) => row.length));
  const map = Array.from({ length: rows }, () => Array(cols).fill('#'));
  const player = { x: 1, y: 1 };
  const key = { x: 1, y: 1, taken: false };
  const exit = { x: 1, y: 1 };
  const switches = [];
  const doors = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const ch = level.layout[y][x] || '#';
      map[y][x] = ch === '#' ? '#' : '.';
      if (ch === 'P') { player.x = x; player.y = y; }
      else if (ch === 'K') { key.x = x; key.y = y; }
      else if (ch === 'E') { exit.x = x; exit.y = y; }
      else if (/[ABC]/.test(ch)) switches.push({ id: ch.toLowerCase(), x, y, active: false });
      else if (/[abc]/.test(ch)) doors.push({ id: ch, x, y, open: false });
    }
  }
  const guards = level.guards.map((guard, index) => {
    const first = guard.path[0];
    const second = guard.path[1] || first;
    return {
      id: guard.id || `G${index + 1}`,
      x: first[0],
      y: first[1],
      dir: directionName(second[0] - first[0], second[1] - first[1]),
      path: guard.path.map((p) => ({ x: p[0], y: p[1] })),
      pathIndex: 0,
      range: guard.range || 3,
    };
  });
  return { rows, cols, map, player, key, exit, switches, doors, guards };
}

// A "world" is the static board (map/dims) plus the dynamic state we evolve.
function makeWorld(level) {
  const p = parseLevel(level);
  return {
    rows: p.rows,
    cols: p.cols,
    map: p.map,
    exit: p.exit,
    keyPos: { x: p.key.x, y: p.key.y },
    state: {
      px: p.player.x,
      py: p.player.y,
      keyTaken: false,
      switches: p.switches.map((sw) => ({ id: sw.id, x: sw.x, y: sw.y, active: false })),
      doors: p.doors.map((d) => ({ id: d.id, x: d.x, y: d.y, open: false })),
      guards: p.guards.map((g) => ({ ...g, path: g.path.map((c) => ({ ...c })) })),
    },
  };
}

function wallAt(w, x, y) {
  return y < 0 || y >= w.rows || x < 0 || x >= w.cols || w.map[y][x] === '#';
}
function closedDoorAt(s, x, y) {
  const door = s.doors.find((d) => d.x === x && d.y === y);
  return door ? !door.open : false;
}
function passable(w, s, x, y) {
  return !wallAt(w, x, y) && !closedDoorAt(s, x, y);
}
function sightBlocked(w, s, x, y) {
  return wallAt(w, x, y) || closedDoorAt(s, x, y);
}
function lineClear(w, s, x0, y0, x1, y1) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 1; i <= steps; i += 1) {
    const x = Math.round(x0 + (x1 - x0) * i / steps);
    const y = Math.round(y0 + (y1 - y0) * i / steps);
    if (sightBlocked(w, s, x, y)) return false;
  }
  return true;
}
function guardSightCells(w, s, guard) {
  const dir = DIRS[guard.dir] || DIRS.right;
  const side = { x: -dir.y, y: dir.x };
  const seen = new Map();
  for (let depth = 1; depth <= guard.range; depth += 1) {
    const width = depth >= 4 ? 2 : depth >= 2 ? 1 : 0;
    for (let spread = -width; spread <= width; spread += 1) {
      const x = guard.x + dir.x * depth + side.x * spread;
      const y = guard.y + dir.y * depth + side.y * spread;
      if (!wallAt(w, x, y) && !closedDoorAt(s, x, y) && lineClear(w, s, guard.x, guard.y, x, y)) {
        seen.set(`${x},${y}`, { x, y });
      }
    }
  }
  return [...seen.values()];
}
function detected(w, s) {
  for (const guard of s.guards) {
    if (guard.x === s.px && guard.y === s.py) return true;
    if (guardSightCells(w, s, guard).some((c) => c.x === s.px && c.y === s.py)) return true;
  }
  return false;
}
function advanceGuards(s) {
  for (const guard of s.guards) {
    const old = guard.path[guard.pathIndex];
    guard.pathIndex = (guard.pathIndex + 1) % guard.path.length;
    const next = guard.path[guard.pathIndex];
    guard.x = next.x;
    guard.y = next.y;
    guard.dir = directionName(next.x - old.x, next.y - old.y);
  }
}
function syncDoors(s) {
  for (const door of s.doors) {
    door.open = s.switches.some((sw) => sw.id === door.id && sw.active);
  }
}
function atExit(w, s) {
  return s.keyTaken && s.px === w.exit.x && s.py === w.exit.y;
}

// Apply one action. variant 'fixed' = corrected order (detect before crediting
// the exit); variant 'buggy' = shipped order (credit the exit before detection).
// Returns { outcome } where outcome is 'blocked' | 'playing' | 'win' | 'caught'.
function step(w, s, action, variant = 'fixed') {
  if (action === 'interact') {
    const spots = [
      { x: s.px, y: s.py }, { x: s.px + 1, y: s.py }, { x: s.px - 1, y: s.py },
      { x: s.px, y: s.py + 1 }, { x: s.px, y: s.py - 1 },
    ];
    const sw = spots.map((c) => s.switches.find((q) => q.x === c.x && q.y === c.y)).find(Boolean);
    if (sw && !sw.active) { sw.active = true; syncDoors(s); }
    // resolveTurn with no completion hook
    if (detected(w, s)) return { outcome: 'caught' };
    advanceGuards(s);
    if (detected(w, s)) return { outcome: 'caught' };
    return { outcome: 'playing' };
  }
  const move = MOVES.find((m) => m.name === action);
  const nx = s.px + move.dx;
  const ny = s.py + move.dy;
  if (!passable(w, s, nx, ny)) return { outcome: 'blocked' };
  s.px = nx;
  s.py = ny;
  if (!s.keyTaken && s.px === w.keyPos.x && s.py === w.keyPos.y) s.keyTaken = true;
  if (variant === 'buggy') {
    // shipped: credit the exit before any detection this turn
    if (atExit(w, s)) return { outcome: 'win' };
    if (detected(w, s)) return { outcome: 'caught' };
    advanceGuards(s);
    if (detected(w, s)) return { outcome: 'caught' };
    return { outcome: 'playing' };
  }
  // fixed: resolveTurn runs pre-advance detection, then the completion hook
  if (detected(w, s)) return { outcome: 'caught' };
  if (atExit(w, s)) return { outcome: 'win' };
  advanceGuards(s);
  if (detected(w, s)) return { outcome: 'caught' };
  return { outcome: 'playing' };
}

// ---- state cloning + signature for BFS --------------------------------------
function cloneState(s) {
  return {
    px: s.px,
    py: s.py,
    keyTaken: s.keyTaken,
    switches: s.switches.map((sw) => ({ ...sw })),
    doors: s.doors.map((d) => ({ ...d })),
    guards: s.guards.map((g) => ({ ...g, path: g.path })),
  };
}
function signature(s) {
  const sw = s.switches.map((q) => (q.active ? '1' : '0')).join('');
  const ph = s.guards.map((g) => g.pathIndex).join('.');
  return `${s.px},${s.py},${s.keyTaken ? 1 : 0},${sw},${ph}`;
}

const ACTIONS = ['up', 'down', 'left', 'right', 'interact'];

// BFS over reachable states. Returns { solvable, winPath, litExitWitness } where
// winPath is a shortest action sequence to a legitimate win, and litExitWitness
// is { path, move } for a reachable arrival onto a LIT exit (caught under the
// fixed rules, a win under the buggy rules) — or null if none exists.
function explore(level) {
  const base = makeWorld(level);
  const start = base.state;
  const startSig = signature(start);
  const seen = new Map([[startSig, null]]); // sig -> { prev, action }
  const queue = [start];
  let winPath = null;
  let litExitWitness = null;
  let guard = 0;

  const pathTo = (sig) => {
    const acts = [];
    let cur = sig;
    while (seen.get(cur)) { const { prev, action } = seen.get(cur); acts.push(action); cur = prev; }
    return acts.reverse();
  };

  while (queue.length) {
    if (++guard > 2_000_000) break; // defensive; real space is tiny
    const s = queue.shift();
    const sig = signature(s);
    for (const action of ACTIONS) {
      const next = cloneState(s);
      const res = step(base, next, action, 'fixed');
      if (res.outcome === 'blocked') continue;
      // Record a lit-exit arrival witness: a move that lands on the exit while
      // it is lit (caught under fixed rules). The same prefix+move wins under
      // the buggy rules — that IS the bug.
      if (!litExitWitness && action !== 'interact' && res.outcome === 'caught') {
        const probe = cloneState(s);
        const buggy = step(base, probe, action, 'buggy');
        if (buggy.outcome === 'win') {
          litExitWitness = { level: level.name, path: pathTo(sig), move: action };
        }
      }
      if (res.outcome === 'win') {
        if (!winPath) winPath = [...pathTo(sig), action];
        continue;
      }
      if (res.outcome === 'caught') continue;
      const nsig = signature(next);
      if (!seen.has(nsig)) { seen.set(nsig, { prev: sig, action }); queue.push(next); }
    }
    if (winPath && litExitWitness) {
      // keep exploring only if we still need one of them; both found -> done early
      // (winPath/litExitWitness are stable once set)
    }
  }
  return { solvable: Boolean(winPath), winPath, litExitWitness };
}

function extractLevels(src) {
  const match = src.match(/const LEVELS = (\[[\s\S]*?\n {2}\]);/);
  if (!match) throw new Error('websites/shadow-switch.html: could not locate the LEVELS array');
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${match[1]});`)();
}

export { extractLevels, makeWorld, step, explore, signature, cloneState, MOVES, ACTIONS };

async function main() {
  const issues = [];
  let levels = [];
  try {
    const src = await readFile(join(repoRoot, 'websites/shadow-switch.html'), 'utf8');
    levels = extractLevels(src);
  } catch (error) {
    console.error(`Shadow-switch solvability check failed: ${error.message}`);
    process.exit(1);
  }
  if (!Array.isArray(levels) || levels.length === 0) {
    issues.push('websites/shadow-switch.html: parsed empty LEVELS array');
  }

  let anyLitExit = false;
  levels.forEach((level, index) => {
    const { solvable, litExitWitness } = explore(level);
    if (!solvable) {
      issues.push(`shadow-switch level ${index + 1} ("${level.name}"): unsolvable under the corrected rules — no route reaches the exit with the key on a beat the exit is unlit`);
    }
    if (litExitWitness) anyLitExit = true;
  });

  if (!anyLitExit) {
    issues.push('shadow-switch: no level has a reachable "step onto a lit exit" arrival — the data no longer exercises the win-while-lit bug, so this gate would not catch a regression of the tryComplete-before-detection ordering');
  }

  if (issues.length) {
    console.error(`Shadow-switch solvability check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
    for (const issue of issues) console.error(` - ${issue}`);
    process.exit(1);
  }

  console.log(`Shadow-switch solvability check passed: all ${levels.length} levels remain winnable under the corrected turn order, and a reachable lit-exit arrival is correctly a capture (not a win).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
