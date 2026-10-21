/**
 * `pilot store restore` (store-durability S3, S6; spec 4, 9; L2, A5): the store one write back, swapped in
 * by hand, refused while a deck serves this store on any port. Imported by `bin/pilot.mjs`; split from
 * `store-recovery.mjs` so that module imports nothing from `store-core.mjs`, which imports it.
 */

import fs from 'node:fs';
import path from 'node:path';

import { atomicWriteFileSync } from '../hooks/lib/atomic-write.js';
import { DeckRefusal, storeDir, storeFile } from './store-core.mjs';
import { isDeck, readDeckFile, setAside } from './store-recovery.mjs';
import { DECK_HOST, deckPort } from './tools.mjs';

/**
 * The pid of the deck serving this store (spec 9): null when none does, undefined when it cannot be told.
 * `deck/daemon.mjs` writes `<pid> <port>` to the store dir's `deck.pid` once it listens; that port is asked
 * for its pid, and the file counts only while the same pid answers there, so a pid reused after the deck died
 * outside its handler (an outside kill on Windows runs none) never refuses. A port that cannot tell is a
 * refusal; one that answers nothing or another pid makes the file stale, and with no deck.pid, or a stale
 * one, the configured port is asked. A deck.pid that cannot be read is a refusal. `probe(port)` resolves the
 * pid that port's deck reports, null for nothing listening, undefined for an answer that is not one.
 */
export async function storePid({ dir = storeDir(), probe = healthPid } = {}) {
  const file = path.join(dir, 'deck.pid');
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8').trim();
  } catch (err) {
    if (err.code !== 'ENOENT') throw new DeckRefusal(`${file} cannot be read (${err.code}); nothing restored`);
  }
  const named = /^([1-9]\d{0,9}) ([1-9]\d{0,4})$/.exec(text);
  if (named && Number(named[2]) < 65536) {
    const answer = await probe(Number(named[2]));
    if (answer === undefined || answer === Number(named[1])) return answer;
  }
  return probe(deckPort());
}

/**
 * Restores the store (spec 4, 9; L2, A5). Refused, changing nothing, unless `daemonPid()` (`main` passes
 * `storePid`'s answer) says for sure that no deck serves (null), and when `.bak` does not parse as a deck.
 * deck.json is first set aside as `deck.json.replaced-<YYYY-MM-DD>[-n]`, never overwriting one; then, when
 * it parses, it and `.bak` swap, so a second restore puts it back; when it does not, `.bak`'s bytes go in
 * and `.bak` stays.
 */
export function restoreStore({ daemonPid = () => undefined } = {}) {
  const pid = daemonPid();
  if (pid === undefined) throw new DeckRefusal('cannot tell whether a deck daemon serves this store; nothing restored');
  if (pid !== null) throw new DeckRefusal(`deck daemon ${pid} serves this store; stop it first, then restore`);
  const file = storeFile();
  const backup = `${file}.bak`;
  const raw = readDeckFile(backup);
  if (raw === null) throw new DeckRefusal(`${backup} does not parse as a deck; nothing restored`);
  if (!fs.existsSync(file)) throw new DeckRefusal(`${file} is missing; start the deck once to make one, then restore`);
  const current = fs.readFileSync(file);
  let swap = false;
  try {
    swap = isDeck(JSON.parse(current.toString('utf8')));
  } catch {
    /* not JSON, so not a deck: `.bak` stays */
  }
  const kept = setAside(file, 'replaced');
  atomicWriteFileSync(file, raw);
  // A crash before the next write loses nothing: `kept` already holds the store just replaced.
  if (swap) atomicWriteFileSync(backup, current);
  return { restored: file, kept };
}

/** `pilot store restore`: one line out, exit 0 restored or 1 refused. The store comes from `storeDir()` only. */
export async function main(argv) {
  try {
    if (argv.length) throw new DeckRefusal('usage: pilot store restore (it takes no arguments)');
    const pid = await storePid();
    const { restored, kept } = restoreStore({ daemonPid: () => pid });
    console.log(`restored ${restored} from its backup; the store it replaced is kept as ${kept}`);
    return 0;
  } catch (err) {
    console.error(`pilot store restore: ${err.message}`);
    return 1;
  }
}

/** The pid the deck on `port` reports; null when nothing listens there, undefined when it cannot be told. */
async function healthPid(port) {
  try {
    const response = await fetch(`http://${DECK_HOST}:${port}/api/health`, { signal: AbortSignal.timeout(1000) });
    const { pid } = response.ok ? await response.json() : {};
    return Number.isInteger(pid) ? pid : undefined;
  } catch (err) {
    return err.cause?.code === 'ECONNREFUSED' ? null : undefined;
  }
}
