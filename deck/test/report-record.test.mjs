/**
 * S1 of report-record: a closing report is a record and takes no reply from the user (spec 1, 2, 7;
 * L1, L2, ADR 0148). The store refuses the reply, whoever sends it, before any reopen; the
 * report's page draws no reply box. S3 keeps a reply stored before this from any pilot.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { deckOnAPort, postStored, tempDeck } from '../testUtils.mjs';
import { KINDS, KIND_REPORT, RECORD_KINDS, isRecord } from '../items.mjs';
import { renderThreadPage } from '../ui/render.mjs';

const { addReply, listItems } = await import('../store.mjs');

const REPO = path.resolve('D:/work/alpha');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const aRun = () => ({ id: 'run_1', repo: REPO, name: 'alpha', pid: process.pid, startedAt: new Date().toISOString() });
const reread = (id) => listItems().find((candidate) => candidate.id === id);

/** The repository's chat and one closing report in it, stored as the deck holds them. */
const aReportWithChat = (extra = {}) => {
  const chat = postStored({ kind: 'chat', title: 'Chat', body: 'Say anything.', repo: REPO });
  const report = postStored({ kind: KIND_REPORT, title: 'Closing report', body: 'What landed.', repo: REPO, ...extra });
  return { chat, report };
};

test("a user's reply on an open report is refused naming the chat", (t) => {
  tempDeck(t);
  const { chat, report } = aReportWithChat();
  assert.throws(
    () => addReply(report.id, 'please also fix the header'),
    (err) => err.message.includes('ADR 0148') && err.message.includes(`/thread/${chat.id}`),
  );
  assert.deepEqual(reread(report.id).replies, []);
});

test("the refusal names this repository's chat, else /", (t) => {
  tempDeck(t);
  postStored({ kind: 'chat', title: 'Chat', body: 'Elsewhere.', repo: path.resolve('D:/work/beta') });
  const report = postStored({ kind: KIND_REPORT, title: 'Closing report', body: 'What landed.', repo: REPO });
  assert.throws(() => addReply(report.id, 'hello'), { message: /say it on the chat: \/$/ });
  const chat = postStored({ kind: 'chat', title: 'Chat', body: 'Say anything.', repo: REPO });
  assert.throws(() => addReply(report.id, 'hello'), { message: new RegExp(`say it on the chat: /thread/${chat.id}$`) });
});

test("a report's page shows no pickup badge over a stored user reply", () => {
  const planted = [{ from: 'user', text: 'fix the header', repliedAt: new Date().toISOString(), seq: 1 }];
  const report = { id: 'itm_aaaaaaaaaaaa', kind: KIND_REPORT, title: 'Closing report', body: 'What landed.', repo: REPO, replies: planted };
  const question = { id: 'itm_bbbbbbbbbbbb', kind: 'question', title: 'Which?', body: 'A or B', repo: REPO, replies: planted };
  assert.doesNotMatch(renderThreadPage(report, [report, question], [aRun()]), /not picked up yet/);
  assert.match(renderThreadPage(question, [report, question], [aRun()]), /not picked up yet/);
});

test("the page draws the refusal's chat as one working link", () => {
  const report = { id: 'itm_aaaaaaaaaaaa', kind: KIND_REPORT, title: 'Closing report', body: 'What landed.', repo: REPO, replies: [] };
  const chat = { id: 'itm_cccccccccccc', kind: 'chat', title: 'Chat', body: 'Say anything.', repo: REPO, replies: [] };
  const refused = `a closing report is a record and takes no reply (ADR 0148); say it on the chat: /thread/${chat.id}`;
  const page = renderThreadPage(report, [report, chat], [aRun()], {}, {}, false, [], refused);
  assert.match(page, /say it on the chat: <a class="ref" href="\/thread\/itm_cccccccccccc">Chat<\/a>/);
  assert.doesNotMatch(page, /\/thread\/<a/);
});

test('a reply on a closed report reopens nothing', (t) => {
  tempDeck(t);
  const { report } = aReportWithChat({ resolution: 'closed', resolvedAt: new Date().toISOString() });
  assert.throws(() => addReply(report.id, 'one more thing'), /ADR 0148/);
  const after = reread(report.id);
  assert.equal(after.resolution, 'closed', 'the report stays closed');
  assert.deepEqual(after.replies, []);
});

test('POST /reply on a report stores nothing', async (t) => {
  const origin = await deckOnAPort(t);
  const { chat, report } = aReportWithChat();
  const before = reread(report.id);
  // A script's POST: fetch cannot send a navigation, so this is the error path, not the page's 303.
  const answer = await fetch(`${origin}/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin },
    redirect: 'manual',
    body: new URLSearchParams({ id: report.id, text: 'do this next' }),
  });
  const refused = await answer.text();
  assert.equal(answer.status, 400, refused);
  assert.match(refused, /ADR 0148/);
  assert.ok(refused.includes(`/thread/${chat.id}`), refused);
  assert.deepEqual(reread(report.id), before, 'the stored item is unchanged');
});

test("a report's page has no reply box, a question's keeps one", () => {
  const report = { id: 'r1', kind: KIND_REPORT, title: 'Closing report', body: 'What landed.', repo: REPO, replies: [] };
  const question = { id: 'q1', kind: 'question', title: 'Which port?', body: '4321?', repo: REPO, replies: [] };
  const reportPage = renderThreadPage(report, [report, question], [aRun()]);
  const questionPage = renderThreadPage(question, [report, question], [aRun()]);
  assert.doesNotMatch(reportPage, /reply-text/);
  assert.doesNotMatch(reportPage, /action="\/reply"/);
  assert.match(questionPage, /reply-text/);
  assert.match(questionPage, /action="\/reply"/);
});

test('only reports are records', () => {
  assert.deepEqual(RECORD_KINDS, [KIND_REPORT]);
  assert.equal(isRecord({ kind: KIND_REPORT }), true);
  for (const kind of [...KINDS.filter((k) => k !== KIND_REPORT), 'chat', 'user']) {
    assert.equal(isRecord({ kind }), false, kind);
  }
  assert.equal(isRecord(null), false);
});

test('ADR 0148 is indexed', () => {
  const index = fs.readFileSync(path.join(ROOT, 'docs/adr/README.md'), 'utf8');
  assert.match(index, /0148/);
});
