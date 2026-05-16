import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const requiredCommands = [
  'validate-catalog.ps1',
  'npm run test:a11y',
  'npm run test:games',
  'npm run capture:games:ci',
  'npm run audit:perf:ci'
];

const validationSurfaces = [
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
