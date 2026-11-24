/**
 * The deck's one credential check, `findCredential`: every deck post, land's output and the classifier
 * log go through it. Moved whole out of `deck/store-core.mjs`, which re-exports it, so that file stays
 * under the deck's line bar; it imports nothing.
 */

// A name, its `:`/`=`, and the value captured in a lookahead, so the next pair is found from the value's start
// (`x=token=…`). The name starts where no name character precedes it, and neither run can hold `:` or `=`, so each
// character is scanned from one start only.
const NAMED_VALUE = /(?<![A-Za-z0-9_-])([A-Za-z0-9_-]+)\s*[:=]\s*["']?(?=([A-Za-z0-9/+_.@!#%*-]+))/g;
// A keyword may be glued to the word before it (`PGPASSWORD`, `GITHUBTOKEN`), but `pwd` only after a separator or a
// camel hump, since `OLDPWD` is a directory. In the middle of a name a camel hump may follow (`accessTokenTtl`).
const GLUED = 'api[_-]?key|secret|token|passw(?:or)?d';
const CAMEL = /[a-z0-9](?:Api[_-]?Key|Secret|Token|Passw(?:or)?d|Pwd)s?/.source;
const NAME_HOLDS = [new RegExp(`(?:${GLUED}|(?:^|[_-])pwd)s?(?![a-z0-9])`, 'i'), new RegExp(`${CAMEL}(?![a-z0-9])`)];
const NAME_ENDS = [new RegExp(`(?:${GLUED}|(?:^|[_-])pwd)s?$`, 'i'), new RegExp(`${CAMEL}$`)];

/**
 * Whether a `NAMED_VALUE` match is a credential of the given length class. Long: 16+ characters with a digit or
 * both cases. Short: 6+ with a letter and a digit or one of `@!#%*`, so a slug (`re-issued`), a count and a
 * dotted reference stay prose. Code is not a value: a call (`load(…)`), a member chain with no digit
 * (`process.env.API_KEY`) or a camelCase identifier of whole words (`currentSessionToken`).
 */
function namedSecret(match, text, length) {
  const [whole, name, value] = match;
  if (text[match.index + whole.length + value.length] === '(') return false;
  if (/^[A-Za-z_]+(?:\.[A-Za-z_]+)+$/.test(value) || /^[A-Za-z][a-z]+(?:[A-Z][a-z]{2,})+$/.test(value)) return false;
  if (length === 'long') {
    return value.length >= 16 && (/[0-9]/.test(value) || (/[a-z]/.test(value) && /[A-Z]/.test(value))) && NAME_HOLDS.some((r) => r.test(name));
  }
  return value.length >= 6 && /[A-Za-z]/.test(value) && /[0-9@!#%*]/.test(value) && NAME_ENDS.some((r) => r.test(name));
}

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
  // `name = value` pairs are found by one pattern and judged in code (`namedSecret`): a long value under a name
  // holding the keyword anywhere (`AWS_SECRET_ACCESS_KEY`), a short one only under a name ending in it (`DB_PASSWORD`,
  // `clientSecret`), so `TOKEN_LIMIT=4096` and `max_tokens: 100000` stay postable.
  ['a secret assigned to a name', NAMED_VALUE, (m, text) => namedSecret(m, text, 'long')],
  ['a short secret assigned to a name', NAMED_VALUE, (m, text) => namedSecret(m, text, 'short')],
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
    /\b[a-z][a-z0-9+.-]{0,30}:\/\/[^\s/:@$<]*:(?![$<{])[^\s/@]+@(?!(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?(?:[/?#\s"']|$))/i,
  ],
  ['a --password value', /(?:^|\s)--password(?:\s+|=)["']?(?![$<{-])(?=[^\s"']*[^A-Za-z\s"'])[^\s"']{6,}/],
  // A value with no digit, `+`, `/` or `=` is still base64 when a lower-case letter meets an upper-case one
  // (`dXNlcjpwYXNz`); a word, capitalised or not, is prose.
  ['a Basic authorization', /\bAuthorization:\s*Basic\s+([A-Za-z0-9+/]{8,}={0,2})/gi, (m) => /[0-9+/=]|[a-z][A-Z]/.test(m[1])],
  // No segment character may precede `eyJ`, so a run of `eyJ-` is scanned from one start, not one per `eyJ`.
  ['a JWT', /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/],
  ['a GitLab token', /\bglpat-[A-Za-z0-9_-]{20,}/],
  ['an npm token', /\bnpm_[A-Za-z0-9]{36,}/],
  ['a Google API key', /\bAIza[0-9A-Za-z_-]{35}/],
  ['a DigitalOcean token', /\bdo[opr]_v1_[a-f0-9]{64}/],
  ['a Hugging Face token', /\bhf_[A-Za-z0-9]{30,}/],
  ['a SendGrid key', /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/],
  ['a PyPI token', /\bpypi-AgE[A-Za-z0-9_-]{50,}/],
  ['a Shopify token', /\bshp(?:at|ca|pa|ss)_[a-fA-F0-9]{32}/],
  ['a Supabase token', /\bsbp_[a-f0-9]{40}/],
  ['a Linear key', /\blin_api_[A-Za-z0-9]{32,}/],
  ['a Stripe webhook secret', /\bwhsec_[A-Za-z0-9+/]{24,}/],
  ['a Google OAuth token', /\bya29\.[A-Za-z0-9_-]{20,}/],
  ['an Azure AccountKey', /\bAccountKey=[A-Za-z0-9+/]{20,}/],
  // The scheme is case-insensitive in HTTP, so a lower-case `bearer` after the header name is caught here.
  ['a token authorization', /\bAuthorization:\s*(?:token|bearer)\s+(?![$<{])[A-Za-z0-9._~+/=-]{16,}/i],
  // As `--password`: a reference or placeholder stays postable, as does a plain word; `--token-limit` is another flag.
  // `docker build --secret id=…,src=…` names a secret's file, never its value.
  [
    'a --token, --api-key, --secret or --pass value',
    /(?:^|\s)--(?:token|api[-_]?key|secret|pass)(?:\s+|=)["']?(?![$<{-]|(?:id|src|source|env|type)=)(?=[^\s"']*[^A-Za-z\s"'])[^\s"']{8,}/i,
  ],
  // As `mysql`: the gap stops at the next command name, so each character is scanned from one start.
  ['a docker login -p password', /\bdocker\s+login\b(?:(?!docker)[^\n|;&])*?\s-p\s*["']?(?![$<{-])[^\s"']/],
  ['a redis-cli -a password', /\bredis-cli\b(?:(?!redis-cli)[^\n|;&])*?\s-a\s*["']?(?![$<{-])[^\s"']/],
  // `-b` takes the password from the command line: the last of two words after `-nb` (no file), else of three.
  [
    'an htpasswd -b password',
    /\bhtpasswd\s+(?:-(?=[A-Za-z]*n)(?=[A-Za-z]*b)[A-Za-z]+\s+\S+|-(?![A-Za-z]*n)(?=[A-Za-z]*b)[A-Za-z]+(?:\s+\S+){2})\s+["']?(?![$<{-])[^\s"']/,
  ],
  // The `.npmrc` key starts a line or follows the registry's `:`; `this._authToken = …` is code.
  ['an npm _authToken', /(?<![^\s:])_authToken\s*=\s*["']?(?![$<{])[^\s"']{8,}/],
  // sshpass's own options come first, `-f`/`-d`/`-P` taking a value; any other word ends them, so `ssh -p 22` after
  // the command is a port. No run holds `sshpass`, so each character is scanned from one start only.
  [
    'an sshpass -p password',
    /\bsshpass(?:\s+(?:-[fdP]\s*(?:(?!sshpass)\S)+|-[ehvV]+))*\s+-p\s*["']?(?![$<{-])[^\s"']/,
  ],
  // Only the joined form: `mysql -p db` prompts, and `db` is the database. The gap stops at the next `mysql`.
  ['a mysql -p password', /\bmysql\w*\b(?:(?!mysql)[^\n|;&])*?\s-p["']?(?![$<{])[^\s"']/],
  // A quoted JSON or Python key leaves no doubt about what follows, so the value may be short; a plain word ("string")
  // is prose. The key run cannot hold a quote, so each character is scanned from one opening quote only.
  [
    'a secret under a quoted key',
    /["'][A-Za-z0-9_-]*(?:api[_-]?key|secret|token|passw(?:or)?d|pwd)s?["']\s*:\s*["'](?![$<{])(?=[^"'\s]*[^A-Za-z"'\s])[^"'\s]{6,}["']/i,
  ],
];

/** The credential shape `text` matches, or null. A shape with a third element is a global pattern whose matches it judges. */
export function findCredential(text) {
  for (const [what, pattern, holds] of CREDENTIAL_SHAPES) {
    if (holds ? text.matchAll(pattern).some((m) => holds(m, text)) : pattern.test(text)) return what;
  }
  return null;
}
