// OPERATING.md's `## Commands under the hood` (readme-graph-deck S2, spec 5): every subcommand that
// moves work is named there, so the README's graph can stay at the level the user sees.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { helpSubcommands } from './lib/help-subcommands.mjs';
import { RETIRED } from '../check-references.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// The text under '## Commands under the hood', up to the next heading.
const commandsSection = (md) => md.split(/^## Commands under the hood\s*$/m)[1]?.split(/^## /m)[0] ?? '';

const section = commandsSection(fs.readFileSync(path.join(ROOT, 'docs', 'OPERATING.md'), 'utf8'));

// lint: the section names no command `pilot help` does not list
test('the section names only real commands', () => {
  const real = [...helpSubcommands(), ...RETIRED, 'help'];
  const named = [...section.matchAll(/`pilot (\w+)/g)].map((m) => m[1]);
  assert.notEqual(named.length, 0);
  assert.deepEqual(named.filter((s) => !real.includes(s)), []);
});
