/** Pins for the duplicate-number check and the NNNN placeholder in `scripts/adr-index.mjs`. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { checkIndex, renderIndex, nextNumber } from '../adr-index.mjs';

function scratch(t, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-adr-placeholder-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const name of files) fs.writeFileSync(path.join(dir, name), '', 'utf8');
  return dir;
}

const adr = (title, fields = {}) => {
  const fm = { status: 'accepted', date: '2026-10-01', tags: '[]', supersedes: '[]', superseded_by: '[]', paths: '[]', ...fields };
  return `---\n${Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\n# ${title}\n\nBody.\n`;
};

function withFiles(t, files) {
  const dir = scratch(t, []);
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text, 'utf8');
  fs.writeFileSync(path.join(dir, 'README.md'), renderIndex(dir), 'utf8');
  return dir;
}

test('a duplicate number is named', (t) => {
  const dir = withFiles(t, { '0161-a.md': adr('A'), '0161-b.md': adr('B') });
  const { problems } = checkIndex(dir);
  assert.equal(problems.length, 1, problems.join('\n'));
  assert.match(problems[0], /ADR 0161 is used by 0161-a\.md and 0161-b\.md/);
});

test('a placeholder passes on a feature branch', (t) => {
  const dir = withFiles(t, {
    'NNNN-x.md': adr('X', { supersedes: '[0140]' }),
    '0140-old.md': adr('Old', { status: 'superseded', superseded_by: '[NNNN]' }),
  });
  assert.deepEqual(checkIndex(dir).problems, []);
});

test('the next number', (t) => {
  const dir = scratch(t, ['0001-a.md', '0166-b.md', 'NNNN-x.md']);
  assert.equal(nextNumber(dir), '0167');
  assert.equal(nextNumber(scratch(t, [])), '0001');
});
