/**
 * handoff-mod S8 (spec 3, 7): nothing writes or reads a turn stamp, and nothing reads the retired
 * wrapper's env name; the mod's `turn.complete` is the only turn signal. The scans read code under bin, deck,
 * hooks and scripts, never a test directory, where these names appear as fixtures.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCOPE = ['bin', 'deck', 'hooks', 'scripts'];

/** Every code file under `SCOPE`, test directories and node_modules skipped. */
function codeFiles() {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'test' && entry.name !== 'node_modules') walk(full);
      } else if (/\.(c|m)?js$/.test(entry.name)) {
        found.push(full);
      }
    }
  };
  for (const top of SCOPE) if (fs.existsSync(path.join(ROOT, top))) walk(path.join(ROOT, top));
  return found;
}

/** `path:line` of each line in scope matching `pattern`. */
function hits(pattern) {
  const out = [];
  for (const file of codeFiles()) {
    fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, i) => {
      if (pattern.test(line)) out.push(`${path.relative(ROOT, file)}:${i + 1}`);
    });
  }
  return out;
}

test('no stamp is read', async () => {
  const claim = await import('../run-claim.mjs');
  assert.equal('lastTurnEnded' in claim, false);
  assert.equal('lastToolRan' in claim, false);
  // lint: no-turn-stamps. `--turn-ended` is run-look's flag for the mod's turn.complete time, not a stamp.
  assert.deepEqual(hits(/(?<!-)\b(turn-ended|tool-ran)\b/), []);
});

test('no run env is read', () => {
  // lint: no-run-env
  assert.deepEqual(hits(/PILOT_RUN_(PID|REPO)/), []);
});
