/**
 * `POST /api/exit { version }` (daemon-lifecycle L3, L11): a session whose plugin is newer
 * than this deck asks it to go, and the deck itself decides. It goes only for a caller whose
 * version is above its own, so a session opened before an update never stops the newer
 * deck, and never while a landing runs, whose `land` child would die with it. Behind
 * `isTrustedOrigin` like every write, which the route table checks before this is reached.
 * Its own module so the route table stays under the deck's line bar.
 */

import { landingsRunning } from './landing.mjs';
import { readJsonBody, sendJson } from './server-wait.mjs';
import { DeckRefusal } from './store-core.mjs';
import { PLUGIN_VERSION, isOlder, isVersion } from './version.mjs';

/**
 * 202 and then `exit()`, once the answer has left: `exit` is the daemon's shutdown, which
 * cuts every connection, this one included. 409 for a caller not newer, or a landing live.
 * `own` is this deck's version, an argument only so a test can stand in an older deck.
 */
export async function exitRoute(request, response, { exit, landings = landingsRunning, own = PLUGIN_VERSION }) {
  const version = (await readJsonBody(request))?.version;
  if (!isVersion(version)) {
    throw new DeckRefusal('an exit request names the caller\'s plugin version as x.y.z');
  }
  if (!isOlder(own, version)) {
    return sendJson(response, 409, { error: `this deck is ${own}, not older than ${version}; it keeps serving` });
  }
  if (landings() > 0) {
    return sendJson(response, 409, { error: `this ${own} deck has a landing running; it keeps serving until that ends` });
  }
  console.error(`[deck] a session on ${version} asked this ${own} deck to exit; closing`);
  response.once('finish', () => {
    try {
      exit();
    } catch (err) {
      console.error('[deck] the exit request could not close the deck:', err?.message ?? err);
    }
  });
  return sendJson(response, 202, { ok: true });
}
