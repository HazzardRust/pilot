/**
 * Thread-kinds S10, spec 4-6; L3, L14, L16, ADR 0058.
 *
 * The auditor posts the audit item itself, so by the A1 rule it owns it: a reply
 * typed there is heard by the auditor's wait alone, the pilot takes the thread back
 * with `to: "pilot"`, and an auditor gone quiet hands the reply to the pilot by the
 * owner fallback (ADR 0045) with a note that names the auditor. The tickets it posts
 * from a pick carry it as author. Never port 4321: this machine runs a real deck.
 *
 * Tool calls go over `node:http` with no agent, as in `fallback.test.mjs`: undici's
 * pooled connections keep timers that a mocked clock strands.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { deckOnAPort, tempDeck } from '../testUtils.mjs';

const { LIVE_WINDOW_MS, forgetAgents, noteActive } = await import('../agents.mjs');
const { addReply, currentSeq, listItems, postItem, registerRun } = await import('../store.mjs');
const { chainNext } = await import('../chain.mjs');
const { ownerOf } = await import('../items.mjs');
const { callTool, waiterCount } = await import('../server.mjs');
const { renderThreadPage } = await import('../ui/render.mjs');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ALPHA = 'D:/work/alpha';
const AUDITOR = 'pilot:pilot-auditor';
const PICK_UP = 30_000; // L6
const START = Date.parse('2026-10-01T10:00:00Z');

const stored = (id) => listItems().find((item) => item.id === id);
const audit = () =>
  postItem({ kind: 'audit', title: 'Audit: alpha', body: 'F1 slow suite', repo: ALPHA, author: AUDITOR });

const callApi = (base, name, args = {}) =>
  new Promise((resolve, reject) => {
    const request = http.request(`${base}/api/tool`, { method: 'POST', agent: false, headers: { 'content-type': 'application/json' } }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => (body += chunk));
      response.on('end', () => resolve(body));
    });
    request.on('error', reject);
    request.end(JSON.stringify({ name, arguments: args }));
  });
const payloadOf = (body) => JSON.parse(JSON.parse(body).content[0].text);
const saidIn = (payload) => payload.replies.map((reply) => reply.text);

const settleLoop = async (turns = 30) => {
  for (let i = 0; i < turns; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

/** A wait, parked: resolves to its payload, and `done()` says whether it has answered yet. */
async function park(base, args) {
  const before = waiterCount();
  let answered = false;
  const reply = callApi(base, 'deck_wait', args).then(payloadOf).finally(() => (answered = true));
  reply.catch(() => {});
  for (let i = 0; i < 200 && waiterCount() === before && !answered; i += 1) await settleLoop(1);
  return { reply, done: () => answered };
}

test('an audit posted by a pilot-auditor is owned by auditor', (t) => {
  tempDeck(t);
  const item = audit();

  assert.equal(stored(item.id).owner, 'auditor');
  assert.equal(ownerOf(stored(item.id)), 'auditor');
  assert.match(renderThreadPage(stored(item.id)), /<span class="who by-auditor">auditor<\/span>/, 'the byline is the auditor');
});

test("a reply on it is heard by the auditor's deck_wait and not the pilot's", async (t) => {
  const base = await deckOnAPort(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  const item = audit();
  addReply(item.id, 'F1');

  const pilot = payloadOf(await callApi(base, 'deck_wait', { since: 0, timeout: 50, repo: ALPHA, author: '' }));
  assert.deepEqual(saidIn(pilot), [], "the pilot's wait is handed nothing of the auditor's");
  const auditor = payloadOf(await callApi(base, 'deck_wait', { since: 0, timeout: 50, repo: ALPHA, author: AUDITOR }));
  assert.deepEqual(saidIn(auditor), ['F1']);
});

test('the pilot takes it back with to: "pilot"', async (t) => {
  const base = await deckOnAPort(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  const item = audit();

  assert.throws(() => callTool('deck_reply', { id: item.id, text: 'mine', author: '' }), /owned by auditor/);
  callTool('deck_reply', { id: item.id, text: 'I have this one', author: '', to: 'pilot' });
  assert.equal(ownerOf(stored(item.id)), 'pilot');

  addReply(item.id, 'F2 then');
  const pilot = payloadOf(await callApi(base, 'deck_wait', { since: 0, timeout: 50, repo: ALPHA, author: '' }));
  assert.deepEqual(saidIn(pilot), ['F2 then'], "the pilot's wait hears it now");
});

test('an auditor quiet past the fallback window hands the reply to the pilot, and the note names the auditor', async (t) => {
  const base = await deckOnAPort(t);
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: START });
  forgetAgents();
  t.after(() => forgetAgents());
  noteActive({ cwd: ALPHA, kind: 'auditor' }, Date.now() - 2 * LIVE_WINDOW_MS);
  const item = audit();
  addReply(item.id, 'F1 please');

  const wait = await park(base, { since: currentSeq(), timeout: 120_000, repo: ALPHA });
  t.mock.timers.tick(PICK_UP);
  await settleLoop();
  assert.equal(wait.done(), true, 'at 30 s the pilot is handed the reply');
  const [reply] = (await wait.reply).replies;
  assert.equal(reply.text, 'F1 please');
  assert.match(reply.fallback, /auditor's thread/);
  assert.doesNotMatch(reply.fallback, /QA/, 'the note names the owner kind, not QA');
  assert.doesNotMatch(reply.fallback, /to: "auditor"/, 'a thread cannot be passed to the auditor (PASS_KINDS)');
  assert.equal(ownerOf(stored(item.id)), 'pilot');
});

test('a ticket posted by the auditor carries it as author', (t) => {
  tempDeck(t);
  // As `audit spec` prints it: the report path is what lets a ticket skip ticket-making's shape.
  const body = 'Problem: the suite is slow.\n\n1. `npm test` runs in under 60 s\n\nAudit report: D:/x/audits/alpha/2026-10-01T10-00-00-000Z.json';
  const ticket = postItem({ kind: 'ticket', sliceCount: 60, title: 'Audit F1: slow suite', body, repo: ALPHA, author: AUDITOR });
  assert.equal(stored(ticket.id).author, 'auditor');
  assert.equal(ownerOf(stored(ticket.id)), 'pilot', 'the auditor authors it; the pilot owns it (ADR 0058)');
});

test('the chain takes an auditor-posted ticket', (t) => {
  tempDeck(t);
  const body = 'Problem: the suite is slow.\n\n1. `npm test` runs in under 60 s\n\nAudit report: D:/x/audits/alpha/2026-10-01T10-00-00-000Z.json';
  const ticket = postItem({ kind: 'ticket', sliceCount: 60, title: 'Audit F1: slow suite', body, repo: ALPHA, author: AUDITOR });
  const { handoff } = chainNext(ALPHA, { atStart: true });
  assert.ok(handoff, 'one hand-off is posted');
  assert.equal(stored(ticket.id).live, true, 'taken live, not resolved (ticket-states spec 13)');
  assert.equal(listItems().filter((item) => item.kind === 'handoff').length, 1);
});

test('pilot-auditor.md lists the three deck tools and the skill no longer posts the item', () => {
  const auditor = fs.readFileSync(path.join(ROOT, 'agents/pilot-auditor.md'), 'utf8');
  const skill = fs.readFileSync(path.join(ROOT, 'skills/audit/SKILL.md'), 'utf8');
  const tools = auditor.match(/^tools: (.+)$/m)[1].split(', ');
  for (const tool of ['deck_post', 'deck_reply', 'deck_resolve']) {
    assert.ok(tools.includes(`mcp__plugin_pilot_deck__${tool}`), `the auditor holds ${tool}`);
  }
  // crew-waits L5: it waits through a background `pilot wait --as auditor`, not deck_wait.
  assert.ok(!tools.includes('mcp__plugin_pilot_deck__deck_wait'), 'and no deck_wait (crew-waits L5)');
  assert.ok(!tools.includes('mcp__plugin_pilot_deck__deck_read'), 'and still no deck_read (ADR 0058)');
  assert.match(auditor, /^## Owning the thread$/m);
  assert.ok(auditor.indexOf('## Owning the thread') < auditor.indexOf('## Report'), 'Owning the thread comes before Report');
  assert.doesNotMatch(skill, /deck_post|deck_wait|deck_reply|deck_resolve/, 'the skill touches no deck tool');
  assert.match(skill, /audit-after\.txt/, 'the skill keeps the after snapshot');
  assert.match(skill, /audit save/, 'and audit save');
  assert.match(skill, /differs/, 'and hands the auditor the lines that differ');
});
