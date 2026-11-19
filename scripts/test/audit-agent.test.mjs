/** S1 of housekeeping-audit: the auditor and the audit skill, pinned in their prose (A6: no test spawns an agent). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AREAS } from '../../deck/audit.mjs';
import { read, fieldOf, sectionOf } from './lib/area-file.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const AREAS_DIR = 'skills/audit/areas';

const auditor = () => read('agents/pilot-auditor.md');
const skill = () => read('skills/audit/SKILL.md');

// Each area file's own test asserts what only it needs to; the exact spec and model
// values, which are otherwise restated per file (review P7), live here, next to the loop
// that already checks every area file's frontmatter shape.
const EXPECT = {
  'context.md': { spec: '[8, 9]', model: 'haiku' },
  'loops.md': { spec: '[6, 11]' },
  'navigability.md': { spec: '[7]', model: 'sonnet' }, // L14: navigability runs on Sonnet
  'open.md': { spec: '[15]' },
  'rederived.md': { spec: '[8]', model: 'sonnet' }, // verdict-pass A4: an explorer on Sonnet
  'refusals.md': { spec: '[7]' }, // crew-refusals spec 7: the auditor's own area
  'setup.md': { spec: '[5, 10]' },
};

test('the auditor names itself and carries the tools to own its thread', () => {
  const source = auditor();
  assert.equal(fieldOf(source, 'name'), 'pilot-auditor');
  assert.equal(fieldOf(source, 'model'), 'opus', 'L14');
  assert.equal(
    fieldOf(source, 'tools'),
    'Read, Write, Grep, Glob, Bash, PowerShell, Agent, SendMessage, ToolSearch, mcp__plugin_pilot_deck__deck_post, ' +
      'mcp__plugin_pilot_deck__deck_reply, mcp__plugin_pilot_deck__deck_resolve',
  );
});

test("the auditor cuts at the CLI's sha and records base", () => {
  const source = auditor();
  // lint: the Scratch worktree section runs the pilot-tip CLI with --fetch (audit-f1 spec 1, 4)
  assert.match(sectionOf(source, 'Scratch worktree'), /^node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/pilot-tip\.mjs" --fetch$/m);
  // lint: the report shape names base (audit-f1 spec 3)
  assert.match(sectionOf(source, 'Report'), /`\{ repo, scratch, base, /);
});

test('the audit skill keeps its three steps, and its snapshot takes the four git states', () => {
  const source = skill();
  assert.equal(fieldOf(source, 'name'), 'audit');

  // lint: the skill's step headings exist, in order
  const headings = [...source.matchAll(/^## (.+)$/gm)].map(([, heading]) => heading);
  assert.deepEqual(headings, ['Before', 'Run the auditor', 'Hand over']);

  // lint: the Before step takes each git snapshot
  const before = sectionOf(source, 'Before');
  for (const command of ['git status --porcelain', 'git branch -a', 'git stash list', 'git worktree list']) {
    assert.ok(before.includes(command), `the snapshot takes ${command}`);
  }
});

// lint: every area file's frontmatter shape and its Measure and Rows headings
test('every file in skills/audit/areas carries the area-file frontmatter', () => {
  const files = fs.readdirSync(path.join(ROOT, AREAS_DIR)).filter((name) => name.endsWith('.md'));
  assert.ok(files.includes('loops.md'), 'spec 6');

  for (const file of files) {
    const source = read(`${AREAS_DIR}/${file}`);
    const area = fieldOf(source, 'area');
    assert.equal(area, path.basename(file, '.md'), `${file}: area names the file`);
    assert.ok(AREAS.includes(area), `${file}: ${area} is an Area`);

    const owner = fieldOf(source, 'owner');
    assert.ok(['auditor', 'explorer'].includes(owner), `${file}: owner is auditor or explorer`);
    const model = fieldOf(source, 'model');
    if (owner === 'explorer') assert.ok(['sonnet', 'haiku'].includes(model), `${file}: an explorer's area names its model`);
    else assert.equal(model, undefined, `${file}: the auditor's own area names no model`);

    assert.match(fieldOf(source, 'spec') ?? '', /^\[\d+(, \d+)*\]$/, `${file}: spec is a list of spec lines`);
    assert.match(source, /^## Measure$/m, `${file}: ## Measure`);
    assert.match(source, /^## Rows$/m, `${file}: ## Rows`);

    const expected = EXPECT[file];
    assert.ok(expected, `${file}: has a row in EXPECT naming its exact spec`);
    assert.equal(fieldOf(source, 'spec'), expected.spec, `${file}: spec is ${expected.spec}`);
    assert.equal(model, expected.model, `${file}: model is ${expected.model ?? 'unset'}`);
  }
});
