/**
 * The hand-off mod (handoff-mod L1, L3, L4): a thin adapter between the host and the look,
 * `deck/run-look.mjs`. On the main session's `turn.complete` it asks the look whether this session's hand-off
 * is due, clears, asks the look again once the clear has run (`cleared`, which confirms the lane's marker), and
 * submits the prompt that answered. A subagent's turn end does nothing.
 *
 * It reads no environment, fetches nothing and puts no deck text in an argv (A4): the argv is fixed, the look's
 * path is the module's own, and the one id passed on is shape-checked first. The submitted text is the fixed
 * literal plus the lander line, checked here too. The host lets a mod import nothing of Node's, so the path is
 * worked out from `import.meta.url` by hand.
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

/** The look's one `Outcome` line, or null for a look that failed. */
async function look($, op, id) {
  try {
    const { exitCode, stdout } = await $.process.run(id ? ['node', LOOK, op, '--id', id] : ['node', LOOK, op]);
    if (exitCode !== 0) return null;
    const outcome = JSON.parse(stdout.trim().split('\n').pop());
    return outcome !== null && typeof outcome === 'object' ? outcome : null;
  } catch {
    return null;
  }
}

/** Clear and submit when the look says this session's hand-off is due. */
async function handOff($) {
  const due = await look($, 'turn');
  if (due?.act !== 'clear' || !ITEM_ID.test(due.id ?? '')) return;
  await $.command.run({ command: 'clear' });
  const taken = await look($, 'cleared', due.id);
  if (taken?.act !== 'submit' || taken.id !== due.id || !PROMPT.test(taken.prompt ?? '')) return;
  await $.prompt.submit({ text: taken.prompt });
}

export function register(on) {
  if (LOOK === null) return;
  on('turn.complete', async ($, e, next) => {
    const result = await next(e);
    try {
      if (e.agentId === undefined) await handOff($);
    } catch {
      // A refused clear or submit (the Stop hold) leaves the claim taken: the hand-off fails closed, never twice.
    }
    return result;
  });
}
