import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const humanRequiredCommands = [
  'validate-catalog.ps1',
  'npm test',
  'npm run test:games',
  'npm run capture:games:ci',
  'npm run audit:perf:ci'
];

const generatorCommands = [
  'npm run inject:meta',
  'npm run build:sitemap',
  'npm run build:feed',
  'npm run build:og-images'
];

const humanValidationSurfaces = [
  'README.md',
  'CONTRIBUTING.md',
  'docs/game-contract.md',
  '.github/pull_request_template.md',
  '.github/ISSUE_TEMPLATE/workshop-request.md',
  '.github/workflows/workshop-request.yml',
  '.github/workflows/workshop-draft-pr.yml'
];

const generatorSurfaces = [
  'README.md',
  'CONTRIBUTING.md',
  'docs/game-contract.md',
  'ARCHITECTURE.md'
];

const liveSmokeSurfaces = [
  'README.md',
  'ARCHITECTURE.md'
];

const githubSecuritySettingsSurfaces = [
  'README.md',
  'ARCHITECTURE.md'
];

const githubSecuritySettingsRequiredText = [
  'npm run test:github-security-settings',
  '.github/workflows/security-surfaces.yml',
  'Security Surfaces',
  'SECURITY_SURFACES_TOKEN',
  'vulnerability alerts',
  'secret scanning push protection'
];

const liveSmokeRequiredText = [
  'WORKSHOP_ARCADE_LIVE_SLUGS',
  'WORKSHOP_ARCADE_TOUCHED_SLUGS',
  'WORKSHOP_ARCADE_REQUIRE_LIVE_SLUGS',
  'WORKSHOP_ARCADE_SKIP_CONTENT_HASH',
  'WORKSHOP_ARCADE_EXPECTED_ROOT',
  'WORKSHOP_ARCADE_EXPECTED_SITE_URL',
  'WORKSHOP_ARCADE_EXPECTED_SECURITY_CANONICAL',
  'WORKSHOP_ARCADE_EXPECTED_SW_REVISION',
  'WORKSHOP_ARCADE_SKIP_SW_REVISION',
  '.well-known/security.txt',
  'npm run test:live-smoke-slugs',
  'npm run test:live-canvas-evidence',
  'test-results/live-pages-smoke/<timestamp>/summary.json',
  'test-results/live-pages-smoke/<timestamp>/report.md',
  'source revision provenance'
];

const localPerfSurfaces = [
  'README.md',
  'ARCHITECTURE.md',
  'docs/performance-baseline.md'
];

const ciEvidenceSurfaces = [
  'README.md',
  'ARCHITECTURE.md'
];

const ciEvidenceRequiredText = [
  'game-smoke-summary',
  'test-results/smoke-games/<timestamp>/summary.json',
  'performance-audit',
  'test-results/lighthouse-baseline/<timestamp>/summary.json',
  'render-ranking',
  'test-results/render-ranking/<timestamp>/summary.json',
  'source revision provenance'
];

const playwrightHarnessSurfaces = [
  'README.md',
  'ARCHITECTURE.md',
  'CLAUDE.md'
];

const playwrightHarnessRequiredText = [
  'npm run test:playwright-harness',
  'reusable desktop and mobile browser contexts',
  'one bounded retry',
  'transportRetryCount',
  'transportRetries'
];

const launchEvidenceCurrentSurfaces = [
  'README.md',
  'ARCHITECTURE.md'
];

const launchEvidenceCurrentRequiredText = [
  'npm run test:launch-evidence-current',
  'npm run test:launch-evidence-refresh',
  'npm run test:current-head-workflows',
  'test-results/publish-ready/<timestamp>/summary.json',
  'test-results/live-pages-smoke/<timestamp>/summary.json',
  'test-results/launch-evidence-refresh/<timestamp>/summary.json',
  'test-results/current-head-workflows/<timestamp>/summary.json',
  'current clean HEAD'
];

const validationGatedDeploySurfaces = [
  'README.md',
  'ARCHITECTURE.md',
  'CLAUDE.md'
];

const validationGatedDeployRequiredText = [
  'validation-gated',
  'Build static artifact',
  'Deploy',
  'Live Pages smoke',
  'Validate Catalog',
  'CodeQL',
  'Security Surfaces'
];

const tagCoverageSurfaces = [
  'README.md',
  'ARCHITECTURE.md'
];

const tagCoverageRequiredText = [
  'npm run test:tag-coverage',
  'at least 3 games',
  'CATEGORY_ORDER'
];

const agentRunbookRequiredText = [
  '.ai-sync',
  'no PR',
  'audited pages',
  'catalog/tooling',
  'workshop-runtime.js',
  'window.render_game_to_text()',
  'window.advanceTime(ms)',
  'validate-catalog.ps1 -Fix',
  'npm run inject:meta',
  'npm run build:sitemap',
  'npm run build:feed',
  'npm run build:og-images',
  'SHELL_REVISION',
  'scripts/capture-games.mjs',
  'docs/performance-baseline.md',
  'progress.md',
  'npm test',
  'npm run test:games',
  'npm run capture:games:ci',
  'npm run audit:perf:local',
  'npm run test:current-head-workflows',
  'npm run test:launch-evidence-refresh',
  'git diff --check'
];

const issues = [];

function readText(file) {
  const absolute = path.join(root, file);
  try {
    return fs.readFileSync(absolute, 'utf8');
  } catch (error) {
    issues.push(`${file}: unable to read (${error.message})`);
    return '';
  }
}

function requireCommands(file, commands, label) {
  const text = readText(file);
  if (!text) return;
  for (const command of commands) {
    if (!text.includes(command)) {
      issues.push(`${file}: missing required ${label} command "${command}"`);
    }
  }
}

for (const file of humanValidationSurfaces) {
  requireCommands(file, humanRequiredCommands, 'publish-gate');
}

for (const file of generatorSurfaces) {
  requireCommands(file, generatorCommands, 'generator');
}

for (const file of liveSmokeSurfaces) {
  const text = readText(file);
  if (!text) continue;
  for (const requiredText of liveSmokeRequiredText) {
    if (!text.includes(requiredText)) {
      issues.push(`${file}: missing live-smoke contract text "${requiredText}"`);
    }
  }
}

for (const file of githubSecuritySettingsSurfaces) {
  const text = readText(file);
  if (!text) continue;
  for (const requiredText of githubSecuritySettingsRequiredText) {
    if (!text.includes(requiredText)) {
      issues.push(`${file}: missing GitHub security settings contract text "${requiredText}"`);
    }
  }
}

for (const file of localPerfSurfaces) {
  const text = readText(file);
  if (!text) continue;
  if (!text.includes('npm run audit:perf:local')) {
    issues.push(`${file}: missing local performance-audit command "npm run audit:perf:local"`);
  }
  if (!text.includes('named exception headroom')) {
    issues.push(`${file}: missing named exception headroom policy text`);
  }
  if (!text.includes('10 KB / 1 request')) {
    issues.push(`${file}: missing named exception headroom threshold "10 KB / 1 request"`);
  }
}

for (const file of ciEvidenceSurfaces) {
  const text = readText(file);
  if (!text) continue;
  for (const requiredText of ciEvidenceRequiredText) {
    if (!text.includes(requiredText)) {
      issues.push(`${file}: missing CI evidence contract text "${requiredText}"`);
    }
  }
}

for (const file of playwrightHarnessSurfaces) {
  const text = readText(file);
  if (!text) continue;
  for (const requiredText of playwrightHarnessRequiredText) {
    if (!text.includes(requiredText)) {
      issues.push(`${file}: missing Playwright harness contract text "${requiredText}"`);
    }
  }
}

for (const file of launchEvidenceCurrentSurfaces) {
  const text = readText(file);
  if (!text) continue;
  for (const requiredText of launchEvidenceCurrentRequiredText) {
    if (!text.includes(requiredText)) {
      issues.push(`${file}: missing launch-evidence freshness contract text "${requiredText}"`);
    }
  }
}

for (const file of validationGatedDeploySurfaces) {
  const text = readText(file);
  if (!text) continue;
  for (const requiredText of validationGatedDeployRequiredText) {
    if (!text.includes(requiredText)) {
      issues.push(`${file}: missing validation-gated deployment contract text "${requiredText}"`);
    }
  }
}

for (const file of tagCoverageSurfaces) {
  const text = readText(file);
  if (!text) continue;
  for (const requiredText of tagCoverageRequiredText) {
    if (!text.includes(requiredText)) {
      issues.push(`${file}: missing tag-coverage contract text "${requiredText}"`);
    }
  }
}

const agentRunbookText = readText('CLAUDE.md');
if (agentRunbookText) {
  for (const requiredText of agentRunbookRequiredText) {
    if (!agentRunbookText.includes(requiredText)) {
      issues.push(`CLAUDE.md: missing agent runbook text "${requiredText}"`);
    }
  }
  let manifest = [];
  try {
    manifest = JSON.parse(readText('websites/manifest.json') || '[]');
    if (!Array.isArray(manifest)) {
      issues.push('websites/manifest.json: expected an array while checking CLAUDE.md game-count drift');
      manifest = [];
    }
  } catch (error) {
    issues.push(`websites/manifest.json: unable to parse while checking CLAUDE.md game-count drift (${error.message})`);
  }
  if (manifest.length > 0) {
    const gameCountText = `${manifest.length} games`;
    const auditedPagesText = `${manifest.length + 1} audited pages`;
    if (!agentRunbookText.includes(gameCountText)) {
      issues.push(`CLAUDE.md: current-state runbook must mention "${gameCountText}" from websites/manifest.json`);
    }
    if (!agentRunbookText.includes(auditedPagesText)) {
      issues.push(`CLAUDE.md: current-state runbook must mention "${auditedPagesText}" from websites/manifest.json plus the catalog`);
    }
  }
}

const agentsText = readText('AGENTS.md');
if (agentsText && !agentsText.includes('CLAUDE.md')) {
  issues.push('AGENTS.md: must point Codex agents to CLAUDE.md for the shared Workshop Arcade runbook');
}

const packageJson = JSON.parse(readText('package.json') || '{}');
const scripts = packageJson.scripts || {};
const fastGateExclusions = new Set(['test:github-security-settings', 'test:games', 'test:live-canvas-evidence', 'test:owned-domain-cutover-preflight', 'test:owned-domain-rehearsal', 'test:player-storage-bridge', 'test:pwa-runtime', 'test:publish-ready', 'test:runtime-storage', 'test:scoped-verification', 'test:live-pages', 'test:launch-evidence-current', 'test:launch-evidence-refresh', 'test:current-head-workflows', 'test:all']);
const fastGateScripts = Object.keys(scripts)
  .filter((name) => name.startsWith('test:') && !fastGateExclusions.has(name))
  .sort();
const fastGateCount = fastGateScripts.length;
const readmeText = readText('README.md');

for (const script of fastGateScripts) {
  const command = `npm run ${script}`;
  if (!readmeText.includes(command)) {
    issues.push(`README.md: missing fast-gate command "${command}"`);
  }
}

if (!readmeText.includes(`${fastGateCount} fast validators`)) {
  issues.push(`README.md: script-network summary must say "${fastGateCount} fast validators" so the count stays aligned with package.json`);
}

function readBudget(source, name) {
  const property = name === 'default'
    ? 'default'
    : `(?:"${escapeRegex(name)}"|${escapeRegex(name)})`;
  const pattern = new RegExp(`${property}:\\s*\\{\\s*transferKb:\\s*(\\d+),\\s*requests:\\s*(\\d+)\\s*\\}`);
  const match = source.match(pattern);
  if (!match) {
    issues.push(`scripts/audit-pagespeed.mjs: unable to parse ${name} budget`);
    return null;
  }
  return { transferKb: Number(match[1]), requests: Number(match[2]) };
}

const auditSource = readText('scripts/audit-pagespeed.mjs');
const budgetRows = [
  { key: 'Catalog', label: 'Catalog', architectureLabel: 'Catalog' },
  { key: 'Lexica', label: 'Lexica', architectureLabel: 'Lexica' },
  { key: 'Idle Tycoon', label: 'Idle Tycoon', architectureLabel: 'Idle Tycoon' },
  { key: 'Arcade Jump', label: 'Arcade Jump', architectureLabel: 'Arcade Jump' },
  { key: 'Brick Breaker', label: 'Brick Breaker', architectureLabel: 'Brick Breaker' },
  { key: 'default', label: 'Other manifest games', architectureLabel: '(?:Other manifest games|everything else)' }
];
const perfDoc = readText('docs/performance-baseline.md');
const architectureDoc = readText('ARCHITECTURE.md');

for (const row of budgetRows) {
  const budget = readBudget(auditSource, row.key);
  if (!budget) continue;

  const perfTableRow = `| ${row.label} | ${budget.transferKb} KB | ${budget.requests} |`;
  const architecturePattern = new RegExp(`${row.architectureLabel}\\s*(?:<=|≤)\\s*${budget.transferKb}\\s*KB\\s*/\\s*(?:<=|≤)\\s*${budget.requests}\\s*requests`, 'i');

  if (!perfDoc.includes(perfTableRow)) {
    issues.push(`docs/performance-baseline.md: CI budget table must include "${perfTableRow}" from scripts/audit-pagespeed.mjs`);
  }
  if (!architecturePattern.test(architectureDoc)) {
    issues.push(`ARCHITECTURE.md: CI workflow summary must cite the current ${row.label} budget (${budget.transferKb} KB / ${budget.requests} requests)`);
  }
}

const workflow = fs.readFileSync(path.join(root, '.github/workflows/validate-catalog.yml'), 'utf8');
const workflowLines = workflow.split(/\r?\n/);

const requiredWorkflowJobs = [
  {
    id: 'catalog-docs-a11y',
    label: 'catalog/docs/a11y',
    commands: [
      'validate-catalog.ps1',
      ...fastGateScripts.map((script) => `npm run ${script}`)
    ]
  },
  {
    id: 'game-smoke',
    label: 'game smoke',
    commands: ['npm run test:live-canvas-evidence', 'npm run test:games']
  },
  {
    id: 'performance-audit',
    label: 'performance audit',
    commands: ['npm run audit:perf:ci']
  },
  {
    id: 'render-capture',
    label: 'render capture',
    commands: ['npm run capture:games:ci']
  }
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findWorkflowJobBlock(jobId) {
  const jobStartPattern = new RegExp(`^  ${escapeRegex(jobId)}:\\s*$`);
  const nextJobPattern = /^  [A-Za-z0-9_-]+:\s*$/;
  const start = workflowLines.findIndex((line) => jobStartPattern.test(line));

  if (start === -1) {
    return '';
  }

  let end = workflowLines.length;
  for (let index = start + 1; index < workflowLines.length; index += 1) {
    if (nextJobPattern.test(workflowLines[index])) {
      end = index;
      break;
    }
  }

  return workflowLines.slice(start, end).join('\n');
}

for (const job of requiredWorkflowJobs) {
  const block = findWorkflowJobBlock(job.id);
  if (!block) {
    issues.push(`.github/workflows/validate-catalog.yml: missing ${job.label} job "${job.id}"`);
    continue;
  }

  for (const command of job.commands) {
    if (!block.includes(command)) {
      issues.push(`.github/workflows/validate-catalog.yml: ${job.label} job must run "${command}"`);
    }
  }
}

function findArtifactUploadBlock(artifactName) {
  const artifactLine = workflowLines.findIndex((line) => line.trim() === `name: ${artifactName}`);
  if (artifactLine === -1) {
    return '';
  }

  let start = artifactLine;
  while (start > 0 && !workflowLines[start].startsWith('      - name: ')) {
    start -= 1;
  }

  let end = workflowLines.length;
  for (let index = artifactLine + 1; index < workflowLines.length; index += 1) {
    if (workflowLines[index].startsWith('      - name: ')) {
      end = index;
      break;
    }
  }

  return workflowLines.slice(start, end).join('\n');
}

const artifactPathRequirements = new Map([
  ['game-smoke-summary', ['test-results/smoke-games/**/summary.json']],
  ['performance-audit', [
    'test-results/lighthouse-baseline/**/summary.json',
    'test-results/lighthouse-baseline/**/report.md'
  ]],
  ['render-ranking', [
    'test-results/render-ranking/**/summary.json',
    'test-results/render-ranking/**/contact-sheet.html',
    'test-results/render-ranking/**/contact-sheet.png'
  ]],
]);

for (const artifactName of artifactPathRequirements.keys()) {
  const artifactBlock = findArtifactUploadBlock(artifactName);
  if (!artifactBlock) {
    issues.push(`.github/workflows/validate-catalog.yml: missing "${artifactName}" artifact upload`);
    continue;
  }

  if (!/uses:\s*actions\/upload-artifact@[0-9a-f]{40}\s+#\s+v7\.\d+\.\d+/.test(artifactBlock)) {
    issues.push(`.github/workflows/validate-catalog.yml: "${artifactName}" artifact upload must use an immutable actions/upload-artifact v7 release pin`);
  }

  if (!artifactBlock.includes('retention-days: 14')) {
    issues.push(`.github/workflows/validate-catalog.yml: "${artifactName}" artifact must retain for 14 days`);
  }

  for (const expectedPath of artifactPathRequirements.get(artifactName)) {
    if (!artifactBlock.includes(expectedPath)) {
      issues.push(`.github/workflows/validate-catalog.yml: "${artifactName}" artifact must upload "${expectedPath}"`);
    }
  }
}

const docsIndex = workflow.indexOf('npm run test:docs');
const a11yIndex = workflow.indexOf('npm run test:a11y');
const gamesIndex = workflow.indexOf('npm run test:games');

if (docsIndex === -1) {
  issues.push('.github/workflows/validate-catalog.yml: missing "npm run test:docs"');
} else {
  if (a11yIndex !== -1 && docsIndex > a11yIndex) {
    issues.push('.github/workflows/validate-catalog.yml: "npm run test:docs" must run before "npm run test:a11y"');
  }
  if (gamesIndex !== -1 && docsIndex > gamesIndex) {
    issues.push('.github/workflows/validate-catalog.yml: "npm run test:docs" must run before "npm run test:games"');
  }
}

if (issues.length) {
  console.error('Docs drift check failed:');
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log(`Docs drift check passed for ${humanValidationSurfaces.length} validation surfaces plus CLAUDE.md agent runbook.`);
