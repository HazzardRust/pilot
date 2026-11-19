'use strict';

/**
 * crew-refusals spec 2 (A1, L2): inside a `node --test` run the deck store refuses to resolve the
 * user's real store, `<os.userInfo().homedir>/.claude/pilot`, which no environment variable moves,
 * so a test that forgot to isolate itself throws instead of writing to somebody's live deck.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { deckDir } = require('../lib/deck-secret.js');

const realStore = path.join(os.userInfo().homedir, '.claude', 'pilot');

/** Sets the given variables for one test (undefined deletes one) and puts every one back after it. */
function withEnv(t, vars) {
  for (const [name, value] of Object.entries(vars)) {
    const previous = process.env[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
  }
}

test('a test run cannot resolve the real store', (t) => {
  assert.ok(process.env.NODE_TEST_CONTEXT, 'this file runs under node --test');
  const realHome = os.userInfo().homedir;
  withEnv(t, { HOME: realHome, USERPROFILE: realHome, PILOT_DECK_DIR: undefined });
  assert.throws(() => deckDir(), (err) => {
    assert.equal(err.message, 'a test run may not use the real deck store: ' + realStore);
    return true;
  });
});

test('a test run cannot name the real store through PILOT_DECK_DIR either', (t) => {
  withEnv(t, { PILOT_DECK_DIR: realStore });
  assert.throws(() => deckDir(), /a test run may not use the real deck store/);
});

test("a test's own store still resolves", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-deck-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  withEnv(t, { PILOT_DECK_DIR: dir });
  assert.equal(deckDir(), dir);
});

test('the suite home under testUtils still resolves', async (t) => {
  // Loading testUtils redirects HOME and USERPROFILE to a suite home and unsets PILOT_DECK_DIR.
  withEnv(t, { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, PILOT_DECK_DIR: process.env.PILOT_DECK_DIR });
  await import('../../deck/testUtils.mjs');
  // testUtils points HOME and USERPROFILE at the same suite home, so either names it.
  assert.equal(deckDir(), path.join(process.env.HOME, '.claude', 'pilot'));
  assert.notEqual(deckDir(), realStore);
});
