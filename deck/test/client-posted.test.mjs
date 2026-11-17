/**
 * handoff-mod S5, spec 9 (L12, A6): a finish that chains posts a hand-off from the daemon, so the session that
 * finished learns which one only from `deck_status`'s answer. Its own MCP client reads `; chained <id>` there and
 * writes S1's posted stamp for its session, so that session's mod, and no other's, clears for it.
 *
 * Every test takes its own scratch home; nothing here touches the user's claims.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { notePosted } = await import('../client.mjs');

const scratchHome = (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-posted-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
};
const claimsOf = (home) => path.join(home, '.claude', 'pilot-inbox', 'claims');

test('the client stamps a chained id for its session', (t) => {
  const home = scratchHome(t);
  const answer = 'D1: 0 slices saved; no mirror; chained itm_0a1b2c.';

  const stamped = notePosted(answer, { env: { CLAUDE_PID: '4242' }, ppid: 7, home });

  assert.equal(stamped, 'itm_0a1b2c');
  assert.equal(fs.readFileSync(path.join(claimsOf(home), 'posted-4242.stamp'), 'utf8'), 'itm_0a1b2c');
  assert.deepEqual(fs.readdirSync(claimsOf(home)), ['posted-4242.stamp'], 'one stamp, for this session only');
});

test('an answer without a well-shaped id stamps nothing', (t) => {
  const home = scratchHome(t);

  for (const answer of [
    'D1: 0 slices saved; no mirror; chained itm_X;rm -rf.',
    'D1: 0 slices saved; no mirror; chained ../itm_0a1b.',
    'D1: 0 slices saved; no mirror; chained itm_.',
    'D1: 0 slices saved; no mirror; took itm_0a1b2c live here.',
    'D1: 0 slices saved; no mirror.',
    '',
  ]) {
    assert.equal(notePosted(answer, { env: { CLAUDE_PID: '4242' }, ppid: 7, home }), null, answer);
  }
  assert.equal(fs.existsSync(path.join(claimsOf(home), 'posted-4242.stamp')), false, 'no file');
  assert.equal(fs.existsSync(path.join(claimsOf(home), 'posted-7.stamp')), false, 'no file under the parent either');
});
