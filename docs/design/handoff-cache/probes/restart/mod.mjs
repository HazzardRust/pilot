/**
 * handoff-cache S4 probe mod (L3: never shipped). After the driver's second main turn it runs one restart, chosen
 * by PROBE_MODE, then submits a fixed pickup prompt; every main `turn.complete` is logged with its `usage`.
 *
 *   clear              $.command.run({ command: 'clear' })            the baseline
 *   compact            $.session.compact({ instructions })
 *   compact-keep-head  $.command.run({ command: 'compact' }), the `session.compact` hook returning { messages: the
 *                      first HEAD } (headless refuses `$.session.compact` and names /compact as its route)
 *   branch             $.command.run({ command: 'branch' })
 *
 * Each call's outcome is logged as it came back: resolved (with a summary of the value) or threw (with the
 * message). `$.session.messages()` is counted before and after the call to see whether the live context was cut.
 * Like `hooks/handoff-mod.mjs` it reads no environment itself; `io.mjs`, run through `$.process.run`, does.
 */

const MODES = ['clear', 'compact', 'compact-keep-head', 'branch'];
const DRIVER_TURNS = 2;
const HEAD = 2;
const INSTRUCTIONS = 'Summarise in one sentence: this is a probe session; nothing in it needs keeping.';
export const PICKUP = 'Probe pickup: reply with the single word PICKED.';

/** `<plugin root>/io.mjs` from this file's `file:` URL. */
function ioPath(url) {
  const root = decodeURIComponent(url.slice('file://'.length, url.lastIndexOf('/')));
  return `${/^\/[A-Za-z]:\//.test(root) ? root.slice(1) : root}/io.mjs`;
}

const IO = ioPath(import.meta.url);

/** A JSON-safe summary of whatever the host handed back. */
function brief(value) {
  if (value === undefined || value === null) return value ?? 'undefined';
  if (Array.isArray(value)) return { array: value.length };
  if (typeof value === 'object') return { keys: Object.keys(value).slice(0, 20) };
  if (typeof value === 'function') return 'function';
  return String(value).slice(0, 300);
}

async function log($, record) {
  try {
    await $.process.run(['node', IO, 'log', encodeURIComponent(JSON.stringify(record))]);
  } catch {
    // Nothing to log to: the runner reads the absence.
  }
}

async function readMode($) {
  try {
    const { stdout } = await $.process.run(['node', IO, 'mode']);
    const mode = stdout.trim();
    return MODES.includes(mode) ? mode : null;
  } catch {
    return null;
  }
}

/** `$.session.messages()` as a count, or what stopped it. */
async function countMessages($) {
  try {
    const messages = await $.session.messages();
    return Array.isArray(messages) ? messages.length : brief(messages);
  } catch (err) {
    return { threw: String(err?.message ?? err).slice(0, 300) };
  }
}

/** The one restart call, its outcome as it came back. */
async function restart($, mode) {
  try {
    let value;
    if (mode === 'clear') value = await $.command.run({ command: 'clear' });
    else if (mode === 'branch') value = await $.command.run({ command: 'branch' });
    // Headless refuses `$.session.compact` and names a /compact prompt as the way compaction runs there.
    else if (mode === 'compact-keep-head') value = await $.command.run({ command: 'compact' });
    else value = await $.session.compact({ instructions: INSTRUCTIONS });
    return { result: 'resolved', value: brief(value) };
  } catch (err) {
    return { result: 'threw', error: String(err?.message ?? err).slice(0, 500) };
  }
}

export function register(on) {
  const probe = { mode: null, turns: 0, restarted: false, submitted: false, keepHead: false };

  on('session.compact', async ($, e, next) => {
    if (!probe.keepHead) return next(e);
    const messages = Array.isArray(e?.messages) ? e.messages : null;
    await log($, { ev: 'compact-hook', keys: brief(e).keys ?? brief(e), messages: messages?.length ?? null });
    if (messages === null) return next(e);
    return { messages: messages.slice(0, HEAD) };
  });

  on('turn.complete', async ($, e, next) => {
    const result = await next(e);
    if (e?.agentId !== undefined) return result;
    probe.turns += 1;
    await log($, {
      ev: 'turn', n: probe.turns, restarted: probe.restarted, submitted: probe.submitted, keys: brief(e).keys,
      usage: e?.usage ?? null,
    });
    if (probe.restarted || probe.turns !== DRIVER_TURNS) return result;
    probe.restarted = true;
    probe.mode = await readMode($);
    if (probe.mode === null) {
      await log($, { ev: 'restart', mode: null, result: 'no mode' });
      return result;
    }
    probe.keepHead = probe.mode === 'compact-keep-head';
    const before = await countMessages($);
    const outcome = await restart($, probe.mode);
    probe.keepHead = false;
    const after = await countMessages($);
    await log($, { ev: 'restart', mode: probe.mode, ...outcome, messagesBefore: before, messagesAfter: after });
    probe.submitted = true;
    try {
      await $.prompt.submit({ text: PICKUP });
      await log($, { ev: 'submit', result: 'resolved' });
    } catch (err) {
      await log($, { ev: 'submit', result: 'threw', error: String(err?.message ?? err).slice(0, 300) });
    }
    return result;
  });
}
