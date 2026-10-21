import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { frontmatterOf, bodyOf } from './lib/area-file.mjs';

const TESTS = path.dirname(fileURLToPath(import.meta.url));
const crlf = (text) => text.replace(/\n/g, '\r\n');

test('frontmatterOf reads a CRLF file as its LF copy', () => {
  const lf = '---\narea: x\n---\nbody\n';
  assert.equal(frontmatterOf(lf), 'area: x');
  assert.equal(frontmatterOf(crlf(lf)), 'area: x');
  assert.equal(frontmatterOf('no block\n'), '');
});

test('bodyOf drops the block in either ending', () => {
  const lf = '---\narea: x\n---\nbody\nmore\n';
  assert.equal(bodyOf(lf), 'body\nmore\n');
  assert.equal(bodyOf(crlf(lf)), 'body\r\nmore\r\n');
  assert.equal(bodyOf('no block\n'), 'no block\n');
});

test('no test parses a leading frontmatter by its own LF regex', () => {
  // adr-format.test.mjs matches a template it holds in the file, not its own frontmatter.
  const parsers = fs
    .readdirSync(TESTS)
    .filter((name) => name.endsWith('.test.mjs') && name !== 'adr-format.test.mjs')
    .filter((name) => /\^---\\n(?:\(|\[\\s\\S\])/.test(fs.readFileSync(path.join(TESTS, name), 'utf8')));
  assert.deepEqual(parsers, []);
});
