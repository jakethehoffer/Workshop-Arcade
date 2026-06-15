#!/usr/bin/env node
// Static orbit-salvage win-reachability check.
//
// orbit-salvage is a single-launch gravity slingshot: each attempt converts an
// (aim, power) pair into a launch velocity, then the skiff coasts under capped
// inverse-square gravity until it rescues a pod, hits a planet, drifts off, or
// times out. crash() does NOT un-rescue pods, so a run is built across many
// launches: rescue every pod (each within 29px on some launch), then dock at
// the beacon (within 31px once all pods are held). The level is therefore
// completable iff EACH pod and the beacon are independently reachable from the
// station by some launch the player can actually dial in.
//
// Four sectors shipped with pods and/or beacons in gravity dead zones that no
// launch can reach (an exhaustive aim/power sweep never lands inside the dock
// radius) — uncompletable, and invisible to render/smoke gates, which drive the
// game but never prove a target is reachable. This gate replays the game's
// EXACT launch + integration rules over the keyboard control lattice
// (aim = level.aim + 0.08k, power = clamp(level.power + 0.05j, 0.18, 1) — the
// discrete inputs Arrow/WASD produce) and asserts every pod and beacon is hit.
// Reachability on that lattice guarantees both keyboard play and the strictly
// finer pointer-drag aim, so a fix that passes here is completable by any input.
//
// Mirrors websites/orbit-salvage.html update()/launch() exactly. The model is
// verified faithful by a keyboard-driven full-campaign replay in a real browser
// (see the commit landing this gate): the launches it finds actually clear all
// four sectors in the shipped game.

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const issues = [];

// Constants mirrored from websites/orbit-salvage.html.
const W = 960;
const H = 540;
const DT = 1 / 60;
const SHIP_R = 8;
const POD_R = 14;
const POD_HIT = SHIP_R + POD_R + 7; // dist(ship,pod) < 29 rescues
const DOCK_R = 31;                  // dist(ship,beacon) < 31 docks
const GRAV_CAP = 520;               // force = Math.min(520, mass / d2)
const SOFTEN = 900;                 // d2 = Math.max(900, dx*dx + dy*dy)
const DRAG = 0.999;                 // per-frame velocity decay
const MAX_T = 16;                   // elapsed > 16 -> crash
const OOB = 90;                     // |x|,|y| beyond bounds by 90 -> crash
const SPEED_BASE = 260;
const SPEED_RANGE = 360;            // speed = 260 + power * 360
const AIM_STEP = 0.08;              // Arrow/WASD aim nudge
const POWER_STEP = 0.05;            // Arrow/WASD power nudge
const POWER_MIN = 0.18;
const POWER_MAX = 1;
const AIM_PRESSES = 79;             // k in [-79, 79] covers a full turn at 0.08

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// One launch. Returns the closest approach (px) to each pod and to the beacon
// over the whole flight. Mirrors update() frame-for-frame.
function flight(level, aim, power) {
  const speed = SPEED_BASE + power * SPEED_RANGE;
  let x = level.station.x;
  let y = level.station.y;
  let vx = Math.cos(aim) * speed;
  let vy = Math.sin(aim) * speed;
  const podMin = level.pods.map(() => Infinity);
  let beaconMin = Infinity;
  let elapsed = 0;
  const steps = Math.round(MAX_T * 60) + 2;
  for (let s = 0; s < steps; s += 1) {
    let ax = 0;
    let ay = 0;
    for (const p of level.planets) {
      const dx = p.x - x;
      const dy = p.y - y;
      const d2 = Math.max(SOFTEN, dx * dx + dy * dy);
      const d = Math.sqrt(d2);
      const force = Math.min(GRAV_CAP, p.mass / d2);
      ax += (dx / d) * force;
      ay += (dy / d) * force;
      if (d < p.r + SHIP_R) return { podMin, beaconMin }; // planet collision
    }
    vx += ax * DT;
    vy += ay * DT;
    x += vx * DT;
    y += vy * DT;
    vx *= DRAG;
    vy *= DRAG;
    for (let i = 0; i < level.pods.length; i += 1) {
      const dx = x - level.pods[i].x;
      const dy = y - level.pods[i].y;
      const dp = Math.sqrt(dx * dx + dy * dy);
      if (dp < podMin[i]) podMin[i] = dp;
    }
    const bx = x - level.beacon.x;
    const by = y - level.beacon.y;
    const db = Math.sqrt(bx * bx + by * by);
    if (db < beaconMin) beaconMin = db;
    if (x < -OOB || x > W + OOB || y < -OOB || y > H + OOB) return { podMin, beaconMin };
    elapsed += DT;
    if (elapsed > MAX_T) return { podMin, beaconMin };
  }
  return { podMin, beaconMin };
}

// The discrete (aim, power) pairs a keyboard player can dial in from the level
// defaults: aim shifts by 0.08 per press (any number of presses), power by 0.05
// clamped to [0.18, 1].
function keyboardLaunches(level) {
  const aims = [];
  for (let k = -AIM_PRESSES; k <= AIM_PRESSES; k += 1) aims.push(level.aim + AIM_STEP * k);
  const powers = new Set();
  for (let j = -25; j <= 25; j += 1) powers.add(clamp(level.power + POWER_STEP * j, POWER_MIN, POWER_MAX));
  const out = [];
  for (const a of aims) for (const p of powers) out.push([a, p]);
  return out;
}

function checkLevel(level, index) {
  const podReached = level.pods.map(() => false);
  const podBest = level.pods.map(() => Infinity);
  let beaconReached = false;
  let beaconBest = Infinity;
  let remaining = level.pods.length + 1;
  for (const [aim, power] of keyboardLaunches(level)) {
    const { podMin, beaconMin } = flight(level, aim, power);
    for (let i = 0; i < podMin.length; i += 1) {
      if (podMin[i] < podBest[i]) podBest[i] = podMin[i];
      if (!podReached[i] && podMin[i] < POD_HIT) { podReached[i] = true; remaining -= 1; }
    }
    if (beaconMin < beaconBest) beaconBest = beaconMin;
    if (!beaconReached && beaconMin < DOCK_R) { beaconReached = true; remaining -= 1; }
    if (remaining === 0) return; // every target reachable — done early
  }
  const name = level.name || `index ${index}`;
  podReached.forEach((ok, i) => {
    if (!ok) {
      issues.push(`websites/orbit-salvage.html sector ${index + 1} ("${name}"): pod ${i + 1} at (${level.pods[i].x}, ${level.pods[i].y}) is unreachable — no launch passes within ${POD_HIT}px (closest ${podBest[i].toFixed(1)}px)`);
    }
  });
  if (!beaconReached) {
    issues.push(`websites/orbit-salvage.html sector ${index + 1} ("${name}"): beacon at (${level.beacon.x}, ${level.beacon.y}) is undockable — no launch passes within ${DOCK_R}px (closest ${beaconBest.toFixed(1)}px)`);
  }
}

function extractLevels(src) {
  const match = src.match(/const levels = (\[[\s\S]*?\n {2}\]);/);
  if (!match) throw new Error('could not locate the levels array');
  // The literal is pure data (numbers/strings) from our own trusted source;
  // evaluating it keeps the gate's levels exactly in sync with the game.
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${match[1]});`)();
}

try {
  const src = await readFile(join(repoRoot, 'websites/orbit-salvage.html'), 'utf8');
  const levels = extractLevels(src);
  if (!Array.isArray(levels) || levels.length === 0) {
    issues.push('websites/orbit-salvage.html: parsed empty levels array');
  }
  levels.forEach((level, index) => checkLevel(level, index));
} catch (error) {
  issues.push(error instanceof Error ? error.message : String(error));
}

if (issues.length) {
  console.error(`Orbit-salvage solvability check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues) console.error(` - ${issue}`);
  process.exit(1);
}

console.log('Orbit-salvage solvability check passed: every sector has all pods rescuable and its beacon dockable from the station via the keyboard control lattice.');
