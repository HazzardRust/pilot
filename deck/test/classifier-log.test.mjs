/**
 * crew-refusals S4, spec 6 (A4, A5, L9): the classifier log's writer and reader, each test
 * against a scratch `dir` of its own, never the user's store.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { appendRefusal, readRefusals } from '../classifier-log.mjs';

function scratch(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-classifier-log-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function entry(extra) {
  return {
    repo: 'C:/repo',
    ticket: null,
    agent: 'main',
    reason: 'outside the ticket',
    tool: 'Bash',
    command: 'gh pr ready 576',
    verdict: 'refused',
    ...extra,
  };
}

test('an entry reads back with its time, oldest first', (t) => {
  const dir = scratch(t);
  appendRefusal(entry({ command: 'first' }), { dir, now: () => new Date('2026-11-19T10:00:00Z') });
  appendRefusal(entry({ command: 'second', ticket: 'itm_t1' }), { dir, now: () => new Date('2026-11-19T10:01:00Z') });
  const read = readRefusals({ dir });
  assert.deepStrictEqual(read.map((r) => r.command), ['first', 'second']);
  assert.strictEqual(read[0].when, '2026-11-19T10:00:00.000Z');
  assert.deepStrictEqual(readRefusals({ dir, ticket: 'itm_t1' }).map((r) => r.command), ['second']);
});

test('a credential never reaches the log', (t) => {
  const dir = scratch(t);
  const token = 'ghp_' + 'A1b2C3d4E5f6G7h8I9j0K1l2';
  appendRefusal(entry({ command: 'git push https://x:' + token + '@github.com/o/r', reason: 'pushes with ' + token, repo: 'C:/' + token }), { dir });
  const [read] = readRefusals({ dir });
  assert.strictEqual(read.command, '<withheld: credential>');
  assert.strictEqual(read.reason, '<withheld: credential>');
  assert.strictEqual(read.repo, '<withheld: credential>');
  assert.ok(!fs.readFileSync(path.join(dir, 'classifier.log'), 'utf8').includes(token), 'not on disk either');
});

// Each value is split so no line of this file is a credential itself.
const SECRET = 'hunter2' + 'Zq9';
const B64 = Buffer.from('ci-bot:' + SECRET).toString('base64');
const JWT = 'eyJhbGciOiJIUzI1NiJ9' + '.eyJzdWIiOiIxMjM0In0' + '.c2lnbmF0dXJlLXZhbHVl';

for (const [shape, command] of [
  ['curl -u user:pass', 'curl -u ci-bot:' + SECRET + ' https://api.example.com/v1'],
  ['curl --user user:pass', 'curl --user=ci-bot:' + SECRET + ' https://api.example.com/v1'],
  ['curl -uuser:pass', 'curl -uci-bot:' + SECRET + ' https://api.example.com/v1'],
  ['curl -fsSLu user:pass', 'curl -fsSLu ci-bot:' + SECRET + ' https://api.example.com/v1'],
  ['a URL with user:pass', 'git clone https://ci-bot:' + SECRET + '@git.example.com/o/r.git'],
  ['a database URL off this machine', 'psql postgres://u:p@db.example.com'],
  ['a URL to a host named after localhost', 'psql postgres://u:' + SECRET + '@localhost.example.com:5432/app'],
  ['--password <x>', 'mysql -h db --password ' + SECRET + ' -e "select 1"'],
  ['--password=<x>', 'psql --password=' + SECRET + ' -c "select 1"'],
  ['Authorization: Basic', 'curl -H "Authorization: Basic ' + B64 + '" https://api.example.com'],
  ['a JWT', 'curl https://api.example.com/v1?t=' + JWT],
]) {
  test(`a credential as ${shape} reads back withheld`, (t) => {
    const dir = scratch(t);
    appendRefusal(entry({ command }), { dir });
    assert.strictEqual(readRefusals({ dir })[0].command, '<withheld: credential>');
    assert.ok(!fs.readFileSync(path.join(dir, 'classifier.log'), 'utf8').includes(SECRET), 'not on disk either');
  });
}

test('a long field of repeated curl flags is checked without a backtracking stall', (t) => {
  const dir = scratch(t);
  const started = process.hrtime.bigint();
  appendRefusal(entry({ command: 'curl x -u '.repeat(20000) }), { dir });
  assert.ok(process.hrtime.bigint() - started < 1_000_000_000n, 'checked in under a second');
});

// Each probe is 64 KiB and must be checked well under a second; a quadratic shape takes seconds.
for (const [name, command] of [
  ['a run of u after curl -', 'curl -' + 'u'.repeat(65536)],
  ['an alternating uA run after curl -', 'curl -' + 'uA'.repeat(32768)],
  ['many curls before a run of u', 'curl '.repeat(500) + ' -' + 'u'.repeat(65536)],
  ['a long eyJ run', 'eyJ' + 'a'.repeat(65536)],
  ['a curl with no -u', 'curl ' + 'x '.repeat(32768)],
  ['a run of curls', 'curl '.repeat(13108)],
  ['a flag cluster with no u', 'curl -' + 'A'.repeat(65536)],
  ['a run of flag clusters with no u', 'curl' + ' -AAAAAAAAAAAA'.repeat(5041)],
  ['a curl -u user with no colon', 'curl -u ' + 'a'.repeat(65536)],
  ['a run of curl -u users with no colon', 'curl' + ' -uuuuuuuuuu0'.repeat(5041)],
  ['a URL user with no colon', 'x://' + 'a'.repeat(65536)],
  ['a URL password with no @', 'x://u:' + 'p'.repeat(65536)],
  ['a run of URL schemes', 'a.'.repeat(15) + 'a://' + 'b:'.repeat(32768)],
]) {
  test(`${name} is checked in under 200 ms`, (t) => {
    const dir = scratch(t);
    const started = process.hrtime.bigint();
    appendRefusal(entry({ command }), { dir });
    assert.ok(process.hrtime.bigint() - started < 200_000_000n, 'checked in under 200 ms');
  });
}

// A run longer than a pattern's old bound must fail closed, never let the credential through.
for (const [name, command] of [
  ['a curl -u user of 201 characters', 'curl -u ' + 'a'.repeat(201) + ':pw12345'],
  ['a URL user of 201 characters', 'psql postgres://' + 'a'.repeat(201) + ':pw@evil.com/db'],
  ['a URL password of 501 characters', 'psql postgres://bob:' + 'p'.repeat(501) + '@evil.com/db'],
  ['a curl flag cluster of 11 letters before u', 'curl -abcdefghijku bob:pw12345'],
  ['a curl with 501 characters before -u', 'curl ' + 'x'.repeat(501) + ' -u bob:pw12345'],
]) {
  test(`${name} reads back withheld`, (t) => {
    const dir = scratch(t);
    appendRefusal(entry({ command }), { dir });
    assert.strictEqual(readRefusals({ dir })[0].command, '<withheld: credential>');
  });
}

test('a long sentence about curl and a URL with no userinfo reads back as it was', (t) => {
  const dir = scratch(t);
  const sentence =
    'Run curl against https://api.example.com/v1/items to list the items, then read the response headers ' +
    'for a cache hit, and if the request was slow, retry it with a longer timeout before you open a ticket. '.repeat(4);
  appendRefusal(entry({ reason: sentence }), { dir });
  assert.strictEqual(readRefusals({ dir })[0].reason, sentence.slice(0, 300));
});

test('a JWT whose first segment is longer than 3000 characters reads back withheld', (t) => {
  const dir = scratch(t);
  appendRefusal(entry({ command: 'eyJ' + 'a'.repeat(3000) + '.eyJ' + 'a'.repeat(10) + '.x' }), { dir });
  assert.strictEqual(readRefusals({ dir })[0].command, '<withheld: credential>');
});

for (const command of [
  'psql http://a:b@localhost:80@evil.com',
  'psql http://u:p@127.0.0.1:80@evil.com/',
  'psql http://u:p@localhost:80:90@evil.com/',
]) {
  test(`a loopback host followed by a second @ reads back withheld: ${command}`, (t) => {
    const dir = scratch(t);
    appendRefusal(entry({ command }), { dir });
    assert.strictEqual(readRefusals({ dir })[0].command, '<withheld: credential>');
  });
}

test('a dev database URL on this machine reads back as it was', (t) => {
  const dir = scratch(t);
  const local = [
    'psql postgres://postgres:postgres@localhost:54322/postgres',
    'psql postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    'redis-cli -u redis://default:devpass@[::1]:6379',
    'psql postgres://app:app@localhost/app',
  ];
  for (const command of local) appendRefusal(entry({ command }), { dir });
  assert.deepStrictEqual(readRefusals({ dir }).map((r) => r.command), local);
});

test('a plain command with no credential reads back as it was', (t) => {
  const dir = scratch(t);
  const plain = [
    'curl https://api.example.com/v1/path',
    'git -C C:/repo log --oneline',
    'git push -u origin main',
    'docker run -u 1000:1000 node',
    'docker login --password-stdin',
    'curl -u "$USER:$TOKEN" https://api.example.com',
    'git clone https://ci-bot:$TOKEN@git.example.com/o/r.git',
    'echo "Basic auth is set in the Authorization header"',
    'echo "the --password flag is unsafe; use --password to set it"',
    'echo "Authorization: Basic authentication scheme"',
    'curl -sSu "$USER:$TOKEN" https://api.example.com',
  ];
  for (const command of plain) appendRefusal(entry({ command }), { dir });
  assert.deepStrictEqual(readRefusals({ dir }).map((r) => r.command), plain);
});

test('a command is clipped to 300 characters', (t) => {
  const dir = scratch(t);
  appendRefusal(entry({ command: 'x'.repeat(1000) }), { dir });
  assert.strictEqual(readRefusals({ dir })[0].command, 'x'.repeat(300));
});

test('the log stays bounded', (t) => {
  const dir = scratch(t);
  const small = { repo: '', agent: '', reason: '', tool: '', ticket: null, verdict: 'refused' };
  for (let n = 0; n <= 10000; n++) appendRefusal({ ...small, command: String(n) }, { dir });
  const read = readRefusals({ dir });
  assert.strictEqual(read.length, 10000);
  assert.strictEqual(read[0].command, '1', 'the oldest is gone');
  assert.strictEqual(read[9999].command, '10000');
});

test('a torn or foreign line is skipped', (t) => {
  const dir = scratch(t);
  appendRefusal(entry({ command: 'kept' }), { dir });
  fs.appendFileSync(path.join(dir, 'classifier.log'), '{"when":"2026\n{"hello":"world"}\n[1,2]\n');
  appendRefusal(entry({ command: 'kept too' }), { dir });
  assert.deepStrictEqual(readRefusals({ dir }).map((r) => r.command), ['kept', 'kept too']);
});

test('no log yet reads as none', (t) => {
  assert.deepStrictEqual(readRefusals({ dir: scratch(t) }), []);
});

test('an unwritable dir throws nothing', (t) => {
  const file = path.join(scratch(t), 'a-file');
  fs.writeFileSync(file, '');
  assert.doesNotThrow(() => appendRefusal(entry(), { dir: file }));
});
