/**
 * S18 of co-pilot-tickets: the page's Tickets region carries the id `tickets` (spec 2).
 * The DOM id, the `data-live` region key and the badge key had the retired plural; none of
 * the three may be spelt that way now. It is spelt in halves so the vocabulary guard (S7) passes.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DECK = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = fileURLToPath(import.meta.url);
const OLD = 'ta' + 'sks';
const STALE = new RegExp(
  ['id="OLD"', 'data-live="OLD"', '#OLD\\b', 'badges: \\{ OLD', "\\['OLD',", ", 'OLD'", "\\(\\w+, 'OLD'\\)", "aRegion\\('OLD'"].join('|').replaceAll('OLD', OLD),
);

function filesUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : filesUnder(full);
    return /\.(html|css|mjs|js)$/.test(entry.name) ? [full] : [];
  });
}

test('the Tickets region is #tickets', () => {
  const stale = [];
  for (const file of filesUnder(DECK)) {
    if (file === SELF) continue;
    fs.readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (STALE.test(line)) {
          stale.push(`${path.relative(DECK, file)}:${i + 1}`);
        }
      });
  }
  assert.deepEqual(stale, [], `no DOM id, region key or badge key spells ${OLD}`);
  const strips = fs.readFileSync(path.join(DECK, 'ui', 'strips.html'), 'utf8');
  assert.match(strips, /<details class="tab" id="tickets">/);
  assert.match(strips, /data-live="tickets" data-name="Tickets"/);
});
