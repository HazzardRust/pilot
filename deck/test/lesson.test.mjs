/**
 * The lesson thread (small ticket itm_9aaece4a409c, ADR 0053). A `Teach me` press has
 * the teacher post a `lesson` it owns, naming the thread it teaches: replies on it
 * wake the teacher's wait and never the pilot's, the teacher closes it, and a press
 * on its trial options decides nothing on the question it mirrors.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';

import { deckOnAPort, tempDeck } from '../testUtils.mjs';

const { DeckRefusal, addReply, listItems, postItem, registerRun, resolveItem } = await import('../store.mjs');
const { chosenOf, isOpen, ownerOf, threadState } = await import('../items.mjs');
const { callTool } = await import('../server.mjs');
const { renderThreadPage } = await import('../ui/render.mjs');

const ALPHA = 'D:/work/alpha';
const TEACHER = 'pilot:pilot-teacher';
const OPTIONS = ['Postgres', 'SQLite'];

const question = () =>
  postItem({ kind: 'question', title: 'Which store?', body: 'A or B', options: OPTIONS, repo: ALPHA, author: '' });
const lessonOn = (source) =>
  postItem({
    kind: 'lesson',
    title: `Lesson: ${source.title}`,
    body: `Teaching ${source.id}. What do you know about write concurrency?`,
    options: OPTIONS,
    repo: ALPHA,
    author: TEACHER,
  });
const stored = (id) => listItems().find((item) => item.id === id);

const callApi = (base, name, args = {}) =>
  fetch(`${base}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, arguments: args }),
  });
const payloadOf = async (response) => JSON.parse((await response.json()).content[0].text);
const saidIn = (payload) => payload.replies.map((reply) => reply.text);
const send = (base, id, text) =>
  fetch(`${base}/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({ id, text, choice: '' }),
    redirect: 'manual',
  });

test("deck_post takes a lesson with trial options, and the teacher's is the teacher's", (t) => {
  tempDeck(t);
  const asked = question();
  callTool('deck_post', {
    kind: 'lesson',
    title: 'Lesson: Which store?',
    body: `Teaching ${asked.id}.`,
    options: OPTIONS,
    author: TEACHER,
  });

  const item = listItems().at(-1);
  assert.equal(item.kind, 'lesson');
  assert.equal(ownerOf(item), 'teacher');
  assert.deepEqual(item.options, OPTIONS);
  assert.ok(item.body.includes(asked.id), 'the lesson names the thread it teaches');
});

test('a reply on a lesson is heard by the teacher wait and not by the pilot wait', async (t) => {
  const base = await deckOnAPort(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  const lesson = lessonOn(question());

  let pilotDone = false;
  const forTeacher = callApi(base, 'deck_wait', { since: 0, timeout: 5_000, repo: ALPHA, author: TEACHER });
  const forPilot = callApi(base, 'deck_wait', { since: 0, timeout: 1_500, repo: ALPHA, author: '' })
    .then(payloadOf)
    .then((payload) => {
      pilotDone = true;
      return payload;
    });
  await sleep(100);
  assert.equal((await send(base, lesson.id, 'writes are rare')).status, 303);

  assert.deepEqual(saidIn(await payloadOf(await forTeacher)), ['writes are rare']);
  assert.equal(pilotDone, false, "the pilot's wait is still parked when the teacher's returns");
  assert.deepEqual(saidIn(await forPilot), [], 'and it times out with nothing of the lesson handed to it');
});

test('the teacher concludes its lesson, and the pilot closes nothing on it', (t) => {
  tempDeck(t);
  const lesson = lessonOn(question());

  assert.throws(() => resolveItem(lesson.id, 'done', ''), DeckRefusal, "the pilot's resolve is refused");
  assert.throws(() => callTool('deck_reply', { id: lesson.id, text: 'mine', author: '' }), DeckRefusal);
  callTool('deck_reply', { id: lesson.id, text: 'Next step.', author: TEACHER });
  assert.equal(threadState(stored(lesson.id)), 'teacher replied');
  resolveItem(lesson.id, 'The user explained the trade-off back.', TEACHER);
  assert.equal(isOpen(stored(lesson.id)), false);
});

test("a press on the lesson's trial option resolves nothing on the question", (t) => {
  tempDeck(t);
  const asked = question();
  const lesson = lessonOn(asked);

  addReply(lesson.id, 'SQLite');

  assert.equal(chosenOf(stored(lesson.id)), 'SQLite', 'the trial press is on the lesson');
  assert.equal(isOpen(stored(asked.id)), true, 'the question stays open');
  assert.equal(chosenOf(stored(asked.id)), null, 'and nothing is chosen on it');
  assert.deepEqual(stored(asked.id).replies, []);
});

test("a lesson renders its trial options as buttons, with no Teach me of its own", (t) => {
  tempDeck(t);
  const html = renderThreadPage(lessonOn(question()));
  for (const option of OPTIONS) assert.ok(html.includes(`value="${option}"`), `${option} is a button`);
  assert.doesNotMatch(html, /value="Teach me"/, 'a lesson is not taught again');
});

test('a pass to the teacher is still refused: a lesson is posted, never handed over', (t) => {
  tempDeck(t);
  const asked = question();
  assert.throws(() => callTool('deck_reply', { id: asked.id, text: 'yours', to: 'teacher', author: '' }), DeckRefusal);
  assert.equal(ownerOf(stored(asked.id)), 'pilot');
});

const optionButton = (html, option) => html.match(new RegExp(`<button[^>]*value="${option}"[^>]*>`))[0];

test("a trial press locks the lesson's options only until the teacher answers it", (t) => {
  tempDeck(t);
  const lesson = lessonOn(question());

  addReply(lesson.id, 'SQLite');
  assert.match(optionButton(renderThreadPage(stored(lesson.id)), 'Postgres'), /disabled/, 'locked while the press waits');

  callTool('deck_reply', { id: lesson.id, text: 'SQLite trades away concurrent writers.', author: TEACHER });
  const html = renderThreadPage(stored(lesson.id));
  for (const option of OPTIONS) assert.doesNotMatch(optionButton(html, option), /disabled/, `${option} can be tried next`);
});

test('a lesson links to the thread it teaches', (t) => {
  tempDeck(t);
  const asked = question();
  assert.ok(renderThreadPage(lessonOn(asked)).includes(`href="/thread/${asked.id}"`));
});
