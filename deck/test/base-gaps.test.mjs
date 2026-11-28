/**
 * S3 of landed-pr-closed (spec 4, A3): a gate1 carries a `Base: <base>` line matching its ticket's run record, so the
 * user sees at Gate 1 what the run was cut from. Read off the body, so `postItem` refuses before it writes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { baseGate1Gaps } from '../gate2-evidence.mjs';

const REPO = path.resolve('D:/work/base');
const TICKET = { id: 'itm_aaaaaaaaaaaa', repo: REPO };
const records = (base) => [
  { repo: REPO, record: { slug: 'other', ticket: 'itm_bbbbbbbbbbbb', base: 'main' } },
  { repo: REPO, record: { slug: 'x', ticket: TICKET.id, ...(base === undefined ? {} : { base }) } },
];

test('a gate1 with no base line is refused', () => {
  const gaps = baseGate1Gaps(records('hazzardrust-pilot'), TICKET, 'The design.\nFonts: Inter');
  assert.equal(gaps.length, 1);
  assert.match(gaps[0], /`Base: hazzardrust-pilot`/, "the gap names the record's base");
});

test('a gate1 naming another base is refused', () => {
  const gaps = baseGate1Gaps(records('hazzardrust-pilot'), TICKET, 'The design.\nBase: main');
  assert.equal(gaps.length, 1);
  assert.match(gaps[0], /`Base: hazzardrust-pilot`/);
});

test('a matching base line is accepted', () => {
  assert.deepEqual(baseGate1Gaps(records('hazzardrust-pilot'), TICKET, 'The design.\nBase: hazzardrust-pilot'), []);
  assert.deepEqual(baseGate1Gaps(records(undefined), TICKET, 'Base: pilot'), [], 'any base while the record has none');
  assert.equal(baseGate1Gaps(records(undefined), TICKET, 'The design.').length, 1, 'still owes a line while the record has none');
});
