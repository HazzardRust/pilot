/**
 * A walkthrough's fields are general (deck-press-feedback spec 17, 18, L10): `url` is any
 * locator, `login` how to reach it, `screens` one step per action, and `dir` the absolute
 * working directory its commands run from, drawn first as "working directory:" in `<code>`.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

import { KIND_WALKTHROUGH } from '../items.mjs';
import { listItems, postItem } from '../store.mjs';
import { TOOLS } from '../tools.mjs';
import { renderThreadPage } from '../ui/render.mjs';
import { tempDeck } from '../testUtils.mjs';

const { callTool } = await import('../server.mjs');

const REPO = path.join(os.tmpdir(), 'pilot-walkthrough-repo');
const WORKDIR = path.resolve(os.tmpdir(), 'cli-project');
const walkthrough = (fields) => ({ kind: KIND_WALKTHROUGH, title: 'Try the CLI', body: 'Run it.', repo: REPO, ...fields });
const detailOf = (page) => page.match(/<dl class="detail">.*?<\/dl>/s)?.[0] ?? '';
const labelsIn = (detail) => [...detail.matchAll(/<dt>([^<]*)<\/dt>/g)].map((match) => match[1]);

test('a walkthrough posted with dir is stored and shows working directory first', (t) => {
  tempDeck(t);
  callTool('deck_post', walkthrough({ dir: WORKDIR, url: 'bin/cli.mjs', screens: ['run `cli --help` -> usage prints'] }));
  const item = listItems().find((each) => each.kind === KIND_WALKTHROUGH);
  assert.equal(item.dir, WORKDIR, 'dir is stored on the walkthrough');
  assert.equal(item.repo, REPO, "a walkthrough's dir does not refile it");
  const detail = detailOf(renderThreadPage(item, [item], []));
  assert.equal(labelsIn(detail)[0], 'working directory:');
  assert.ok(detail.includes(`<dt>working directory:</dt><dd><code>${WORKDIR}</code></dd>`), detail);
});

test('one posted without dir shows no empty row', (t) => {
  tempDeck(t);
  const item = postItem(walkthrough({ url: 'http://127.0.0.1:3000/' }));
  const detail = detailOf(renderThreadPage(item, [item], []));
  assert.deepEqual(labelsIn(detail), ['URL']);
  assert.doesNotMatch(detail, /working directory/);
});

test('a relative dir is refused with a reason', (t) => {
  tempDeck(t);
  assert.throws(() => postItem(walkthrough({ dir: 'some/relative/dir' })), /dir must be an absolute path/);
});

test('a file-path url renders as escaped text', (t) => {
  tempDeck(t);
  const item = postItem(walkthrough({ url: 'C:\\work\\out<b>.png', dir: 'C:\\work\\<img src=x>' }));
  const detail = detailOf(renderThreadPage(item, [item], []));
  assert.ok(detail.includes('<dd>C:\\work\\out&lt;b&gt;.png</dd>'), detail);
  assert.ok(detail.includes('<dd><code>C:\\work\\&lt;img src=x&gt;</code></dd>'), 'a hostile dir is escaped');
  assert.doesNotMatch(detail, /<a |<img/);
});

test('the deck_post schema says nothing of browser or http', () => {
  const post = TOOLS.find((tool) => tool.name === 'deck_post');
  const { url, login, screens, dir } = post.inputSchema.properties;
  assert.doesNotMatch(post.description, /browser/i);
  for (const field of [url, login, screens, dir]) assert.doesNotMatch(field.description, /browser|http/i);
  assert.match(dir.description, /walkthrough/);
  assert.equal(post.inputSchema.properties.workdir, undefined, 'no new workdir property (L10)');
});
