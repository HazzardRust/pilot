/**
 * Slice S1 of ui-design-workflow: `pilot look snap` (ADR 0210).
 *
 * The surface adapter is a process start from a repo file's argv, so every test here hands
 * `snap` a recorder instead of `spawnSync` and asserts the argv it would have started. Each
 * test builds its own repository in the temp directory; none reads the real fixture.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readSurface, snap } from '../look.mjs';

/** A repository (a `.git` marker) holding `files`, each a path and its text; returns its root. */
function repo(files) {
  const root = mkdtempSync(join(tmpdir(), 'look-'));
  mkdirSync(join(root, '.git'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const WEB = {
  name: 'web',
  tokens: 'tokens.json',
  rules: 'DESIGN.md',
  screens: { home: '#home' },
  open: { kind: 'web', page: 'index.html' },
};

/** A web surface at `ui/surface.json`, its fields overridden by `over`; returns the file's path. */
function surfaceFile(over = {}, extra = {}) {
  const root = repo({
    'ui/tokens.json': '{}',
    'ui/DESIGN.md': '# rules',
    'ui/index.html': '<html></html>',
    'ui/surface.json': JSON.stringify({ ...WEB, ...over }),
    ...extra,
  });
  return join(root, 'ui', 'surface.json');
}

/** A `spawnSync` stand-in that records each call and reports success. */
function recorder() {
  const calls = [];
  const spawn = (command, args, options) => {
    calls.push({ command, args, options });
    return { status: 0 };
  };
  return { calls, spawn };
}

const BROWSER = join(tmpdir(), 'fake-chromium');

/** Runs `fn` with `PILOT_LOOK_BROWSER` naming a fake browser, so the lookup finds one on any machine. */
function withBrowser(fn) {
  const before = process.env.PILOT_LOOK_BROWSER;
  writeFileSync(BROWSER, '');
  process.env.PILOT_LOOK_BROWSER = BROWSER;
  try {
    return fn();
  } finally {
    if (before === undefined) delete process.env.PILOT_LOOK_BROWSER;
    else process.env.PILOT_LOOK_BROWSER = before;
  }
}

test('an unknown screen is refused before any process starts', () => {
  const surface = readSurface(surfaceFile({ screens: { home: '#home', inbox: '#inbox' } }));
  const { calls, spawn } = recorder();
  assert.throws(
    () => withBrowser(() => snap(surface, 'settings', 'light', join(tmpdir(), 'x.png'), spawn)),
    /settings.*home, inbox/,
  );
  assert.equal(calls.length, 0);
});

test('an unknown mode is refused before any process starts', () => {
  const surface = readSurface(surfaceFile());
  const { calls, spawn } = recorder();
  assert.throws(() => withBrowser(() => snap(surface, 'home', 'dusk', join(tmpdir(), 'x.png'), spawn)), /dusk/);
  assert.equal(calls.length, 0);
});

test('the web adapter starts one headless browser with an argv', () => {
  const surface = readSurface(surfaceFile());
  const out = join(tmpdir(), 'home-dark.png');
  for (const mode of ['light', 'dark']) {
    const { calls, spawn } = recorder();
    const result = withBrowser(() => snap(surface, 'home', mode, out, spawn));
    assert.deepEqual(result, { status: 0, out });
    assert.equal(calls.length, 1);
    const [{ command, args, options }] = calls;
    assert.equal(command, BROWSER);
    assert.ok(args.includes('--headless'));
    assert.ok(args.includes(`--screenshot=${out}`));
    const profile = args.find((a) => a.startsWith('--user-data-dir='));
    assert.ok(profile && profile.slice('--user-data-dir='.length).startsWith(tmpdir()), profile);
    assert.equal(args.includes('--force-dark-mode'), mode === 'dark');
    // A page that may read local files is given no network to send them on.
    assert.ok(args.includes('--proxy-server=127.0.0.1:9') && args.includes('--host-resolver-rules=MAP * ~NOTFOUND'));
    assert.match(args.at(-1), /^file:\/\/.*\/ui\/index\.html#home$/);
    assert.equal(options.shell, undefined);
  }
});

test('the web adapter refuses a route that is not a query or a fragment', () => {
  const surface = readSurface(surfaceFile({ screens: { home: '/../../secret.html' } }));
  const { calls, spawn } = recorder();
  assert.throws(() => withBrowser(() => snap(surface, 'home', 'light', join(tmpdir(), 'x.png'), spawn)), /route/);
  assert.equal(calls.length, 0);
});

test('the web adapter refuses when no browser is found', () => {
  const surface = readSurface(surfaceFile());
  const { calls, spawn } = recorder();
  const before = process.env.PILOT_LOOK_BROWSER;
  process.env.PILOT_LOOK_BROWSER = join(tmpdir(), 'no-such-browser-here');
  try {
    assert.throws(() => snap(surface, 'home', 'light', join(tmpdir(), 'x.png'), spawn), /PILOT_LOOK_BROWSER/);
  } finally {
    if (before === undefined) delete process.env.PILOT_LOOK_BROWSER;
    else process.env.PILOT_LOOK_BROWSER = before;
  }
  assert.equal(calls.length, 0);
});

test('a command adapter substitutes only its placeholders', () => {
  const file = surfaceFile({
    screens: { inbox: 'inbox; rm -rf ~' },
    open: { kind: 'command', argv: ['app', '--open', '{route}', '--mode={mode}', '--snap', '{out}', '{other}'] },
  });
  const surface = readSurface(file);
  const { calls, spawn } = recorder();
  const out = join(tmpdir(), 'inbox.png');
  assert.deepEqual(snap(surface, 'inbox', 'dark', out, spawn), { status: 0, out });
  assert.equal(calls.length, 1);
  const [{ command, args, options }] = calls;
  assert.equal(command, 'app');
  assert.deepEqual(args, ['--open', 'inbox; rm -rf ~', '--mode=dark', '--snap', out, '{other}']);
  assert.equal(options.shell, undefined);
  assert.equal(options.cwd, join(file, '..'));
});

test('a failed start is reported as a non-zero status', () => {
  const surface = readSurface(surfaceFile({ open: { kind: 'command', argv: ['app'] } }));
  const out = join(tmpdir(), 'x.png');
  assert.deepEqual(snap(surface, 'home', 'light', out, () => ({ status: null, error: new Error('ENOENT') })), { status: 1, out });
});

test('a surface.json escaping the repository is refused', () => {
  assert.throws(() => readSurface(surfaceFile({ tokens: join(tmpdir(), 'tokens.json') })), /tokens.*absolute/);
  assert.throws(() => readSurface(surfaceFile({ rules: '../../DESIGN.md' })), /rules.*outside/);
  const inside = readSurface(surfaceFile({ rules: '../DESIGN.md' }, { 'DESIGN.md': '# repo rules' }));
  assert.equal(inside.rules, join(inside.dir, '..', 'DESIGN.md'));
});

test('a surface.json outside any repository is refused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'look-norepo-'));
  for (const f of ['tokens.json', 'DESIGN.md', 'index.html']) writeFileSync(join(dir, f), '');
  writeFileSync(join(dir, 'surface.json'), JSON.stringify(WEB));
  assert.throws(() => readSurface(join(dir, 'surface.json')), /repository/);
});

test('a surface without its ruleset is refused', () => {
  const { rules, ...noRules } = WEB;
  const root = repo({ 'tokens.json': '{}', 'index.html': '', 'surface.json': JSON.stringify(noRules) });
  assert.throws(() => readSurface(join(root, 'surface.json')), /rules/);
  assert.throws(() => readSurface(surfaceFile({ rules: 'MISSING.md' })), /rules.*MISSING\.md/);
});

test('a surface.json missing a key or of the wrong shape is refused', () => {
  assert.throws(() => readSurface(surfaceFile({ screens: undefined })), /screens/);
  assert.throws(() => readSurface(surfaceFile({ open: { kind: 'shell', line: 'x' } })), /open/);
  assert.throws(() => readSurface(surfaceFile({ open: { kind: 'command', argv: 'app --x' } })), /argv/);
  assert.throws(() => readSurface(join(tmpdir(), 'no-such', 'surface.json')), /surface\.json/);
});
