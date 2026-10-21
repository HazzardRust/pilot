/**
 * `GET /api/health`'s answer: who this deck is, where it serves, where its cursor stands,
 * and which plugin version has been serving since when (daemon-lifecycle spec 3). Its own
 * module so the route table stays under the deck's line bar.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isCheckout } from './spawn-root.mjs';
import { currentSeq } from './store.mjs';
import { deckUrl } from './tools.mjs';
import { PLUGIN_VERSION } from './version.mjs';

/** When this daemon started serving: the module loads once per process. */
const STARTED_AT = new Date().toISOString();

/** The directory holding this daemon's package.json, and whether it is a checkout (deck-spawn-root spec 8). */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECKOUT = isCheckout(ROOT);

export const healthOf = () => ({
  ok: true,
  pid: process.pid,
  url: deckUrl(),
  seq: currentSeq(),
  rss: process.memoryUsage().rss,
  version: PLUGIN_VERSION,
  startedAt: STARTED_AT,
  root: ROOT,
  checkout: CHECKOUT,
});
