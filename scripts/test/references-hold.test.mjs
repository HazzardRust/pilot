/**
 * deep-modules S6 (spec 4 (b), L5, L12): a prompt that names a `pilot` subcommand or a
 * deck tool that does not exist, or a deck tool its own agent is not granted, fails the
 * corpus check. These tests stand in for the per-prompt pins that only checked a name.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkReferences } from '../check-references.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A scratch package: the real dispatcher and tool list, plus the files a test plants. */
function scratch(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'references-hold-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const rel of ['bin/pilot.mjs', 'deck/tools.mjs']) {
    fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), path.join(root, rel));
  }
  for (const [rel, lines] of Object.entries(files)) {
    fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), lines.join('\n'));
  }
  return root;
}

const agent = (tools, ...body) => ['---', 'name: a', `tools: ${tools}`, '---', '', ...body];

test('an unknown pilot subcommand fails', (t) => {
  const root = scratch(t, {
    'skills/s/SKILL.md': [
      '# S',
      '',
      'Run `pilot integrate` and then `pilot frobnicate --now`.',
      'Or `pilot --dir <worktree> launch <branch>`, or `"${CLAUDE_PLUGIN_ROOT}/bin/pilot.mjs" vanish`.',
      'The pilot merges it; that is prose, not a command.',
    ],
  });

  const { ok, failures } = checkReferences(root, ['skills']);

  assert.equal(ok, false);
  assert.deepEqual(failures, [
    'skills/s/SKILL.md:3: `pilot frobnicate` is not a subcommand bin/pilot.mjs dispatches',
    'skills/s/SKILL.md:4: `pilot launch` is not a subcommand bin/pilot.mjs dispatches',
    'skills/s/SKILL.md:4: `pilot vanish` is not a subcommand bin/pilot.mjs dispatches',
  ]);
});

test('an unknown deck tool fails', (t) => {
  const root = scratch(t, {
    'skills/s/SKILL.md': [
      '# S',
      '',
      'Post with `mcp__plugin_pilot_deck__deck_post`; never `mcp__plugin_pilot_deck__deck_launch`.',
      'Any tool on the server is `mcp__plugin_pilot_deck__*`.',
    ],
    'hooks/hooks.json': ['{ "matcher": "^mcp__plugin_pilot_deck__deck_(post|shout)$" }'],
  });

  const { ok, failures } = checkReferences(root, ['skills', 'hooks']);

  assert.equal(ok, false);
  assert.deepEqual(failures, [
    'hooks/hooks.json:1: deck tool deck_shout is not one deck/tools.mjs TOOLS names',
    'skills/s/SKILL.md:3: deck tool deck_launch is not one deck/tools.mjs TOOLS names',
  ]);
});

test('an agent naming an ungranted deck tool fails', (t) => {
  const root = scratch(t, {
    'agents/narrow.md': agent(
      'Read, mcp__plugin_pilot_deck__deck_post',
      'Post with `mcp__plugin_pilot_deck__deck_post`, then resolve with `mcp__plugin_pilot_deck__deck_resolve`.',
    ),
    'agents/server.md': agent(
      'Read, mcp__plugin_pilot_deck',
      'The server grant covers `mcp__plugin_pilot_deck__deck_resolve`.',
    ),
    'agents/bare.md': agent('Read', 'You have no `deck_read`; a bare name is prose, not a call.'),
    'agents/body.md': ['---', 'name: b', '---', '', 'tools: mcp__plugin_pilot_deck', 'Call `mcp__plugin_pilot_deck__deck_post`.'],
  });

  const { ok, failures } = checkReferences(root, ['agents']);

  assert.equal(ok, false);
  assert.deepEqual(failures, [
    'agents/body.md:6: agents/body.md names mcp__plugin_pilot_deck__deck_post, which its tools: does not grant',
    'agents/narrow.md:6: agents/narrow.md names mcp__plugin_pilot_deck__deck_resolve, which its tools: does not grant',
  ]);
});

test('a root without the dispatcher or the tool list throws rather than failing every name', (t) => {
  for (const [missing, named] of [
    ['bin/pilot.mjs', 'Run `pilot integrate`.'],
    ['deck/tools.mjs', 'Post with `mcp__plugin_pilot_deck__deck_post`.'],
  ]) {
    const root = scratch(t, { 'skills/s/SKILL.md': ['# S', '', named] });
    fs.rmSync(path.join(root, missing));
    assert.throws(() => checkReferences(root, ['skills']), { message: `no ${missing} under ${root}` });
  }
});
