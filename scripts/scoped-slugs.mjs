// Shared `--slug` parsing for the scoped verification fast path.
//
// `smoke-games.mjs` and `capture-games.mjs` accept `--slug a,b` (or repeated
// `--slug` flags / `--slug=a,b`) so a change to one game can be verified
// without re-running the full catalog. Unknown slugs are an error rather
// than a silent full run, and callers decide whether scoping is allowed at
// all (the CI rendered-quality gate refuses it).

export function parseScopedSlugs(argv) {
  const slugs = [];
  let sawFlag = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--slug') {
      sawFlag = true;
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) {
        throw new Error('--slug requires a comma-separated list of game slugs');
      }
      slugs.push(...argv[i + 1].split(','));
      i += 1;
    } else if (arg.startsWith('--slug=')) {
      sawFlag = true;
      slugs.push(...arg.slice('--slug='.length).split(','));
    }
  }
  const cleaned = [...new Set(slugs.map((slug) => slug.trim()).filter(Boolean))];
  if (sawFlag && cleaned.length === 0) {
    throw new Error('--slug requires at least one game slug');
  }
  return cleaned;
}

export function resolveScopedGames(manifest, slugs) {
  if (slugs.length === 0) {
    return { targets: manifest, scope: { type: 'full' } };
  }
  const bySlug = new Map(manifest.map((game) => [game.slug, game]));
  const unknown = slugs.filter((slug) => !bySlug.has(slug));
  if (unknown.length) {
    throw new Error(`unknown slug(s): ${unknown.join(', ')} — slugs must match websites/manifest.json entries`);
  }
  return { targets: slugs.map((slug) => bySlug.get(slug)), scope: { type: 'slugs', slugs } };
}
