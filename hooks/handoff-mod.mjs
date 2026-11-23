/**
 * The hand-off mod (handoff-mod L1, L3, L4, L12): a thin adapter between the host and the look,
 * `deck/run-look.mjs`. On the main session's `turn.complete` it asks the look whether this session's hand-off
 * is due, clears, asks the look again once the clear has run (`cleared`, which confirms the lane's marker), and
 * submits the prompt that answered. A subagent's turn end does nothing. `session.start` runs the look's `start`
 * once. A clear the look answers while a turn has started (`turn.start` busy, `turn.complete` idle) waits for that
 * turn's end. The mod arms no timer but one (handoff-no-wait L3): a submit refused, or one whose turn never starts
 * within 60 s, is handed to the look's `unstarted` to say aloud.
 *
 * It reads no environment, fetches nothing and puts no deck text in an argv (A4): the argv is fixed, the look's
 * path is the module's own, and the one id passed on is shape-checked first. The submitted text is the fixed
 * literal plus the lander line, checked here too. The host lets a mod import nothing of Node's, so the path is
 * worked out from `import.meta.url` by hand. The host's validator follows `$` only into functions declared at the
 * top of this file, so the session's state is passed beside it.
 */

const ITEM_ID = /^itm_[0-9a-f]{1,40}$/;
const PROMPT = /^Pick up the hand-off on the deck\.( Spawn pilot-lander itm_[0-9a-f]{1,40}\.)?$/;

/** `<root>/deck/run-look.mjs` from this file's `file:` URL, `<root>/hooks/handoff-mod.mjs`; null off a file. */
function lookPath(url) {
  if (typeof url !== 'string' || !url.startsWith('file:///')) return null;
  const hooks = url.slice(0, url.lastIndexOf('/'));
  const root = decodeURIComponent(hooks.slice('file://'.length, hooks.lastIndexOf('/')));
  // `file:///C:/x` is `C:/x` on Windows; `file:///x` is `/x` elsewhere.
  return `${/^\/[A-Za-z]:\//.test(root) ? root.slice(1) : root}/deck/run-look.mjs`;
}

const LOOK = lookPath(import.meta.url);

/** How long the submitted prompt has to start its turn before the hand-off is said not to have started. */
const STARTED_MS = 60_000;

/** The look's one `Outcome` line, or null for a look that failed. Every flag is a literal or a checked id. */
async function look($, op, ...flags) {
  try {
    const { exitCode, stdout } = await $.process.run(['node', LOOK, op, ...flags]);
    if (exitCode !== 0) return null;
    const outcome = JSON.parse(stdout.trim().split('\n').pop());
    return outcome !== null && typeof outcome === 'object' ? outcome : null;
  } catch {
    return null;
  }
}

/** Act on a `turn` outcome: a well-formed `clear` hands off; anything else, a failed look among them, does nothing. */
async function decide($, mod, due) {
  if (due?.act !== 'clear' || !ITEM_ID.test(due.id ?? '')) return;
  // The claim is taken: a clear answered to a look that a turn overtook waits for that turn's end. A turn that
  // never ends (the session closed) loses it, failing closed like a refused clear.
  if (mod.busy) mod.due = due;
  else await handOff($, mod, due.id);
}

/** Clear, confirm the lane's marker, submit, and watch for the fresh turn's start. */
async function handOff($, mod, id) {
  await $.command.run({ command: 'clear' });
  const taken = await look($, 'cleared', '--id', id);
  if (taken?.act !== 'submit' || taken.id !== id || !PROMPT.test(taken.prompt ?? '')) return;
  endSubmitted(mod);
  mod.submitted = { id };
  mod.noTurn = $.clock.after(STARTED_MS, () => unstarted($, mod, id, 'no turn'));
  try {
    await $.prompt.submit({ text: taken.prompt });
  } catch {
    await unstarted($, mod, id, 'refused');
  }
}

/** The submitted prompt's turn started, or will be said not to have: either way the watch for it ends. */
function endSubmitted(mod) {
  mod.noTurn?.cancel();
  mod.noTurn = mod.submitted = null;
}

/** Say once that the submitted prompt did not start its turn. */
async function unstarted($, mod, id, why) {
  if (mod.submitted?.id !== id) return;
  endSubmitted(mod);
  await look($, 'unstarted', '--id', id, '--why', why);
}

export function register(on) {
  if (LOOK === null) return;
  // One session's state: `register` runs once per session (and again on a reload, which drops the timers too).
  const mod = { busy: false, submitted: null, started: false, due: null, noTurn: null };

  on('session.start', async ($, e, next) => {
    const result = await next(e);
    // The host does not refire it after a /clear; the flag keeps a second `start` out regardless.
    if (!mod.started) {
      mod.started = true;
      await look($, 'start');
    }
    return result;
  });

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      mod.busy = true;
      if (mod.submitted) endSubmitted(mod);
    }
    return next(e);
  });

  on('turn.complete', async ($, e, next) => {
    const result = await next(e);
    if (e.agentId !== undefined) return result;
    mod.busy = false;
    try {
      const due = mod.due ?? await look($, 'turn');
      mod.due = null;
      await decide($, mod, due);
    } catch {
      // A refused clear (the Stop hold) leaves the claim taken: the hand-off fails closed, never twice.
    }
    return result;
  });
}
