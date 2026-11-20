/**
 * handoff-cache S2 probe mod (L3: never shipped). Logs every `prompt.section` the engine builds as its name, UTF-8
 * bytes and sha256, never its text; with PROBE_TRIM (a comma list, or `*` for every section) it answers `text: null`
 * for those names, which removes them, and empties a `prompt.attachment` whose type it names. `prompt.context`
 * blocks and the attachments are logged the same way. Every main `turn.complete` is logged with its `usage`.
 *
 * With PROBE_START=after-clear, after the first main turn it seeds a hand-off item on the scratch deck, runs
 * `$.command.run({ command: 'clear' })` as `hooks/handoff-mod.mjs` does, and submits the hand-off's own pickup
 * prompt. Records carry `phase`: `start` before that clear, `after-clear` from it on.
 *
 * Like `hooks/handoff-mod.mjs` it reads no environment itself; `io.mjs`, run through `$.process.run`, does.
 */

const PICKUP = 'Pick up the hand-off on the deck.';

/** `<plugin root>/io.mjs` from this file's `file:` URL. */
function ioPath(url) {
  const root = decodeURIComponent(url.slice('file://'.length, url.lastIndexOf('/')));
  return `${/^\/[A-Za-z]:\//.test(root) ? root.slice(1) : root}/io.mjs`;
}

const IO = ioPath(import.meta.url);

async function io($, ...args) {
  try {
    return await $.process.run(['node', IO, ...args]);
  } catch (err) {
    return { exitCode: -1, stdout: '', stderr: String(err?.message ?? err).slice(0, 300) };
  }
}

const log = ($, record) => io($, 'log', encodeURIComponent(JSON.stringify(record)));

/** {start, trim} from io.mjs, read once; a failed read trims nothing and starts cold. */
async function readConfig($) {
  const { stdout } = await io($, 'config');
  try {
    const config = JSON.parse(stdout.trim());
    return { start: config.start, trim: config.trim === '*' || Array.isArray(config.trim) ? config.trim : [] };
  } catch {
    return { start: 'cold', trim: [], unread: true };
  }
}

/** Bytes and sha256 of a text; the text itself goes nowhere. */
async function digest(text) {
  if (typeof text !== 'string') return { bytes: null, sha256: null };
  const data = new TextEncoder().encode(text);
  try {
    const hash = await crypto.subtle.digest('SHA-256', data);
    return { bytes: data.length, sha256: [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('') };
  } catch (err) {
    return { bytes: data.length, sha256: null, hashError: String(err?.message ?? err).slice(0, 100) };
  }
}

const errorOf = (err) => String(err?.message ?? err).slice(0, 300);

/** The session's config, read on first use (a section may be built before `session.start`). */
function config($, probe) {
  probe.config ??= readConfig($);
  return probe.config;
}

/**
 * Where an after-clear text differs from the same part's text at the start: character offsets of the changed span
 * and whether both sides of it are digits and time punctuation only (a clock or an id). Positions, never text.
 */
function spanOf(before, after) {
  if (typeof before !== 'string' || typeof after !== 'string' || before === after) return undefined;
  let from = 0;
  while (from < before.length && from < after.length && before[from] === after[from]) from += 1;
  let tail = 0;
  while (tail < before.length - from && tail < after.length - from && before.at(-1 - tail) === after.at(-1 - tail)) tail += 1;
  const a = before.slice(from, before.length - tail);
  const b = after.slice(from, after.length - tail);
  return { from, toBefore: before.length - tail, toAfter: after.length - tail, length: before.length, digitsOnly: /^[\d:.\-TZ ]*$/.test(a + b) };
}

/** Keeps a part's start text in memory (never logged) and answers its after-clear span. */
function compare(probe, key, text) {
  if (probe.phase === 'start') {
    if (!probe.texts.has(key)) probe.texts.set(key, text);
    return undefined;
  }
  return probe.texts.has(key) ? spanOf(probe.texts.get(key), text) : undefined;
}

export function register(on) {
  const probe = { config: null, phase: 'start', turns: 0, cleared: false, texts: new Map() };

  on('prompt.section', async ($, e, next) => {
    const out = await next(e);
    const { trim } = await config($, probe);
    const text = typeof out?.text === 'string' ? out.text : null;
    const trimmed = text !== null && (trim === '*' || trim.includes(e.name));
    const span = compare(probe, `section:${e.name}`, text);
    await log($, { ev: 'section', phase: probe.phase, name: e.name, keys: Object.keys(e ?? {}), ...await digest(text), trimmed, span });
    return trimmed ? { ...out, text: null } : out;
  });

  on('prompt.context', async ($, e, next) => {
    const out = await next(e);
    const blocks = Array.isArray(out?.blocks) ? out.blocks : [];
    const rows = await Promise.all(blocks.map(async (block) => ({ name: block?.name, ...await digest(block?.text) })));
    const files = out?.instructionFiles;
    await log($, { ev: 'context', phase: probe.phase, blocks: rows, instructionFiles: Array.isArray(files) ? files.length : typeof files });
    return out;
  });

  // An attachment cannot be null; a trimmed one is emptied instead.
  on('prompt.attachment', async ($, e, next) => {
    const out = await next(e);
    const { trim } = await config($, probe);
    const trimmed = typeof out?.text === 'string' && out.text !== '' && Array.isArray(trim) && trim.includes(e?.type);
    const span = compare(probe, `attachment:${e?.type}`, out?.text);
    await log($, { ev: 'attachment', phase: probe.phase, type: e?.type, agentId: e?.agentId, ...await digest(out?.text), trimmed, span });
    return trimmed ? { ...out, text: '' } : out;
  });

  on('turn.complete', async ($, e, next) => {
    const result = await next(e);
    if (e?.agentId !== undefined) return result;
    probe.turns += 1;
    await log($, { ev: 'turn', phase: probe.phase, n: probe.turns, usage: e?.usage ?? null });
    if ((await config($, probe)).start !== 'after-clear' || probe.cleared) return result;
    probe.cleared = true;
    const seeded = await io($, 'seed');
    await log($, { ev: 'seed', exitCode: seeded.exitCode, out: seeded.stdout.trim().slice(0, 200) });
    probe.phase = 'after-clear';
    try {
      await $.command.run({ command: 'clear' });
      await log($, { ev: 'clear', result: 'resolved' });
      await $.prompt.submit({ text: PICKUP });
      await log($, { ev: 'submit', result: 'resolved' });
    } catch (err) {
      await log($, { ev: 'restart', result: 'threw', error: errorOf(err) });
    }
    return result;
  });
}
