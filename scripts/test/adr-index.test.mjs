/**
 * Pins for the generated ADR index, `docs/adr/README.md`. Every case but the
 * last runs against a scratch directory; the last is the check over the real
 * `docs/adr/`, which is what makes an ADR added without regenerating fail
 * `npm test`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { indexLines, checkIndex } from '../adr-index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'adr-index.mjs');

function scratch(t, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-adr-index-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), body, 'utf8');
  }
  return dir;
}

const generate = (dir) => {
  const r = spawnSync(process.execPath, [SCRIPT, '--dir', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
};

/** An ADR file's text: front matter (defaults overridden by `fields`), title, body. */
function adr(title, body, fields = {}) {
  const fm = {
    status: 'accepted',
    date: '2026-10-01',
    tags: '[]',
    supersedes: '[]',
    superseded_by: '[]',
    paths: '[]',
    ...fields,
  };
  const lines = Object.entries(fm).map(([k, v]) => `${k}: ${v}`);
  return `---\n${lines.join('\n')}\n---\n# ${title}\n\n${body}\n`;
}

const TWO = {
  '0002-second.md': adr('The second decision', 'We chose B. A lost.'),
  '0001-first.md': adr('The first decision', 'We chose A over B. Then more.'),
  'notes.txt': 'not an ADR\n',
};

test('the index has one row per ADR file, by number', (t) => {
  const dir = scratch(t, TWO);
  assert.deepEqual(indexLines(dir), [
    '| 0001 | [The first decision](0001-first.md) | accepted | We chose A over B. |',
    '| 0002 | [The second decision](0002-second.md) | accepted | We chose B. |',
  ]);
});

test('regenerating changes nothing', (t) => {
  const dir = scratch(t, TWO);
  generate(dir);
  const first = fs.readFileSync(path.join(dir, 'README.md'));
  generate(dir);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'README.md')), first);
  assert.deepEqual(checkIndex(dir), { ok: true, problems: [] });
});

test('the check fails naming an ADR missing from the index', (t) => {
  const dir = scratch(t, TWO);
  generate(dir);
  fs.writeFileSync(path.join(dir, '0003-third.md'), adr('A third', 'C.'), 'utf8');
  const result = checkIndex(dir);
  assert.equal(result.ok, false);
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /0003-third\.md/);
  assert.match(result.problems[0], /missing/);

  const cli = spawnSync(process.execPath, [SCRIPT, '--dir', dir, '--check'], { encoding: 'utf8' });
  assert.equal(cli.status, 1);
  assert.match(cli.stderr, /0003-third\.md/);
});

test('the check fails on a stale row', (t) => {
  const dir = scratch(t, TWO);
  generate(dir);
  fs.writeFileSync(path.join(dir, '0002-second.md'), adr('A renamed decision', 'We chose B. A lost.'));
  const result = checkIndex(dir);
  assert.equal(result.ok, false);
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /stale/);
  assert.match(result.problems[0], /0002-second\.md/);
});

test('the check fails when the index is absent', (t) => {
  const dir = scratch(t, TWO);
  const result = checkIndex(dir);
  assert.equal(result.ok, false);
  assert.match(result.problems[0], /README\.md/);
});

test('the row reads status from front matter and the first sentence of the body', (t) => {
  const dir = scratch(t, {
    '0001-front.md': adr('Front', 'First. Second.', { status: 'superseded' }),
    '0002-neither.md': adr('Neither', 'Plain body\nacross two lines.'),
    '0003-long.md': adr('Long', `${'word '.repeat(60)}end.`),
    '0004-pipe.md': adr('A | B', 'Use a | b. Then.'),
  });
  const [front, neither, long, pipe] = indexLines(dir);
  assert.equal(front, '| 0001 | [Front](0001-front.md) | superseded | First. |');
  assert.equal(neither, '| 0002 | [Neither](0002-neither.md) | accepted | Plain body across two lines. |');
  const sentence = long.split(' | ')[3].replace(/ \|$/, '');
  assert.ok(sentence.length <= 160, `${sentence.length} chars`);
  assert.equal(pipe, '| 0004 | [A \\| B](0004-pipe.md) | accepted | Use a \\| b. |');
});

/** Writes `files`, regenerates the index, and returns the check's problems. */
function problemsOf(t, files) {
  const dir = scratch(t, files);
  generate(dir);
  const result = checkIndex(dir);
  assert.equal(result.ok, result.problems.length === 0);
  return result.problems;
}

test('the check fails on an ADR without front matter', (t) => {
  const problems = problemsOf(t, { ...TWO, '0003-bare.md': '# Bare\n\nNo front matter.\n' });
  assert.deepEqual(problems, ['0003 has no front matter']);
});

test('the check fails on front matter missing a key', (t) => {
  const text = adr('Keyless', 'Body.').replace('paths: []\n', '');
  assert.deepEqual(problemsOf(t, { ...TWO, '0003-keyless.md': text }), ['0003 has no paths in its front matter']);
});

test('the check fails on a one-sided supersedes', (t) => {
  const problems = problemsOf(t, {
    '0001-old.md': adr('Old', 'Was.'),
    '0002-new.md': adr('New', 'Is.', { supersedes: '[0001]' }),
  });
  assert.deepEqual(problems, ['0002 supersedes 0001 but 0001 has no superseded_by 0002']);
});

test('the check fails on a one-sided superseded_by', (t) => {
  const problems = problemsOf(t, {
    '0001-old.md': adr('Old', 'Was.', { status: 'superseded', superseded_by: '[0002]' }),
    '0002-new.md': adr('New', 'Is.'),
  });
  assert.deepEqual(problems, ['0001 is superseded_by 0002 but 0002 has no supersedes 0001']);
});

test('the check passes on supersession named on both sides', (t) => {
  const problems = problemsOf(t, {
    '0001-old.md': adr('Old', 'Was.', { status: 'superseded', superseded_by: '[0003]' }),
    '0002-part.md': adr('Part', 'Partly.', { status: 'amended', superseded_by: '[0003]' }),
    '0003-new.md': adr('New', 'Is.', { supersedes: '[0001, 0002]' }),
  });
  assert.deepEqual(problems, []);
});

test('the check fails on a status outside the allowed set', (t) => {
  const problems = problemsOf(t, { ...TWO, '0003-odd.md': adr('Odd', 'Hm.', { status: 'its' }) });
  assert.deepEqual(problems, [
    '0003 has status "its", not one of proposed, accepted, superseded, amended, deprecated',
  ]);
});

test('the real docs/adr passes the check', () => {
  const result = checkIndex(path.join(ROOT, 'docs', 'adr'));
  assert.deepEqual(result.problems, [], 'run `npm run adr-index` to regenerate docs/adr/README.md');
  assert.equal(result.ok, true);
});

test('an unknown flag is refused and writes nothing', (t) => {
  const dir = scratch(t, TWO);
  const r = spawnSync(process.execPath, [SCRIPT, '--dir', dir, '--chek'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.equal(fs.existsSync(path.join(dir, 'README.md')), false);
});
