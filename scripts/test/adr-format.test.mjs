import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const path = new URL('../../skills/domain-modeling/ADR-FORMAT.md', import.meta.url);
const text = readFileSync(path, 'utf8').split('\r\n').join('\n');
const root = new URL('../../', import.meta.url);

test('the ADR format shows the six keys in order', () => {
  const block = text.match(/^---\n([\s\S]*?)\n---\n# /m);
  assert.ok(block, 'template opens with a front matter block');
  const keys = block[1].split('\n').map((l) => l.match(/^(\w+):/)?.[1]).filter(Boolean);
  assert.deepEqual(keys, ['status', 'date', 'tags', 'supersedes', 'superseded_by', 'paths']);
});

test('the ADR format lists the allowed statuses', () => {
  assert.match(text, /status: proposed \| accepted \| superseded \| amended \| deprecated/);
});

test('the ADR format says a repository rule may replace the schema', () => {
  assert.match(text, /repository'?s? own rule[^.]*another schema[^.]*wins/i);
  assert.doesNotMatch(text, /No status frontmatter/);
});

test('the provenance header still names its upstream and says adapted', () => {
  assert.match(text, /^<!-- provenance\nupstream: mattpocock-skills[^\n]*\n[\s\S]*?\nadapted: [^\n]*front matter/);
  const r = spawnSync(process.execPath, ['scripts/check-provenance.mjs', 'skills/'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
