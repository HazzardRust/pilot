// `pilot wait-for`: wait on a file for a line matching a pattern, and end by itself at a deadline.
// An agent waiting on a log uses this instead of an `until` loop, which never ends when the marker
// never comes. There is no default deadline, and none past MAX_WAIT_MINUTES.
import { readFileSync, statSync } from 'node:fs';
import { parseArgs } from 'node:util';

// Inside the one-hour prompt cache (A4).
export const MAX_WAIT_MINUTES = 50;
const MAX_MATCH_CHARS = 200;
const DEFAULT_POLL_MS = 2000;
const USAGE = `usage: pilot wait-for --file <path> --match <regex> --timeout <minutes>  (0 < minutes <= ${MAX_WAIT_MINUTES})`;

// The file's text, or null while it does not exist yet. Any other failure (a directory, no read
// permission) is thrown, since polling would never get past it; so is a FIFO or a device, whose
// read could block past the deadline.
function readText(file) {
  let st;
  try {
    st = statSync(file);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
  if (!st.isFile()) throw new Error('not a regular file');
  return readFileSync(file, 'utf8');
}

const realSleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

export async function waitFor({ file, match, timeoutMin, read = readText, now = Date.now, sleep = realSleep, pollMs = DEFAULT_POLL_MS }) {
  const re = new RegExp(match);
  const deadline = now() + timeoutMin * 60_000;
  for (;;) {
    const text = read(file);
    if (text !== null) {
      // The last piece has no newline yet: a line still being written, so not matched.
      const line = text.split(/\r?\n/).slice(0, -1).find((l) => re.test(l));
      if (line !== undefined) return { line };
    }
    const left = deadline - now();
    if (left <= 0) return { timedOut: true };
    await sleep(Math.min(pollMs, left));
  }
}

// The reason argv cannot start a wait, or null with the parsed options.
function parse(argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: { file: { type: 'string' }, match: { type: 'string' }, timeout: { type: 'string' } },
      strict: true,
      allowPositionals: false,
    }));
  } catch (e) {
    return { error: e.message };
  }
  const { file, match, timeout } = values;
  if (!file) return { error: '--file is required' };
  if (!match) return { error: '--match is required' };
  if (match.length > MAX_MATCH_CHARS) return { error: `--match is over ${MAX_MATCH_CHARS} characters` };
  try {
    new RegExp(match);
  } catch (e) {
    return { error: `--match is not a valid regular expression: ${e.message}` };
  }
  if (timeout === undefined) return { error: '--timeout is required; a wait with no deadline is refused' };
  const minutes = /^\d+(\.\d+)?$/.test(timeout) ? Number(timeout) : NaN;
  if (!(minutes > 0 && minutes <= MAX_WAIT_MINUTES)) {
    return { error: `--timeout must be a number of minutes above 0 and at most ${MAX_WAIT_MINUTES}` };
  }
  return { file, match, timeoutMin: minutes };
}

export async function main(argv, { out = process.stdout, err = process.stderr } = {}) {
  const opts = parse(argv);
  if (opts.error) {
    err.write(`pilot wait-for: ${opts.error}\n${USAGE}\n`);
    return 1;
  }
  let result;
  try {
    result = await waitFor(opts);
  } catch (e) {
    err.write(`pilot wait-for: cannot read ${opts.file}: ${e.message}\n`);
    return 1;
  }
  if (result.timedOut) {
    out.write(`timed out waiting for ${opts.match} in ${opts.file} after ${opts.timeoutMin} min\n`);
    return 2;
  }
  out.write(`${result.line}\n`);
  return 0;
}
