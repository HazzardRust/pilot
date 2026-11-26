import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** `git <args>` in the checkout, with the user's global excludes switched off so only the repo's .gitignore answers. */
const git = (...args) =>
  spawnSync('git', ['-c', 'core.excludesFile=', ...args], { cwd: ROOT, encoding: 'utf8' });

/**
 * `git check-ignore --no-index` answers by pattern alone, so a path need not exist and a tracked one is still judged.
 * One run for all of `files` (`-v -n`): each path's line names the pattern that decided it, `!` first when it
 * re-includes, empty when none matched. Answers path -> ignored, and the run's stderr.
 */
function checkIgnore(files) {
  const { status, stdout, stderr } = git('check-ignore', '--no-index', '-v', '-n', ...files);
  assert.ok(status === 0 || status === 1, `check-ignore failed: ${stderr}`);
  const pattern = new Map(stdout.split('\n').filter(Boolean).map((line) => {
    const [source, file] = line.split('\t');
    // `<source>:<line>:<pattern>`, or `::` for none; the source may be an absolute path with a drive colon.
    return [file, source.match(/^(?:.*?:\d+:|::)(.*)$/s)[1]];
  }));
  const ignored = (file) => {
    assert.ok(pattern.has(file), `check-ignore printed no line for ${file}`);
    const p = pattern.get(file);
    return p !== '' && !p.startsWith('!');
  };
  return { ignored, stderr };
}

test('env and scratch files are ignored', () => {
  const files = [
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
  ];
  const { ignored, stderr } = checkIgnore(files);
  for (const file of files) {
    assert.equal(ignored(file), true, `${file} should be ignored${stderr ? `: ${stderr}` : ''}`);
  }
});

test('nothing tracked is newly ignored', () => {
  const { status, stdout, stderr } = git('ls-files', '-ci', '--exclude-standard');
  assert.equal(status, 0, stderr);
  assert.equal(stdout, '', `tracked files matched by .gitignore:\n${stdout}`);
});

test('an example env file stays committable', () => {
  const files = ['.env.example', 'fixtures/audit-repo/.env.example'];
  const { ignored, stderr } = checkIgnore(files);
  for (const file of files) {
    assert.equal(ignored(file), false, `${file} should not be ignored${stderr ? `: ${stderr}` : ''}`);
  }
});
