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
  ['a GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/],
  ['an AWS access key id', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['a Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ['a bearer token', /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/],
  [
    'a secret assigned to a name',
    /\b(?:api[_-]?key|secret|token|password|passwd|pwd)\b\s*[:=]\s*["']?[A-Za-z0-9/+_-]{16,}/i,
  ],
  // A shell reference (`$TOKEN`) or a placeholder (`<token>`) names a credential and stays postable. The gaps and
  // runs are bounded so a 64 KiB field cannot backtrack for seconds; a plain word after `--password` or `Basic` is prose.
  [
    'a password in a curl -u',
    /\bcurl\b[^\n|;&]{0,500}\s(?:--(?:proxy-)?user|-[A-Za-z]*[uU])(?:\s+|=|(?=[^\s-]))["']?[^\s"':$<]+:(?![$<{])[^\s"']+/,
  ],
  ['a password in a URL', /\b[a-z][a-z0-9+.-]{0,30}:\/\/[^\s/:@$<]{1,200}:(?![$<{])[^\s/@]{1,500}@/i],
  ['a --password value', /(?:^|\s)--password(?:\s+|=)["']?(?![$<{-])(?=[^\s"']*[^A-Za-z\s"'])[^\s"']{6,}/],
  ['a Basic authorization', /\bAuthorization:\s*Basic\s+(?=[A-Za-z0-9+/=]*[0-9+/=])[A-Za-z0-9+/]{8,}={0,2}/i],
  ['a JWT', /\beyJ[A-Za-z0-9_-]{8,2000}\.eyJ[A-Za-z0-9_-]{8,2000}\.[A-Za-z0-9_-]*/],
];

/** The credential shape `text` matches, or null. */
export function findCredential(text) {
  for (const [what, pattern] of CREDENTIAL_SHAPES) {
    if (pattern.test(text)) return what;
  }
  return null;
}
