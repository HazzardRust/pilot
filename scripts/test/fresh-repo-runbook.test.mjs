/**
 * The move to a fresh public repository (fresh-public-repo spec 4, 4a, 5, 7, 8): docs/OPERATING.md's
 * runbook keeps its four subsections in order and names the builder, the scan and the secret by
 * name only; every owner/name pin reads the one `REPOSITORY`; the title "Pilot Deck Claude Code"
 * reads in README's H1, package.json and the runbook; and neither workflow loosens its guard.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { REPOSITORY } from '../install-command.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8').replace(/\r\n/g, '\n');
const json = (...parts) => JSON.parse(read(...parts));

const TITLE = 'Pilot Deck Claude Code';
const SUBSECTIONS = ['Before the move', 'On GitHub', 'After the move', 'Links from before the move'];

function runbook() {
  const doc = read('docs', 'OPERATING.md');
  const start = doc.indexOf('\n## Moving to a fresh public repository\n');
  assert.notEqual(start, -1, 'docs/OPERATING.md has no "## Moving to a fresh public repository" section');
  const rest = doc.slice(start + 1);
  const next = rest.slice(2).search(/\n## /);
  return next === -1 ? rest : rest.slice(0, next + 2);
}

function subsection(body, heading) {
  const at = body.indexOf(`\n### ${heading}\n`);
  assert.notEqual(at, -1, `no "### ${heading}" subsection`);
  const rest = body.slice(at + 1);
  const next = rest.slice(4).search(/\n### /);
  return next === -1 ? rest : rest.slice(0, next + 4);
}

test('the runbook has its four subsections in order', () => {
  const body = runbook();
  const at = SUBSECTIONS.map((heading) => body.indexOf(`\n### ${heading}\n`));
  SUBSECTIONS.forEach((heading, i) => assert.notEqual(at[i], -1, `no "### ${heading}" subsection`));
  assert.deepEqual([...at].sort((a, b) => a - b), at, `the subsections are not in the order ${SUBSECTIONS.join(', ')}`);
});

test('the runbook names the builder, the scan and the secret by name only', () => {
  const body = runbook();
  for (const name of ['scripts/fresh-repo.mjs', 'gitleaks dir', 'CLAUDE_CODE_OAUTH_TOKEN']) {
    assert.ok(body.includes(name), `the runbook does not name ${name}`);
  }
  // An OAuth token, a GitHub token, or a value handed to `gh secret set` on its command line.
  for (const value of [/sk-ant-[\w-]{8,}/, /\bgh[opsur]_[A-Za-z0-9]{16,}/, /\bgithub_pat_\w{16,}/, /gh secret set [^`\n]*(--body|-b)\b/]) {
    assert.doesNotMatch(body, value, 'the runbook carries a secret value');
  }
});

test('the archive note reads', () => {
  const note = subsection(runbook(), 'Links from before the move');
  for (const term of [/PR numbers/, /mergeShas?/, /run records/, /briefs/, /archive/]) {
    assert.match(note, term, `"Links from before the move" does not say ${term.source}`);
  }
});

test('every pin reads one owner/name', () => {
  const repo = REPOSITORY;
  const [owner] = repo.split('/');
  const plugin = json('.claude-plugin', 'plugin.json');
  assert.equal(plugin.homepage, `https://github.com/${repo}`);
  assert.equal(plugin.repository, `https://github.com/${repo}`);
  assert.deepEqual(plugin.author, { name: owner, url: `https://github.com/${owner}` });
  assert.deepEqual(json('.claude-plugin', 'marketplace.json').owner, { name: owner, url: `https://github.com/${owner}` });
  const pkg = json('package.json');
  assert.equal(pkg.author, owner);
  assert.equal(pkg.repository.url, `git+https://github.com/${repo}.git`);
  for (const file of ['README.md', path.join('docs', 'INSTALL.md')]) {
    // An `<owner>/<name>`, not a local path such as INSTALL.md's `/path/to/pilot`.
    const added = [...read(file).matchAll(/claude plugin marketplace add ([\w-]+\/[\w.-]+)/g)].map((m) => m[1]);
    assert.ok(added.length > 0, `${file} names no \`claude plugin marketplace add\``);
    for (const name of added) assert.equal(name, repo, `${file} adds the marketplace from ${name}`);
  }
});

test('public CI keeps its guards', () => {
  const claude = read('.github', 'workflows', 'claude.yml');
  for (const loosener of ['allowed_non_write_users', 'allowed_bots']) {
    assert.ok(!claude.includes(loosener), `claude.yml sets ${loosener}`);
  }
  assert.match(read('.github', 'workflows', 'gate.yml'), /^permissions:\n {2}contents: read\n(?! )/m, 'gate.yml does not keep `contents: read` alone');
});

test('the title reads Pilot Deck Claude Code', () => {
  const readme = read('README.md');
  // README opens with the user's `# BETA` banner; the project's H1 is the heading that was `# Pilot`.
  assert.match(readme, new RegExp(`^# ${TITLE}$`, 'm'), `README has no \`# ${TITLE}\` heading`);
  assert.doesNotMatch(readme, /^# Pilot\s*$/m, 'README still has a bare `# Pilot` heading');
  assert.ok(json('package.json').description.startsWith(TITLE), `package.json's description does not open with ${TITLE}`);
  assert.ok(runbook().includes(`--description "${TITLE}"`), `the runbook's gh repo create has no --description "${TITLE}"`);
  assert.equal(json('.claude-plugin', 'plugin.json').name, 'pilot');
});
