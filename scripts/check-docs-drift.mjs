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

const liveSmokeRequiredText = [
  'WORKSHOP_ARCADE_LIVE_SLUGS',
  'WORKSHOP_ARCADE_TOUCHED_SLUGS',
  'WORKSHOP_ARCADE_REQUIRE_LIVE_SLUGS',
  'WORKSHOP_ARCADE_SKIP_CONTENT_HASH',
  'WORKSHOP_ARCADE_EXPECTED_SW_REVISION',
  'WORKSHOP_ARCADE_SKIP_SW_REVISION',
  'test-results/live-pages-smoke/<timestamp>/summary.json',
  'test-results/live-pages-smoke/<timestamp>/report.md'
];

const localPerfSurfaces = [
  'README.md',
  'ARCHITECTURE.md',
  'docs/performance-baseline.md'
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

for (const file of localPerfSurfaces) {
  const text = readText(file);
  if (!text) continue;
  if (!text.includes('npm run audit:perf:local')) {
    issues.push(`${file}: missing local performance-audit command "npm run audit:perf:local"`);
  }
}

const packageJson = JSON.parse(readText('package.json') || '{}');
const scripts = packageJson.scripts || {};
const fastGateExclusions = new Set(['test:games', 'test:pwa-runtime', 'test:runtime-storage', 'test:live-pages', 'test:all']);
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
    commands: ['npm run test:games']
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

for (const artifactName of ['performance-audit', 'render-ranking']) {
  const artifactBlock = findArtifactUploadBlock(artifactName);
  if (!artifactBlock) {
    issues.push(`.github/workflows/validate-catalog.yml: missing "${artifactName}" artifact upload`);
    continue;
  }

  if (!artifactBlock.includes('uses: actions/upload-artifact@v7')) {
    issues.push(`.github/workflows/validate-catalog.yml: "${artifactName}" artifact upload must use actions/upload-artifact@v7`);
  }

  if (!artifactBlock.includes('retention-days: 14')) {
    issues.push(`.github/workflows/validate-catalog.yml: "${artifactName}" artifact must retain for 14 days`);
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

console.log(`Docs drift check passed for ${humanValidationSurfaces.length} validation surfaces.`);
