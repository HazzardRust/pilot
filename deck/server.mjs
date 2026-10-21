/**
 * The deck's surface (feature audit-f1-f7, spec 13, ADR 0113), kept as a facade: the
 * routes and the HTTP server are `deck/server-routes.mjs`, the tools as the deck
 * performs them `deck/server-tools.mjs`, and the long poll `deck/server-wait.mjs`.
 * Every name an importer of this path used before the split is re-exported here.
 */

export { createDeckHttpServer } from './server-routes.mjs';
export { callTool } from './server-tools.mjs';

/**
 * The deck's vocabulary lives in `deck/tools.mjs` because `deck/client.mjs` needs it
 * without needing the store (L3). It is re-exported here unchanged, so every other file
 * in the package goes on importing it from the one place it has always imported it from.
 */
export { browserCount, waiterCount } from './server-wait.mjs';
export { DECK_HOST, DECK_PORT, DEFAULT_WAIT_MS, KINDS, MAX_POLL_MS, MAX_READ_ITEMS, MAX_WAIT_MS, TOOLS, deckPort, deckUrl } from './tools.mjs';
