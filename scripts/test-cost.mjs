/**
 * What each test file costs (cheap-suite S1; spec 1, L2, L4). `costReporter` is a `node --test` reporter
 * `gate --cost` adds beside the shown one: one JSON line `{ file, ms, pass }` per top-level test, the file
 * repo-relative (the gate runs the suite from the checkout). `costTable` joins those lines with
 * `spawnCount`'s owners into the table the gate prints after its spawn line. A file's seconds are its
 * top-level tests' summed durations, so its module-load time is not in them: read them as a lower bound.
 */

import path from 'node:path';

export default costReporter;

export async function* costReporter(source) {
  for await (const { type, data } of source) {
    if ((type !== 'test:pass' && type !== 'test:fail') || data.nesting !== 0 || !data.file) continue;
    const file = path.relative(process.cwd(), data.file).replaceAll('\\', '/');
    yield `${JSON.stringify({ file, ms: data.details?.duration_ms ?? 0, pass: type === 'test:pass' })}\n`;
  }
}

const seconds = (ms) => (ms / 1000).toFixed(1);

/**
 * The cost table: a header, one row per file slowest first by summed ms (then most spawns, then name),
 * every file a row (spec 1), and last `total <files> files <s> s <spawns> spawns (git <g>)`. A file is any
 * file in `lines` or any owner, the runner's own `-` included so the total matches the spawn line; a file with
 * spawns and no reported test is a row of 0 s.
 */
export function costTable(lines, owners) {
  const files = new Map();
  const row = (file) => {
    if (!files.has(file)) files.set(file, { file, ms: 0, tests: 0, total: 0, node: 0, git: 0, other: 0 });
    return files.get(file);
  };
  for (const text of lines) {
    if (!text.trim()) continue;
    const { file, ms } = JSON.parse(text);
    const entry = row(file);
    entry.ms += ms;
    entry.tests++;
  }
  for (const [owner, kinds] of owners) {
    Object.assign(row(owner), { total: kinds.total, node: kinds.node, git: kinds.git, other: kinds.other });
  }
  const ranked = [...files.values()].sort((a, b) => b.ms - a.ms || b.total - a.total || (a.file < b.file ? -1 : 1));
  const sum = (list, key) => list.reduce((n, entry) => n + entry[key], 0);
  const cells = [['file', 's', 'tests', 'spawns', 'git', 'node', 'other'], ...ranked.map((e) => [e.file, seconds(e.ms), e.tests, e.total, e.git, e.node, e.other].map(String))];
  const widths = cells[0].map((_, i) => Math.max(...cells.map((cell) => cell[i].length)));
  const out = cells.map((cell) => cell.map((text, i) => (i === 0 ? text.padEnd(widths[i]) : text.padStart(widths[i]))).join('  ').trimEnd());
  // The git count is built apart: `spawns (` reads as a spawn call to hidden-spawns.test.mjs.
  const git = `(git ${sum(ranked, 'git')})`;
  out.push(`total ${ranked.length} files ${seconds(sum(ranked, 'ms'))} s ${sum(ranked, 'total')} spawns ${git}`);
  return `${out.join('\n')}\n`;
}
