/**
 * `POST /api/hold { id, ticket } -> { held }` (held-handoff L2): `pilot run` holding a hand-off's `/clear` for the
 * directory's live co-pilot. Item state, never a reply, so nothing takes the hold for a pick-up. The page is told
 * only when the hold was written, so a repeat is silent. Behind `isTrustedOrigin` and the secret like every write,
 * which the route table checks before this is reached; its own module so that table stays under the line bar.
 */

import { announceChange, readJsonBody, sendJson } from './server-wait.mjs';
import { DeckRefusal } from './store-core.mjs';
import { markHold } from './store-items.mjs';

export async function holdRoute(request, response) {
  const body = await readJsonBody(request);
  if (body === null || typeof body !== 'object') throw new DeckRefusal('a hold names its hand-off and its ticket');
  const held = markHold(body.id, body.ticket);
  if (held) announceChange();
  return sendJson(response, 200, { held });
}
