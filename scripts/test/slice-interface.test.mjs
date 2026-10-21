/**
 * S1 (architect-depth spec 1 (format), 2, 3, 5, 6, 11): the slice-file shape starts here,
 * in the skill the architect preloads and the definition that names it, before any crew
 * file passes a slice-file path instead of a pasted section (S2's job). Files owned as a
 * path plus a role, an Interface block for the seams a slice creates or changes, ordered
 * Tests as the implementer's red steps, the "stated once" rule for a seam a later slice
 * reuses, the 300/60-line caps, and the no-code-past-signatures rule (L1, L3, L4, L7, L8).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const ANATOMY_FIELDS = [
  'Source spec',
  'Dependencies',
  'Reviewers',
  'Model',
  'Files owned',
  'Interface',
  'Tests',
  'Expected behaviour',
  'Verification commands',
  'Evidence required',
  'Prohibited shortcuts',
  'Completion condition',
];

const anatomySection = () => {
  const skill = read('skills/vertical-slicing/SKILL.md');
  const match = /## Anatomy of a slice\r?\n([\s\S]*?)\r?\n## Sizing/.exec(skill);
  assert.ok(match, 'skills/vertical-slicing/SKILL.md has no "## Anatomy of a slice" section');
  return match[1];
};

const architectItem8 = () => {
  const architect = read('agents/pilot-architect.md');
  const match = /8\.\s+\*\*Slices\*\*:([\s\S]*?)\r?\n9\./.exec(architect);
  assert.ok(match, 'agents/pilot-architect.md has no numbered item 8, "Slices"');
  return match[1];
};

test('vertical-slicing names twelve fields, Interface and Tests among them, in order', () => {
  const section = anatomySection();
  const rows = [...section.matchAll(/^\|\s*\*\*(.+?)\*\*\s*\|/gm)].map((m) => m[1]);
  assert.deepEqual(rows, ANATOMY_FIELDS, 'the anatomy table must list exactly these twelve fields, in this order');
  assert.match(section, /\*\*Interface\*\* \|[^\n]*the shapes crossing them, or a ubiquitous-language term/, 'spec 3: a shape may be named as a glossary term');
});

test('the worked slice carries a Reviewers line', () => {
  const section = anatomySection();
  const worked = /````markdown\r?\n([\s\S]*?)\r?\n````/.exec(section);
  assert.ok(worked, 'the anatomy section has no worked slice-file example fenced with four backticks');
  assert.match(worked[1], /^Reviewers: `pilot:[a-z-]+`/m, 'the worked example carries no Reviewers line');
});

test('a seam is stated once, in the slice that creates it', () => {
  const skill = read('skills/vertical-slicing/SKILL.md');
  assert.match(skill, /stated once/i, 'must say a seam is stated once');
  assert.match(skill, /S<n>'s <symbol>/, 'must name the S<n>\'s <symbol> form a later slice uses');
});

test("a slice's fields live in its own slice file", () => {
  const skill = read('skills/vertical-slicing/SKILL.md');
  assert.match(
    skill,
    /docs\/design\/<slug>\/slices\/S<n>\.md/,
    'skills/vertical-slicing/SKILL.md must name the slices/S<n>.md path',
  );
  const item8 = architectItem8();
  assert.doesNotMatch(item8, /slices\/S<n>\.md|ten fields/, 'item 8 must leave the slice-file path and field count to the skill (L3)');
  assert.match(item8, /a link to its slice file/i, 'item 8 must name the link to the slice file');
});

test('the architect caps architecture.md at 300 lines and a slice file at 60', () => {
  const architect = read('agents/pilot-architect.md').replace(/\s+/g, ' ');
  assert.match(
    architect,
    /Keep `architecture\.md` under (?:three hundred|300) lines and each slice file under (?:sixty|60)/i,
    'no single sentence caps both architecture.md at 300 lines and a slice file at 60',
  );
});

test('the architect writes no code past signatures', () => {
  const architect = read('agents/pilot-architect.md');
  const section = /## Scope discipline\r?\n([\s\S]*?)\r?\n## /.exec(architect);
  assert.ok(section, 'agents/pilot-architect.md has no "## Scope discipline" section');
  assert.match(
    section[1].replace(/\s+/g, ' '),
    /An Interface block stops at signatures: no function bodies and no pseudo-code, only declarations, types and one-line comments\./,
    'Scope discipline must stop an Interface block at signatures',
  );
});

test('nothing a sign-off needs lives only in a slice file', () => {
  const item8 = architectItem8().replace(/\s+/g, ' ');
  assert.match(
    item8,
    /\*\*L8\*\*: nothing a Gate 1 sign-off needs lives only in a slice file — the spec, the decisions, the DAG, and each slice's spec lines and files owned stay here, in `architecture\.md`\./,
    'item 8 must carry L8 in those words',
  );
});
