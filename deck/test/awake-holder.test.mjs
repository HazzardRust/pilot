/**
 * stay-awake S1 (spec 2, 8; L1): the real Windows holder. It takes a SystemRequired request, says `held`,
 * and exits within 5 s of the pid it watches. Skipped off win32. Every process it starts is stopped by
 * the test, so the gate's census finds none left (spec 7). `powercfg /requests` needs an elevated shell;
 * unelevated the test says so and rests on the holder's own `held` line.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';

import { hostPlatform } from '../../hooks/lib/platform.js';
import { REASON, holderFor } from '../awake.mjs';

const POWERCFG = path.win32.join(process.env.SystemRoot ?? 'C:/Windows', 'System32', 'powercfg.exe');

/** The OS request list, or null when this shell is not elevated. */
function requests() {
  try {
    return execFileSync(POWERCFG, ['/requests'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return null;
  }
}

/** A child's first stdout line, or the reason it never wrote one. */
const firstLine = (child) =>
  new Promise((resolve, reject) => {
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
      if (out.includes('\n')) resolve(out.split(/\r?\n/)[0]);
    });
    child.once('exit', (code) => reject(new Error(`the holder exited ${code} before a line: ${JSON.stringify(out)}`)));
  });

test('the Windows holder appears and dies with its pid', { skip: hostPlatform() !== 'win32' && 'the Windows holder runs on win32 only' }, async (t) => {
  const watched = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', windowsHide: true });
  t.after(() => watched.kill());
  const { cmd, args } = holderFor('win32', watched.pid);
  assert.equal(path.win32.isAbsolute(cmd), true, 'by absolute path');
  const holder = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  t.after(() => holder.kill());

  assert.equal(await firstLine(holder), 'held');
  const listed = requests();
  if (listed === null) t.diagnostic('powercfg /requests needs an elevated shell; resting on the holder\'s held line');
  else assert.ok(listed.includes(REASON), `powercfg /requests lists ${REASON}`);

  const exited = once(holder, 'exit');
  watched.kill();
  const killedAt = Date.now();
  const [code] = await Promise.race([exited, new Promise((_, reject) => setTimeout(() => reject(new Error('the holder outlived its pid by 5 s')), 5000).unref())]);
  assert.equal(code, 0);
  assert.ok(Date.now() - killedAt < 5000);
  if (listed !== null) assert.ok(!requests().includes(REASON), 'the request is gone with the holder');
});

test('a holder watching a pid that is gone holds nothing', { skip: hostPlatform() !== 'win32' && 'the Windows holder runs on win32 only' }, async () => {
  const gone = spawn(process.execPath, ['-e', ''], { stdio: 'ignore', windowsHide: true });
  await once(gone, 'exit');
  const { cmd, args } = holderFor('win32', gone.pid);
  const holder = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let out = '';
  holder.stdout.on('data', (chunk) => (out += chunk));
  const [code] = await once(holder, 'exit');
  assert.equal(code, 2);
  assert.equal(out, '', 'never said held');
});
