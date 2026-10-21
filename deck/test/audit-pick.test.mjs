// Picking (housekeeping-audit spec 14; L11, A6): a typed pick posts one ticket per row, body the row's spec verbatim.

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { tempDeck } from '../testUtils.mjs';
import { parsePicks, saveReport, specFor } from '../audit.mjs';
import { chainNext } from '../chain.mjs';
import { KIND_TICKET } from '../items.mjs';
import { postItem } from '../store.mjs';
import { ticketShapeGaps } from '../ticket-shape.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const REPO = 'D:/work/alpha';
const IDS = ['F1', 'F2', 'F3', 'F4', 'F5'];

// Trailing spaces, a tab, CRLF, a leading newline and non-ASCII: anything a trim or a re-flow would change.
const ODD_SPEC = '\nProblem: the suite takes 4 min.  \r\n\n1. `npm test` runs in under 60 s\t— evidence: the timing.\n   Indented line é ✓\n\n';

const row = (finding, minutes, spec) => ({
  area: 'loops',
  finding,
  command: 'npm test',
  output: 'ok',
  exit: 0,
  saving: { minutes, tokens: 0 },
  fix: 'split the suite',
  effort: 'S',
  spec,
});

/** Two rows ranked F1 (the odd spec) and F2; the saved JSON's text, as `pilot audit spec` reads it. */
function savedReport(t) {
  tempDeck(t);
  const saved = saveReport(REPO, {
    repo: REPO,
    scratch: 'D:/tmp/scratch',
    startedAt: '2026-09-27T10:00:00.000Z',
    minutes: 3,
    tokens: null,
    unmeasured: ['measured spend: no usage log'],
    rows: [row('slow suite', 9, ODD_SPEC), row('second finding', 1, 'Problem: two.\n\n1. two holds')],
  });
  return saved.json;
}

const cli = (...args) =>
  spawnSync(process.execPath, [path.join(ROOT, 'bin', 'pilot.mjs'), 'audit', ...args], {
    env: { ...process.env, PILOT_DECK_NO_OPEN: '1' },
    encoding: 'utf8',
  });

test('picks are parsed case-insensitively and unknown ids are named', () => {
  assert.deepEqual(parsePicks('F1, f3 and F9', IDS), { picked: ['F1', 'F3'], unknown: ['F9'] });
  assert.deepEqual(parsePicks(' f2\nF1 & F2 ', IDS), { picked: ['F2', 'F1'], unknown: [] }, 'pick order, once each');
  assert.deepEqual(
    parsePicks('F1 but not F3', IDS),
    { picked: [], unknown: [] },
    'a reply that is not a list of ids picks nothing, never the ids inside it',
  );
  assert.deepEqual(parsePicks('do the first two', IDS), { picked: [], unknown: [] });
  assert.deepEqual(parsePicks('F1; rm -rf /', IDS), { picked: [], unknown: [] });
});

test('none picks nothing', () => {
  for (const reply of ['none', ' None. ', 'NONE', '', '   ']) {
    assert.deepEqual(parsePicks(reply, IDS), { picked: [], unknown: [] }, JSON.stringify(reply));
  }
});

test('ids past F9 are read, and a trailing full stop is dropped (P11a)', () => {
  const manyIds = [...IDS, 'F10', 'F11'];
  assert.deepEqual(parsePicks('F10, F11', manyIds), { picked: ['F10', 'F11'], unknown: [] }, 'F10 and above');
  assert.deepEqual(parsePicks('F1, F3.', IDS), { picked: ['F1', 'F3'], unknown: [] }, 'a trailing full stop');
});

test("specFor returns the row's spec text byte for byte", (t) => {
  const json = fs.readFileSync(savedReport(t), 'utf8');
  assert.equal(specFor(json, ['F1']), ODD_SPEC);
  assert.equal(specFor(json, ['f1']), ODD_SPEC, 'an id is read the way a pick reads it');
  assert.throws(() => specFor(json, ['F7']), /F7/);
  assert.throws(() => specFor('not json', ['F1']), /not readable JSON/);
});

test('pilot audit spec exits 1 naming an unknown id', (t) => {
  const file = savedReport(t);
  const ok = cli('spec', file, 'F1');
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.stdout, `${ODD_SPEC}\n\nAudit report: ${file}`, 'printed unedited, then the report it came from');

  const bad = cli('spec', file, 'F9');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /F9/);
  assert.equal(bad.stdout, '');
});

// bigger-jobs S6 (spec 6): the picks on one surface become one ticket, so one body carries several rows.
const SECOND = 'Problem: two.\n\n1. two holds';

test('two ids give one body with both specs', (t) => {
  const json = fs.readFileSync(savedReport(t), 'utf8');
  const body = specFor(json, ['f2', 'F1']);
  assert.equal(body, `### F2: second finding\n\n${SECOND}\n\n### F1: slow suite\n\n${ODD_SPEC}`, 'in pick order, each spec unedited');
  assert.equal(specFor(json, ['F1']), ODD_SPEC, 'one id is its spec alone, as before');
});

test('the body passes the ticket shape', (t) => {
  const file = savedReport(t);
  const out = cli('spec', file, 'F2', 'F1');
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stdout, `### F2: second finding\n\n${SECOND}\n\n### F1: slow suite\n\n${ODD_SPEC}\n\nAudit report: ${file}`);
  assert.deepEqual(ticketShapeGaps(out.stdout), []);
  const ticket = postItem({ kind: KIND_TICKET, sliceCount: 2, repo: REPO, title: 'Audit F2, F1: the suite', body: out.stdout });
  assert.equal(ticket.body, out.stdout, 'the deck takes it as printed');
});

test('an unknown id among several is named', (t) => {
  const file = savedReport(t);
  const json = fs.readFileSync(file, 'utf8');
  assert.throws(() => specFor(json, ['F1', 'F7', 'F2']), /^Error: no row F7 in this report; its ids are F1, F2$/);
  assert.throws(() => specFor(json, []), /no ids/);
  const bad = cli('spec', file, 'F1', 'F7');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /no row F7/);
  assert.equal(bad.stdout, '', 'nothing printed when one id is unknown');
});

test('the auditor posts one ticket per surface', () => {
  const auditor = read('agents/pilot-auditor.md').replace(/\s+/g, ' ');
  const post = auditor.slice(auditor.indexOf('7. Otherwise'), auditor.indexOf('## Report'));
  assert.match(post, /group the picked ids by surface \(the files a fix touches\)/);
  assert.match(post, /one ticket per surface/);
  assert.match(post, /audit spec <report\.json> <id> \[<id>\.\.\.\]/);
  assert.match(post, /exactly as `audit pick` printed them, never taken from the reply's text/, 'no user text on the shell line');
  assert.match(post, /`sliceCount`[^.]*the sum of its rows' efforts, each row's effort as slices \(S 1, M 3, L 8\)/);
  const skill = read('skills/audit/SKILL.md').replace(/\s+/g, ' ');
  assert.match(skill, /grouped by surface, one ticket each/);
});

test('pilot audit pick reads the reply from a file and prints the picked ids in order', (t) => {
  const file = savedReport(t);
  const reply = path.join(path.dirname(file), 'reply.txt');
  fs.writeFileSync(reply, 'f2, F1 and F8');
  const out = cli('pick', file, reply);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stdout, 'F2\nF1\n');
  assert.match(out.stderr, /unknown: F8/);

  fs.writeFileSync(reply, "none `touch x` $(id) 'F1'");
  const none = cli('pick', file, reply);
  assert.equal(none.status, 0, none.stderr);
  assert.equal(none.stdout, '', 'not a list of ids: nothing picked');
});

test('a pick posts one ticket per id with the row\'s spec as its body, and none posts nothing', () => {
  // Thread-kinds S10 (ADR 0058): the auditor picks, in the section where it owns the thread.
  const auditor = read('agents/pilot-auditor.md');
  const start = auditor.indexOf('## Owning the thread');
  assert.ok(start >= 0, 'the auditor owns the thread');
  const picking = auditor.slice(start, auditor.indexOf('\n## ', start + 1));
  assert.ok(picking.indexOf('a pick never starts') > picking.indexOf('deck_post'), 'the pick follows the post');
  assert.match(picking, /Write tool/, 'the reply reaches the parser through a file, never a shell line');
  assert.match(picking, /audit pick <report\.json> <reply-file>/);
  assert.match(picking, /audit spec <report\.json> <id>/);
  assert.match(picking, /kind `ticket`/);
  assert.match(picking, /in pick order/i);
  assert.match(picking, /unedited/);
  assert.match(picking, /no tickets posted/);
  assert.match(picking, /never start/i);
});

test("a picked row's ticket reaches the next run verbatim", (t) => {
  const file = savedReport(t);
  const body = cli('spec', file, 'F1').stdout;
  const ticket = postItem({ kind: KIND_TICKET, sliceCount: 60, repo: REPO, title: 'Audit F1: slow suite', body });
  const { handoff } = chainNext(REPO, { atStart: true });
  assert.equal(handoff.next, ticket.id);
  assert.equal(handoff.body, `${ODD_SPEC}\n\nAudit report: ${file}`);
});

test('the audit skill and the auditor never name deck_launch or headless', () => {
  const files = ['agents/pilot-auditor.md', 'skills/audit/SKILL.md'];
  for (const file of fs.readdirSync(path.join(ROOT, 'skills/audit/areas'))) files.push(`skills/audit/areas/${file}`);
  for (const file of files) assert.doesNotMatch(read(file), /deck_launch|headless/i, file);
});

test('the fixture plants at least one item for every area file in skills/audit/areas', () => {
  const planted = read('fixtures/audit-repo/PLANTED.md')
    .split('\n')
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).split(' · ').map((part) => part.trim()));
  const areas = new Set(planted.map(([area]) => area));
  for (const file of fs.readdirSync(path.join(ROOT, 'skills/audit/areas'))) {
    const area = read(`skills/audit/areas/${file}`).match(/^area: (\S+)$/m)?.[1];
    assert.ok(area, `${file} names its area`);
    assert.ok(areas.has(area), `PLANTED.md plants nothing for ${area}`);
  }
  for (const area of ['context', 'tooling']) assert.ok(areas.has(area), `PLANTED.md plants nothing for ${area}`);
  for (const [area, file] of planted) {
    assert.ok(fs.existsSync(path.join(ROOT, 'fixtures/audit-repo', file)), `${area}: ${file} is in the fixture`);
  }
});

// node --test's default patterns (Node 22+), with the TypeScript extensions it also collects.
const COLLECTED = /(^|\/)test\/|(^|\/)(test|test-[^/]*|[^/]*[.\-_]test)\.[cm]?[jt]s$/;

test('no fixture file is collected by node --test', () => {
  const files = fs.readdirSync(path.join(ROOT, 'fixtures'), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(path.join(ROOT, 'fixtures'), path.join(entry.parentPath ?? entry.path, entry.name)).replace(/\\/g, '/'));
  assert.ok(files.some((file) => file.startsWith('audit-repo/')), 'the fixture exists');
  assert.ok(files.some((file) => file.startsWith('audit-repo-broken/')), 'the broken fixture exists');
  assert.ok(COLLECTED.test('a/test/x.js') && COLLECTED.test('a/x.test.mjs') && COLLECTED.test('test-y.cjs'), 'the pattern bites');
  assert.deepEqual(files.filter((file) => COLLECTED.test(file)), []);
  assert.deepEqual(files.filter((file) => file.split('/').includes('.git')), [], 'no nested repository');
});
