import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, access, rm, symlink, realpath, utimes} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pruneRenderCaptures} from './prune-render-captures.mjs';

const workspace = await realpath(await mkdtemp(join(tmpdir(), 'wa-retention-')));
const root = join(workspace, 'test-results', 'render-ranking');
async function exists(path) { try { await access(path); return true; } catch { return false; } }
const stamp = day => `2026-09-${String(day).padStart(2, '0')}T00-00-00-000Z`;
try {
  for (let day = 1; day <= 13; day++) {
    const run = join(root, stamp(day));
    await mkdir(run, {recursive: true});
    await writeFile(join(run, 'shot.png'), 'disposable pixels');
    if (day !== 1) await writeFile(join(run, 'summary.json'), JSON.stringify({status: day === 2 ? 'ranked-issues' : day === 3 ? 'failed' : 'passed', finishedAt: '2026-09-13T01:00:00Z'}));
  }
  const preview = await pruneRenderCaptures(workspace, {dryRun: true});
  assert.deepEqual(preview.removed, [stamp(3), stamp(2)]);
  assert.equal(await exists(join(root, stamp(2))), true);
  const result = await pruneRenderCaptures(workspace);
  assert.deepEqual(result, preview);
  assert.equal(await exists(join(root, stamp(1))), true, 'unfinished run must survive');
  assert.equal(await exists(join(root, stamp(2))), false);
  assert.equal(await exists(join(root, stamp(13))), true);
  assert.equal((await pruneRenderCaptures(workspace)).removed.length, 0);
  const stale = join(root, '2026-08-01T00-00-00-000Z');
  await mkdir(stale);
  await writeFile(join(stale, 'shot.png'), 'abandoned');
  const old = new Date(Date.now() - 8 * 86400000);
  await utimes(join(stale, 'shot.png'), old, old);
  await utimes(stale, old, old);
  assert.deepEqual((await pruneRenderCaptures(workspace)).removed, ['2026-08-01T00-00-00-000Z']);
  await assert.rejects(pruneRenderCaptures(workspace, {keep: 0}));
  const outside = join(workspace, 'outside');
  await mkdir(outside);
  await writeFile(join(outside, 'keep.txt'), 'keep');
  await symlink(outside, join(root, stamp(4), 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(pruneRenderCaptures(workspace, {keep: 1}), /link/);
  assert.equal(await exists(join(outside, 'keep.txt')), true);
  assert.equal(await exists(join(root, stamp(5))), true, 'all paths must be validated before deletion');
  console.log('Capture retention passed: newest runs, active runs, dry run, repeat cleanup, and linked paths.');
} finally {
  // This exact temporary workspace was created above and resolved before use.
  await rm(workspace, {recursive: true, force: true});
}
