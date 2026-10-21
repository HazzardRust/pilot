/** S1 of run-analytics: `pilot analytics <slug>` prints the agent table (spec 1, 2, 7, 8). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { main } from '../analytics.mjs';
import { readRun } from '../transcripts.mjs';
import { ROOT, analytics, blocks, tables } from './analytics-run.mjs';

/** The widest a table line may be (itm_96731cecb9ef). */
const MAX_WIDTH = 120;

test('pilot analytics prints one row per agent and a pilot row', (t) => {
  const { code, stdout } = analytics(t, ['demo']);

  assert.equal(code, 0);
  const [identity, figures] = blocks(stdout);
  assert.deepEqual(identity[0], ['Agent', 'Slice', 'Role', 'Description', 'Model']);
  assert.deepEqual(figures[0], ['Agent', 'Input', 'Cache write', 'Cache read', 'Output', 'Tool calls', 'Duration', 'Cost']);
  assert.deepEqual(figures.map((row) => row[0]), identity.map((row) => row[0]));
  const [body] = tables(stdout);
  assert.equal(body.length, 3);
  assert.deepEqual(body[0], ['pilot', '–', 'pilot', '–', 'claude-fable-5-1', '11', '300', '1,000', '34', '2', '10m 10s', '$0.01']);
  assert.deepEqual(body[1], ['a1', '–', 'pilot-implementer', 'S1 implementer', 'claude-opus-5-5', '5', '0', '1,100', '16', '2', '1m 40s', '$0.00']);
  assert.deepEqual(body[2], ['a2', '–', 'typescript-reviewer', 'Review S1', 'claude-sonnet-5', '10', '300', '1,000', '40', '1', '30s', '$0.00']);
  assert.match(stdout, /skipped 1 line/);
  assert.equal(stdout.includes('PLANTED-9Q7X-SECRET'), false);
});

test('every line of a table is padded to one length, so the columns line up in a terminal', (t) => {
  for (const slug of ['demo', 'buckets', 'unrecorded']) {
    const blocks = analytics(t, [slug]).stdout.split('\n\n').filter((block) => block.startsWith('|'));
    assert.ok(blocks.length > 0, slug);
    for (const lines of blocks.map((block) => block.split('\n'))) {
      assert.equal(new Set(lines.map((line) => line.length)).size, 1, `${slug}:\n${lines.join('\n')}`);
      assert.ok(lines[0].length <= MAX_WIDTH, `${slug}: ${lines[0].length} columns`);
    }
  }
});

test('pilot analytics without a slug, or for a run with no session, exits 1', (t) => {
  assert.equal(analytics(t, []).code, 1);
  const none = analytics(t, ['nothing-here']);
  assert.equal(none.code, 1);
  assert.match(none.stderr, /nothing-here/);
  assert.equal(none.stdout, '');
});

test('a slug that is not a run slug is refused before any path is built', (t) => {
  for (const slug of ['../demo', 'Demo', 'demo/..']) {
    const { code, stdout, stderr } = analytics(t, [slug]);
    assert.equal(code, 1, slug);
    assert.equal(stderr, 'usage: pilot analytics <slug>\n', slug);
    assert.equal(stdout, '');
  }
});

test('any argument after the slug is refused with the usage, never ignored', (t) => {
  for (const argv of [['demo', '--repo', '/tmp'], ['demo', 'extra']]) {
    const { code, stdout, stderr } = analytics(t, argv);
    assert.equal(code, 1, argv.join(' '));
    assert.equal(stderr, 'usage: pilot analytics <slug>\n', argv.join(' '));
    assert.equal(stdout, '');
  }
});

test('outside any git repository the transcripts read are the cwd\'s own', (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-no-git-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const out = { stderr: '' };
  t.mock.method(process.stderr, 'write', (chunk) => { out.stderr += chunk; return true; });

  const code = main(['demo'], { cwd, projectsRoot: ROOT });

  t.mock.restoreAll();
  assert.equal(code, 1);
  assert.ok(out.stderr.includes(`no session of ${cwd} `), out.stderr);
});

/** S4 of user-thread-listener: the memory row (spec 10; L11, A5). */

const REPO = 'C:\\fixture\\repo';
const DEMO_SPAN = { from: Date.parse('2026-01-01T10:00:00.000Z'), to: Date.parse('2026-01-01T11:00:40.000Z') };
const MIB = 2 ** 20;
const reading = (process, at, rss, free) => ({ at, process, pid: 7, event: 'tick', rss: rss * MIB, free: free * MIB });

/** `pilot analytics demo` with `lines` as the store's memory.jsonl (none written when null): exit code, stdout and the file. */
function withMemory(t, lines) {
  const store = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-analytics-memory-'));
  t.after(() => fs.rmSync(store, { recursive: true, force: true }));
  const file = path.join(store, 'memory.jsonl');
  if (lines) fs.writeFileSync(file, lines.map((line) => `${typeof line === 'string' ? line : JSON.stringify(line)}\n`).join(''));
  const out = { stdout: '', stderr: '' };
  t.mock.method(process.stdout, 'write', (chunk) => { out.stdout += chunk; return true; });
  t.mock.method(process.stderr, 'write', (chunk) => { out.stderr += chunk; return true; });
  const before = process.env.PILOT_DECK_DIR;
  process.env.PILOT_DECK_DIR = store;
  try {
    return { code: main(['demo'], { cwd: ROOT, repo: REPO, projectsRoot: ROOT }), file, ...out };
  } finally {
    if (before === undefined) delete process.env.PILOT_DECK_DIR;
    else process.env.PILOT_DECK_DIR = before;
    t.mock.restoreAll();
  }
}

test('readRun returns the run\'s span', () => {
  assert.deepEqual(readRun(REPO, 'demo', { projectsRoot: ROOT }).span, DEMO_SPAN);
  assert.equal(readRun(REPO, 'nothing-here', { projectsRoot: ROOT }).span, null);
});

test('analytics prints the peak per process inside the span', (t) => {
  const { code, stdout } = withMemory(t, [
    reading('wait', '2026-01-01T10:05:00.000Z', 60, 5000),
    reading('wait', '2026-01-01T10:20:00.000Z', 90, 4000),
    reading('wait', '2026-01-01T10:40:00.000Z', 70, 4500), // in span, after the peak, lower: the peak is not the last reading
    reading('wait', '2026-01-01T12:00:00.000Z', 900, 100), // after the span: not counted
    reading('daemon', '2026-01-01T09:00:00.000Z', 999, 1), // before it
    reading('daemon', '2026-01-01T11:00:40.000Z', 120, 3000),
    'not json',
    { ...reading('client', '2026-01-01T10:30:00.000Z', 50, 2000), process: 'PLANTED-9Q7X-SECRET' },
  ]);

  assert.equal(code, 0);
  const memory = blocks(stdout).find((rows) => rows[0][0] === 'Process');
  assert.deepEqual(memory[0], ['Process', 'Peak RSS', 'Free at peak', 'Readings']);
  assert.deepEqual(memory.slice(2), [
    ['wait', '90 MiB', '4,000 MiB', '3'],
    ['daemon', '120 MiB', '3,000 MiB', '1'],
  ]);
  assert.equal(stdout.includes('PLANTED-9Q7X-SECRET'), false);
});

test('analytics with no memory log says so in one line', (t) => {
  const { code, stdout, file } = withMemory(t, null);

  assert.equal(code, 0);
  assert.ok(stdout.includes(`No memory readings in ${file}.\n`), stdout);
  assert.equal(blocks(stdout).some((rows) => rows[0][0] === 'Process'), false);
});
