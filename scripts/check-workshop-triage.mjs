import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Execute the actual workflow script with a fake GitHub client. Nothing is
// sent externally. Hostile issue text must never enter a bot-authored comment.
const workflow = await readFile(new URL('../.github/workflows/workshop-request.yml', import.meta.url), 'utf8');
const script = workflow.split('          script: |')[1].trimEnd().split('\n').slice(1).map(line => line.replace(/^            /, '')).join('\n');
const run = new (Object.getPrototypeOf(async function () {}).constructor)('github', 'context', 'core', script);
const manifest = await readFile(new URL('../websites/manifest.json', import.meta.url), 'utf8');
async function commentFor(body) {
  const comments = [];
  const github = {rest: {issues: {
    createLabel: async () => {}, addLabels: async () => {}, listComments: async () => {},
    createComment: async value => comments.push(value.body),
  }, repos: {getContent: async args => {
    assert.equal(args.path, 'websites/manifest.json');
    assert.equal(args.ref, 'trusted-revision');
    return {data: {content: Buffer.from(manifest).toString('base64')}};
  }}}, paginate: async () => []};
  await run(github, {repo: {owner: 'arcade', repo: 'games'}, sha: 'trusted-revision', payload: {issue: {number: 12, body}}}, {info() {}});
  assert.equal(comments.length, 1);
  return comments[0];
}
for (const file of ['websites/echo-mimic.html', 'websites/missing.html', '../../secret', 'websites/echo-mimic.html)@stranger', 'https://example.invalid/attack']) {
  const comment = await commentFor(`Game: @stranger [Click here](https://example.invalid/attack)\nFile: ${file}`);
  assert.doesNotMatch(comment, /@stranger|example\.invalid|\.\.\/|websites\/missing\.html/);
  if (file === 'websites/echo-mimic.html') assert.match(comment, /\*\*Game:\*\* Echo Mimic/);
  else assert.doesNotMatch(comment, /\*\*Game:\*\*|\*\*File:\*\*/);
}
assert.match(await commentFor('File: websites/your-game.html'), /blocked by the active catalog content freeze/);
console.log('Workshop triage passed: trusted catalog names/paths, hostile Markdown rejection, and frozen-game handling.');
