/**
 * The crew probe's mod (handoff-cache S5). At the main session's first turn end it clears the way
 * `hooks/handoff-mod.mjs` does, `$.command.run({ command: 'clear' })` then `$.prompt.submit`, and lets the
 * background agent send main its message at one point of that clear, read from `config.mjs`:
 *
 *   before  the agent's send returns before `command.run` is called (main idle, the mod holding its turn end)
 *   during  the send happens inside the `SessionStart:clear` hook, which runs before `command.run` resolves
 *   after   the send happens once the fresh context's first turn has ended
 *
 * It logs every turn, the clear, `$.agent.list()` after the clear and at each fresh turn end, and any
 * `session.receive`, to `<dir>/mod.jsonl` through `probe-io.mjs`. A mod may import nothing of Node's, so the
 * helper's path is worked out from `import.meta.url` by hand, as the hand-off mod does.
 */

import { config } from './config.mjs';

const FRESH = 'FRESH-CONTEXT probe. Another agent may message you. For each message from another agent that you '
  + 'can see now, or that arrives later, reply with exactly `RECEIVED: <the message text>`. If you see none now, '
  + 'reply with exactly `NONE YET`. Use no tools.';

/** `<plugin>/hooks/probe-io.mjs` from this file's `file:` URL; null off a file. */
function ioPath(url) {
  if (typeof url !== 'string' || !url.startsWith('file:///')) return null;
  const hooks = decodeURIComponent(url.slice('file://'.length, url.lastIndexOf('/')));
  return `${/^\/[A-Za-z]:\//.test(hooks) ? hooks.slice(1) : hooks}/probe-io.mjs`;
}

const IO = ioPath(import.meta.url);

async function io($, ...args) {
  try {
    const { exitCode, stdout } = await $.process.run(['node', IO, ...args]);
    return { exitCode, out: String(stdout).trim() };
  } catch (error) {
    return { exitCode: -1, out: String(error) };
  }
}

function log($, entry) {
  return io($, 'log', config.dir, JSON.stringify(entry));
}

function pause($, ms) {
  return new Promise((resolve) => { $.clock.after(ms, resolve); });
}

async function agents($) {
  try {
    return await $.agent.list();
  } catch (error) {
    return { error: String(error) };
  }
}

/** The clear, with the send placed before it, inside it (the hook) or after the fresh turn (`onFresh`). */
async function clearOnce($, mod) {
  if (config.at === 'before') {
    await io($, 'go', config.dir);
    const sent = await io($, 'waitsent', config.dir, '150000');
    await pause($, 3_000);
    await log($, { ev: 'before-sent', sent });
    await log($, { ev: 'agents-before-clear', agents: await agents($) });
  }
  await log($, { ev: 'clear-start' });
  try {
    await $.command.run({ command: 'clear' });
    await log($, { ev: 'clear-end' });
  } catch (error) {
    await log($, { ev: 'clear-refused', error: String(error) });
    return;
  }
  mod.phase = 'fresh';
  await log($, { ev: 'agents-after-clear', agents: await agents($) });
  try {
    await $.prompt.submit({ text: FRESH });
    await log($, { ev: 'submitted' });
  } catch (error) {
    await log($, { ev: 'submit-refused', error: String(error) });
  }
}

async function onFresh($, mod) {
  mod.freshTurns += 1;
  await log($, { ev: 'agents-fresh-turn', n: mod.freshTurns, agents: await agents($) });
  if (config.at === 'after' && !mod.go) {
    mod.go = true;
    await io($, 'go', config.dir);
    await log($, { ev: 'after-go' });
  }
}

export function register(on) {
  if (config.dir === null || IO === null) return;
  const mod = { phase: 'old', acting: false, freshTurns: 0, go: false };

  on('turn.start', async ($, e, next) => {
    await log($, { ev: 'turn.start', agentId: e.agentId ?? null, phase: mod.phase });
    return next(e);
  });

  on('turn.complete', async ($, e, next) => {
    const result = await next(e);
    await log($, { ev: 'turn.complete', agentId: e.agentId ?? null, phase: mod.phase });
    if (e.agentId !== undefined) return result;
    if (mod.phase === 'fresh') await onFresh($, mod);
    else if (!mod.acting) {
      mod.acting = true;
      await clearOnce($, mod);
    }
    return result;
  });

  try {
    on('session.receive', async ($, e, next) => {
      await log($, { ev: 'receive', origin: e?.origin ?? null, agentId: e?.agentId ?? null, phase: mod.phase });
      return next(e);
    });
  } catch {
    // An event this host does not know: the probe runs without the receive log.
  }
}
