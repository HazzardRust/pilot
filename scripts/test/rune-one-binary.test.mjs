import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// Every integration-test target cargo discovers under tests/: top-level *.rs and */main.rs.
function runeTestTargets(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => {
      if (e.isFile() && e.name.endsWith('.rs')) return [e.name];
      if (e.isDirectory() && existsSync(join(dir, e.name, 'main.rs'))) return [`${e.name}/main.rs`];
      return [];
    })
    .sort();
}

test("the Rune deck's tests build one test binary", () => {
  const real = fileURLToPath(new URL('../../deck/rune/tests', import.meta.url));
  assert.deepEqual(runeTestTargets(real), ['deck/main.rs']);

  const scratch = mkdtempSync(join(tmpdir(), 'rune-targets-'));
  try {
    mkdirSync(join(scratch, 'deck'));
    writeFileSync(join(scratch, 'deck', 'main.rs'), '');
    writeFileSync(join(scratch, 'foo.rs'), '');
    const targets = runeTestTargets(scratch);
    assert.equal(targets.length, 2);
    assert.ok(targets.includes('foo.rs'), 'a stray top-level file is named');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
