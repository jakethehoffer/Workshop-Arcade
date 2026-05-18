import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const requiredCommands = [
  'validate-catalog.ps1',
  'npm run test:docs',
  'npm run test:tools',
  'npm run test:capture-recipes',
  'npm run test:a11y',
  'npm run test:games',
  'npm run capture:games:ci',
  'npm run audit:perf:ci'
];

const validationSurfaces = [
  'README.md',
  'CONTRIBUTING.md',
  'docs/game-contract.md',
  '.github/pull_request_template.md',
  '.github/ISSUE_TEMPLATE/workshop-request.md',
  '.github/workflows/workshop-request.yml',
  '.github/workflows/workshop-draft-pr.yml',
  '.github/workflows/validate-catalog.yml'
];

const issues = [];

for (const file of validationSurfaces) {
  const absolute = path.join(root, file);
  let text = '';
  try {
    text = fs.readFileSync(absolute, 'utf8');
  } catch (error) {
    issues.push(`${file}: unable to read (${error.message})`);
    continue;
  }

  for (const command of requiredCommands) {
    if (!text.includes(command)) {
      issues.push(`${file}: missing required validation command "${command}"`);
    }
  }
}

const workflow = fs.readFileSync(path.join(root, '.github/workflows/validate-catalog.yml'), 'utf8');
const workflowLines = workflow.split(/\r?\n/);

const requiredWorkflowJobs = [
  {
    id: 'catalog-docs-a11y',
    label: 'catalog/docs/a11y',
    commands: ['validate-catalog.ps1', 'npm run test:docs', 'npm run test:tools', 'npm run test:capture-recipes', 'npm run test:a11y']
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

console.log(`Docs drift check passed for ${validationSurfaces.length} validation surfaces.`);
