/**
 * The deck's secret (deck-token S1, spec 1, 2, 4; L2, L6): `hooks/lib/deck-secret.js`, the one
 * place the store dir, the secret file and the header are spelt. No assertion here prints a
 * value: a test compares what it reads and says only whether they matched.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureSecret, readSecret, secretFile } from '../../hooks/lib/deck-secret.js';
import { tempDeck } from '../testUtils.mjs';

const SECRET_MODULE = fileURLToPath(new URL('../../hooks/lib/deck-secret.js', import.meta.url));

const scratchDir = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-secret-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};

/** A process that calls `ensureSecret(dir)` at `startAt` and exits 0 when what it got is what the file holds. */
const racer = (dir, startAt) =>
  new Promise((resolve, reject) => {
    const script = `
      const { ensureSecret } = require(${JSON.stringify(SECRET_MODULE)});
      const fs = require('fs');
      while (Date.now() < ${startAt}) {}
      const got = ensureSecret(${JSON.stringify(dir)});
      const held = fs.readFileSync(${JSON.stringify(path.join(dir, 'deck.secret'))}, 'utf8');
      process.exit(got === held ? 0 : 3);
    `;
    const child = spawn(process.execPath, ['-e', script], { stdio: 'ignore', windowsHide: true });
    child.on('error', reject);
    child.on('exit', resolve);
  });

test('the secret is created once, 0600, and reused', async (t) => {
  const dir = scratchDir(t);

  const first = ensureSecret(dir);
  assert.ok(/^[0-9a-f]{64}$/.test(first), 'the secret is 32 bytes as hex');
  assert.ok(ensureSecret(dir) === first, 'a second call reads the same value rather than making a new one');
  assert.ok(readSecret(dir) === first, 'readSecret reads the value ensureSecret made');
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(secretFile(dir)).mode & 0o777, 0o600, 'only the user can read it');
  }

  const raced = scratchDir(t);
  const startAt = Date.now() + 400;
  const codes = await Promise.all([racer(raced, startAt), racer(raced, startAt), racer(raced, startAt)]);
  assert.deepEqual(codes, [0, 0, 0], 'every racer took the one value the file holds');
});

test('a missing secret names the file', (t) => {
  const dir = scratchDir(t);

  assert.throws(() => readSecret(dir), (err) => err.message.includes(secretFile(dir)));
  assert.equal(fs.existsSync(secretFile(dir)), false, 'reading never creates it');
});

test('the default dir is PILOT_DECK_DIR, as the store has it', (t) => {
  const dir = tempDeck(t);

  assert.equal(secretFile(), path.join(dir, 'deck.secret'));
});

test('a scratch deck has its own secret', (t) => {
  const user = tempDeck(t);
  const scratch = scratchDir(t);

  const users = ensureSecret();
  const scratchs = ensureSecret(scratch);
  assert.ok(users !== scratchs, 'the scratch dir has a secret of its own');
  assert.ok(readSecret(user) === users, "and the user's is untouched by it");
});
