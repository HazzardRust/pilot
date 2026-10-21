/**
 * crew-voice-rules S10 (spec 9; L1, L16): a language rule sends an agent only to a file
 * or a skill this package ships. `rules/common/` was retired in 0.7.0, and most of the
 * `See skill:` names were the upstream's skills, never copied here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkProvenance, parseHeader } from '../check-provenance.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Every markdown file under a language directory of rules/, relative to the root. */
function languageFiles() {
  const files = [];
  for (const entry of fs.readdirSync(path.join(ROOT, 'rules'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const name of fs.readdirSync(path.join(ROOT, 'rules', entry.name))) {
      if (name.endsWith('.md')) files.push(`rules/${entry.name}/${name}`);
    }
  }
  return files;
}

/** The cells of `rel`'s row under `## Vendored files` in vendor/toolbox.md. */
function ledgerRow(rel) {
  const line = read('vendor/toolbox.md').split('\n').find((row) => row.startsWith(`| \`${rel}\` |`));
  assert.ok(line, `${rel} has no ledger row`);
  return line.slice(1, -1).split('|').map((cell) => cell.trim());
}

test('no language rules file links into common/', () => {
  const dead = languageFiles().filter((rel) => /common\/[\w-]+\.md/.test(read(rel)));
  assert.deepEqual(dead, []);
});

test('check-provenance accepts the adapted rows', () => {
  const { ok, failures, vendored } = checkProvenance(ROOT, ['rules']);
  assert.ok(ok, failures.join('\n'));

  for (const rel of vendored) {
    const said = parseHeader(read(rel)).adapted;
    const [, , column, why] = ledgerRow(rel);
    if (said === 'verbatim') {
      assert.equal(column, 'verbatim', `${rel}: header says verbatim, ledger says ${column}`);
      continue;
    }
    assert.equal(column, 'yes', `${rel}: header names an adaptation, ledger says ${column}`);
    assert.ok(why.includes(said), `${rel}: ledger row does not say "${said}"`);
  }
});
