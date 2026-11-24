/**
 * crew-refusals S4, spec 6 (A4, A5, L9): the classifier log's writer and reader, each test
 * against a scratch `dir` of its own, never the user's store.
 */

import { after, before, test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { appendRefusal, readRefusals } from '../classifier-log.mjs';
import { findCredential } from '../credential.mjs';

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
  ['curl -u user:"pass"', 'curl -u ci-bot:"' + SECRET + '" https://api.example.com/v1'],
  ['curl -u user:\'pass\'', "curl -u ci-bot:'" + SECRET + "' https://api.example.com/v1"],
  ['curl with & inside a quoted URL before -u', 'curl "http://x/?a=1&b=2" -u ci-bot:' + SECRET],
  ['curl with ; inside a quoted header before -u', 'curl -H "a;b" -u ci-bot:' + SECRET + ' x'],
  ['curl with | inside a single-quoted URL before -u', "curl 'http://x/?a=b|c' -u ci-bot:" + SECRET],
  ['curl -1u user:pass', 'curl -1u ci-bot:' + SECRET + ' x'],
  ['CURL -u user:pass', 'CURL -u ci-bot:' + SECRET + ' x'],
  ['curl with an unclosed quote before -u', 'curl "abc -u ci-bot:' + SECRET],
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

// archive-page S13: shapes S6's security review found missing. Each token is built in parts so no line here is one.
const HEX64 = 'a1b2c3d4e5f60718'.repeat(4);
for (const [shape, command, secret] of [
  ['a GitLab token', 'echo glpat-' + SECRET + 'Ab3De6Gh9J | glab auth login --stdin', SECRET],
  ['an npm token', 'npm config set //registry.npmjs.org/:x npm_' + SECRET + 'a'.repeat(26), SECRET],
  ['a Google API key', 'curl "https://maps.googleapis.com/x?key=AIza' + SECRET + 'b'.repeat(25) + '"', SECRET],
  ['a DigitalOcean token', 'doctl auth init -t dop_v1_' + HEX64, HEX64],
  ['Authorization: token', 'curl -H "Authorization: token ' + SECRET + 'abcdefgh" https://api.github.com', SECRET],
  ['--token <x>', 'gh-tool --token ' + SECRET + ' run', SECRET],
  ['--token=<x>', 'gh-tool --token=' + SECRET + ' run', SECRET],
  ['--api-key <x>', 'stripe-cli --api-key ' + SECRET + ' listen', SECRET],
  ['--api-key=<x>', 'stripe-cli --api-key=' + SECRET + ' listen', SECRET],
  ['_authToken=', 'echo //registry.npmjs.org/:_authToken=' + SECRET + ' >> .npmrc', SECRET],
  ['sshpass -p <x>', 'sshpass -p ' + SECRET + ' ssh deploy@host', SECRET],
  ['sshpass -v -p<x>', 'sshpass -v -p' + SECRET + ' ssh deploy@host', SECRET],
  ['mysql -p<x>', 'mysql -u root -p' + SECRET + ' app', SECRET],
  ['mysql -p"<x>"', 'mysql -uroot -p"' + SECRET + '" app', SECRET],
  ['a quoted JSON password', 'echo \'{"user":"ci","password":"' + SECRET + '"}\' > creds.json', SECRET],
  ['a URL with an empty user', 'redis-cli -u redis://:' + SECRET + '@cache.example.com:6379', SECRET],
  ['Authorization: bearer in lower case', 'curl -H "Authorization: bearer ' + SECRET + 'abcdefgh" x', SECRET],
  ['a quoted JSON key with a prefixed name', 'echo \'{"db_password": "' + SECRET + '"}\'', SECRET],
]) {
  test(`a credential as ${shape} reads back withheld`, (t) => {
    const dir = scratch(t);
    appendRefusal(entry({ command }), { dir });
    assert.strictEqual(readRefusals({ dir })[0].command, '<withheld: credential>');
    assert.ok(!fs.readFileSync(path.join(dir, 'classifier.log'), 'utf8').includes(secret), 'not on disk either');
  });
}

// archive-page S14: what S13's security review left open. Each token is built in parts so no line here is one.
const SHORT = 'hun' + 't3r';
const PUNCT = 'Pa' + '@s.s!#%*';
const BASIC_LETTERS = 'dXNlcjpw' + 'YXNz';
for (const [shape, command, secret] of [
  ['a camelCase apiKey', 'const apiKey = "' + SECRET + '";', SECRET],
  ['a camelCase clientSecret', 'clientSecret: ' + SECRET, SECRET],
  ['a plural secrets', 'secrets=' + SECRET, SECRET],
  ['a plural tokens', 'tokens: ' + SECRET, SECRET],
  ['a plural PASSWORDS', 'PASSWORDS=' + SECRET, SECRET],
  ['a short value under a name', 'export DB_PASSWORD=' + SHORT, SHORT],
  ['a value holding .@!#%*', 'password=' + PUNCT + ' ./run', PUNCT],
  ['a long letters-only value', 'resume with token = abcdefghijklm' + 'nopqrstuvwxyz', 'abcdefghijklm'],
  ['a long mixed-case value with no digit','export API_TOKEN=aBcDeFgHiJ' + 'kLmNoPqRsT', 'aBcDeFgHiJ'],
  ['a long value holding dots', 'SECRET_KEY=abc.' + SECRET + '.xyz12345', SECRET],
  ['a kebab value with a digit, failing closed', 'secret: rotate-quarterly-per-policy-doc-v2', 'rotate-quarterly'],
  // S14's security review: a quoted camelCase or single-quoted key, and a name with no separator.
  ['a quoted camelCase key', 'echo \'{"clientSecret": "' + SECRET + '"}\'', SECRET],
  ['a single-quoted key', "creds = {'password': '" + SECRET + "'}", SECRET],
  ['PGPASSWORD=<x>', 'PGPASSWORD=' + SECRET + ' psql -h db app', SECRET],
  ['a glued upper-case name', 'export GITHUBTOKEN=' + SECRET + 'Ab3De6Gh9J', SECRET],
  ['--secret <x>', 'vault-cli --secret ' + SECRET + ' put', SECRET],
  ['--pass <x>', 'zip-tool --pass ' + SECRET + ' a.zip', SECRET],
  ['docker login -p <x>', 'docker login -u ci -p ' + SECRET + ' registry.example.com', SECRET],
  ['redis-cli -a <x>', 'redis-cli -h cache -a ' + SECRET + ' ping', SECRET],
  ['htpasswd -b <file> <user> <x>', 'htpasswd -b .htpasswd ci ' + SECRET, SECRET],
  ['htpasswd -nb <user> <x>', 'htpasswd -nb ci ' + SECRET, SECRET],
  ['a Hugging Face token', 'export HF=hf_' + SECRET + 'c'.repeat(24), SECRET],
  ['a SendGrid key', 'SG.' + SECRET + 'd'.repeat(12) + '.' + SECRET + 'e'.repeat(33), SECRET],
  ['a PyPI token', 'twine upload -u __token__ -p pypi-AgEIcHlwaS5vcmc' + SECRET + 'f'.repeat(40), SECRET],
  ['a Shopify token', 'export SHOPIFY=shpat_' + HEX64.slice(0, 32), HEX64.slice(0, 32)],
  ['a Supabase token', 'export SUPABASE=sbp_' + HEX64.slice(0, 40), HEX64.slice(0, 40)],
  ['a Linear key', 'LINEAR=lin_api_' + SECRET + 'g'.repeat(30), SECRET],
  ['a Stripe webhook secret', 'WEBHOOK=whsec_' + SECRET + 'h'.repeat(22), SECRET],
  ['a Google OAuth token', 'curl -H "X-Goog: ya29.' + SECRET + 'i'.repeat(20) + '"', SECRET],
  ['an Azure AccountKey', 'DefaultEndpointsProtocol=https;AccountName=x;AccountKey=' + SECRET + 'j'.repeat(30) + '==;', SECRET],
  ['Authorization: Basic with no digit', 'curl -H "Authorization: Basic ' + BASIC_LETTERS + '" x', BASIC_LETTERS],
]) {
  test(`a credential as ${shape} reads back withheld`, (t) => {
    const dir = scratch(t);
    appendRefusal(entry({ command }), { dir });
    assert.strictEqual(readRefusals({ dir })[0].command, '<withheld: credential>');
    assert.ok(!fs.readFileSync(path.join(dir, 'classifier.log'), 'utf8').includes(secret), 'not on disk either');
  });
}

// S14 B2: prose about tokens and secrets, and code that names them, stay readable.
test('prose and code near the S14 shapes read back as they were', (t) => {
  const dir = scratch(t);
  const plain = [
    'sk-learn-pipeline is the model we ship',
    'rotate the API token every 90 days: see docs/security.md',
    'secrets: inherit',
    'max_tokens: 100000',
    'token: re-issued after the leak, ask in #ops',
    'password: see the team vault, never paste it here',
    'const clientSecret = loadClientSecretFromVault(env);',
    'const accessToken = currentSessionToken;',
    'echo \'{"max_tokens": "100000"}\'',
    'echo \'{"OLDPWD": "/home/u1/x"}\'',
    'PASSWORD_MIN_LENGTH=12',
    'docker build --secret id=npmrc,src=.npmrc .',
    'docker login -p $REGISTRY_PASS registry.example.com',
    'docker run -p 8080:80 nginx',
    'redis-cli -a "$REDIS_PASSWORD" ping',
    'htpasswd -b .htpasswd ci $HTPASS',
    'htpasswd -c .htpasswd ci',
    'echo "Authorization: Basic Authentication is weak"',
  ];
  for (const command of plain) appendRefusal(entry({ command }), { dir });
  assert.deepStrictEqual(readRefusals({ dir }).map((r) => r.command), plain);
});

// S13 B2: talk about these shapes, and the commands that only look like them, stay readable.
test('prose and commands near the new shapes read back as they were', (t) => {
  const dir = scratch(t);
  const plain = [
    'const apiKey = process.env.PILOT_API_KEY;',
    'the token field in the schema is nullable; secret rotation is slice 9',
    'TOKEN_LIMIT=4096 node run.mjs',
    'claude --token-limit 5',
    'gh-tool --token $GH_TOKEN run',
    'gh-tool --token=<token> run',
    'pass --token whenever the registry asks',
    'mysql -p',
    'mysql -u root -p mydb',
    'sshpass -e ssh -p 22 deploy@host',
    'sshpass -p "$SSHPASS" ssh deploy@host',
    'echo \'{"password": ""}\'',
    'echo \'{"password": "string"}\'',
    'npm config get npm_config_registry',
    'echo "Authorization: token authentication is deprecated"',
    'echo //registry.npmjs.org/:_authToken=${NPM_TOKEN} >> .npmrc',
    'this._authToken = response.data.token;',
  ];
  for (const command of plain) appendRefusal(entry({ command }), { dir });
  assert.deepStrictEqual(readRefusals({ dir }).map((r) => r.command), plain);
});

// S13 B3: a 64 KiB string aimed at each new shape is checked in under 50 ms.
for (const [name, text] of [
  ['a run of sshpass -v', 'sshpass' + ' -v'.repeat(21845)],
  ['a run of sshpass with -f args', 'sshpass -f a'.repeat(5461)],
  ['sshpass then a long -f path', 'sshpass -f ' + 'a'.repeat(65536)],
  ['a run of mysql', 'mysql '.repeat(10922)],
  ['mysql then a long gap', 'mysql ' + 'x '.repeat(32768)],
  ['a quoted key with no closing quote', '"password":"' + 'a'.repeat(65536)],
  ['a run of quoted prefixed names', '"a_'.repeat(21845)],
  ['a run of --token', ' --token'.repeat(8192)],
  ['--token= then a long letter run', '--token=' + 'a'.repeat(65536)],
  ['Authorization: token then a long run', 'Authorization: token ' + 'a'.repeat(65536)],
  ['a run of glpat-', 'glpat-'.repeat(10922)],
  // Found by S13's security review in two older shapes: each was quadratic, about a second at 64 KiB.
  ['a run of hyphen-joined api_key names', 'api_key-'.repeat(8192)],
  ['a run of hyphen-joined token names', 'token-a-'.repeat(8192)],
  ['a run of eyJ- segments', 'eyJ-'.repeat(16384)],
  // S14 B3: each added or changed rule.
  ['a run of camelCase names with no value', 'apiKey'.repeat(10922)],
  ['a run of quoted glued keys', '"xtoken\''.repeat(8192)],
  ['a quoted key then a long unclosed value', "'password': '" + 'a1'.repeat(32768)],
  ['a run of glued names', 'PGPASSWORD'.repeat(6553) + '=x'],
  ['a run of name= pairs', 'a='.repeat(32768)],
  ['a name then a long letter value', 'clientSecret=' + 'a'.repeat(65536)],
  ['a name then a long dotted value', 'token=' + 'a.'.repeat(32768)],
  ['a name then spaces and no separator', 'secret' + ' '.repeat(65536)],
  ['a long hyphenated name', 'token-'.repeat(10922) + '=x'],
  ['a run of --secret', ' --secret'.repeat(7281)],
  ['--pass= then a long letter run', '--pass=' + 'a'.repeat(65536)],
  ['a run of docker login', 'docker login '.repeat(5041)],
  ['docker login then a long gap', 'docker login ' + 'x '.repeat(32768)],
  ['a run of redis-cli', 'redis-cli '.repeat(6553)],
  ['redis-cli then a long gap', 'redis-cli ' + 'x '.repeat(32768)],
  ['a run of htpasswd -b', 'htpasswd -b'.repeat(5957)],
  ['htpasswd then a long flag cluster', 'htpasswd -' + 'b'.repeat(65536)],
  ['SG. then a long run', 'SG.' + 'a'.repeat(65536)],
  ['a run of SG.', 'SG.'.repeat(21845)],
  ['a run of vendor prefixes', 'hf_ pypi- shpat_ sbp_ lin_api_ whsec_ ya29. '.repeat(1489)],
  ['a run of AccountKey=', 'AccountKey='.repeat(5957)],
  ['Authorization: Basic then a long letter run', 'Authorization: Basic ' + 'a'.repeat(65536)],
  ['a run of Authorization: Basic', 'Authorization: Basic '.repeat(3120)],
]) {
  test(`${name} is checked by findCredential in under 50 ms`, () => {
    const started = process.hrtime.bigint();
    findCredential(text);
    assert.ok(process.hrtime.bigint() - started < 50_000_000n, 'checked in under 50 ms');
  });
}

test('a long field of repeated curl flags is checked without a backtracking stall', (t) => {
  const dir = scratch(t);
  const started = process.hrtime.bigint();
  appendRefusal(entry({ command: 'curl x -u '.repeat(20000) }), { dir });
  assert.ok(process.hrtime.bigint() - started < 1_000_000_000n, 'checked in under a second');
});

// Each probe is 64 KiB and must be checked well under a second; a quadratic shape takes seconds.
// The probes share one scratch dir: each times only its own append and reads nothing back.
let probes;
before(() => {
  probes = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-classifier-log-'));
});
after(() => fs.rmSync(probes, { recursive: true, force: true }));
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
  ['a curl followed by unclosed quotes', 'curl ' + '"a'.repeat(32768)],
  ['a curl followed by quoted words', 'curl ' + '"a" '.repeat(16384)],
  ['a curl followed by apostrophes', 'curl ' + "'a".repeat(32768)],
  ['a URL user with no colon', 'x://' + 'a'.repeat(65536)],
  ['a URL password with no @', 'x://u:' + 'p'.repeat(65536)],
  ['a run of URL schemes', 'a.'.repeat(15) + 'a://' + 'b:'.repeat(32768)],
]) {
  test(`${name} is checked in under 200 ms`, () => {
    const started = process.hrtime.bigint();
    appendRefusal(entry({ command }), { dir: probes });
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
    'curl -u user x',
    'curl -u :pw x',
    'curl -u user:$PW x',
    'curl -u user: x',
    'curl -u user:<pw> x',
    'curl -u user:"$PW" x',
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
  // Entries 0-9998 go in as one write of the writer's own line, renumbered: 10,001 appends cost a
  // minute on Windows. The last two go through appendRefusal, at the cap and one past it.
  const log = path.join(dir, 'classifier.log');
  appendRefusal({ ...small, command: '0' }, { dir });
  const line = JSON.parse(fs.readFileSync(log, 'utf8'));
  const seeded = [];
  for (let n = 1; n <= 9998; n++) seeded.push(JSON.stringify({ ...line, command: String(n) }) + '\n');
  fs.appendFileSync(log, seeded.join(''));
  for (let n = 9999; n <= 10000; n++) appendRefusal({ ...small, command: String(n) }, { dir });
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
