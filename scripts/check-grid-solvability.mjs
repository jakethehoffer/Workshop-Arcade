#!/usr/bin/env node
// Static grid-solvability check for tile-based games.
//
// Parses each stage's map and asserts the start cell can reach BOTH the asset
// and the exit through non-wall cells (4-connected BFS). This is the
// win-reachability assertion the game-quality audit recommended: it catches
// "objective sealed by a wall" bugs that no render/smoke gate can see —
// nightwire stage 2 shipped with a solid column splitting the board, making
// the asset physically unreachable and the stage unwinnable.
//
// This checks PHYSICAL reachability (walls only), not full stealth solvability
// (guard vision cones are a separate, softer constraint) — but an objective you
// cannot even walk to is a definite, deterministic failure.

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const issues = [];

// Tile games whose stage maps must be physically solvable. Markers match the
// game's own loadLevel parser.
const GRID_GAMES = [
  { file: 'websites/nightwire.html', start: 'A', asset: '*', exit: 'E', wall: '#', expectStages: 5 },
];

function extractMaps(src) {
  // Each stage is `map: [ "row", "row", ... ]`. Pull the quoted rows per block.
  const maps = [];
  const blockRe = /\bmap:\s*\[([\s\S]*?)\]/g;
  let match;
  while ((match = blockRe.exec(src))) {
    const rows = [...match[1].matchAll(/"([^"]*)"/g)].map((row) => row[1]);
    if (rows.length) maps.push(rows);
  }
  return maps;
}

function findCell(rows, ch) {
  for (let y = 0; y < rows.length; y += 1) {
    const x = rows[y].indexOf(ch);
    if (x !== -1) return { x, y };
  }
  return null;
}

function floodReachable(rows, start, wall) {
  const height = rows.length;
  const width = Math.max(...rows.map((row) => row.length));
  const seen = new Set([`${start.x},${start.y}`]);
  const queue = [start];
  while (queue.length) {
    const { x, y } = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || ny >= height || nx >= width) continue;
      const key = `${nx},${ny}`;
      if (seen.has(key)) continue;
      if ((rows[ny][nx] || wall) === wall) continue;
      seen.add(key);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

for (const game of GRID_GAMES) {
  let src;
  try {
    src = await readFile(join(repoRoot, game.file), 'utf8');
  } catch (error) {
    issues.push(`${game.file}: unreadable (${error.message})`);
    continue;
  }
  const maps = extractMaps(src);
  if (game.expectStages && maps.length !== game.expectStages) {
    issues.push(`${game.file}: expected ${game.expectStages} stage maps, parsed ${maps.length}`);
  }
  if (!maps.length) {
    issues.push(`${game.file}: no stage maps found`);
    continue;
  }
  maps.forEach((rows, index) => {
    const stage = index + 1;
    const start = findCell(rows, game.start);
    const asset = findCell(rows, game.asset);
    const exit = findCell(rows, game.exit);
    if (!start || !asset || !exit) {
      issues.push(`${game.file} stage ${stage}: missing ${!start ? `start '${game.start}'` : !asset ? `asset '${game.asset}'` : `exit '${game.exit}'`}`);
      return;
    }
    const reachable = floodReachable(rows, start, game.wall);
    if (!reachable.has(`${asset.x},${asset.y}`)) {
      issues.push(`${game.file} stage ${stage}: asset (${asset.x},${asset.y}) is unreachable from start (${start.x},${start.y}) — walls seal it off, stage is unwinnable`);
    }
    if (!reachable.has(`${exit.x},${exit.y}`)) {
      issues.push(`${game.file} stage ${stage}: exit (${exit.x},${exit.y}) is unreachable from start (${start.x},${start.y})`);
    }
  });
}

if (issues.length) {
  console.error(`Grid solvability check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues) console.error(` - ${issue}`);
  process.exit(1);
}

const stageTotal = GRID_GAMES.reduce((sum, g) => sum + (g.expectStages || 0), 0);
console.log(`Grid solvability check passed: every stage start reaches its asset and exit through floor (${GRID_GAMES.length} game(s), ${stageTotal} stages).`);
