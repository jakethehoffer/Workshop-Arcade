#!/usr/bin/env node
// Static breachline win-reachability check.
//
// breachline is a two-agent synchronized stealth game: each beat you queue a
// move (or wait) for Alpha and Beta, both move, patrols advance one loop step,
// then anyone standing on a patrol or inside its vision cone is spotted (fail).
// Win = grab the core then land both agents on exits. Two missions shipped
// mathematically unsolvable (patrol cones permanently cover the only routes),
// which no render/smoke gate can see. This gate replays the game's EXACT rules
// in a BFS over (Alpha pos, Beta pos, core-held, patrol phase) and asserts every
// mission has a reachable win.
//
// The model is verified faithful by cross-validation: the originally-shippable
// missions must come out solvable while the broken ones come out unsolvable.

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const issues = [];

// Mirrors websites/breachline.html exactly.
const COLS = 8;
const ROWS = 6;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0], wait: [0, 0] };
const COMMANDS = ['up', 'down', 'left', 'right', 'wait'];

function inBounds(x, y) { return x >= 0 && y >= 0 && x < COLS && y < ROWS; }
function isWall(m, x, y) { return m.walls.some(([wx, wy]) => wx === x && wy === y); }
function isExit(m, x, y) { return m.exits.some(([ex, ey]) => ex === x && ey === y); }
function patrolAt(patrol, beat) {
  const s = patrol.loop[beat % patrol.loop.length];
  return { x: s[0], y: s[1], dir: s[2] };
}
// Same shape as visionCells(): 3 cells straight ahead (wall/edge stops it) with
// perpendicular flanks on the first two cells.
function visionCells(m, guard) {
  const [dx, dy] = DIRS[guard.dir];
  const cells = [];
  for (let i = 1; i <= 3; i += 1) {
    const x = guard.x + dx * i;
    const y = guard.y + dy * i;
    if (!inBounds(x, y) || isWall(m, x, y)) break;
    cells.push([x, y]);
    if (i <= 2) {
      const a = dx === 0 ? [x + 1, y] : [x, y + 1];
      const b = dx === 0 ? [x - 1, y] : [x, y - 1];
      if (inBounds(a[0], a[1]) && !isWall(m, a[0], a[1])) cells.push(a);
      if (inBounds(b[0], b[1]) && !isWall(m, b[0], b[1])) cells.push(b);
    }
  }
  return cells;
}
function occupiedByPatrol(m, x, y, beat) {
  return m.patrols.some((patrol) => {
    const g = patrolAt(patrol, beat);
    return g.x === x && g.y === y;
  });
}
function spotted(m, ax, ay, bx, by, beat) {
  for (const patrol of m.patrols) {
    const g = patrolAt(patrol, beat);
    const vis = visionCells(m, g);
    for (const [px, py] of [[ax, ay], [bx, by]]) {
      if ((g.x === px && g.y === py) || vis.some(([x, y]) => x === px && y === py)) return true;
    }
  }
  return false;
}
function lcm(a, b) {
  const gcd = (p, q) => (q ? gcd(q, p % q) : p);
  return (a * b) / gcd(a, b);
}

// One beat: returns null if the command pair is "blocked" (game does nothing),
// otherwise the resulting state plus spotted/win flags. Mirrors executeBeat().
function applyBeat(m, s, ca, cb) {
  const beat = s.beat;
  const cur = { A: { x: s.ax, y: s.ay }, B: { x: s.bx, y: s.by } };
  const targets = {};
  let blocked = false;
  for (const id of ['A', 'B']) {
    const cmd = id === 'A' ? ca : cb;
    const [dx, dy] = DIRS[cmd];
    const x = cur[id].x + dx;
    const y = cur[id].y + dy;
    if (!inBounds(x, y) || isWall(m, x, y) || occupiedByPatrol(m, x, y, beat)) {
      if (cmd !== 'wait') blocked = true;
      targets[id] = { x: cur[id].x, y: cur[id].y };
    } else {
      targets[id] = { x, y };
    }
  }
  if (targets.A.x === targets.B.x && targets.A.y === targets.B.y && !isExit(m, targets.A.x, targets.A.y)) blocked = true;
  if (targets.A.x === cur.B.x && targets.A.y === cur.B.y && targets.B.x === cur.A.x && targets.B.y === cur.A.y) blocked = true;
  if (blocked) return null;

  const newBeat = beat + 1;
  let core = s.core;
  if (!core && ((targets.A.x === m.core[0] && targets.A.y === m.core[1]) || (targets.B.x === m.core[0] && targets.B.y === m.core[1]))) {
    core = 1;
  }
  if (spotted(m, targets.A.x, targets.A.y, targets.B.x, targets.B.y, newBeat)) return { spotted: true };
  const win = core === 1 && isExit(m, targets.A.x, targets.A.y) && isExit(m, targets.B.x, targets.B.y);
  return { spotted: false, win, state: { ax: targets.A.x, ay: targets.A.y, bx: targets.B.x, by: targets.B.y, core, beat: newBeat } };
}

function isSolvable(m) {
  const period = m.patrols.reduce((acc, p) => lcm(acc, p.loop.length), 1) || 1;
  const start = { ax: m.agents.A[0], ay: m.agents.A[1], bx: m.agents.B[0], by: m.agents.B[1], core: 0, beat: 0 };
  const key = (s) => `${s.ax},${s.ay},${s.bx},${s.by},${s.core},${s.beat % period}`;
  const seen = new Set([key(start)]);
  let frontier = [start];
  let guard = 0;
  while (frontier.length) {
    if (++guard > 2_000_000) return false; // defensive; state space is far smaller
    const next = [];
    for (const s of frontier) {
      for (const ca of COMMANDS) {
        for (const cb of COMMANDS) {
          const res = applyBeat(m, s, ca, cb);
          if (!res || res.spotted) continue;
          if (res.win) return true;
          const k = key(res.state);
          if (!seen.has(k)) { seen.add(k); next.push(res.state); }
        }
      }
    }
    frontier = next;
  }
  return false;
}

function extractMissions(src) {
  const match = src.match(/const missions = (\[[\s\S]*?\n\]);/);
  if (!match) throw new Error('could not locate the missions array');
  // The literal is pure data (arrays/strings/numbers) from our own trusted
  // source; evaluating it keeps the gate's missions exactly in sync with the
  // game with no fragile hand-parsing.
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${match[1]});`)();
}

try {
  const src = await readFile(join(repoRoot, 'websites/breachline.html'), 'utf8');
  const missions = extractMissions(src);
  if (!Array.isArray(missions) || missions.length === 0) {
    issues.push('websites/breachline.html: parsed empty missions array');
  }
  missions.forEach((m, index) => {
    if (!isSolvable(m)) {
      issues.push(`websites/breachline.html mission ${index + 1} ("${m.name}"): unwinnable — no route grabs the core and extracts both agents past the patrol cones`);
    }
  });
} catch (error) {
  issues.push(error instanceof Error ? error.message : String(error));
}

if (issues.length) {
  console.error(`Breachline solvability check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues) console.error(` - ${issue}`);
  process.exit(1);
}

console.log('Breachline solvability check passed: every mission has a reachable win (core grabbed, both agents extracted past the patrol cones).');
