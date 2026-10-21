/**
 * The README is a pitch (readme-pitch): a tagline and three one-line hooks open it, the
 * install is one short paste prompt with today's commands, no prose paragraph runs long,
 * and the operator detail lives in docs/OPERATING.md, which no installing session follows.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { helpSubcommands } from './lib/help-subcommands.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8').replace(/\r\n/g, '\n');

/** The body of the section whose heading line is exactly `heading`, up to the next heading of the same or a higher level. */
function section(text, heading) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trim() === heading);
  assert.notEqual(start, -1, `${heading} is missing`);
  const level = heading.match(/^#+/)[0].length;
  const out = [];
  let fenced = false;
  for (const l of lines.slice(start + 1)) {
    if (/^\s*```/.test(l)) fenced = !fenced;
    const m = !fenced && l.match(/^(#+)\s/);
    if (m && m[1].length <= level) break;
    out.push(l);
  }
  return out.join('\n');
}

/** The prose blocks of `text`, each a list of its source lines; fences, tables, lists and headings excluded. */
function paragraphs(text) {
  const blocks = [];
  let block = [];
  let fenced = false;
  const close = () => {
    if (block.length) blocks.push(block);
    block = [];
  };
  for (const line of text.split('\n')) {
    if (/^\s*```/.test(line)) {
      close();
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    if (line.trim() === '' || /^\s*(#|\||[-*+]\s|\d+\.\s)/.test(line)) {
      close();
      continue;
    }
    block.push(line);
  }
  close();
  return blocks;
}

/**
 * The top-level items of a list whose marker is `marker` (`- ` by default), each with its
 * continuation lines joined by newlines, so an item's line count is its `split('\n').length`.
 */
function bullets(text, marker = /^- /) {
  const items = [];
  let item = null;
  for (const line of text.split('\n')) {
    if (marker.test(line)) {
      if (item) items.push(item.join('\n'));
      item = [line];
    } else if (item && line.trim() !== '' && !/^\s*(#|\||```|[-*+]\s|\d+\.\s)/.test(line)) {
      item.push(line);
    } else if (item) {
      items.push(item.join('\n'));
      item = null;
    }
  }
  if (item) items.push(item.join('\n'));
  return items;
}

test('the hooks come before any instruction', () => {
  const readme = read('README.md');
  const install = readme.indexOf('\n## Install\n');
  assert.notEqual(install, -1, '## Install is missing');
  const top = readme.slice(0, install);
  const blocks = top.split(/\n\s*\n/).map((b) => b.split('\n').filter((l) => l.trim() !== '')).filter((b) => b.length);
  assert.ok(blocks.length > 1, 'a tagline and the hooks open the README');
  assert.equal(blocks[0].length, 1, 'the tagline is one line');
  assert.doesNotMatch(blocks[0][0], /^\s*[-*]\s/, 'a tagline, not a bullet, comes first');
  const lists = blocks.filter((b) => b.some((l) => /^\s*[-*]\s/.test(l)));
  assert.equal(lists.length, 1, 'one list of hooks above ## Install');
  assert.equal(lists[0].length, 3, 'three hooks, one line each');
  for (const hook of lists[0]) assert.match(hook, /^- \S/, `a hook is a one-line bullet: ${hook}`);
  assert.doesNotMatch(top, /```/, 'nothing to run sits above Install');
});

test('the operator detail lives in OPERATING.md', () => {
  const operating = read('docs', 'OPERATING.md');
  for (const h of ['## Starting a run by hand', '## Where run branches live', '## Slow gates on Windows']) {
    assert.ok(operating.split('\n').includes(h), `docs/OPERATING.md lacks ${h}`);
  }

  const byHand = section(operating, '## Starting a run by hand');
  assert.match(byHand, /`pilot run`/);
  assert.match(byHand, /one way to start the pilot|only way/, 'plain-session L7: only `pilot run` starts it');
  assert.match(byHand, /CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP/);

  const readme = read('README.md');
  assert.doesNotMatch(readme, /CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP/, 'the wrapper detail left the README');
  assert.equal((readme.match(/\]\(docs\/OPERATING\.md\)/g) || []).length, 1, 'the README links OPERATING.md once');
  assert.doesNotMatch(readme, /Add-MpPreference/, 'no admin command in the README');
  assert.doesNotMatch(readme, /^#+ Where run branches live/m);
});

test("the install commands are today's", () => {
  const install = section(read('README.md'), '## Install');
  const prompt = install.match(/```text\n([\s\S]*?)```/);
  assert.ok(prompt, '## Install holds one ```text prompt');
  for (const command of [
    'claude plugin marketplace add HazzardRust/pilot',
    'claude plugin install pilot@pilot',
    'claude plugin list --json',
  ]) {
    assert.ok(prompt[1].includes(command), `the prompt lacks ${command}`);
  }
});

test('the installing session runs nothing there', () => {
  const install = read('docs', 'INSTALL.md');
  const step = section(install, '## 10. Report what happened');
  assert.match(step, /\]\(OPERATING\.md\)/, 'step 10 links OPERATING.md');
  assert.match(step, /run\s+nothing\s+in\s+it/i, 'and says the installing session runs none of it');
  assert.doesNotMatch(install, /in the README\./, 'INSTALL.md points at OPERATING.md, not the README');
});

test('the feature list is long and one line each', () => {
  const features = bullets(section(read('README.md'), '## Features'));
  assert.ok(features.length >= 15, `at least fifteen features, not ${features.length}`);
  assert.deepEqual(features.filter((f) => f.split('\n').length > 1), [], 'each feature is one line');
});

test("the principles read in the user's order", () => {
  const principles = section(read('README.md'), '## Principles');
  const items = bullets(principles, /^\d+\. /);
  const order = [
    ['the intent gap', /intent/i],
    ['understanding', /understand/i],
    ['LLM-centric', /token/i],
    ['memory', /memory|record/i],
    ['self-optimisation', /optimi[sz]/i],
    ['wayfinding', /wayfinds[\s\S]*answer the questions/i],
  ];
  assert.equal(items.length, order.length, 'six numbered principles');
  order.forEach(([name, pattern], i) => {
    assert.ok(items[i].startsWith(`${i + 1}. `), `principle ${i + 1} is numbered ${i + 1}`);
    assert.match(items[i], pattern, `principle ${i + 1} is ${name}`);
    assert.ok(items[i].split('\n').length <= 2, `principle ${i + 1} is one or two lines`);
  });
  const after = principles.slice(principles.indexOf(items[5]) + items[5].length);
  assert.match(after, /agnostic/i, 'a line after the six names model and harness agnosticity');
  assert.doesNotMatch(items.join('\n'), /agnostic/i, 'agnosticity is intent, not one of the six');
});

test('nothing says there is no audit', () => {
  const readme = read('README.md');
  assert.doesNotMatch(readme, /no separate audit pass/i, 'ADR 0040 made the audit; nothing denies it');
  assert.match(section(readme, '## Principles'), /`\/pilot:audit`/, 'the principles name the audit');
});

/** The relative link targets of `text`'s Markdown links, anchors dropped; web, mail and in-page links excluded. */
function links(text) {
  return [...text.matchAll(/\]\(([^)\s]+)\)/g)]
    .map((m) => m[1])
    .filter((t) => !/^(#|[a-z][a-z0-9+.-]*:)/i.test(t))
    .map((t) => t.split('#')[0]);
}

test('every relative link resolves', () => {
  const targets = links(read('README.md'));
  assert.ok(targets.length > 0, 'the README links into the tree');
  assert.deepEqual(targets.filter((t) => !fs.existsSync(path.join(ROOT, t))), [], 'a link to nothing');
  assert.deepEqual(links('[a](docs/x.md#y) [b](https://e.org) [c](#z) [d](mailto:a@b)'), ['docs/x.md']);
});

// A command is one in code (`pilot x`) or a bash fence line; prose "the pilot plans" is not. A
// `pilot:<agent>` is an agent type, `/pilot:<skill>` a skill.
test('every command and agent named exists', () => {
  const readme = read('README.md');
  const known = new Set(helpSubcommands());
  const bash = [...readme.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1]).join('\n');
  const commands = [
    ...[...readme.matchAll(/`pilot ([a-z][a-z0-9-]*)/g)].map((m) => m[1]),
    ...[...bash.matchAll(/^pilot ([a-z][a-z0-9-]*)/gm)].map((m) => m[1]),
  ];
  assert.ok(commands.includes('run'), 'the README names `pilot run`');
  assert.deepEqual([...new Set(commands)].filter((c) => !known.has(c)), [], 'a command `pilot help` does not list');
  const agents = [...readme.matchAll(/(?<![/\w])pilot:([a-z][a-z0-9-]*)/g)].map((m) => m[1]);
  assert.ok(agents.length > 0, 'the README names agents');
  assert.deepEqual([...new Set(agents)].filter((a) => !fs.existsSync(path.join(ROOT, 'agents', `${a}.md`))), [], 'an agent with no file');
  const sec = section(readme, '## How it fits together');
  assert.match(sec, /`pilot:pilot-[a-z-]+`/, 'the walkthrough names its agents in code');
});
