/**
 * `pilot checks [<ref>] [--wait <min>]` (ci-gate spec 7; L1, L10): the CI on one commit as S1's **Check line**, its
 * state as the exit code, or a bounded wait while it is pending. The ref is resolved by git to a full sha and only
 * that sha reaches the host, so no ref text is ever a host CLI argument (spec 10).
 */

import { git as gitAt } from './pilot-branch.mjs';
import { hostFor } from '../deck/host.mjs';
import { checkLine, checksAt } from './checks.mjs';

const USAGE = 'usage: pilot checks [<ref>] [--wait <min>]   (min 1..60, default 20)\n';
const EXIT = { green: 0, red: 1, pending: 4, none: 5, unread: 6 };
const POLL_MS = 30_000;
const DEFAULT_WAIT_MIN = 20;

/** `{ ref, wait }` from argv, or null when it is not the usage. `wait` is minutes, 0 without `--wait`. */
function parse(argv) {
  let ref;
  let wait;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--wait') {
      if (wait !== undefined) return null;
      // The next word is the minutes when it is number-shaped, else a bare --wait and the word is the ref.
      if (/^[0-9.]+$/.test(argv[i + 1] ?? '')) {
        wait = Number(argv[(i += 1)]);
        if (!Number.isInteger(wait) || wait < 1 || wait > 60) return null;
      } else wait = DEFAULT_WAIT_MIN;
    } else if (arg.startsWith('-') || ref !== undefined) return null;
    else ref = arg;
  }
  return { ref: ref ?? 'HEAD', wait: wait ?? 0 };
}

/** The exit code of `pilot checks`; prints one Check line on stdout, or the usage on stderr (exit 2). */
export async function main(argv, {
  cwd = process.cwd(),
  host,
  git = (args) => gitAt(cwd, ...args),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
} = {}) {
  const args = parse(argv);
  if (args === null) {
    process.stderr.write(USAGE);
    return 2;
  }
  let sha;
  try {
    sha = git(['rev-parse', '--verify', '--quiet', `${args.ref}^{commit}`]).trim();
  } catch {
    process.stderr.write(`pilot checks: ${JSON.stringify(args.ref)} is not a commit here\n${USAGE}`);
    return 2;
  }
  let verdict;
  try {
    const reader = host === undefined ? hostFor(cwd, { git }) : host;
    const deadline = now() + args.wait * 60_000;
    verdict = checksAt({ host: reader, sha });
    while (verdict.state === 'pending' && now() + POLL_MS < deadline) {
      await sleep(POLL_MS);
      verdict = checksAt({ host: reader, sha });
    }
  } catch (err) {
    // A host that cannot be chosen (a bad pilot.host) is unread, never green.
    verdict = { state: 'unread', sha, why: String(err?.message ?? err).split(/\r?\n/)[0] };
  }
  process.stdout.write(`${checkLine(verdict)}\n`);
  return EXIT[verdict.state];
}
