/**
 * The install asks the reach (plain-session S6, spec 1 7 8, L6 L7): INSTALL.md puts a fourth
 * question, how much a plain `claude` session carries, runs `pilot reach <level>` for the
 * answer, offers the CLAUDE.md excerpt only at `everything`, and verifies through the enable.
 * No doc tells anyone to start the pilot with a bare `claude --agent pilot:pilot`, which below
 * `everything` starts a session with no pilot plugin loaded.
 *
 * Each assertion pins a word a rewording has to keep findable (the question, the command, the
 * condition), never a whole sentence.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
const INSTALL = () => read('docs/INSTALL.md');

/** From the heading line matching `pattern` up to the next `## ` heading. */
function sectionMatching(source, pattern) {
  const start = source.search(pattern);
  assert.notEqual(start, -1, `docs/INSTALL.md has no heading matching ${pattern}`);
  const end = source.indexOf('\n## ', start + 3);
  return end === -1 ? source.slice(start) : source.slice(start, end);
}

test('INSTALL asks the reach and runs pilot reach', () => {
  const install = INSTALL();
  const questions = sectionMatching(install, /^## The four questions to ask$/m);
  const fourth = questions.slice(questions.search(/^4\. /m));

  assert.match(install, /answers to the four questions below/, 'the opening counts four');
  assert.match(fourth, /^4\. \*\*How much should a plain `?claude`? session carry\?\*\*/, 'question 4 is the reach');
  for (const level of ['nothing', 'rules', 'everything']) {
    assert.match(fourth, new RegExp(`\`${level}\``), `question 4 names the level ${level}`);
  }
  assert.match(fourth, /`nothing`[^.]*default|default[^.]*`nothing`/i, 'and its default is nothing');

  const step = sectionMatching(install, /^## \d+\. Choose the reach$/m);
  assert.match(step, /```bash\npilot reach <level>\n```/, 'the step runs pilot reach with the answer');
});

test('the excerpt is offered only at everything', () => {
  const install = INSTALL();
  const step = sectionMatching(install, /^## 7\. /m);

  assert.match(step, /CLAUDE\.excerpt\.md/, 'step 7 is still the excerpt');
  assert.match(step, /only (?:if|when) the reach is `everything`/, 'step 7 names the condition');
  assert.match(step, /skip this step/i, 'and what to do below it');
});

test('no doc starts the pilot bare', () => {
  for (const file of [
    'README.md',
    'docs/INSTALL.md',
    'docs/OPERATING.md',
    'CLAUDE.excerpt.md',
    'agents/pilot.md',
    'rules/orchestration.md',
  ]) {
    // A line naming `claude` and `--agent pilot:pilot`, in any order of flags, is a start; it is
    // bare unless the same line turns the plugin on with `--settings`.
    const bare = read(file)
      .split('\n')
      .filter((line) => /\bclaude\b/.test(line) && /--agent\s+pilot:pilot/.test(line) && !/--settings/.test(line));
    assert.deepEqual(bare, [], `${file} starts the pilot bare`);
  }

  const verify = sectionMatching(INSTALL(), /^## 9\. /m);
  assert.match(verify, /--settings[^\n]*enabledPlugins[^\n]*pilot@pilot[^\n]*true/, 'step 9 verifies through the enable');
});
