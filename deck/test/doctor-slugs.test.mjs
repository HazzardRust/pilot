/**
 * The `slugs` row (two-devices S2, spec 2b; L5): each `docs/design/<slug>/` an open ticket of this deck names,
 * minus this deck's own run records, checked for a clash with S1's `slugClashes`. Git runs against a scratch bare
 * origin and the Host is a stub; nothing reaches a real forge or the real deck.
 */

// The fixture seam imports fake-home.mjs first and gives every git below its identity.
import { gitFixture } from '../../scripts/test/lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { heldSlugs, slugsRow } from '../doctor.mjs';

const run = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** A bare origin holding only `main`, and a clone of it. */
function buildOrigin(root) {
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  run(root, 'init', '--bare', '-q', '-b', 'main', origin);
  run(root, 'clone', '-q', origin, work);
  fs.writeFileSync(path.join(work, 'base.txt'), 'base\n');
  run(work, 'add', 'base.txt');
  run(work, 'commit', '-q', '-m', 'base');
  run(work, 'push', '-q', 'origin', 'HEAD:refs/heads/main');
  return { origin, work };
}

/** The scratch clone's git, recording every argv. */
function repo(t) {
  const { work } = gitFixture(t, 'doctor-slugs:origin', buildOrigin);
  const calls = [];
  const git = (args) => {
    calls.push(args);
    return run(work, ...args);
  };
  return { work, git, calls };
}

/** A `hostFor` answering a stub Host whose open reviews are `open`, and recording that it was asked. */
function hostWith(open) {
  const asked = [];
  const hostFor = (cwd, { git }) => {
    asked.push(cwd);
    return { cli: 'gh', reviews: (query) => open.filter((review) => review.head === query.head && query.state === 'open') };
  };
  return { asked, hostFor };
}

const ticket = (body) => ({ id: 'itm_1', title: 't', state: 'red', body });

test('a held slug that clashes fails the row', (t) => {
  const { work, git } = repo(t);
  const { hostFor } = hostWith([{ number: 12, state: 'open', head: 'feat/x' }]);
  const view = { open: [ticket('The design is at docs/design/x/architecture.md.')], records: [] };

  const row = slugsRow({ view, git, hostFor, cwd: work });

  assert.equal(row.name, 'slugs');
  assert.equal(row.verdict, 'fail');
  assert.ok(row.steps.some((step) => step.includes('PR #12')), `a step names the PR: ${JSON.stringify(row.steps)}`);
});

test("the deck's own run is not a clash", () => {
  const view = { open: [ticket('see docs/design/x/brief.md')], records: [{ slug: 'x' }] };

  assert.deepEqual(heldSlugs(view), []);
});

test('held slugs come once each, in the order the bodies name them', () => {
  const view = { open: [ticket('docs/design/a/S1.md and docs/design/b/S2.md'), ticket('docs/design/a/brief.md')], records: [] };

  assert.deepEqual(heldSlugs(view), ['a', 'b']);
});

test('nothing held passes', () => {
  const calls = [];
  const git = (args) => (calls.push(args), '');
  const { asked, hostFor } = hostWith([]);
  const view = { open: [ticket('no design path here')], records: [] };

  const row = slugsRow({ view, git, hostFor, cwd: '.' });

  assert.equal(row.verdict, 'pass');
  assert.equal(calls.length, 0, 'no git call');
  assert.equal(asked.length, 0, 'no host read');
});

test('a body slug off SLUG is dropped', () => {
  const view = { open: [ticket('docs/design/--x/brief.md')], records: [] };

  assert.deepEqual(heldSlugs(view), []);
});

test('a malformed view holds nothing and never throws', () => {
  assert.deepEqual(heldSlugs({ open: { body: 'docs/design/x/' }, records: 'x' }), []);
  assert.deepEqual(heldSlugs({ open: [null, ticket('docs/design/y/')], records: [null] }), ['y']);
});

test('a deck that was not read cannot tell', () => {
  const calls = [];
  const git = (args) => (calls.push(args), '');

  const row = slugsRow({ view: null, git, hostFor: hostWith([]).hostFor, cwd: '.' });

  assert.equal(row.verdict, 'cannot tell');
  assert.equal(calls.length, 0);
});
