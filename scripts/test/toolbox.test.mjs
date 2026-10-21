/**
 * Slice 8 vendors ECC's toolbox: ten agents, six skills and the 22-language rules tree.
 * The provenance checker already proves each file's credit survives (ADR 0011); these
 * tests prove the other half of the vendoring — that what landed is addressable as
 * `pilot:`, points only at components this package actually ships, and still fits the
 * implementer's loop. A toolbox that quietly keeps an `ecc:` reference works on this
 * machine, where ECC is installed, and fails on the friend's, where it is not.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkProvenance, parseHeader } from '../check-provenance.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const AGENTS = [
  'security-reviewer',
  'typescript-reviewer',
  'react-reviewer',
  'python-reviewer',
  'database-reviewer',
  'silent-failure-hunter',
  'build-error-resolver',
  'react-build-resolver',
  'code-explorer',
  'docs-lookup',
];

const SKILLS = [
  'tdd-workflow',
  'verification-loop',
  'iterative-retrieval',
  'browser-qa',
  'context-budget',
  'architecture-decision-records',
];

/** The upstream this slice vendored from; a partial re-sync must move every header at once. */
const UPSTREAM = 'ECC 2.2.0 - ';

/** The longest a skill may be and still be worth preloading into every implementer. */
const SKILL_LINE_BUDGET = 200;

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/**
 * The body without its provenance header. The header is required to name the upstream
 * (L13 makes it the only in-tree trace of origin), so reading it as a reference the
 * package makes would fail every file for carrying the credit it was told to carry.
 */
const body = (source) => source.replace(/<!--\s*provenance[\s\S]*?-->/, '');

const toolboxFiles = () => [
  ...AGENTS.map((name) => `agents/${name}.md`),
  ...SKILLS.map((name) => `skills/${name}/SKILL.md`),
];

/** Components named in a copied file that this package does not ship (A7). */
const NOT_SHIPPED = [
  // Agents dropped rather than vendored
  /\bhealthcare-reviewer\b/,
  /\bcode-reviewer\b/,
  /\brefactor-cleaner\b/,
  /\btdd-guide\b/,
  /\btypescript-build-resolver\b/,
  // MCP server this package does not declare (L7: only `deck` and `chrome-devtools`)
  /\bcontext7\b/i,
  // Skills dropped rather than vendored
  /\bcontinuous-learning\b/,
  /\bcanary-watch\b/,
  /\bsecurity-review\b/,
  /\bpython-patterns\b/,
  /\bpostgres-patterns\b/,
  /\bdatabase-migrations\b/,
  /\breact-patterns\b/,
  /\breact-testing\b/,
  /\bcoding-standards\b/,
  /\bfrontend-patterns\b/,
  /\bbackend-patterns\b/,
  // Commands this package does not register
  /\borch-refine-code\b/,
  /\/react-review\b/,
  /\/react-build\b/,
  /\/react-test\b/,
  /\/verify\b/,
];

test('the toolbox is all ten agents and all six skills', () => {
  for (const rel of toolboxFiles()) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `${rel} is missing from the toolbox`);
  }
});

test('every vendored toolbox file carries a header and a ledger row', () => {
  const { ok, failures, vendored } = checkProvenance(ROOT, ['agents', 'skills', 'rules']);
  assert.deepEqual(failures, [], 'provenance problems in the vendored toolbox');
  assert.ok(ok);
  assert.ok(vendored.length > AGENTS.length + SKILLS.length, 'the rules tree did not land');
});

test('every agent and skill opens with its frontmatter, then the header', () => {
  for (const rel of toolboxFiles()) {
    const source = read(rel);
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(source);
    assert.ok(frontmatter, `${rel} needs YAML frontmatter to be invocable`);

    const name =
      path.basename(rel) === 'SKILL.md' ? path.basename(path.dirname(rel)) : path.basename(rel, '.md');
    assert.match(frontmatter[1], new RegExp(`^name: ${name}$`, 'm'), `${rel} must be addressable as pilot:${name}`);
    assert.match(frontmatter[1], /^description: \S/m, `${rel} needs a description or Claude never loads it`);
    assert.ok(
      source.indexOf('<!-- provenance') > frontmatter[0].length - 1,
      `${rel}: the header must follow the frontmatter, not precede it, or the harness sees no frontmatter at all`,
    );
  }
});

test('a rules file with frontmatter carries the header below it, not above', () => {
  const { vendored } = checkProvenance(ROOT, ['rules']);
  let withFrontmatter = 0;
  for (const rel of vendored) {
    const source = read(rel);
    const frontmatter = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(source);
    if (!frontmatter) {
      assert.ok(source.startsWith('<!-- provenance'), `${rel} has no frontmatter, so the header comes first`);
      continue;
    }
    withFrontmatter += 1;
    assert.ok(
      source.indexOf('<!-- provenance') > frontmatter[0].length - 1,
      `${rel}: the header must follow the frontmatter, not precede it`,
    );
  }
  assert.ok(withFrontmatter > 0, 'no rules file has frontmatter; the placement rule would be untested');
});

test('no agent or skill addresses a namespace this package does not ship', () => {
  for (const rel of toolboxFiles()) {
    const source = body(read(rel));
    assert.doesNotMatch(source, /\becc:/i, `${rel} still addresses the upstream namespace`);
    assert.doesNotMatch(source, /mattpocock/i, `${rel} still addresses the upstream namespace`);
    assert.doesNotMatch(source, /installed_plugins\.json/, `${rel} reads the harness's plugin list`);
  }
});

test('no agent or skill points at a component this package does not ship', () => {
  for (const rel of toolboxFiles()) {
    const source = body(read(rel));
    for (const pattern of NOT_SHIPPED) {
      assert.doesNotMatch(source, pattern, `${rel} points at ${pattern.source}, which is not vendored`);
    }
  }
});

test('the test-first skill was trimmed to what an implementer preloads', () => {
  const source = read('skills/tdd-workflow/SKILL.md');
  const lines = source.split('\n').length;
  assert.ok(
    lines < SKILL_LINE_BUDGET,
    `skills/tdd-workflow/SKILL.md is ${lines} lines; the budget is ${SKILL_LINE_BUDGET}`,
  );
  assert.match(source, /red/i);
  assert.match(source, /green/i);
  assert.doesNotMatch(body(source), /80%/, 'the coverage bar belongs to the phase gate, not this skill');
});

test('browser-qa drives the one browser MCP this package declares', () => {
  const { mcpServers } = JSON.parse(read('.mcp.json'));
  assert.ok(mcpServers['chrome-devtools'], '.mcp.json no longer declares chrome-devtools');

  const source = body(read('skills/browser-qa/SKILL.md'));
  assert.match(source, /mcp__plugin_pilot_chrome-devtools__/);
  assert.doesNotMatch(source, /browserbase/i, 'browser-qa still offers an MCP this package does not declare');
  assert.doesNotMatch(source, /claude-in-chrome/i, 'browser-qa still offers an MCP this package does not declare');
});

test('every toolbox header names one upstream version, so a re-sync moves them together', () => {
  // skills/ also holds the methodology skills and the taste pass, which keep their
  // own ledgers; only this slice's files are held to the toolbox upstream.
  const { vendored } = checkProvenance(ROOT, ['agents', 'skills', 'rules']);
  const toolbox = vendored.filter((rel) => !['vendor/methodology.md', 'vendor/taste.md'].includes(parseHeader(read(rel)).ledger));
  assert.notEqual(toolbox.length, 0);
  for (const rel of toolbox) {
    const header = parseHeader(read(rel));
    assert.equal(header.ledger, 'vendor/toolbox.md', `${rel} names the wrong ledger`);
    assert.ok(header.upstream.startsWith(UPSTREAM), `${rel} names upstream ${header.upstream}`);
  }
});

test('the rules tree is a copy, edited only by the S10 dead-line cut', () => {
  const { vendored } = checkProvenance(ROOT, ['rules']);
  assert.ok(vendored.length >= 100, `only ${vendored.length} rules files landed`);
  const allowed = /^(verbatim|(dead common\/ link( and unshipped skill pointers)? removed|unshipped skill pointers removed)(; deduped against typescript\/react\/web; generic advice removed)?(; the \*\*\/hooks\/\*\* path globs dropped \(they matched this repository's Claude Code hooks\/ scripts, audit F9\))?)$/;
  for (const rel of vendored) {
    assert.match(parseHeader(read(rel)).adapted, allowed, `${rel} was edited while being copied`);
  }
});

/**
 * The package says its own version in four places, and a bump that misses one
 * is not hypothetical: 0.3.0 went out with the deck's MCP server still
 * announcing 0.2.0, and needed a second commit (334d96e) to catch it up. The
 * updater compares version strings, so a stale one there is a session told it
 * is current when it is not.
 */
test('every place this package states its own version says the same thing', () => {
  const json = (rel) => JSON.parse(read(rel));
  const stated = {
    'package.json': json('package.json').version,
    '.claude-plugin/plugin.json': json('.claude-plugin/plugin.json').version,
    'package-lock.json (root)': json('package-lock.json').version,
    'package-lock.json (self)': json('package-lock.json').packages[''].version,
  };

  const one = stated['package.json'];
  assert.match(one, /^\d+\.\d+\.\d+$/, 'package.json states a version at all');
  for (const [where, said] of Object.entries(stated)) {
    assert.equal(said, one, `${where} says ${said}, and package.json says ${one}`);
  }
});
