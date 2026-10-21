import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** `git <args>` in the checkout, with the user's global excludes switched off so only the repo's .gitignore answers. */
const git = (...args) =>
  spawnSync('git', ['-c', 'core.excludesFile=', ...args], { cwd: ROOT, encoding: 'utf8' });

/** `git check-ignore --no-index` answers by pattern alone, so a path need not exist and a tracked one is still judged. */
const checkIgnore = (file) => git('check-ignore', '--no-index', '-q', file);

test('env and scratch files are ignored', () => {
  for (const file of [
    '.env',
    '.env.prod',
    'deck/.env.local',
    'deck/settings.local',
    'prod.env',
    '.claude/settings.local.json',
    'certs/server.pem',
    '.npmrc',
    'pb.txt',
    'notes.scratch.md',
  ]) {
    const { status, stderr } = checkIgnore(file);
    assert.equal(status, 0, `${file} should be ignored${stderr ? `: ${stderr}` : ''}`);
  }
});

test('nothing tracked is newly ignored', () => {
  const { status, stdout, stderr } = git('ls-files', '-ci', '--exclude-standard');
  assert.equal(status, 0, stderr);
  assert.equal(stdout, '', `tracked files matched by .gitignore:\n${stdout}`);
});

test('an example env file stays committable', () => {
  for (const file of ['.env.example', 'fixtures/audit-repo/.env.example']) {
    const { status, stderr } = checkIgnore(file);
    assert.equal(status, 1, `${file} should not be ignored${stderr ? `: ${stderr}` : ''}`);
  }
});
