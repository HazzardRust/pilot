// `scripts/shell-rules.mjs` (crew-refusals S2, spec 3, 4; L4): every agent whose `tools:` line
// grants a shell carries both SHELL_RULES sentences verbatim. Pinned on the real `agents/` and on
// fixture directories this test writes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SHELL_RULES, shellAgents, missingShellRules } from '../shell-rules.mjs';

const AGENTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'agents');

function fixture(t, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-rules-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text, 'utf8');
  return dir;
}

const agent = (tools, body) => `---\nname: x\ntools: ${tools}\n---\n\n${body}\n`;

test('every shell agent carries both rules', () => {
  assert.deepEqual(missingShellRules(AGENTS), []);
});

test('a shell agent without a rule is named', (t) => {
  const dir = fixture(t, {
    'whole.md': agent('Read, Bash', SHELL_RULES.join('\n\n')),
    'half.md': agent('Read, PowerShell', SHELL_RULES[0]),
  });
  assert.deepEqual(missingShellRules(dir), [{ agent: 'half', rule: SHELL_RULES[1] }]);
});

test('a rule wrapped across lines counts, a reworded one does not', (t) => {
  const [first, second] = SHELL_RULES;
  const wrapped = first.replace(' a red-then-green', '\r\n  a red-then-green');
  const reworded = second.replace('pkill -f', 'pkill');
  const dir = fixture(t, {
    'wrapped.md': agent('Bash', `${wrapped}\n\n${second}`),
    'reworded.md': agent('Bash', `${first}\n\n${reworded}`),
  });
  assert.deepEqual(missingShellRules(dir), [{ agent: 'reworded', rule: second }]);
});

test('an agent with no shell needs none', (t) => {
  const dir = fixture(t, {
    'reader.md': agent('Read, Grep, Glob', 'Reads only.'),
    'web.md': agent('WebFetch, Bashful', 'No shell, despite the name.'),
    'shell.md': agent('Read, Bash', 'Runs things.'),
    'notes.txt': 'not an agent',
  });
  assert.deepEqual(shellAgents(dir), ['shell']);
  assert.deepEqual(missingShellRules(dir).map((row) => row.agent), ['shell', 'shell']);
});

test('the two rules are two non-empty sentences', () => {
  assert.equal(SHELL_RULES.length, 2);
  for (const rule of SHELL_RULES) assert.match(rule, /^[A-Z].*\.$/);
  assert.ok(Object.isFrozen(SHELL_RULES));
});
