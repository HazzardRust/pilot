import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { deckOnAPort, tempDeck } from '../testUtils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

test('the repository is its own marketplace and lists the pilot plugin at the root', () => {
  const marketplace = readJson('.claude-plugin/marketplace.json');
  const plugin = readJson('.claude-plugin/plugin.json');

  assert.equal(marketplace.name, 'pilot');
  assert.equal(marketplace.owner.name, 'HazzardRust');
  assert.equal(typeof marketplace.description, 'string');
  assert.ok(marketplace.description.length > 0, 'marketplace needs a description so `claude plugin validate .` is warning-free');
  assert.equal(marketplace.plugins.length, 1);
  assert.equal(marketplace.plugins[0].name, plugin.name, 'marketplace entry must name the plugin');
  assert.equal(marketplace.plugins[0].source, './', 'the repository root is the plugin');
});

test('the plugin declares the deck MCP server and the pinned Chrome DevTools MCP server', () => {
  const mcp = readJson('.mcp.json');

  assert.deepEqual(Object.keys(mcp.mcpServers).sort(), ['chrome-devtools', 'deck']);
  assert.equal(mcp.mcpServers.deck.command, 'node');
  assert.deepEqual(mcp.mcpServers.deck.args, ['${CLAUDE_PLUGIN_ROOT}/deck/client.mjs']);
  assert.ok(
    mcp.mcpServers['chrome-devtools'].args.includes('chrome-devtools-mcp@1.9.0'),
    'Chrome DevTools MCP is pinned to 1.9.0 (L7), never @latest',
  );
});

test('the pilot agent locates its own package through ${CLAUDE_PLUGIN_ROOT}', () => {
  // The stub this slice shipped pointed at the README, to prove the variable expands in
  // agent content at all (A5). Slice 6 replaced the stub with the real pilot, which
  // reaches its rules and skills the same way; the expansion is still what is asserted.
  const agent = fs.readFileSync(path.join(ROOT, 'agents', 'pilot.md'), 'utf8');
  assert.match(agent, /\$\{CLAUDE_PLUGIN_ROOT\}\/(?:rules|skills)\//);
});

test('the licence is MIT under the package owner', () => {
  const licence = fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8');
  assert.match(licence, /MIT License/);
  assert.match(licence, /Copyright \(c\) 2026 HazzardRust/);
});

// --- the store -------------------------------------------------------------

const { DeckRefusal, MAX_TEXT_BYTES, addReply, defaultStoreDir, listItems, postItem, storeFile } =
  await import('../store.mjs');

test('the store lives under ~/.claude/pilot, never in the repository', () => {
  assert.equal(defaultStoreDir(), path.join(os.homedir(), '.claude', 'pilot'));
  assert.ok(!path.relative(os.homedir(), defaultStoreDir()).startsWith('..'));
});

test('an item posted by the pilot is returned by the next read', (t) => {
  tempDeck(t);

  const posted = postItem({ kind: 'question', title: 'Port', body: 'Is 4321 free?' });

  assert.match(posted.id, /^itm_[0-9a-f]{12}$/);
  assert.deepEqual(posted.replies, []);
  assert.deepEqual(listItems(), [posted]);
});

test('a reply typed in the browser is returned by the next read', (t) => {
  tempDeck(t);
  const posted = postItem({ kind: 'question', title: 'Port', body: 'Is 4321 free?' });

  addReply(posted.id, 'yes, use it');

  const [item] = listItems();
  assert.equal(item.replies.length, 1);
  assert.equal(item.replies[0].text, 'yes, use it');
  assert.equal(item.replies[0].from, 'user');
});

test('reading a deck that has never been written returns no items', (t) => {
  tempDeck(t);
  assert.deepEqual(listItems(), []);
});

test('a write leaves no temporary file behind', (t) => {
  const dir = tempDeck(t);
  postItem({ kind: 'walkthrough', title: 'Slice 1', body: 'open the deck' });

  assert.deepEqual(fs.readdirSync(dir).sort(), [path.basename(storeFile()), 'deck.secret'].sort());
});

test('a corrupt store is reported, never silently discarded', (t) => {
  const dir = tempDeck(t);
  fs.writeFileSync(path.join(dir, path.basename(storeFile())), '{ not json', 'utf8');

  assert.throws(() => listItems(), /deck store .* is not readable JSON/);
});

test('a store that parses but is not a deck is reported, never read as empty', (t) => {
  tempDeck(t);
  fs.writeFileSync(storeFile(), '{}', 'utf8');

  assert.throws(() => listItems(), /deck store .* move it aside to start a fresh deck/s);
});

test('a store that holds a bare list is reported as not a deck', (t) => {
  tempDeck(t);
  fs.writeFileSync(storeFile(), '[]', 'utf8');

  assert.throws(() => listItems(), /holds \[\], which is not a deck/);
});

test('a store written by a newer deck is reported, never rewritten', (t) => {
  tempDeck(t);
  fs.writeFileSync(storeFile(), '{"version":4,"items":[]}', 'utf8');

  assert.throws(() => listItems(), /version 4.*reads version 3/s);
  assert.equal(fs.readFileSync(storeFile(), 'utf8'), '{"version":4,"items":[]}');
});

// Slice 1 refused any kind outside its list. Slice 3 opened kinds up (A11), so
// what is checked here is the rule that replaced the list: a kind must be a
// name. `deck/test/items.test.mjs` covers the other half — that a kind the deck
// has never heard of is still a perfectly good item.
test('an item kind that is not a name at all is refused', (t) => {
  tempDeck(t);
  assert.throws(
    () => postItem({ kind: 'a whole sentence, which is a body in the wrong field', title: 'x', body: 'y' }),
    /kind must be a short name/,
  );
  assert.throws(() => postItem({ kind: 42, title: 'x', body: 'y' }), /kind must be a non-empty string/);
});

test('a reply to an item that does not exist is refused', (t) => {
  tempDeck(t);
  assert.throws(() => addReply('itm_000000000000', 'hello'), /no item itm_000000000000/);
});

test('an item with an empty title or body is refused', (t) => {
  tempDeck(t);
  assert.throws(() => postItem({ kind: 'question', title: '  ', body: 'y' }), /title/);
  assert.throws(() => postItem({ kind: 'question', title: 'x', body: '' }), /body/);
});

test('a reply lands on the item it names and on no other', (t) => {
  tempDeck(t);
  const first = postItem({ kind: 'question', title: 'First question', body: 'one' });
  const second = postItem({ kind: 'question', title: 'Second question', body: 'two' });

  addReply(second.id, 'this answers the second');

  const [storedFirst, storedSecond] = listItems();
  assert.equal(storedFirst.id, first.id, 'the deck keeps its items oldest first');
  assert.deepEqual(storedFirst.replies, [], 'the first item must not collect the second one\'s reply');
  assert.equal(storedSecond.id, second.id);
  assert.deepEqual(
    storedSecond.replies.map((reply) => reply.text),
    ['this answers the second'],
  );
});

// --- A6: the deck refuses to store a credential ----------------------------

const CREDENTIALS = [
  ['an Anthropic-style key', 'use sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'],
  ['a GitHub token', 'token ghp_0123456789abcdefghijklmnopqrstuvwxyz'],
  ['an AWS access key id', 'AKIAIOSFODNN7EXAMPLE is the id'],
  ['a Slack token', 'xoxb-123456789012-1234567890123-abcdefghijklmnopqrstuvwx'], // gitleaks:allow
  ['a private key block', '-----BEGIN RSA PRIVATE KEY-----\nMIIE\n-----END RSA PRIVATE KEY-----'], // gitleaks:allow
  ['a named secret assignment', 'api_key = "s3cr3tv4lu3thatisverylong01"'], // gitleaks:allow
  ['a bearer header', 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc'],
  ['an unlabelled private key block', '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----'],
  ['a fine-grained GitHub token', 'github_pat_11ABCDE0A0aBcDeFgHiJkL_0123456789abcdefghijkLMNOP'],
  ['an AWS session key id', 'ASIAIOSFODNN7EXAMPLE was the temporary id'],
  ['an unspaced apikey assignment', 'apikey=abcdefghijklmnop0123'], // gitleaks:allow
  ['an unquoted secret assignment', 'secret = hunter2hunter2hunter2'],
  ['a token after a colon', 'token:abcdefghijklmnop0123'], // gitleaks:allow
];

/** The other half of A6: prose about credentials has to stay postable. */
const NOT_CREDENTIALS = [
  ['a bare sk- prefix in prose', 'the sk- prefix is how an Anthropic key starts'],
  ['a truncated key in a log line', 'it logged sk-abc123 and then gave up'],
];

for (const [what, text] of CREDENTIALS) {
  test(`posting ${what} is refused`, (t) => {
    tempDeck(t);
    assert.throws(() => postItem({ kind: 'question', title: 'Deploy', body: text }), DeckRefusal);
    assert.deepEqual(listItems(), [], 'nothing is written when a post is refused');
  });

  test(`replying with ${what} is refused`, (t) => {
    tempDeck(t);
    const posted = postItem({ kind: 'question', title: 'Deploy', body: 'which key?' });

    assert.throws(() => addReply(posted.id, text), DeckRefusal);
    assert.deepEqual(listItems()[0].replies, [], 'nothing is written when a reply is refused');
  });
}

test('ordinary review talk is not mistaken for a credential', (t) => {
  tempDeck(t);
  const body = [
    'PR #16 at 91cbb89, draft, walkthrough on http://localhost:3260/jobs',
    'the token field in the schema is nullable; secret rotation is slice 9',
    'const apiKey = process.env.PILOT_API_KEY;',
  ].join('\n');

  const posted = postItem({ kind: 'walkthrough', title: 'Slice 8', body });
  assert.equal(listItems()[0].body, posted.body);
});

for (const [what, text] of NOT_CREDENTIALS) {
  test(`posting ${what} is allowed`, (t) => {
    tempDeck(t);
    const posted = postItem({ kind: 'question', title: 'Deploy', body: text });
    assert.equal(listItems()[0].body, posted.body);
  });
}

// --- the browser round trip ------------------------------------------------

const { DECK_HOST, DECK_PORT, callTool, createDeckHttpServer, deckUrl } = await import('../server.mjs');

const postForm = (base, body) =>
  fetch(`${base}/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    redirect: 'manual',
  });

test('the deck page shows an item the pilot posted', async (t) => {
  const base = await deckOnAPort(t);
  postItem({ kind: 'question', title: 'Which port?', body: 'The deck wants 4321.' });

  const page = await (await fetch(base)).text();

  assert.match(page, /Which port\?/);
  assert.match(page, /The deck wants 4321\./);
});

test('the deck page comes back as a 200 of HTML', async (t) => {
  const base = await deckOnAPort(t);
  const response = await fetch(base);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
});

test('the deck binds the loopback interface, on the port the README names', async (t) => {
  assert.equal(DECK_HOST, '127.0.0.1', 'A4: the deck is loopback-only');
  assert.equal(DECK_PORT, 4321, 'A4: the port is fixed, and the README and statusline name it');

  tempDeck(t);
  const server = createDeckHttpServer();
  // The host is the module's, not this test's; only the port is 0, so a deck already
  // serving 4321 on this machine cannot make this fail.
  await new Promise((resolve) => server.listen(0, DECK_HOST, resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  assert.equal(server.address().address, '127.0.0.1', 'the socket is bound to loopback');
  assert.notEqual(server.address().address, '0.0.0.0', 'never every interface');
});

test('a reply larger than the deck accepts is refused with a reason the browser can read', async (t) => {
  const base = await deckOnAPort(t);
  const item = postItem({ kind: 'question', title: 'Which port?', body: '4321?' });

  const response = await postForm(
    base,
    new URLSearchParams({ id: item.id, text: 'x'.repeat(70 * 1024) }),
  );

  assert.equal(response.status, 400);
  assert.match(await response.text(), /longer than the deck accepts/);
  assert.deepEqual(listItems()[0].replies, [], 'nothing is written when the body is too big');
});

test('a store the deck cannot read reaches the browser as the store\'s own message', async (t) => {
  const base = await deckOnAPort(t);
  fs.writeFileSync(storeFile(), '{ not json', 'utf8');

  const response = await fetch(base);
  const body = await response.text();

  assert.equal(response.status, 500);
  assert.match(body, /is not readable JSON/);
  assert.match(body, /move it aside to start a fresh deck/);
});

test('a reply typed in the browser reaches the store and the page redirects back', async (t) => {
  const base = await deckOnAPort(t);
  const item = postItem({ kind: 'question', title: 'Which port?', body: '4321?' });

  const response = await postForm(base, new URLSearchParams({ id: item.id, text: 'yes, 4321' }));

  assert.equal(response.status, 303);
  // Slice 1 sent the browser back to the list; slice 3 sends it back to the
  // thread the reply was typed in, because an argument has a next message. The
  // fragment lands them at the reply box rather than at the top of the page.
  assert.equal(response.headers.get('location'), `/thread/${item.id}#reply`);
  assert.equal(listItems()[0].replies[0].text, 'yes, 4321');
});

test('an item and a reply are escaped, never rendered as HTML', async (t) => {
  const base = await deckOnAPort(t);
  const item = postItem({ kind: 'question', title: 'Escaping', body: '<script>alert(1)</script>' });
  await postForm(base, new URLSearchParams({ id: item.id, text: '<img onerror=alert(2)>' }));

  const page = await (await fetch(base)).text();

  assert.doesNotMatch(page, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(page, /<img onerror/);
  assert.match(page, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('a reply carrying a credential is refused with a reason, and nothing is stored', async (t) => {
  const base = await deckOnAPort(t);
  const item = postItem({ kind: 'question', title: 'Deploy', body: 'which key?' });

  const response = await postForm(
    base,
    new URLSearchParams({ id: item.id, text: 'use ghp_0123456789abcdefghijklmnopqrstuvwxyz' }),
  );

  assert.equal(response.status, 400);
  assert.match(await response.text(), /looks like a GitHub token/);
  assert.deepEqual(listItems()[0].replies, []);
});

test('a reply to an unknown item is refused rather than crashing the deck', async (t) => {
  const base = await deckOnAPort(t);
  const response = await postForm(base, new URLSearchParams({ id: 'itm_000000000000', text: 'hi' }));
  assert.equal(response.status, 400);
});

test('a reply posted with a mismatched Origin header is refused (cross-site drive-by)', async (t) => {
  const base = await deckOnAPort(t);
  const item = postItem({ kind: 'question', title: 'Which port?', body: '4321?' });

  const response = await fetch(`${base}/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'http://evil.example' },
    body: new URLSearchParams({ id: item.id, text: 'forged from another site' }),
    redirect: 'manual',
  });

  assert.equal(response.status, 403);
  assert.deepEqual(listItems()[0].replies, [], 'nothing is written when the origin does not match');
});

test('a reply posted with a matching Origin header is accepted', async (t) => {
  const base = await deckOnAPort(t);
  const item = postItem({ kind: 'question', title: 'Which port?', body: '4321?' });

  const response = await fetch(`${base}/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({ id: item.id, text: 'same origin' }),
    redirect: 'manual',
  });

  assert.equal(response.status, 303);
  assert.equal(listItems()[0].replies[0].text, 'same origin');
});

test('an unknown path is a 404, not a stack trace', async (t) => {
  const base = await deckOnAPort(t);
  const response = await fetch(`${base}/../etc/passwd`);
  assert.equal(response.status, 404);
});

// --- the Host header: DNS rebinding ----------------------------------------
//
// `fetch` will not let a caller set `Host`, and that is the whole point of these:
// only a request that names some other site in `Host` can be a rebinding attempt,
// so they are built on `node:http`, which lets the header be set.

const requestWithHost = (base, hostHeader, { path: urlPath = '/', method = 'GET', body = null } = {}) =>
  new Promise((resolve, reject) => {
    const headers = { host: hostHeader };
    if (body !== null) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      headers['content-length'] = Buffer.byteLength(body);
    }
    const request = http.request(
      // `setHost: false` or Node quietly replaces the header with the real one, and the
      // test then proves nothing: an empty Host would arrive as `127.0.0.1:<port>`.
      { hostname: '127.0.0.1', port: new URL(base).port, path: urlPath, method, headers, setHost: false },
      (response) => {
        let text = '';
        response.on('data', (chunk) => {
          text += chunk;
        });
        response.on('end', () => resolve({ status: response.statusCode, text }));
      },
    );
    request.on('error', reject);
    if (body !== null) request.write(body);
    request.end();
  });

test('a page that rebound DNS to loopback cannot read the deck', async (t) => {
  const base = await deckOnAPort(t);
  postItem({ kind: 'question', title: 'Which port?', body: '4321?' });

  const response = await requestWithHost(base, 'evil.example:4321');

  assert.equal(response.status, 421, 'a Host that is not the deck itself is misdirected');
  assert.doesNotMatch(response.text, /Which port\?/, 'the deck must not render its items to it');
});

test('a page that rebound DNS to loopback cannot reply either', async (t) => {
  const base = await deckOnAPort(t);
  const item = postItem({ kind: 'question', title: 'Which port?', body: '4321?' });

  const response = await requestWithHost(base, 'evil.example:4321', {
    path: '/reply',
    method: 'POST',
    body: new URLSearchParams({ id: item.id, text: 'forged by a rebound name' }).toString(),
  });

  assert.equal(response.status, 421);
  assert.deepEqual(listItems()[0].replies, [], 'nothing is written for a Host the deck does not own');
});

test('the deck accepts every loopback spelling a browser may put in Host', async (t) => {
  const base = await deckOnAPort(t);
  const { port } = new URL(base);

  // Each request is carried over IPv4 — the deck binds `127.0.0.1` and nothing else. What
  // this asserts is that the *header* is accepted, which is the whole job of `isOwnHost`:
  // a user who typed `localhost:4321` must not be turned away. `[::1]` is here for the day
  // the deck also binds IPv6; until then it is accepted but never actually arrives.
  for (const host of [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]) {
    const response = await requestWithHost(base, host);
    assert.equal(response.status, 200, `${host} names the deck itself and must be served`);
  }
});

test('a request with no Host at all is refused rather than assumed to be ours', async (t) => {
  const base = await deckOnAPort(t);
  const response = await requestWithHost(base, '');
  assert.equal(response.status, 421);
});

// --- the MCP tool path -----------------------------------------------------
//
// `callTool` is what the CallTool handler runs, so these cover the dispatch, the
// payload shape and the refusals without standing a mock MCP client in for Claude
// Code. The hand round trip through `claude --agent pilot:pilot` stays the evidence
// that the real client reaches this function.

const textOf = (result) => {
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, 'text');
  return result.content[0].text;
};

test('deck_post stores the item and tells the pilot its id and where the human answers', (t) => {
  tempDeck(t);

  const said = textOf(callTool('deck_post', { kind: 'question', title: 'Which port?', body: '4321?' }));

  const [stored] = listItems();
  assert.equal(stored.title, 'Which port?');
  assert.ok(said.includes(stored.id), `the id the pilot is told (${said}) is the id on the deck`);
  assert.ok(said.includes(deckUrl()), 'the pilot is told the deck URL');
});

test('deck_read returns every item with its replies', (t) => {
  tempDeck(t);
  const item = postItem({ kind: 'question', title: 'Which port?', body: '4321?' });
  addReply(item.id, 'yes, 4321');

  const payload = JSON.parse(textOf(callTool('deck_read')));

  assert.equal(payload.url, deckUrl());
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].id, item.id);
  assert.equal(payload.items[0].replies[0].text, 'yes, 4321');
});

test('a tool the deck does not have is refused', (t) => {
  tempDeck(t);
  assert.throws(() => callTool('deck_delete', { id: 'itm_000000000000' }), {
    name: 'DeckRefusal',
    message: /no tool named deck_delete/,
  });
});

test('deck_post cannot smuggle past the size limit the browser form is held to', (t) => {
  tempDeck(t);

  // The HTTP path caps a form at MAX_TEXT_BYTES; the MCP path had no cap at all, so a
  // pilot pasting a whole log could put a megabyte on the deck the browser then had to
  // render. One constant now bounds both.
  assert.throws(
    () => callTool('deck_post', { kind: 'walkthrough', title: 'A log', body: 'x'.repeat(MAX_TEXT_BYTES + 1) }),
    { name: 'DeckRefusal', message: /longer than the deck accepts/ },
  );
  assert.deepEqual(listItems(), [], 'nothing is stored when the body is too big');

  const fits = callTool('deck_post', { kind: 'walkthrough', title: 'A log', body: 'x'.repeat(MAX_TEXT_BYTES) });
  assert.ok(fits, 'exactly the limit still fits');
  assert.equal(listItems().length, 1);
});

test('a reply through the MCP path is held to the same size limit', (t) => {
  tempDeck(t);
  const item = postItem({ kind: 'question', title: 'Which port?', body: '4321?' });

  assert.throws(() => addReply(item.id, 'x'.repeat(MAX_TEXT_BYTES + 1)), {
    name: 'DeckRefusal',
    message: /longer than the deck accepts/,
  });
  assert.deepEqual(listItems()[0].replies, []);
});

test('deck_post with a title that is not a string is refused, and nothing is stored', (t) => {
  tempDeck(t);

  assert.throws(() => callTool('deck_post', { kind: 'question', title: 42, body: 'y' }), {
    name: 'DeckRefusal',
    message: /title must be a non-empty string/,
  });
  assert.deepEqual(listItems(), []);
});
