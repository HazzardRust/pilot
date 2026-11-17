#!/usr/bin/env node
/**
 * handoff-books S1 (spec 4-6; L4, A3, A4): the SessionStart lane counts each hand-off it claims in the
 * repository's audit record, and the hand-off that makes the audit due says so in one line of its notice.
 *
 * Each test runs the hook against a real deck on a port the system hands out, in a scratch store
 * (`PILOT_DECK_DIR`, set by `deckOnAPort`) and a scratch home, never the user's.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const lane = require('../session-handoff.js');

const PILOT = path.join(__dirname, '..', '..', 'bin', 'pilot.mjs');

/** A home and a repository of this test's own; the environment it changes restored after. */
function scratch(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-books-home-'));
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-books-repo-'));
  const before = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    PILOT_DECK_PORT: process.env.PILOT_DECK_PORT,
    CLAUDE_PROJECT_DIR: process.env.CLAUDE_PROJECT_DIR,
  };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  delete process.env.CLAUDE_PROJECT_DIR;
  t.after(function () {
    for (const name of Object.keys(before)) {
      if (before[name] === undefined) delete process.env[name];
      else process.env[name] = before[name];
    }
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
  });
  return repo;
}

/** A real deck on a port with one hand-off posted from `repo`, and the audit module on the same store. */
async function aHandoff(t) {
  await import('../../deck/test/no-open.mjs');
  const utils = await import('../../deck/testUtils.mjs');
  const store = await import('../../deck/store.mjs');
  const audit = await import('../../deck/audit.mjs');
  const base = await utils.deckOnAPort(t);
  const repo = scratch(t);
  process.env.PILOT_DECK_PORT = new URL(base).port;
  const stash = store.postItem({ kind: 'handoff', title: 'Handoff', body: 'At the mark.', repo: repo });
  return { repo: repo, stash: stash, audit: audit };
}

function starting(repo) {
  return {
    session_id: '2600840c-2a13-45b7-87fc-00000000book',
    transcript_path: path.join(os.tmpdir(), 'transcript.jsonl'),
    cwd: repo,
    hook_event_name: 'SessionStart',
    source: 'clear',
  };
}

const contextOf = (answer) => answer.payload.hookSpecificOutput.additionalContext;
const dueLines = (context) => context.split('\n').filter(function (line) { return line === lane.AUDIT_DUE; }).length;

test('the lane counts a claimed hand-off and pilot audit due reads it', async function (t) {
  const h = await aHandoff(t);
  h.audit.recordOffer(h.repo, 'earlier-run');

  const answer = await lane.run(starting(h.repo));
  assert.ok(contextOf(answer).includes('--- end ' + h.stash.id + ' ---'), 'the hand-off is delivered');

  const due = spawnSync(process.execPath, [PILOT, 'audit', 'due'], {
    cwd: h.repo,
    env: Object.assign({}, process.env, { PILOT_DECK_NO_OPEN: '1' }),
    encoding: 'utf8',
  });
  assert.strictEqual(due.stdout.trim(), 'not due 1', due.stderr);
  assert.strictEqual(due.status, 1);
});

/** The lane's context for the nth hand-off since an offer: n - 1 already counted, then this one claimed. */
async function nthHandoff(t, n) {
  const h = await aHandoff(t);
  h.audit.recordOffer(h.repo, 'earlier-run');
  for (let i = 1; i < n; i += 1) h.audit.countHandoff(h.repo, 'itm_before' + i);
  return contextOf(await lane.run(starting(h.repo)));
}

test("the 20th hand-off's notice says the audit is due, the 19th's does not", async function (t) {
  await t.test('the 20th', async function (inner) {
    assert.strictEqual(dueLines(await nthHandoff(inner, 20)), 1);
  });
  await t.test('the 19th', async function (inner) {
    assert.strictEqual(dueLines(await nthHandoff(inner, 19)), 0);
  });
});

test('a count that fails is a log line, and the hand-off is still delivered', async function (t) {
  const h = await aHandoff(t);
  h.audit.recordOffer(h.repo, 'earlier-run');
  const [dir] = fs.readdirSync(path.join(process.env.PILOT_DECK_DIR, 'audits'));
  fs.writeFileSync(path.join(process.env.PILOT_DECK_DIR, 'audits', dir, 'record.json'), '{"offers": [');

  const context = contextOf(await lane.run(starting(h.repo)));
  assert.ok(context.includes('--- end ' + h.stash.id + ' ---'), 'the notice is delivered');
  assert.strictEqual(dueLines(context), 0);
});
