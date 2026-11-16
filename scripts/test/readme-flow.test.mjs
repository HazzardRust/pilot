// The README's `## How it fits together` graph (readme-flow S1, readme-graph-deck S1): no
// subcommand is a node, and every edge says what flows, so the
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

const flow = () => readFlow(read('README.md'));
// No subcommand `pilot help` lists, moving or not (L1), is drawn: a user meets the deck, never the CLI.
// lint: no pilot subcommand is drawn in the graph
test('no subcommand is in the graph', () => {
  const { nodes, edges } = flow();
  const texts = [...nodes, ...edges.map((e) => e.label)];
  const drawn = (sub) => texts.some((t) => new RegExp(String.raw`\bpilot ${sub}(?![\w-])`).test(t));
  assert.deepEqual(helpSubcommands().filter(drawn), []);
});

// lint: every edge carries a label
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

// No deck (L8, the user on itm_db56dcd975f5): the graph is the flow alone; the paragraph names the deck.
// lint: no node label names the deck
test('no node is the deck', () => {
  assert.deepEqual(flow().nodes.filter((n) => n.toLowerCase().includes('the deck')), []);
});

// The average run, in at most eleven lines directly above the graph it walks (readme-pitch S3, A4).
// lint: 1 to 11 numbered one-line steps sit directly above the fence
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
// lint: every walkthrough step names a node of the graph
test('every step is a node', () => {
  const readme = read('README.md');
  const heads = new Set(flow().nodes.flatMap((n) => [n, n.split(': ')[0]]).map((n) => n.toLowerCase()));
  const steps = walkthrough(readme);
  assert.ok(steps.length > 0, 'there is a walkthrough');
  const named = (s) => [...s.matchAll(/\*\*([^*]+)\*\*|`([^`]+)`/g)].some((m) => heads.has((m[1] ?? m[2]).toLowerCase()));
  assert.deepEqual(steps.filter((s) => !named(s)), [], 'each step names a node of the graph');
});

// lint: every ## heading is in the contents list and every contents anchor resolves
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
