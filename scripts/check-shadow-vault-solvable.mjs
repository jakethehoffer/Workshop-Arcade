#!/usr/bin/env node
// Static shadow-vault turn-order / solvability check.
//
// shadow-vault is a turn-based stealth puzzle: each move the player steps, then
// guards advance along ping-pong patrol routes (tickTurn), then the arrival cell
// is checked against guard vision cones (resolveVision) — being seen raises a
// 0..100 alert meter (+28 per spot, -3 when clear) and a lockdown (lose) only at
// 100. Win = collect every key, open every door, and reach the exit.
//
// The shipped tryMove ran collectKeys -> checkExit -> tickTurn, so the floor was
// CREDITED the instant you stepped onto the exit, BEFORE that turn's spotting
// check ran. You could clear a vault while standing in a guard's cone, the
// spotting never counting (and, if it would have hit alert 100, you got a
// contradictory "won" with a "lost" flipped in behind it plus a stray stage
// timer). The fix runs tickTurn (detection) before checkExit and gates the
// credit on mode === "playing".
//
// This gate replays shadow-vault's EXACT turn rules in an alert-minimizing
// search and asserts, for every level, that a win is still reachable under the
// corrected order — the player can collect all keys, open all doors, and reach
// the exit with alert below the 100 lockdown — so the fix strands no level. It
// also confirms a reachable "step onto a lit exit" arrival exists (the data
// exercises the credit-before-detection bug the fix removes).
//
// The model mirrors tickTurn/visibleCells/resolveVision/openDoorAt/checkExit
// verbatim and is cross-checked end-to-end against the live game by the browser
// probe, which replays a path this model finds and confirms the shipped page
// reaches the identical state.

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const dirs = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0], wait: [0, 0] };
const dirVec = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
const dirOrder = ['N', 'E', 'S', 'W'];
const MOVE_ACTIONS = ['up', 'down', 'left', 'right', 'wait'];

function wallBlocksStatic(level, x, y) {
  if (x < 0 || y < 0 || x >= level.size[0] || y >= level.size[1]) return true;
  return level.walls.some((r) => x >= r[0] && x < r[0] + r[2] && y >= r[1] && y < r[1] + r[3]);
}
function popcount(n) { let c = 0; while (n) { c += n & 1; n >>= 1; } return c; }

// ---- guard patrol, mirrored from tickTurn() -------------------------------
function initGuards(level) {
  return level.guards.map((g) => ({
    x: g.x, y: g.y, dir: g.dir, route: g.route.map((p) => [...p]),
    routeIndex: 0, speed: g.speed, turn: 0,
  }));
}
function advanceGuards(guards) {
  for (const g of guards) {
    g.turn += g.speed;
    if (g.turn < 1) continue;
    g.turn -= 1;
    const target = g.route[(g.routeIndex + 1) % g.route.length];
    const dx = Math.sign(target[0] - g.x);
    const dy = Math.sign(target[1] - g.y);
    if (dx || dy) {
      g.x += dx; g.y += dy;
      g.dir = dx > 0 ? 'E' : dx < 0 ? 'W' : dy > 0 ? 'S' : 'N';
    }
    if (g.x === target[0] && g.y === target[1]) {
      g.routeIndex = (g.routeIndex + 1) % g.route.length;
      const next = g.route[(g.routeIndex + 1) % g.route.length];
      const ndx = Math.sign(next[0] - g.x);
      const ndy = Math.sign(next[1] - g.y);
      if (ndx || ndy) g.dir = ndx > 0 ? 'E' : ndx < 0 ? 'W' : ndy > 0 ? 'S' : 'N';
    }
  }
  return guards;
}
// Behavioral key: for speed >= 1 the guard always moves (turn is always >= 1
// after adding speed), so turn never affects behavior and would otherwise grow
// unbounded — omit it. For speed < 1 the fractional turn decides the periodic
// skip, so include it (quantized).
function guardKey(guards) {
  return guards.map((g) => (g.speed >= 1
    ? `${g.x},${g.y},${g.dir},${g.routeIndex}`
    : `${g.x},${g.y},${g.dir},${g.routeIndex},${g.turn.toFixed(3)}`)).join('|');
}
// The guards' initial dir comes from level data and can be inconsistent with
// routeIndex 0 (e.g. dir "W" while heading toward route[1] to the east), so the
// very first state is a TRANSIENT that never recurs. We therefore detect the
// cycle with an offset: the config sequence is configs[0..offset-1] (transient)
// then a `period`-long loop. canonIdx maps any elapsed-tick count into the
// finite canonical index space so the BFS stays bounded. (Detection only ever
// uses post-advance configs, i.e. index >= 1.)
function buildGuardCycle(level) {
  const configs = [];
  const firstSeen = new Map();
  const guards = initGuards(level);
  let offset = 0;
  let period = 0;
  for (let k = 0; k < 20000; k += 1) {
    const key = guardKey(guards);
    if (firstSeen.has(key)) { offset = firstSeen.get(key); period = k - offset; break; }
    firstSeen.set(key, k);
    configs.push(guards.map((g) => ({ x: g.x, y: g.y, dir: g.dir })));
    advanceGuards(guards);
  }
  if (!period) { offset = 0; period = configs.length; }
  const canonIdx = (t) => (t < offset ? t : offset + ((t - offset) % period));
  return { configs, offset, period, canonIdx };
}

// ---- vision cone, mirrored from visibleCells() (doors-aware) --------------
function coneBlocked(level, closedDoors, x, y) {
  return wallBlocksStatic(level, x, y) || closedDoors.has(`${x},${y}`);
}
function visibleCells(level, closedDoors, guard) {
  const [dx, dy] = dirVec[guard.dir];
  const left = dirOrder[(dirOrder.indexOf(guard.dir) + 3) % 4];
  const side = dirVec[left];
  const cells = [];
  for (let r = 1; r <= 3; r += 1) {
    const width = r === 1 ? 0 : 1;
    for (let off = -width; off <= width; off += 1) {
      const x = guard.x + dx * r + side[0] * off;
      const y = guard.y + dy * r + side[1] * off;
      if (coneBlocked(level, closedDoors, x, y)) {
        if (off === 0) break;
        continue;
      }
      cells.push([x, y]);
    }
  }
  return cells;
}
function spottedAt(level, config, closedDoors, px, py) {
  for (const g of config) {
    if (g.x === px && g.y === py) return true;
    if (visibleCells(level, closedDoors, g).some((c) => c[0] === px && c[1] === py)) return true;
  }
  return false;
}

// ---- alert-minimizing search: does a win (alert < 100) exist? -------------
// Lower alert dominates (it only ever buys lockdown headroom and never changes
// guard behavior), so a bucket-Dijkstra over base-states (player, keysMask,
// doorsMask, tick % cycle) keyed on the minimum reachable alert is sound.
function solveWinnable(level) {
  const { configs, canonIdx } = buildGuardCycle(level);
  const keysAll = (1 << level.keys.length) - 1;
  const doorsAll = (1 << level.doors.length) - 1;
  const closedDoorsFor = (doorsMask) => {
    const s = new Set();
    level.doors.forEach((d, i) => { if (!(doorsMask & (1 << i))) s.add(`${d[0]},${d[1]}`); });
    return s;
  };
  // Alert can both rise (+28 when spotted) and fall (-3 when clear). The -3 is a
  // negative edge, so Dijkstra is unsound — use SPFA-style relaxation: track the
  // minimum alert to reach each base-state (player, keys, doors, tick) and
  // re-process a base-state whenever that minimum improves. Lower alert strictly
  // dominates (more lockdown headroom, identical future), so min-alert is the
  // right potential and the search is sound.
  const baseSig = (s) => `${s.x},${s.y},${s.keys},${s.doors},${s.tick}`;
  const start = { x: level.start[0], y: level.start[1], keys: 0, doors: 0, tick: 0, alert: 0 };
  const startSig = baseSig(start);
  const best = new Map([[startSig, 0]]);
  const stateAt = new Map([[startSig, start]]);
  const queue = [startSig];
  const inQueue = new Set([startSig]);
  let litExit = false;
  let solved = false;
  let work = 0;

  while (queue.length) {
    if (++work > 40_000_000) break;
    const sSig = queue.shift();
    inQueue.delete(sSig);
    const s = stateAt.get(sSig);
    if (s.alert !== best.get(sSig)) continue; // stale
    const keysHeld = popcount(s.keys) - popcount(s.doors);
    const closed = closedDoorsFor(s.doors);
    for (const action of MOVE_ACTIONS) {
      const [ddx, ddy] = dirs[action];
      let nx = s.x; let ny = s.y; let nkeys = s.keys; let ndoors = s.doors;
      if (action !== 'wait') {
        const tx = s.x + ddx; const ty = s.y + ddy;
        if (wallBlocksStatic(level, tx, ty)) continue; // don't bump walls (+5 alert, never useful)
        const doorIdx = level.doors.findIndex((d, i) => !(s.doors & (1 << i)) && d[0] === tx && d[1] === ty);
        if (doorIdx >= 0) {
          if (keysHeld <= 0) continue; // keyless door bump -> skip
          ndoors = s.doors | (1 << doorIdx);
        }
        nx = tx; ny = ty;
        const keyIdx = level.keys.findIndex((k, i) => !(s.keys & (1 << i)) && k[0] === nx && k[1] === ny);
        if (keyIdx >= 0) nkeys = s.keys | (1 << keyIdx);
      }
      const ntick = canonIdx(s.tick + 1);
      const nclosed = (ndoors === s.doors) ? closed : closedDoorsFor(ndoors);
      const spotted = spottedAt(level, configs[ntick], nclosed, nx, ny);
      const nalert = spotted ? Math.min(100, s.alert + 28) : Math.max(0, s.alert - 3);
      const atExit = nx === level.exit[0] && ny === level.exit[1] && nkeys === keysAll && ndoors === doorsAll;
      if (spotted && atExit) litExit = true; // free win under the buggy order
      if (nalert >= 100) continue; // lockdown = lost
      if (atExit) { solved = true; continue; } // fixed order: detection applied, alert < 100 -> win
      const ns = { x: nx, y: ny, keys: nkeys, doors: ndoors, tick: ntick, alert: nalert };
      const k = baseSig(ns);
      if ((best.get(k) ?? 101) > nalert) {
        best.set(k, nalert);
        stateAt.set(k, ns);
        if (!inQueue.has(k)) { queue.push(k); inQueue.add(k); }
      }
    }
  }
  return { solvable: solved, litExitWitness: litExit ? { level: level.name } : null };
}

function extractLevels(src) {
  const match = src.match(/const levels = (\[[\s\S]*?\n {2}\]);/);
  if (!match) throw new Error('websites/shadow-vault.html: could not locate the levels array');
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${match[1]});`)();
}

export { extractLevels, buildGuardCycle, visibleCells, spottedAt, solveWinnable, MOVE_ACTIONS, dirs };

async function main() {
  const issues = [];
  let levels = [];
  try {
    const src = await readFile(join(repoRoot, 'websites/shadow-vault.html'), 'utf8');
    levels = extractLevels(src);
  } catch (error) {
    console.error(`Shadow-vault solvability check failed: ${error.message}`);
    process.exit(1);
  }
  if (!Array.isArray(levels) || levels.length === 0) issues.push('websites/shadow-vault.html: parsed empty levels array');

  let anyLitExit = false;
  levels.forEach((level, index) => {
    const { solvable, litExitWitness } = solveWinnable(level);
    if (!solvable) {
      issues.push(`shadow-vault level ${index + 1} ("${level.name}"): no win is reachable under the corrected detect-before-credit order — no route collects all keys, opens all doors, and reaches the exit with alert below the 100 lockdown`);
    }
    if (litExitWitness) anyLitExit = true;
  });

  if (!anyLitExit) {
    issues.push('shadow-vault: no level has a reachable "step onto a lit exit" arrival — the data no longer exercises the credit-before-detection bug, so this gate would not catch a regression of the tryMove ordering');
  }

  if (issues.length) {
    console.error(`Shadow-vault solvability check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
    for (const issue of issues) console.error(` - ${issue}`);
    process.exit(1);
  }

  console.log(`Shadow-vault solvability check passed: all ${levels.length} levels remain winnable under the corrected turn order, and a reachable lit-exit arrival is exercised by the data.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
