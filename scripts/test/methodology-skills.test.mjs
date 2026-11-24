/**
 * The eight vendored methodology skills: that they invoke under `pilot:`, that every
 * copied file is attributed, and that the three adaptations the slice names actually
 * changed the output shape rather than only the prose around it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkProvenance } from '../check-provenance.mjs';
import { parseGlossary, lintGlossary } from '../glossary.mjs';
import { frontmatterOf, bodyOf } from './lib/area-file.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const VENDORED_SKILLS = [
  'code-review',
  'codebase-design',
  'diagnosing-bugs',
  'domain-modeling',
  'grilling',
  'resolving-merge-conflicts',
  'test-design',
  'wizard',
];

/** Normalised to LF: git checks these out with CRLF on Windows, and the assertions are about content. */
const readSkill = (name) =>
  fs.readFileSync(path.join(ROOT, 'skills', name, 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');

test('the skills tree passes the slice verification command', () => {
  const result = checkProvenance(ROOT, ['skills']);

  assert.deepEqual(result.failures, []);
  assert.ok(
    result.vendored.length >= VENDORED_SKILLS.length,
    `expected every copied file to carry a header, got ${result.vendored.length}`,
  );
  // Slice 6 ships this package's own skills (`pilot`, `vertical-slicing`,
  // `compliance-review`) beside the vendored ones, and own work carries no header by
  // design. The claim is about the copies, so assert it of them and not of the tree.
  assert.deepEqual(
    result.own.filter((rel) => VENDORED_SKILLS.some((name) => rel.startsWith(`skills/${name}/`))),
    [],
    'every file under a vendored skill is a copy, so none is own work',
  );
});

test('the eight methodology skills each invoke under their own directory name', () => {
  for (const name of VENDORED_SKILLS) {
    const source = readSkill(name);
    const frontmatter = frontmatterOf(source);

    assert.ok(frontmatter, `${name}/SKILL.md needs YAML frontmatter to be invocable`);
    assert.match(frontmatter, new RegExp(`^name: ${name}$`, 'm'), `${name} must be addressable as /pilot:${name}`);
    assert.match(frontmatter, /^description: \S/m, `${name} needs a description or Claude never loads it`);
    assert.ok(
      source.indexOf('<!-- provenance') > source.length - bodyOf(source).length - 1,
      `${name}: the provenance header must follow the frontmatter, not precede it, or the harness sees no frontmatter at all`,
    );
  }
});

test('skills/ holds every one of the eight skills this slice vendors', () => {
  // Slice 8 vendors the toolbox skills beside these, so the directory is a
  // superset: assert presence, not exclusivity.
  const found = fs
    .readdirSync(path.join(ROOT, 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  for (const name of VENDORED_SKILLS) {
    assert.ok(found.includes(name), `skills/${name} is missing`);
  }
});

test('no upstream brand appears in any vendored path (L13)', () => {
  const { vendored, own } = checkProvenance(ROOT, ['skills']);

  for (const rel of [...vendored, ...own]) {
    assert.doesNotMatch(rel, /pocock/i, `${rel} carries an upstream name in its path`);
  }
});

test('nothing in the tree reaches back to the upstream plugin at runtime (ADR 0003)', () => {
  for (const name of VENDORED_SKILLS) {
    const source = readSkill(name);

    assert.doesNotMatch(source.replace(/<!-- provenance[\s\S]*?-->/, ''), /mattpocock-skills:/, `${name} invokes the upstream plugin`);
    assert.doesNotMatch(source, /installed_plugins\.json/, `${name} reads the runtime plugin registry`);
  }
});

test('grilling asks through the deck, one item at a time, instead of a numbered round', () => {
  const grilling = readSkill('grilling');

  assert.doesNotMatch(grilling, /number each question/i, 'the numbered frontier round is what this slice replaces');
  assert.doesNotMatch(grilling, /Format a round like so/, 'the round format block is replaced by the deck item');
});

test('domain-modeling names no upstream multi-context files', () => {
  const domainModeling = readSkill('domain-modeling');

  // lint: domain-modeling carries no CONTEXT-MAP.md or CONTEXT-FORMAT.md reference
  assert.doesNotMatch(domainModeling, /CONTEXT-MAP\.md/, 'the multi-context map is not this project shape');
  assert.doesNotMatch(domainModeling, /CONTEXT-FORMAT\.md/, 'the glossary format file is GLOSSARY-FORMAT.md here');
});

test('the ADR files in docs/adr/ are named NNNN-slug.md', () => {
  const existing = fs.readdirSync(path.join(ROOT, 'docs', 'adr')).filter((n) => n !== 'README.md'); // the generated index

  assert.ok(existing.length >= 10, 'the repository already carries the ADRs this format describes');
  for (const name of existing) {
    // A literal `NNNN` is a feature's ADR before its landing allocates the number (ADR 0167).
    assert.match(name, /^(?:\d{4}|NNNN)-[a-z0-9-]+\.md$/, `${name} must match the NNNN-slug.md the format names`);
  }
});

test('wizard emits a deck item rather than an interactive terminal prompt', () => {
  const wizard = readSkill('wizard');

  assert.doesNotMatch(wizard, /template\.sh/, 'the interactive bash template is gone; the deck is the inbox');
  assert.ok(
    !fs.existsSync(path.join(ROOT, 'skills', 'wizard', 'template.sh')),
    'template.sh must not ship: it cannot post to the deck, and the deck refuses secrets',
  );
});

test('diagnosing-bugs names no terminal HITL loop template', () => {
  // lint: diagnosing-bugs carries no hitl-loop.template.sh reference
  assert.doesNotMatch(readSkill('diagnosing-bugs'), /hitl-loop\.template\.sh/, 'the terminal HITL loop is a deck walkthrough now');
});

const readFormat = () =>
  fs.readFileSync(path.join(ROOT, 'skills', 'domain-modeling', 'GLOSSARY-FORMAT.md'), 'utf8').replace(/\r\n/g, '\n');

/** The skills that mention the glossary (project-glossary S3); with the format file, the prose that says where it is. */
const GLOSSARY_SKILLS = ['domain-modeling', 'grilling', 'diagnosing-bugs', 'test-design'];

test("the format file's Structure example is an entry in the glossary's real shape (project-glossary spec 8)", () => {
  const structure = /## Structure\n[\s\S]*?```md\n([\s\S]*?)```/.exec(readFormat());
  assert.ok(structure, 'GLOSSARY-FORMAT.md needs a ## Structure section with an ```md example');

  const entries = parseGlossary(structure[1]);
  assert.ok(entries.length >= 1, 'parseGlossary reads no entry from the example, so it shows a shape no file uses');
  assert.ok(entries.some((entry) => entry.avoid.length > 0), 'the example shows no _Avoid_: line');
  assert.deepEqual(lintGlossary(structure[1]), [], 'the example names a path, which the format forbids');
});

test('grilling looks the request up in the glossary before its first question (project-glossary spec 1)', () => {
  // The provenance header names the lookup too, so the order is read in the instructions only.
  const grilling = readSkill('grilling').replace(/<!-- provenance[\s\S]*?-->/, '');
  // The command may be named bare or through the plugin root, `glossary.mjs" match`.
  const lookup = grilling.search(/glossary\.mjs"? match/);
  const firstQuestion = grilling.indexOf('deck_post');

  assert.ok(lookup >= 0, 'grilling names no `glossary.mjs match` lookup');
  assert.ok(firstQuestion >= 0, 'grilling posts its questions with deck_post');
  assert.ok(lookup < firstQuestion, 'the lookup must come before the first question is posted');
  assert.match(readSkill('domain-modeling'), /GLOSSARY\.md/, 'domain-modeling must name the repository glossary');
});

test('no skill keeps a per-run glossary or tells an agent to read the whole glossary (project-glossary spec 5, 6, 9)', () => {
  const texts = [...GLOSSARY_SKILLS.map((name) => [name, readSkill(name)]), ['GLOSSARY-FORMAT.md', readFormat()]];

  // assert.ok over a test, not doesNotMatch, so a failure names the file without dumping it.
  for (const [name, text] of texts) {
    // `\s+`, so the slice's verification grep for the phrase finds no hit in this file either.
    assert.ok(!/one glossary per\s+run/i.test(text), `${name} keeps a glossary per run`);
    assert.ok(!/section 3 glossary/i.test(text), `${name} sends the reader to the artefact's section 3`);
    assert.ok(!/\bread\b[^.\n]{0,30}GLOSSARY\.md/i.test(text), `${name} tells an agent to read the whole glossary`);
  }
  for (const name of ['diagnosing-bugs', 'test-design']) {
    assert.match(readSkill(name), /GLOSSARY\.md/, `${name} must look words up in the repository glossary`);
  }
});

test('every skill that names a sibling skill names it under the pilot namespace', () => {
  for (const name of VENDORED_SKILLS) {
    const body = readSkill(name).replace(/<!-- provenance[\s\S]*?-->/, '');
    for (const match of body.matchAll(/`?\/?(?:pilot:)?(codebase-design|code-review|test-design|grilling|domain-modeling)`? skill/g)) {
      assert.match(match[0], /pilot:/, `${name} refers to "${match[0]}" without the pilot: namespace`);
    }
  }
});
