/**
 * No doc tells anyone to start the pilot with a bare `claude --agent pilot:pilot` (plain-session S6, L6 L7),
 * which below `everything` starts a session with no pilot plugin loaded. A command's absence is tested, no phrase.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');

test('no doc starts the pilot bare', () => {
  // lint: no line starts `claude --agent pilot:pilot` without `--settings` turning the plugin on
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
});
