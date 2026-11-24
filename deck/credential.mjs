/**
 * The deck's one credential check, `findCredential`: every deck post, land's output and the classifier
 * log go through it. Moved whole out of `deck/store-core.mjs`, which re-exports it, so that file stays
 * under the deck's line bar; it imports nothing.
 */

/**
 * Shapes that mean "this is a credential, not prose". Each is deliberately anchored
 * so that talking *about* tokens ("the token field is nullable", "secret rotation is
 * slice 9", `process.env.PILOT_API_KEY`) stays postable — a deck that refused every
 * mention of the word would be worked around within a day, which is the failure mode
 * that matters.
 */
const CREDENTIAL_SHAPES = [
  ['a private key block', /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/],
  ['an sk- API key', /\bsk-[A-Za-z0-9_-]{16,}/],
  ['a Stripe secret or restricted key', /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}/],
  ['a GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/],
  ['an AWS access key id', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['a Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ['a bearer token', /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/],
  // The name may carry `_`/`-` joined words either side (`AWS_SECRET_ACCESS_KEY=`, `NPM_TOKEN=`). The run starts only
  // where no name character precedes it, so each name is scanned from one start and nothing backtracks quadratically.
  [
    'a secret assigned to a name',
    /(?<![A-Za-z0-9_-])(?:[A-Za-z0-9]+[_-])*(?:api[_-]?key|secret|token|password|passwd|pwd)(?:[_-][A-Za-z0-9]+)*(?![A-Za-z0-9])\s*[:=]\s*["']?[A-Za-z0-9/+_-]{16,}/i,
  ],
  // A shell reference (`$TOKEN`) or a placeholder (`<token>`) names a credential and stays postable; a plain word
  // after `--password` or `Basic` is prose. No run may fail open at a bound, and none may backtrack for seconds on
  // 64 KiB: the gap after `curl` is unbounded but stops at the next `curl`, so each character is scanned from one
  // `curl` only; the user run is unbounded, since it cannot hold the whitespace that starts the next flag; the flag
  // cluster stays bounded, and one of 11+ letters with a `u` past them is flagged outright. That over-flags an
  // absurd cluster such as `-abcdefghijklu`, deliberately: failing closed is the accepted cost. The gap steps over a
  // quoted string on one line as a single unit, so an `&`, `;` or `|` inside quotes does not end it; a quote with no
  // partner later on its line is a plain character, so the units never overlap and none backtracks. The password may
  // open with a quote, and curl is matched in any case.
  [
    'a password in a curl -u',
    /\bcurl\b(?:(?!\bcurl\b)(?:"[^"\n]*"|'[^'\n]*'|"(?![^"\n]*")|'(?![^'\n]*')|[^\n|;&"']))*?\s(?:-[A-Z0-9]{11}[A-Z0-9]*U|(?:--(?:proxy-)?user|-[A-Z0-9]{0,10}U)(?:\s+|=|(?=[^\s-]))["']?[^\s"':$<]+:["']?(?![$<{])[^\s"'])/i,
  ],
  // A loopback host's userinfo is a local dev stack's (a Supabase local database), never a shared credential. The
  // user and password runs are unbounded so a long one cannot fail open; neither can hold `/`, so a run is scanned
  // from one `://` only.
  [
    'a password in a URL',
    /\b[a-z][a-z0-9+.-]{0,30}:\/\/[^\s/:@$<]+:(?![$<{])[^\s/@]+@(?!(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?(?:[/?#\s"']|$))/i,
  ],
  ['a --password value', /(?:^|\s)--password(?:\s+|=)["']?(?![$<{-])(?=[^\s"']*[^A-Za-z\s"'])[^\s"']{6,}/],
  ['a Basic authorization', /\bAuthorization:\s*Basic\s+(?=[A-Za-z0-9+/=]*[0-9+/=])[A-Za-z0-9+/]{8,}={0,2}/i],
  ['a JWT', /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/],
];

/** The credential shape `text` matches, or null. */
export function findCredential(text) {
  for (const [what, pattern] of CREDENTIAL_SHAPES) {
    if (pattern.test(text)) return what;
  }
  return null;
}
