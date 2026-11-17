/**
 * The hand-off mod (handoff-mod L1, L3, L4, L12): a thin adapter between the host and the look,
 * `deck/run-look.mjs`. On the main session's `turn.complete` it asks the look whether this session's hand-off
 * is due, clears, asks the look again once the clear has run (`cleared`, which confirms the lane's marker), and
 * submits the prompt that answered. A subagent's turn end does nothing. `session.start` runs the look's `start`
 * once; a held hand-off is looked at again by the mod's own timers, at its bound and every 30 s, only while
 * idle (`turn.start` busy, `turn.complete` idle); a submit refused, or one whose turn never starts within 60 s,
 * is handed to the look's `unstarted` to say aloud.
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

/** How often a held hand-off is looked at again, while idle (L12: the mod's timer is the only looker). */
const HOLD_LOOK_MS = 30_000;
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

/** The `turn` look, told when the main session's last turn ended. */
function lookTurn($, mod) {
  return look($, 'turn', '--turn-ended', String(mod.turnEndedAt));
}

function endHold(mod) {
  mod.bound?.cancel();
  mod.tick?.cancel();
  mod.bound = mod.tick = mod.held = null;
}

/** One timer at the bound and one every 30 s while held; a new bound replaces the old one. */
function hold($, mod, until, now) {
  mod.tick ??= $.clock.every(HOLD_LOOK_MS, () => onTimer($, mod));
  if (mod.held?.until !== until) {
    mod.bound?.cancel();
    mod.bound = $.clock.after(Math.max(0, until - now), () => onTimer($, mod));
  }
  mod.held = { until };
}

/** A timer's look: never mid-turn (the turn's own end looks instead), never beside another look and its acts. */
async function onTimer($, mod) {
  if (mod.busy || mod.looking > 0) return;
  await lookAndAct($, mod, () => lookTurn($, mod));
}

/** The `turn` outcome `ask` resolves, acted on, with `looking` counted so no timer looks meanwhile. */
async function lookAndAct($, mod, ask) {
  mod.looking += 1;
  try {
    await decide($, mod, await ask());
  } catch {
    // A refused clear (the Stop hold) leaves the claim taken: the hand-off fails closed, never twice.
  } finally {
    mod.looking -= 1;
  }
}

/** Act on a `turn` outcome. A failed look keeps the hold's timers; any answer but `held` ends them. */
async function decide($, mod, due) {
  if (due === null) return;
  if (due.act === 'held' && Number.isFinite(due.until)) return hold($, mod, due.until, await $.clock.now());
  endHold(mod);
  if (due.act !== 'clear' || !ITEM_ID.test(due.id ?? '')) return;
  // The claim is taken: a clear answered to a timer look that a turn overtook waits for that turn's end. A turn
  // that never ends (the session closed) loses it, failing closed like a refused clear.
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
  const mod = {
    busy: false, turnEndedAt: 0, held: null, submitted: null, started: false, looking: 0, due: null,
    bound: null, tick: null, noTurn: null,
  };

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
    await lookAndAct($, mod, async () => {
      mod.turnEndedAt = await $.clock.now();
      const due = mod.due ?? await lookTurn($, mod);
      mod.due = null;
      return due;
    });
    return result;
  });
}
