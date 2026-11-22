/**
 * The playground's contrast check and its previews' token channel (ui-design-workflow S5).
 * `tokens.contrast` runs through the same `tokens.js` the page loads; each preview's `onTokens`
 * runs from its own page's inline script, fed the real token file of its surface.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

import { loadTokens, look, readSurface, shapeUrl } from '../look.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('contrast at the AA edge', () => {
  const { contrast } = loadTokens();
  // WCAG 2.x: #777777 on white is the familiar 4.48 (fails AA), #767676 the 4.54 that passes.
  assert.equal(contrast('#777777', '#ffffff'), 4.48);
  assert.equal(contrast('#767676', '#ffffff'), 4.54);
  assert.equal(contrast('#ffffff', '#767676'), 4.54, 'the order of the pair does not matter');
  assert.equal(contrast('#000000', '#FFFFFF'), 21);
  assert.equal(contrast('#123456', '#123456'), 1);
});

test('contrast refuses a colour that is not #rrggbb', () => {
  const { contrast } = loadTokens();
  for (const bad of ['#fff', 'white', '', null, '#gggggg']) {
    assert.throws(() => contrast(bad, '#ffffff'), /#rrggbb/);
    assert.throws(() => contrast('#ffffff', bad), /#rrggbb/);
  }
});

/** A preview page's inline scripts run in a context with only what its handler touches stubbed. */
function preview(page) {
  const html = readFileSync(join(root, page), 'utf8');
  const set = [];
  const style = { setProperty: (name, value) => set.push([name, value]) };
  const context = {
    document: { documentElement: { style }, getElementById: () => ({ hidden: true }), querySelectorAll: () => [] },
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {},
    location: { hash: '' },
    // The token file never arrives over fetch here, so only a message can set a property.
    fetch: () => new Promise(() => {}),
  };
  context.window = context;
  context.parent = {};
  for (const [, script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) runInNewContext(script, context);
  assert.equal(typeof context.onTokens, 'function', `${page} defines onTokens`);
  return { onTokens: context.onTokens, parent: context.parent, set };
}

const previews = [
  ['deck/rune/playground/mock.html', 'deck/rune/theme.json'],
  ['fixtures/surface-web/index.html', 'fixtures/surface-web/tokens.json'],
];

test('pilot look shape opens the one page on each surface\'s own preview', (t) => {
  // Any existing absolute path stands in for the browser, so a machine with none still runs this.
  const kept = process.env.PILOT_LOOK_BROWSER;
  process.env.PILOT_LOOK_BROWSER = process.execPath;
  t.after(() => { if (kept === undefined) delete process.env.PILOT_LOOK_BROWSER; else process.env.PILOT_LOOK_BROWSER = kept; });
  for (const [surfaceFile, preview] of [['deck/rune/surface.json', 'deck/rune/playground/mock.html'], ['fixtures/surface-web/surface.json', 'fixtures/surface-web/index.html']]) {
    const started = [];
    const lines = [];
    const fakeChild = { on: () => {}, unref: () => {} };
    const code = look(['shape', join(root, surfaceFile)], {
      start: (command, args, options) => { started.push({ command, args, options }); return fakeChild; },
      out: { write: (s) => lines.push(s) },
      err: { write: (s) => assert.fail(s) },
    });
    assert.equal(code, 0);
    assert.deepEqual(started.map((s) => s.command), [process.execPath]);
    assert.deepEqual(lines, [`${started[0].args[0]}\nimport ${readSurface(join(root, surfaceFile)).tokens} in the page\n`]);
    const url = new URL(started[0].args[0]);
    assert.equal(url.protocol, 'file:');
    assert.match(url.pathname, /\/skills\/ui-design\/playground\/index\.html$/);
    assert.equal(fileURLToPath(url.searchParams.get('preview')), join(root, preview));
    assert.equal(started[0].options.shell, undefined, 'no shell');
  }
});

test('pilot look shape refuses a surface with no preview', () => {
  const surface = readSurface(join(root, 'fixtures/surface-web/surface.json'));
  delete surface.preview;
  assert.throws(() => shapeUrl(surface), /^Error: preview: missing/);
});

for (const [page, tokenFile] of previews) {
  test(`a preview ignores a foreign message: ${page}`, () => {
    const { onTokens, parent, set } = preview(page);
    const tokens = JSON.parse(readFileSync(join(root, tokenFile), 'utf8'));
    for (const data of [undefined, null, 'tokens', { dark: true }, { tokens: null, dark: false }, { tokens: 'x', dark: false }, { tokens: [], dark: true }]) {
      onTokens({ source: parent, data });
    }
    onTokens({ source: {}, data: { tokens, dark: false } });
    assert.deepEqual(set, [], 'nothing changed');
    onTokens({ source: parent, data: { tokens, dark: true } });
    assert.ok(set.length > 0, 'the parent page\'s tokens redraw it');
  });
}
