/**
 * The deck's logging switch (spec 13, ADR 0095): a file of its own in the deck store, so `pilot logging off`
 * reaches a daemon that is already running without an environment variable it would never see or
 * a key in `deck.json` it would race the daemon to write. Absent or unreadable means on; turning
 * it off never deletes or truncates the log. `at` is when it was last set, so the first window
 * after on starts there and nothing spent while it was off is counted.
 */

import fs from 'node:fs';
import path from 'node:path';

import { privateDir } from '../hooks/lib/atomic-write.js';
import { storeDir } from './store-dir.mjs';

export const usageSwitchFile = () => path.join(storeDir(), 'usage-log.json');

const ON = Object.freeze({ enabled: true, at: '' });

export function readUsageSwitch() {
  try {
    const { enabled, at } = JSON.parse(fs.readFileSync(usageSwitchFile(), 'utf8'));
    return typeof enabled === 'boolean' && typeof at === 'string' ? { enabled, at } : { ...ON };
  } catch {
    return { ...ON };
  }
}

/** Sets the switch; setting the state it is already in keeps its time. Written whole, then renamed. */
export function setUsageSwitch(enabled, now = Date.now) {
  const current = readUsageSwitch();
  // Not rewritten: a second `on` would move `at` and drop what was spent since the last boundary.
  if (current.enabled === enabled) return current;
  const next = { enabled, at: new Date(now()).toISOString() };
  const file = usageSwitchFile();
  privateDir(path.dirname(file));
  fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(next)}\n`);
  fs.renameSync(`${file}.tmp`, file);
  return next;
}
