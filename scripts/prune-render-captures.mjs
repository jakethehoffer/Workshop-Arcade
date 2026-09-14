import {lstat, readFile, readdir, realpath, rm} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

// Delete only completed timestamped capture runs under this workspace's exact
// capture root. Protect active runs; abandoned runs need seven quiet days.
export async function pruneRenderCaptures(repoRoot, {keep = 10, dryRun = false} = {}) {
  if (!Number.isInteger(keep) || keep < 1) throw new Error('keep must be a positive integer');
  const workspace = await realpath(resolve(repoRoot));
  const root = join(workspace, 'test-results', 'render-ranking');
  try {
    if ((await lstat(root)).isSymbolicLink() || await realpath(root) !== root) throw new Error('Capture root must stay inside the workspace, without links');
  } catch (error) { if (error.code === 'ENOENT') return {removed: [], bytes: 0}; throw error; }
  const complete = [];
  const abandoned = [];
  async function inspect(target) {
    const info = await lstat(target);
    if (info.isSymbolicLink()) throw new Error('Refusing capture cleanup containing a link: ' + target);
    const result = {bytes: info.isDirectory() ? 0 : info.size, newestMs: info.mtimeMs};
    if (info.isDirectory()) for (const entry of await readdir(target)) {
      const child = await inspect(join(target, entry));
      result.bytes += child.bytes;
      result.newestMs = Math.max(result.newestMs, child.newestMs);
    }
    return result;
  }
  for (const entry of await readdir(root, {withFileTypes: true})) {
    if (!entry.isDirectory() || !/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/.test(entry.name)) continue;
    const target = join(root, entry.name);
    if (await realpath(target) !== target) continue;
    let finished = false;
    try {
      const summaryPath = join(target, 'summary.json');
      if ((await lstat(summaryPath)).isSymbolicLink()) continue;
      const summary = JSON.parse(await readFile(summaryPath, 'utf8'));
      finished = ['passed', 'failed', 'ranked-issues'].includes(summary.status) && Number.isFinite(Date.parse(summary.finishedAt));
    } catch { /* Only age out abandoned evidence after seven quiet days. */ }
    if (finished) complete.push(entry.name);
    else if (Date.now() - (await inspect(target)).newestMs > 7 * 86400000) abandoned.push(entry.name);
  }
  const removed = [...complete.sort().reverse().slice(keep), ...abandoned.sort()];
  let bytes = 0;
  // Validate the entire deletion set before removing anything.
  for (const name of removed) bytes += (await inspect(join(root, name))).bytes;
  if (!dryRun) for (const name of removed) {
    const target = join(root, name);
    if ((await lstat(target)).isSymbolicLink() || await realpath(target) !== target) throw new Error('Capture path changed before cleanup');
    await rm(target, {recursive: true, force: false});
  }
  return {removed, bytes};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await pruneRenderCaptures(resolve(dirname(fileURLToPath(import.meta.url)), '..'), {dryRun: process.argv.includes('--dry-run')});
  console.log(`${process.argv.includes('--dry-run') ? 'Would remove' : 'Removed'} ${result.removed.length} old capture runs (${(result.bytes / 1024 ** 3).toFixed(2)} GiB). Kept the newest 10 plus active runs.`);
}
