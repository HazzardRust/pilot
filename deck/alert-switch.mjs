/**
 * The deck's Weekly alerts switch (deck-press-feedback spec 15, L9, ADR 0098): a file of its own in
 * the deck store, in the shape of `usage-switch.mjs`, so the usage hook can read it with no HTTP
 * call and no parse of the whole store, and still read it while the deck is down. Absent or
 * unreadable means on; only the session track's alerts are not the switch's to silence.
 */

import fs from 'node:fs';
import path from 'node:path';

import { atomicWriteFileSync, privateDir } from '../hooks/lib/atomic-write.js';
import { storeDir } from './store-dir.mjs';

export const alertSwitchFile = () => path.join(storeDir(), 'alerts.json');

export function readAlertSwitch() {
  try {
    const { weekly } = JSON.parse(fs.readFileSync(alertSwitchFile(), 'utf8'));
    return { weekly: typeof weekly === 'boolean' ? weekly : true };
  } catch {
    return { weekly: true };
  }
}

/** Sets the switch. Written whole, then renamed (retrying a Windows lock), so the hook never reads half a file. */
export function setAlertSwitch({ weekly }) {
  const next = { weekly: weekly === true };
  const file = alertSwitchFile();
  privateDir(path.dirname(file));
  atomicWriteFileSync(file, `${JSON.stringify(next)}\n`);
  return next;
}
