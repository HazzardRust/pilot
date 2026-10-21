/** S7 of deck-press-feedback: the Weekly alerts switch (spec 15; L9, ADR 0098). */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import { deckOnAPort, tempDeck } from '../testUtils.mjs';
import { storeDir } from '../store.mjs';

// Imported so that a missing module fails the tests that use it, not the file.
const alertSwitch = await import('../alert-switch.mjs').catch(() => ({}));

const switchFile = () => path.join(storeDir(), 'alerts.json');
const fileState = () => JSON.parse(fs.readFileSync(switchFile(), 'utf8'));

/** A form post as the browser makes it, over `node:http` so the headers are the test's own. */
const press = (base, route, fields, headers = {}) =>
  new Promise((resolve, reject) => {
    const request = http.request(`${base}${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    });
    request.on('response', (response) => {
      response.resume();
      response.on('end', () => resolve({ status: response.statusCode, location: response.headers.location ?? null }));
    });
    request.on('error', reject);
    request.end(String(new URLSearchParams(fields)));
  });

test('an absent or corrupt alerts.json means on', (t) => {
  tempDeck(t);
  assert.equal(alertSwitch.alertSwitchFile(), switchFile());
  assert.deepEqual(alertSwitch.readAlertSwitch(), { weekly: true }, 'absent');
  for (const text of ['{ not json', JSON.stringify({ weekly: 'off' }), 'null']) {
    fs.writeFileSync(switchFile(), text);
    assert.deepEqual(alertSwitch.readAlertSwitch(), { weekly: true }, text);
  }
  assert.deepEqual(alertSwitch.setAlertSwitch({ weekly: false }), { weekly: false });
  assert.deepEqual(fileState(), { weekly: false });
  assert.deepEqual(alertSwitch.readAlertSwitch(), { weekly: false });
  assert.deepEqual(fs.readdirSync(storeDir()).filter((name) => name.endsWith('.tmp')), [], 'written whole, then renamed');
});

test('alert-switch keeps no tmp of its own', () => {
  const source = fs.readFileSync(new URL('../alert-switch.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\.tmp/, 'the write goes through hooks/lib/atomic-write.js');
});

test('POST /alerts from the page flips it, and a foreign Origin is refused', async (t) => {
  const base = await deckOnAPort(t);
  const foreign = await press(base, '/alerts', { weekly: 'off', back: '/' }, { origin: 'http://evil.example' });
  assert.equal(foreign.status, 403);
  const bare = await press(base, '/alerts', { weekly: 'off', back: '/' });
  assert.equal(bare.status, 403, 'no Origin is not the page either');
  assert.equal(fs.existsSync(switchFile()), false, 'a refused press writes nothing');

  const off = await press(base, '/alerts', { weekly: 'off', back: '/?run=x' }, { origin: base });
  assert.equal(off.status, 303);
  assert.equal(off.location, '/?run=x');
  assert.deepEqual(fileState(), { weekly: false });

  const on = await press(base, '/alerts', { weekly: 'on', back: '//evil.example' }, { origin: base });
  assert.equal(on.status, 303);
  assert.equal(on.location, '/', 'a back that is not a path on this deck goes home');
  assert.deepEqual(fileState(), { weekly: true });

  const neither = await press(base, '/alerts', { weekly: 'maybe', back: '/' }, { origin: base });
  assert.equal(neither.status, 400);
  assert.deepEqual(fileState(), { weekly: true }, 'an unknown value changes nothing');
});

test('the right strip draws the toggle in its current state', async (t) => {
  const base = await deckOnAPort(t);
  const strip = async () => {
    const page = await (await fetch(`${base}/`)).text();
    return page.match(/<aside class="strip right">(.*?)<\/aside>/s)?.[1] ?? '';
  };
  const on = await strip();
  assert.match(on, /<form class="alerts" method="post" action="\/alerts" data-in-place>/);
  assert.match(on, /name="weekly" value="off"/, 'pressing it while on turns it off');
  assert.match(on, /aria-pressed="true"[^>]*>Weekly alerts on</);

  alertSwitch.setAlertSwitch({ weekly: false });
  const off = await strip();
  assert.match(off, /name="weekly" value="on"/, 'pressing it while off turns it on');
  assert.match(off, /aria-pressed="false"[^>]*>Weekly alerts off</);
  assert.match(off, /name="back" value="\/[^"]*"/, 'back to this page');
});
