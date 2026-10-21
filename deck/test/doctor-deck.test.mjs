/**
 * Slice S6 of daemon-lifecycle: `pilot doctor` says who holds the deck's port and whether the
 * running deck is out of date (spec 11). Every deck here is this test's own, on a port the
 * operating system has just handed out; nothing may touch port 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { checkAll } from '../doctor.mjs';
import { deckOnAPort, freePort } from '../testUtils.mjs';
import { DECK_PORT } from '../tools.mjs';
import { PLUGIN_VERSION } from '../version.mjs';

/** Every local probe faked to pass, so a test changes only the deck rows; nothing real runs. */
function passing(overrides = {}) {
  return {
    platform: 'linux',
    run: () => assert.fail('no Defender probe off Windows'),
    root: '/home/dev/projects',
    nodeVersion: '22.8.0',
    engines: '>=22.8.0',
    resolveDep: () => true,
    storeDir: '/home/dev/.claude/pilot',
    canWrite: () => true,
    onPath: () => true,
    ...overrides,
  };
}
const portRow = (rows) => rows.find((r) => r.name.startsWith('port ')) ?? assert.fail(`no port row in ${rows.map((r) => r.name)}`);
const versionRow = (rows) => rows.find((r) => r.name === 'deck version') ?? assert.fail(`no deck version row in ${rows.map((r) => r.name)}`);

test('a free port passes', async () => {
  const port = await freePort();
  const row = portRow(await checkAll(passing({ url: `http://127.0.0.1:${port}` })));
  assert.equal(row.name, `port ${port}`);
  assert.equal(row.verdict, 'pass');
  assert.match(row.detail, /free/);
  assert.equal(versionRow(await checkAll(passing({ url: `http://127.0.0.1:${port}` }))).verdict, 'pass');
});

test('our deck on the port passes with its pid', async (t) => {
  const url = await deckOnAPort(t);
  const rows = await checkAll(passing({ url }));
  assert.equal(portRow(rows).verdict, 'pass');
  assert.match(portRow(rows).detail, new RegExp(`our deck, pid ${process.pid}\\b`));
  assert.equal(versionRow(rows).verdict, 'pass');
});

test('a stranger on the port fails', async (t) => {
  const server = http.createServer((request, response) => response.end('<h1>hello</h1>'));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const rows = await checkAll(passing({ url: `http://127.0.0.1:${server.address().port}` }));
  assert.equal(portRow(rows).verdict, 'fail');
  assert.match(portRow(rows).detail, /held by another program/);
  assert.equal(versionRow(rows).verdict, 'pass');
});

test('an older deck fails the version row', async () => {
  const probe = async () => ({ state: 'deck', pid: 7, version: '0.9.0' });
  const rows = await checkAll(passing({ url: 'http://127.0.0.1:1', probe }));
  const row = versionRow(rows);
  assert.equal(row.verdict, 'fail');
  assert.equal(row.detail, `0.9.0 is older than the plugin's ${PLUGIN_VERSION}; the next session replaces it`);
  assert.equal(portRow(rows).verdict, 'pass');
});

const rootRow = (rows) => rows.find((r) => r.name === 'deck root') ?? assert.fail(`no deck root row in ${rows.map((r) => r.name)}`);
const rootRowFor = async (found, port = DECK_PORT) =>
  rootRow(await checkAll(passing({ url: `http://127.0.0.1:${port}`, probe: async () => ({ state: 'deck', pid: 4242, version: PLUGIN_VERSION, ...found }) })));

test('a checkout deck fails with the restart', async () => {
  const row = await rootRowFor({ root: '/work/pilot', checkout: true });
  assert.equal(row.verdict, 'fail');
  assert.match(row.detail, /serves from checkout \/work\/pilot/);
  assert.match(row.detail, /taskkill \/PID 4242 \/F \(kill 4242 off Windows\), then pilot deck/);
});

test('a checkout deck on another port has no root row', async () => {
  const probe = async () => ({ state: 'deck', pid: 4242, version: PLUGIN_VERSION, root: '/work/pilot', checkout: true });
  const rows = await checkAll(passing({ url: 'http://127.0.0.1:4999', probe }));
  assert.equal(rows.some((r) => r.name === 'deck root'), false);
});

test('an installed deck passes', async () => {
  const row = await rootRowFor({ root: '/home/dev/.claude/plugins/pilot', checkout: false });
  assert.equal(row.verdict, 'pass');
  assert.equal(row.detail, 'installed, /home/dev/.claude/plugins/pilot');
});

test('a deck from before the feature fails', async () => {
  const row = await rootRowFor({});
  assert.equal(row.verdict, 'fail');
  assert.match(row.detail, /no root reported/);
  assert.match(row.detail, /taskkill \/PID 4242 \/F \(kill 4242 off Windows\), then pilot deck/);
});

test('a current deck passes the version row', async () => {
  const probe = async () => ({ state: 'deck', pid: 7, version: PLUGIN_VERSION });
  const row = versionRow(await checkAll(passing({ url: 'http://127.0.0.1:1', probe })));
  assert.equal(row.verdict, 'pass');
  assert.match(row.detail, new RegExp(PLUGIN_VERSION.replaceAll('.', '\\.')));
});
