// The README's `## How it fits together` graph (readme-flow S1, readme-graph-deck S1): every agent file
// and every deck thread you meet is a node, no subcommand is, and every edge says what flows, so the
// picture cannot fall out of date without a red test. It reads names and labels, never positions or node ids.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { helpSubcommands } from './lib/help-subcommands.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const ARROW = String.raw`(?:-->|-\.->|==>|---)`;
const NODE = /(\w+)\s*[[({]+\s*"([^"]*)"/g;
const EDGE = new RegExp(
  String.raw`^\s*(\w+)\b[^-=.]*?\s*(?:(?:--|-\.|==)\s*"([^"]*)"\s*)?${ARROW}\s*(?:\|\s*"?([^"|]*)"?\s*\|)?\s*(\w+)`,
);

// The text under '## How it fits together', up to the next heading.
const section = (readme) => readme.split(/^## How it fits together\s*$/m)[1]?.split(/^## /m)[0] ?? '';

// Parses the first mermaid fence under '## How it fits together' into node labels and labelled edges
// between them; throws if the section has no such fence.
function readFlow(readme) {
  // The `---` front matter, which sets the diagram's wrapping width, is config, not an edge.
  const fence = /^```mermaid\s*\n(?:---\r?\n[\s\S]*?\r?\n---\r?\n)?([\s\S]*?)^```/m.exec(section(readme))?.[1];
  if (fence === undefined) throw new Error('no mermaid fence under "## How it fits together"');
  const labels = new Map();
  // A subgraph title is not a node.
  for (const [, id, label] of fence.replace(/^\s*subgraph.*$/gm, '').matchAll(NODE)) labels.set(id, label.replace(/`/g, '').trim());
  const name = (id) => labels.get(id) ?? id;
  const edges = [];
  for (const line of fence.split('\n')) {
    const bare = line.replace(NODE, '$1');
    const m = EDGE.exec(bare);
    if (!m) {
      if (new RegExp(ARROW).test(bare.replace(/\|[^|]*\|/g, ''))) throw new Error(`cannot parse edge: ${line.trim()}`);
      continue;
    }
    if (new RegExp(ARROW).test(bare.slice(m.index + m[0].length))) throw new Error(`more than one arrow on a line: ${line.trim()}`);
    edges.push({ from: name(m[1]), to: name(m[4]), label: (m[2] ?? m[3] ?? '').trim() });
  }
  return { nodes: [...labels.values()], edges };
}

// The numbered steps between the section's paragraph and its mermaid fence (readme-pitch S3, spec 5),
// each a whole line.
function walkthrough(readme) {
  const above = section(readme.replace(/\r\n/g, '\n')).split(/^```mermaid/m)[0];
  return above.split('\n').filter((l) => /^\d+\. /.test(l));
}

const AGENT_FILES = fs.readdirSync(path.join(ROOT, 'agents')).filter((f) => f.endsWith('.md'));
const flow = () => readFlow(read('README.md'));
// A label's words: agent types (`pilot:pilot-qa`) and command words, split on anything else.
const words = (label) => label.split(/[^\w:/-]+/).filter(Boolean);

test('every agent file is a node', () => {
  const { nodes } = flow();
  const drawn = new Set(nodes.flatMap(words));
  const agents = AGENT_FILES.map((f) => `pilot:${f.slice(0, -3)}`);
  assert.ok(agents.length > 0);
  assert.deepEqual(agents.filter((a) => !drawn.has(a)), []);
});

// No subcommand `pilot help` lists, moving or not (L1), is drawn: a user meets the deck, never the CLI.
test('no subcommand is in the graph', () => {
  const { nodes, edges } = flow();
  const texts = [...nodes, ...edges.map((e) => e.label)];
  const drawn = (sub) => texts.some((t) => new RegExp(String.raw`\bpilot ${sub}(?![\w-])`).test(t));
  assert.deepEqual(helpSubcommands().filter(drawn), []);
});

// The deck threads a run puts in front of you (spec 2, L5), each ending some node label's head.
const THREADS = ['a question', 'Gate 1', 'the ticket', 'the walkthrough', 'Gate 2', 'the closing report', 'a lesson', 'the audit'];

test('every thread you meet is a node', () => {
  const heads = flow().nodes.map((n) => n.split(': ')[0].toLowerCase());
  assert.deepEqual(THREADS.filter((t) => !heads.some((h) => h.endsWith(t.toLowerCase()))), []);
});

test('every edge is labelled', () => {
  const { edges } = flow();
  assert.ok(edges.length > 0);
  assert.deepEqual(edges.filter((e) => e.label === ''), []);
});

test('a fence is required', () => {
  assert.throws(() => readFlow('# x\n\n## How it fits together\n\nNo graph.\n\n## Next\n\n```mermaid\nflowchart LR\n```\n'));
  assert.throws(() => readFlow('# x\n\n```mermaid\nflowchart LR\n```\n'));
  const fenced = (body) => `## How it fits together

\`\`\`mermaid
flowchart LR
${body}
\`\`\`
`;
  assert.throws(() => readFlow(fenced('  a["A"] -->|"x"| b["B"] -->|"y"| c["C"]')), /more than one arrow/);
  assert.throws(() => readFlow(fenced('  a["A"] --> ')), /cannot parse/);
  // The parser itself: an unlabelled edge is read as one, with an empty label.
  const { nodes, edges } = readFlow('## How it fits together\n\n```mermaid\nflowchart LR\n  a["A"] -->|"x"| b["B"]\n  b --> a\n```\n');
  assert.deepEqual(nodes, ['A', 'B']);
  assert.deepEqual(edges, [{ from: 'A', to: 'B', label: 'x' }, { from: 'B', to: 'A', label: '' }]);
});

// The first question of every run and the grilling it opens (L10, the user on itm_db56dcd975f5).
const DEPTH = 'the first question of every run: how deep to be grilled';
const GRILLING = 'the grilling: the pilot interviews you, one question per decision, each with a recommended answer';
const REPORT = 'the closing report: what was built, and any step left to you';

// Run order (L7, L10, spec 3): counted in edges from you, the depth question before the grilling, each gate
// before what it lets through, and the closing report last.
test('the graph runs in run order, Gate 2 before the PR before the closing report', () => {
  const { edges } = flow();
  const depth = new Map([['you', 0]]);
  for (const queue = ['you']; queue.length;) {
    const at = queue.shift();
    for (const e of edges) if (e.from === at && !depth.has(e.to)) depth.set(e.to, depth.get(at) + 1), queue.push(e.to);
  }
  const at = (label) => {
    assert.ok(depth.has(label), `"${label}" is reached from you`);
    return depth.get(label);
  };
  assert.ok(at('pilot:pilot') < at(DEPTH));
  assert.ok(at(DEPTH) < at(GRILLING));
  assert.ok(at(GRILLING) < at('Gate 1: you sign the plan'));
  assert.ok(at('Gate 1: you sign the plan') < at('pilot:pilot-co-pilot'));
  assert.ok(at('Gate 2: you sign off the finished feature') < at('the feature, landed on the pilot branch'));
  assert.ok(at('the feature, landed on the pilot branch') < at(REPORT));
});

// The three answers to the depth question, in plain words, each on an edge out of it (L10).
test('the depth question offers every decision, only the forks, or no grilling', () => {
  const out = flow().edges.filter((e) => e.from === DEPTH).map((e) => e.label);
  for (const answer of [/every decision/, /only the forks/, /no grilling/]) {
    assert.ok(out.some((label) => answer.test(label)), `an edge out of the depth question says ${answer}`);
  }
});

// No deck (L8, the user on itm_db56dcd975f5): the graph is the flow alone; the paragraph names the deck.
test('no node is the deck', () => {
  assert.deepEqual(flow().nodes.filter((n) => n.toLowerCase().includes('the deck')), []);
});

test('the paragraph says what is general', () => {
  const prose = section(read('README.md')).replace(/^```mermaid[\s\S]*?^```/m, '');
  assert.notEqual(prose.trim(), '');
  for (const phrase of [/any\s+repository/, /any\s+stack/, /the\s+same\s+agents/, /the\s+same\s+deck/]) {
    assert.match(prose, phrase);
  }
});

// The average run, in at most eleven lines directly above the graph it walks (readme-pitch S3, A4).
test('the walkthrough is short and above the graph', () => {
  const readme = read('README.md').replace(/\r\n/g, '\n');
  const steps = walkthrough(readme);
  assert.ok(steps.length >= 1 && steps.length <= 11, `1 to 11 steps, not ${steps.length}`);
  steps.forEach((s, i) => assert.ok(s.startsWith(`${i + 1}. `), `step ${i + 1} is numbered ${i + 1}: ${s}`));
  const sec = section(readme);
  const tail = sec.slice(sec.indexOf(steps.at(-1)) + steps.at(-1).length);
  assert.match(tail, /^\s*```mermaid/, 'the fence follows the last step directly');
  const block = sec.slice(sec.indexOf(steps[0]), sec.indexOf(steps.at(-1)) + steps.at(-1).length);
  assert.equal(block.split('\n').length, steps.length, 'each step is one line, with nothing between them');
});

// A step names a node in bold or code: its whole label, or the label's head before ': '.
test('every step is a node', () => {
  const readme = read('README.md');
  const heads = new Set(flow().nodes.flatMap((n) => [n, n.split(': ')[0]]).map((n) => n.toLowerCase()));
  const steps = walkthrough(readme);
  assert.ok(steps.length > 0, 'there is a walkthrough');
  const named = (s) => [...s.matchAll(/\*\*([^*]+)\*\*|`([^`]+)`/g)].some((m) => heads.has((m[1] ?? m[2]).toLowerCase()));
  assert.deepEqual(steps.filter((s) => !named(s)), [], 'each step names a node of the graph');
});

test('the contents list names the heading', () => {
  const readme = read('README.md');
  const intro = readme.split(/^## /m)[0];
  const headings = [...readme.matchAll(/^## (.+?)\s*$/gm)].map((m) => m[1]);
  assert.ok(headings.includes('How it fits together'));
  const slug = (h) => h.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s/g, '-');
  assert.deepEqual(headings.filter((h) => !intro.includes(`](#${slug(h)})`)), []);
  const anchors = headings.map(slug);
  assert.deepEqual([...intro.matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1]).filter((a) => !anchors.includes(a)), []);
});
