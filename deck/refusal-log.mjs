/**
 * One deck.log line per request the deck refuses or fails (daemon-lifecycle spec 2): a 400 or
 * a 415 used to answer the caller and leave nothing behind, so a refusal nobody watched could
 * not be traced, and a 500 wrote a line of its own shape. Its own module so the route table
 * stays under the deck's line bar.
 *
 * The line carries the method, the path and the error's message, never the query string or
 * the raw body: either can hold what a caller sent, and the log outlives the request. The
 * message can echo a field the caller sent, so it is kept to one line of printable text. A
 * 500 is the deck's own failure, so its stack follows on the lines after.
 */

import { oneLine } from './one-line.mjs';
import { UnsupportedMediaType } from './server-wait.mjs';
import { DeckRefusal } from './store-core.mjs';

const statusOf = (err) => (err instanceof UnsupportedMediaType ? 415 : err instanceof DeckRefusal ? 400 : 500);

/** Writes `[deck] <status> <METHOD> <path>: <message>`, and for a 500 the stack under it. */
export function logRefusal(request, err) {
  const status = statusOf(err);
  const pathOnly = String(request.url ?? '').split('?')[0];
  console.error(`[deck] ${status} ${request.method} ${pathOnly}: ${oneLine(err?.message ?? err)}`);
  // The frames only: the stack's own first line repeats the message, unflattened.
  if (status === 500 && typeof err?.stack === 'string') console.error(err.stack.split('\n').filter((line) => /^\s+at /.test(line)).join('\n'));
}
