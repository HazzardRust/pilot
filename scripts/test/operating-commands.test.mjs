// OPERATING.md's `## Commands under the hood` (readme-graph-deck S2, spec 5): every subcommand that
// moves work is named there, so the README's graph can stay at the level the user sees.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { helpSubcommands } from './lib/help-subcommands.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Subcommands `pilot help` prints that move no work between agents, branches and PRs.
const NON_MOVING = ['deck', 'base', 'worktrees', 'branches', 'audit', 'analytics', 'logging', 'budget', 'ps', 'gc', 'doctor', 'store', 'status', 'uninstall', 'reach', 'verdicts', 'gh-stub'];

const moving = () => helpSubcommands().filter((s) => !NON_MOVING.includes(s));

// The text under '## Commands under the hood', up to the next heading.
const commandsSection = (md) => md.split(/^## Commands under the hood\s*$/m)[1]?.split(/^## /m)[0] ?? '';

const section = commandsSection(fs.readFileSync(path.join(ROOT, 'docs', 'OPERATING.md'), 'utf8'));

test('every moving subcommand is under the hood', () => {
  assert.deepEqual(moving().filter((s) => !new RegExp(String.raw`\`pilot ${s}(?![\w-])`).test(section)), []);
});

test('the section names only real commands', () => {
  const real = [...helpSubcommands(), 'help'];
  const named = [...section.matchAll(/`pilot (\w+)/g)].map((m) => m[1]);
  assert.notEqual(named.length, 0);
  assert.deepEqual(named.filter((s) => !real.includes(s)), []);
});
