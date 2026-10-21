/**
 * Importing this turns the deck's own browser-opening off for the importing process and
 * for every process it spawns, because `process.env` is what a child inherits.
 *
 * It exists because the daemon opens a browser when a run registers and no page is
 * watching (D14), and under test nothing ever is: every file here that stands a deck up
 * would otherwise put tabs on the screen of whoever ran the suite. Setting it here
 * rather than in the `npm test` command line is deliberate — running one file directly,
 * `node --test deck/test/daemon.test.mjs`, is an ordinary way to work, and a guard that
 * only holds for the whole suite is a guard that opens a browser the first time somebody
 * iterates on one test.
 *
 * `deck/test/open.test.mjs` pins the list of files that must import it, so a new test
 * file that stands a server up cannot quietly leave it out.
 */

// Never overwritten: a test that wants the opener on sets and restores it itself.
if (!process.env.PILOT_DECK_NO_OPEN) process.env.PILOT_DECK_NO_OPEN = '1';

// The same guard for Start (start-end-session L7): `startSession` refuses under it, so no
// test, and no deck a test spawns, ever opens a terminal window running a session. Always
// set, because nothing under test has a reason to turn it off.
process.env.PILOT_DECK_NO_START = '1';

// And for a landing (gate2-lands L10): a gate2's Sign off under test writes "landing is turned
// off on this deck" and runs nothing, so no test pushes. A test that lands injects `spawn` and `env`.
process.env.PILOT_DECK_NO_LAND = '1';
