// co-pilot-tickets S4 (spec 2, 6, 7; L12): the live scope asks for deck_ticket, `pilot tickets` and
// /api/tickets, and no old name answers. The old names are spelt apart so the live grep stays clean.
import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = path.join(ROOT, 'bin', 'pilot.mjs');
const OLD = 'ta' + 'sk';
const utils = await import('../testUtils.mjs');
const { callTool } = await import('../server.mjs');
const { TOOLS } = await import('../tools.mjs');
const { recordFields } = await import('../runs.mjs');
const { listItems, registerRun } = await import('../store.mjs');
const { renderHomePage } = await import('../ui/render.mjs');
const { checkReferences } = await import('../../scripts/check-references.mjs');

const aRepo = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-tickets-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};
const pilot = (args, cwd, base) =>
  new Promise((resolve) => {
    const env = { ...process.env, PILOT_DECK_PORT: new URL(base).port };
    execFile(process.execPath, [CLI, ...args], { cwd, env }, (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr }));
  });

test('the tool is deck_ticket', (t) => {
  utils.tempDeck(t);
  const names = TOOLS.map(({ name }) => name);
  assert.ok(names.includes('deck_ticket'));
  assert.ok(!names.includes(`deck_${OLD}`), 'no alias (L12)');
  const ticket = utils.aTicket('fix the thing', 'red');
  assert.match(callTool('deck_ticket', { id: ticket.id, action: 'take' }).content[0].text, new RegExp(`Took ${ticket.id}: live`));
  assert.match(callTool('deck_ticket', { id: ticket.id, action: 'park' }).content[0].text, new RegExp(`Parked ${ticket.id}`));
  assert.throws(() => callTool(`deck_${OLD}`, { id: ticket.id, action: 'take' }), /no tool named/);
});

test('a refusal names the field as the caller passes it', () => {
  assert.throws(() => recordFields({ slug: 'x', ticket: 'x' }), /\bticket must be the ticket.s item id/);
  assert.match(TOOLS.find(({ name }) => name === 'deck_post').description, /branch, ticket;/);
});

test('the CLI prints tickets', async (t) => {
  const base = await utils.deckOnAPort(t);
  const repo = aRepo(t);
  utils.takeLive(utils.aTicket('the live one', 'red', repo).id);
  utils.aTicket('the next one', 'red', repo);
  const listed = await pilot(['tickets'], repo, base);
  assert.equal(listed.code, 0, listed.stderr);
  assert.match(listed.stdout, /the live one[\s\S]*the next one/);
  const old = await pilot([`${OLD}s`], repo, base);
  assert.equal(old.code, 1);
  assert.match(old.stderr, new RegExp(`there is no "${OLD}s" command`));
});

test('the route answers', async (t) => {
  const base = await utils.deckOnAPort(t);
  const repo = aRepo(t);
  const live = utils.takeLive(utils.aTicket('the live one', 'red', repo).id);
  utils.aTicket('the next one', 'red', repo);
  const view = await (await fetch(`${base}/api/tickets?repo=${encodeURIComponent(repo)}`)).json();
  assert.equal(view.live.id, live.id);
  assert.deepEqual(view.red.map((item) => item.title), ['the next one']);
  assert.equal((await fetch(`${base}/api/${OLD}s?repo=${encodeURIComponent(repo)}`)).status, 404, 'no alias (L12)');
  const page = renderHomePage(listItems(), [registerRun({ repo, pid: process.pid })], repo);
  assert.match(page, /<details class="tab" id="tickets">/);
  assert.match(page, /data-live="tickets" data-name="Tickets"/);
});

test("Claude Code's names stay", () => {
  const granted = (agent) => /^tools:(.*)$/m.exec(fs.readFileSync(path.join(ROOT, 'agents', agent), 'utf8'))[1];
  for (const agent of ['pilot.md', 'pilot-implementer.md', 'pilot-qa.md']) {
    for (const name of ['TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet']) assert.match(granted(agent), new RegExp(`\\b${name}\\b`), agent);
  }
  for (const agent of ['pilot.md', 'pilot-co-pilot.md']) assert.match(granted(agent), /\bTaskOutput, TaskStop\b/, agent);
  assert.match(granted('pilot-architect.md'), /mcp__plugin_pilot_deck__deck_ticket\b/);
});

test('check-references binds the new names', () => {
  const { ok, failures } = checkReferences(ROOT);
  assert.deepEqual(failures, []);
  assert.ok(ok);
  assert.ok(fs.existsSync(path.join(ROOT, 'skills', 'ticket-making', 'SKILL.md')));
  const grep = (pattern) => spawnSync('git', ['grep', '-c', pattern, '--', 'agents', 'skills', 'rules'], { cwd: ROOT, encoding: 'utf8' }).stdout;
  for (const name of ['ticket-making', 'mcp__plugin_pilot_deck__deck_ticket', '`pilot tickets']) assert.notEqual(grep(name), '', name);
});
