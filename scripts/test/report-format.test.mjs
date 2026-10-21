/**
 * A user walkthrough finding (2026-09-13): pilot:security-reviewer's report came back
 * preceded by a heading and a scope paragraph, and followed by a closing summary
 * paragraph, so the parent session summarised it as prose instead of copying the table
 * verbatim. "and nothing above it" banned a preamble but never said the table plus the
 * verdict line was the whole report, so a model still added a heading and closing prose.
 *
 * This is the correct seam available for it: a unit test cannot drive the live model call
 * that actually reproduced the bug (non-deterministic, costs real API calls), but it can
 * prove the instruction text that steers that behaviour explicitly forbids a heading, a
 * preamble and closing prose, in every reviewer that shares the wording. The live re-run
 * captured in QA is what proves the model actually complies.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The six reviewers that share the "## Report format" wording (A7's toolbox). */
const REVIEWERS = [
  'security-reviewer',
  'typescript-reviewer',
  'react-reviewer',
  'python-reviewer',
  'database-reviewer',
  'silent-failure-hunter',
];

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const reportFormatSection = (source) => {
  const match = /## Report format\r?\n([\s\S]*?)(\r?\n## |\r?\n?$)/.exec(source);
  assert.ok(match, 'no "## Report format" section found');
  return match[1];
};

test('every reviewer\'s report format bans a heading, a preamble and closing prose', () => {
  for (const name of REVIEWERS) {
    const section = reportFormatSection(read(`agents/${name}.md`));
    assert.match(section, /nothing\s+else/i, `agents/${name}.md: report format must say "nothing else"`);
    assert.match(section, /no\s+heading/i, `agents/${name}.md: report format must ban a heading`);
    assert.match(section, /no\s+preamble/i, `agents/${name}.md: report format must ban a preamble`);
    assert.match(section, /no\s+closing\s+prose/i, `agents/${name}.md: report format must ban closing prose`);
  }
});
