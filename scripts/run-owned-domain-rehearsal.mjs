#!/usr/bin/env node
// Build and smoke-test a temporary root-domain release artifact.
//
// The committed repo still targets the GitHub Pages preview. This runner
// proves the owned-domain path without changing tracked generated files:
// assemble the curated public artifact, regenerate canonical metadata inside
// that artifact only, serve it at /, then run live-smoke and perf checks
// against the temporary site.

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectEvidenceProvenance, formatEvidenceProvenance } from './evidence-provenance.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const startedAt = new Date().toISOString();
const runId = startedAt.replace(/[:.]/g, '-');
const outputDir = join(repoRoot, 'test-results', 'owned-domain-rehearsal', runId);
const siteDir = join(outputDir, 'site');
const summaryPath = join(outputDir, 'summary.json');
const reportPath = join(outputDir, 'report.md');
const publicOrigin = normalizeOrigin(process.env.WORKSHOP_ARCADE_SITE_ORIGIN || 'https://arcade.example.test');
const publicBasePath = normalizeBasePath(process.env.WORKSHOP_ARCADE_SITE_BASE_PATH || '/');
const publicSiteUrl = new URL(publicBasePath, `${publicOrigin}/`).href;
const securityCanonicalUrl = new URL('.well-known/security.txt', publicSiteUrl).href;

if (publicBasePath !== '/') {
  console.error(`Owned-domain rehearsal requires WORKSHOP_ARCADE_SITE_BASE_PATH=/, got ${publicBasePath}`);
  process.exit(2);
}

process.env.WORKSHOP_ARCADE_SITE_ORIGIN = publicOrigin;
process.env.WORKSHOP_ARCADE_SITE_BASE_PATH = publicBasePath;

const summary = {
  status: 'running',
  startedAt,
  finishedAt: null,
  durationMs: null,
  repoRoot,
  provenance: await collectEvidenceProvenance(repoRoot),
  outputDir,
  siteDir,
  summaryPath,
  reportPath,
  publicOrigin,
  publicBasePath,
  publicSiteUrl,
  localUrl: null,
  securityCanonicalUrl,
  failedStep: null,
  serverLog: null,
  steps: [],
};

let serverProcess = null;
let serverStdout = '';
let serverStderr = '';

function normalizeOrigin(value) {
  const url = new URL(String(value || '').trim().replace(/\/+$/, ''));
  return url.origin;
}

function normalizeBasePath(value) {
  const raw = String(value ?? '/').trim();
  if (!raw || raw === '/') return '/';
  return `/${raw.replace(/^\/+|\/+$/g, '')}/`;
}

function repoRelative(filePath) {
  return relative(repoRoot, filePath).split(sep).join('/');
}

function durationLabel(ms) {
  if (!Number.isFinite(ms)) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function replaceMarkerBlock(html, start, end, block) {
  const pattern = new RegExp(`${escapeRegex(start)}[\\s\\S]*?${escapeRegex(end)}`);
  if (pattern.test(html)) return html.replace(pattern, block);
  return html.replace(/<\/title>/i, `</title>\n${block}`);
}

function refreshSecurityTxtCanonical(text) {
  const line = `Canonical: ${securityCanonicalUrl}`;
  if (/^Canonical:\s+\S+/m.test(text)) {
    return text.replace(/^Canonical:\s+\S+/m, line);
  }
  return `${text.trimEnd()}\n${line}\n`;
}

async function findOpenPort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close(() => {
        if (port) resolvePort(port);
        else reject(new Error('Unable to allocate an open port'));
      });
    });
  });
}

async function waitForUrl(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

function runShellCommand(command, env = {}) {
  const result = spawnSync(command, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    shell: true,
    windowsHide: true,
  });
  return {
    exitCode: result.status ?? (result.error ? 1 : 0),
    signal: result.signal || null,
    error: result.error?.message || null,
  };
}

async function assembleArtifact() {
  const command = `node scripts/build-pages-artifact.mjs --out "${repoRelative(siteDir)}"`;
  return runShellCommand(command);
}

async function regenerateOwnedDomainSurfaces() {
  const [
    sitemapModule,
    feedModule,
    metaModule,
    ogModule,
  ] = await Promise.all([
    import('./build-sitemap.mjs'),
    import('./build-feed.mjs'),
    import('./inject-game-meta.mjs'),
    import('./build-og-images.mjs'),
  ]);

  const manifest = await readJson(join(siteDir, 'websites', 'manifest.json'));

  await writeFile(join(siteDir, 'sitemap.xml'), await sitemapModule.buildSitemap(manifest), 'utf8');
  await writeFile(join(siteDir, 'robots.txt'), sitemapModule.buildRobotsTxt(), 'utf8');

  const feed = feedModule.buildFeed(manifest);
  // eslint-disable-next-line no-unused-vars
  const { _newest_date, ...publicFeed } = feed;
  await writeJson(join(siteDir, 'feed.json'), publicFeed);

  const indexPath = join(siteDir, 'index.html');
  const indexHtml = await readFile(indexPath, 'utf8');
  let nextIndex = sitemapModule.refreshRootMetaUrls(indexHtml);
  nextIndex = sitemapModule.injectItemList(nextIndex, sitemapModule.renderItemListBlock(manifest));
  nextIndex = sitemapModule.injectWebSite(nextIndex, sitemapModule.renderWebSiteBlock());
  await writeFile(indexPath, nextIndex, 'utf8');

  for (const game of manifest) {
    if (!game.url) continue;
    const gamePath = join(siteDir, game.url);
    const html = await readFile(gamePath, 'utf8');
    let next = replaceMarkerBlock(html, metaModule.MARK_START, metaModule.MARK_END, metaModule.buildBlock(game));
    next = replaceMarkerBlock(next, metaModule.JSONLD_MARK_START, metaModule.JSONLD_MARK_END, metaModule.buildGameJsonLd(game));
    await writeFile(gamePath, next, 'utf8');
  }

  await mkdir(join(siteDir, 'covers', 'og'), { recursive: true });
  for (const game of manifest) {
    if (!game.slug) continue;
    await writeFile(join(siteDir, 'covers', 'og', `${game.slug}.svg`), ogModule.buildOgSvg(game), 'utf8');
  }
  await writeFile(join(siteDir, 'covers', 'og-image.svg'), ogModule.buildSiteOgSvg(manifest), 'utf8');

  const securityPath = join(siteDir, '.well-known', 'security.txt');
  const securityTxt = await readFile(securityPath, 'utf8');
  await writeFile(securityPath, refreshSecurityTxtCanonical(securityTxt), 'utf8');

  return {
    exitCode: 0,
    signal: null,
    error: null,
    details: {
      manifestGames: manifest.length,
      regenerated: [
        'index.html',
        'sitemap.xml',
        'robots.txt',
        'feed.json',
        'websites/*.html meta/jsonld',
        'covers/og/*.svg',
        'covers/og-image.svg',
        '.well-known/security.txt',
      ],
    },
  };
}

async function startServer() {
  const port = await findOpenPort();
  const localUrl = `http://127.0.0.1:${port}/`;
  summary.localUrl = localUrl;
  serverProcess = spawn(process.execPath, [
    'scripts/serve-static.mjs',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--root',
    siteDir,
  ], {
    cwd: repoRoot,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout.on('data', (chunk) => {
    serverStdout += chunk.toString();
  });
  serverProcess.stderr.on('data', (chunk) => {
    serverStderr += chunk.toString();
  });

  await waitForUrl(localUrl);
  return { exitCode: 0, signal: null, error: null, details: { localUrl } };
}

function ownedDomainEnv() {
  return {
    WORKSHOP_ARCADE_URL: summary.localUrl,
    WORKSHOP_ARCADE_EXPECTED_ROOT: siteDir,
    WORKSHOP_ARCADE_EXPECTED_SITE_URL: publicSiteUrl,
    WORKSHOP_ARCADE_EXPECTED_SECURITY_CANONICAL: securityCanonicalUrl,
    WORKSHOP_ARCADE_SITE_ORIGIN: publicOrigin,
    WORKSHOP_ARCADE_SITE_BASE_PATH: publicBasePath,
  };
}

async function runLiveSmoke() {
  return runShellCommand('npm run test:live-pages', ownedDomainEnv());
}

async function runPerformanceAudit() {
  return runShellCommand('npm run audit:perf:ci', ownedDomainEnv());
}

const STEPS = [
  {
    id: 'assemble-artifact',
    label: 'Assemble curated artifact',
    command: `node scripts/build-pages-artifact.mjs --out ${repoRelative(siteDir)}`,
    run: assembleArtifact,
  },
  {
    id: 'regenerate-root-domain-surfaces',
    label: 'Regenerate root-domain surfaces',
    command: 'generate root-domain metadata inside temporary artifact',
    run: regenerateOwnedDomainSurfaces,
  },
  {
    id: 'start-server',
    label: 'Start root artifact server',
    command: 'node scripts/serve-static.mjs --root <artifact>',
    run: startServer,
  },
  {
    id: 'live-pages-smoke',
    label: 'Live smoke against root artifact',
    command: 'npm run test:live-pages',
    run: runLiveSmoke,
  },
  {
    id: 'performance-audit',
    label: 'Performance audit against root artifact',
    command: 'npm run audit:perf:ci',
    run: runPerformanceAudit,
  },
];

async function runStep(step, order) {
  console.log(`\n=== ${order}. ${step.label} ===`);
  console.log(step.command);
  const record = {
    id: step.id,
    label: step.label,
    order,
    command: step.command,
    status: 'running',
    exitCode: null,
    signal: null,
    error: null,
    details: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    durationMs: null,
  };
  summary.steps.push(record);
  const startMs = Date.now();
  try {
    const result = await step.run();
    record.exitCode = result.exitCode ?? 0;
    record.signal = result.signal || null;
    record.error = result.error || null;
    record.details = result.details || null;
  } catch (error) {
    record.exitCode = 1;
    record.error = error instanceof Error ? error.stack || error.message : String(error);
  }
  record.finishedAt = new Date().toISOString();
  record.durationMs = Date.now() - startMs;
  record.status = record.exitCode === 0 ? 'passed' : 'failed';
  console.log(`${step.label}: ${record.status.toUpperCase()} ${durationLabel(record.durationMs)}`);
  if (record.error) console.error(record.error);
  return record.exitCode;
}

function buildReport() {
  const lines = [
    '# Owned-Domain Rehearsal Report',
    '',
    `Status: ${summary.status.toUpperCase()}`,
    ...formatEvidenceProvenance(summary.provenance),
    `Public URL: ${summary.publicSiteUrl}`,
    `Local URL: ${summary.localUrl || ''}`,
    `Artifact: ${repoRelative(summary.siteDir)}`,
    `Started: ${summary.startedAt}`,
    `Finished: ${summary.finishedAt || ''}`,
    `Duration: ${durationLabel(summary.durationMs)}`,
    `Failed step: ${summary.failedStep || 'none'}`,
    '',
    '| # | Step | Status | Exit | Duration | Command |',
    '|---:|------|--------|------|----------|---------|',
  ];

  for (const step of summary.steps) {
    lines.push(`| ${step.order} | ${step.label} | ${step.status} | ${step.exitCode ?? ''} | ${durationLabel(step.durationMs)} | \`${step.command.replaceAll('`', '\\`')}\` |`);
  }

  lines.push('');
  lines.push(summary.status === 'passed'
    ? 'Owned-domain artifact rehearsal passed.'
    : 'Owned-domain artifact rehearsal stopped at the first failing command.');
  if (summary.serverLog) {
    lines.push('');
    lines.push(`Server log: \`${summary.serverLog}\``);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function writeEvidence() {
  await mkdir(outputDir, { recursive: true });
  const serverLogPath = join(outputDir, 'server.log');
  await writeFile(serverLogPath, [
    '# stdout',
    serverStdout.trimEnd(),
    '',
    '# stderr',
    serverStderr.trimEnd(),
    '',
  ].join('\n'), 'utf8');
  summary.serverLog = repoRelative(serverLogPath);
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  await writeFile(reportPath, buildReport(), 'utf8');
}

const startMs = Date.now();
let exitCode = 0;

try {
  for (let index = 0; index < STEPS.length; index += 1) {
    const step = STEPS[index];
    exitCode = await runStep(step, index + 1);
    if (exitCode !== 0) {
      summary.failedStep = step.id;
      for (let skipIndex = index + 1; skipIndex < STEPS.length; skipIndex += 1) {
        summary.steps.push({
          id: STEPS[skipIndex].id,
          label: STEPS[skipIndex].label,
          order: skipIndex + 1,
          command: STEPS[skipIndex].command,
          status: 'skipped',
          exitCode: null,
          signal: null,
          error: null,
          details: null,
          startedAt: null,
          finishedAt: null,
          durationMs: null,
        });
      }
      break;
    }
  }
} finally {
  if (serverProcess) {
    serverProcess.kill();
  }
  summary.finishedAt = new Date().toISOString();
  summary.durationMs = Date.now() - startMs;
  summary.status = exitCode === 0 ? 'passed' : 'failed';
  await writeEvidence();
}

console.log(`\nOwned-domain rehearsal report: ${reportPath}`);
process.exit(exitCode);
