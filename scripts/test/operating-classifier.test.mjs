/**
 * docs/OPERATING.md's "What the classifier is told" section (classifier-env spec 7): it quotes the
 * switch S1 exports, the command that shows the merged block, and the "$defaults" entry.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { CLASSIFIER_SWITCH } from '../../deck/run-env.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const doc = fs.readFileSync(path.join(ROOT, 'docs', 'OPERATING.md'), 'utf8');

function section() {
  const start = doc.indexOf('\n## What the classifier is told\n');
  assert.notEqual(start, -1, 'docs/OPERATING.md has no "## What the classifier is told" section');
  const rest = doc.slice(start + 1);
  const next = rest.slice(2).search(/\n## /);
  return next === -1 ? rest : rest.slice(0, next + 2);
}

// lint: the section names the switch, the check command and "$defaults"
test('the section names the switch and the check', () => {
  const s = section();
  assert.ok(s.includes(`\`${CLASSIFIER_SWITCH}\`=off`), `section does not quote \`${CLASSIFIER_SWITCH}\`=off`);
  assert.match(s, /claude --settings[^\n]*auto-mode config/);
  assert.ok(s.includes('"$defaults"'), 'section does not name "$defaults"');
});
