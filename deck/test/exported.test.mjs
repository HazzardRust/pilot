/**
 * The exporting deck warns its queue may live elsewhere (portable-store S7; spec 10, A3). The mark is written by
 * `pilot store export` itself, never typed here; the notice is posted once per export, and `pilot doctor` names it.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { checkAll } from '../doctor.mjs';
import { exportedMark, exportedNotice, noticeExported } from '../exported.mjs';
import { listItems, postItem, registerRun } from '../store.mjs';
import { exportStore } from '../store-move.mjs';
import { PILOT_MERGE_ALLOW } from '../../scripts/install-settings.mjs';
import { tempDeck } from '../testUtils.mjs';

const noGit = () => assert.fail('a store with no run worktree runs no git');

/** A scratch store exported by the real command at `iso`; returns the store dir. */
function exportedAt(t, iso, dir = tempDeck(t)) {
  if (!fs.existsSync(path.join(dir, 'deck.json'))) registerRun({ repo: path.join(dir, 'repo'), pid: process.pid, session: 'a-session' });
  const said = [];
  const file = path.join(path.dirname(dir), `${path.basename(dir)}-${iso.slice(0, 10)}.pilotstore`);
  t.after(() => fs.rmSync(file, { force: true }));
  const code = exportStore([file], { git: noGit, now: () => new Date(iso), out: (l) => said.push(l), err: (l) => said.push(l) });
  assert.equal(code, 0, said.join('\n'));
  return dir;
}

test('one notice per export: a mark newer than the last notice, and none for the same mark again', (t) => {
  const dir = exportedAt(t, '2026-11-28T10:00:00.000Z');
  const mark = exportedMark(dir);
  assert.equal(mark.at, '2026-11-28T10:00:00.000Z');

  const notice = exportedNotice(mark, null);
  assert.ok(notice.title.length > 0);
  assert.ok(notice.body.includes(mark.file), notice.body);
  assert.ok(notice.body.includes('2026-11-28'), notice.body);
  assert.equal(exportedNotice(mark, mark.at), null, 'the same mark again');
  assert.equal(exportedNotice(mark, '2026-11-29T00:00:00.000Z'), null, 'a mark older than the last notice');

  exportedAt(t, '2026-12-01T09:00:00.000Z', dir);
  assert.ok(exportedNotice(exportedMark(dir), mark.at), 'a second export is noticed');
});

test('the deck start posts one notice per export, however often it starts', (t) => {
  const dir = exportedAt(t, '2026-11-28T10:00:00.000Z');
  const exported = () => listItems().filter((item) => item.title === exportedNotice(exportedMark(dir), null).title);
  const markBefore = fs.readFileSync(path.join(dir, 'exported.json'), 'utf8');

  noticeExported(dir, postItem);
  noticeExported(dir, postItem);
  assert.equal(exported().length, 1);
  assert.equal(fs.readFileSync(path.join(dir, 'exported.json'), 'utf8'), markBefore, 'the mark is never written by the deck');

  exportedAt(t, '2026-12-01T09:00:00.000Z', dir);
  noticeExported(dir, postItem);
  assert.equal(exported().length, 2);
});

test('no mark, or a mark that is not one, reads as none', (t) => {
  const dir = tempDeck(t);
  assert.equal(exportedMark(dir), null);
  fs.writeFileSync(path.join(dir, 'exported.json'), '{"at":"yesterday"}\n');
  assert.equal(exportedMark(dir), null);
  fs.writeFileSync(path.join(dir, 'exported.json'), 'not json');
  assert.equal(exportedMark(dir), null);
  assert.equal(noticeExported(dir, () => assert.fail('nothing to notice')), null);
});

/** Every other doctor probe faked to pass, as doctor.test.mjs's `passing`; nothing real runs. */
const doctorOn = (storeDir) => checkAll({
  platform: 'linux', run: () => assert.fail('no Defender probe off Windows'), root: '/home/dev/projects',
  nodeVersion: '22.8.0', engines: '>=22.8.0', resolveDep: () => true, storeDir, canWrite: () => true, onPath: () => true,
  git: (args) => (args.includes('pilot.branch') ? 'pilot' : 'none'), probe: async () => ({ state: 'none' }),
  readSettings: () => ({ permissions: { allow: PILOT_MERGE_ALLOW } }), findRune: () => ({ source: 'built', file: '/rune' }),
});

test('doctor names the export: its exported row reads the mark time, and there is no row without a mark', async (t) => {
  const bare = tempDeck(t);
  assert.equal((await doctorOn(bare)).find((row) => row.name === 'exported'), undefined);

  const dir = exportedAt(t, '2026-11-28T10:00:00.000Z');
  const row = (await doctorOn(dir)).find((r) => r.name === 'exported');
  assert.ok(row, 'an exported row');
  assert.notEqual(row.verdict, 'fail', 'an export never fails doctor');
  assert.ok(row.detail.includes('2026-11-28T10:00:00.000Z'), row.detail);
});
