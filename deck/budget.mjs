/**
 * The agent split (pilot-branch spec 15; L18, L27, A12): how many agents each session may hold, itself
 * included: the main session, and the yellow lane, the co-pilot and its children (yellow-agent spec 7). A
 * user setting, stored per main deck in the deck store, set from the terminal by `pilot budget`, and read by
 * each session at start from `GET /api/record`, so no prompt file carries the number.
 *
 * A sum above the ceiling is stored, with a warning: the user asked for a setting, and refusing would make
 * it less configurable than that (A12). The floors are the least a session can work with: the main deck
 * itself, and the co-pilot itself and one implementer.
 */

import { deckUrl } from './tools.mjs';
import { bearer } from '../hooks/lib/deck-secret.js';

// bigger-jobs A2: main fits the pilot, an architect and two researchers; yellow the co-pilot, an implementer
// and its five children, plus one. A split already stored is kept (A5).
// lander A2: the main session's share is five, so a lander fits beside the co-pilot; ceiling thirteen.
export const DEFAULT_BUDGET = Object.freeze({ main: 5, yellow: 8 });
export const CEILING = 13;
const FLOORS = { main: 1, yellow: 2 };

/** `{ budget, warning? }` for a split, or a throw naming the field and its floor. */
export function checkBudget({ main, yellow }) {
  for (const [field, value] of Object.entries({ main, yellow })) {
    // Safe, not merely whole: `1e300` is an integer to JavaScript and no count of agents.
    if (!Number.isSafeInteger(value) || value < FLOORS[field]) {
      throw new RangeError(`${field} must be an integer of at least ${FLOORS[field]}, not ${JSON.stringify(value) ?? String(value)}`);
    }
  }
  const budget = { main, yellow };
  return main + yellow > CEILING ? { budget, warning: `${main + yellow} is over the ceiling of ${CEILING}` } : { budget };
}

/** How long the deck has to answer before this calls it down. */
const TIMEOUT_MS = 5000;

/** The flags as `{ main?, yellow? }`, or a throw a usage line can carry. A flag's value is checked by `checkBudget`. */
function parseFlags(argv) {
  const fields = {};
  for (let at = 0; at < argv.length; at += 2) {
    const field = { '--main': 'main', '--yellow': 'yellow' }[argv[at]];
    if (!field || argv[at + 1] === undefined || argv[at + 1].startsWith('--') || field in fields) throw new Error('usage: pilot budget [--main N] [--yellow N]');
    // Digits only, so `2.5`, `1e1` and `two` are the same refusal as the deck's, said before asking it.
    if (!/^\d+$/.test(argv[at + 1])) throw new Error(`${field} must be an integer of at least ${FLOORS[field]}, not ${argv[at + 1]}`);
    fields[field] = Number(argv[at + 1]);
  }
  return fields;
}

/**
 * `pilot budget [--main N] [--yellow N]` in `cwd`: set the fields given, or with none print the split as stored.
 * Answers the exit code: 0 set or shown, 1 the deck refused or did not answer, 2 a malformed flag.
 */
export async function budget(argv, { cwd = process.cwd(), url, say = (text) => process.stdout.write(text), complain = (text) => process.stderr.write(text) } = {}) {
  let fields;
  try {
    fields = parseFlags(argv);
  } catch (err) {
    complain(`pilot budget: ${err.message}\n`);
    return 2;
  }
  let authorization;
  try {
    // Read now, never cached (deck-token L6); a missing file is named as missing, not as a deck that did not answer.
    authorization = bearer();
  } catch (err) {
    complain(`pilot budget: ${err.message}\n`);
    return 1;
  }
  let answer;
  let where = url ?? 'the deck';
  try {
    // Inside the try: `deckUrl()` throws on a mistyped `PILOT_DECK_PORT`, and that is exit 1 too.
    where = url ?? deckUrl();
    const response = await fetch(`${where}/api/budget`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authorization },
      body: JSON.stringify({ repo: cwd, ...fields }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      // A refusal is JSON naming the field; a deck too old for this route answers 404 in text.
      const refusal = await response.json().catch(() => ({}));
      complain(`pilot budget: ${refusal.error ?? `the deck answered ${response.status}`}\n`);
      return 1;
    }
    answer = await response.json();
  } catch (err) {
    complain(`pilot budget: ${where} did not answer: ${err.message}\n`);
    return 1;
  }
  say(`budget main ${answer.budget.main} yellow ${answer.budget.yellow}\n`);
  if (answer.warning) say(`warning: ${answer.warning}\n`);
  return 0;
}
