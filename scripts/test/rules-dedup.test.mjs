/**
 * crew-voice-rules S12 (spec 9, 10; L1, L9, L16): reading a React component loads the
 * typescript/, react/ and web/ rules together, so each rule is said once among them and
 * the three together stay under 10k tokens. A rule that two co-loaded files both state is
 * a rule paid for twice on every .tsx read.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { measureRules } from '../measure-rules.mjs';
import { bodyOf } from './lib/area-file.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIRS = ['typescript', 'react', 'web'];

const BULLET = /^\s*(?:[-*]|\d+\.)\s+(?:\[[ x]\]\s+)?/;
const HEADING = /^#{2,4}\s+/;
const STOP = new Set('a an the and or of to in on for with by is are be it its as at from that this when only not no do use never'.split(' '));

/** A heading's or a list item's words, without markdown, case, punctuation or a parenthetical. */
const words = (line) =>
  line.replace(BULLET, '').replace(HEADING, '').replace(/\([^)]*\)/g, ' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Every heading and list item in the body of every rules file under `dir`, outside code fences. */
function entries(dir) {
  const out = [];
  for (const file of fs.readdirSync(path.join(ROOT, 'rules', dir))) {
    const text = bodyOf(fs.readFileSync(path.join(ROOT, 'rules', dir, file), 'utf8'));
    let fenced = false;
    for (const line of text.split('\n')) {
      if (line.startsWith('```')) fenced = !fenced;
      else if (!fenced && HEADING.test(line)) out.push({ dir, where: `${dir}/${file}`, kind: 'heading', text: words(line) });
      else if (!fenced && BULLET.test(line)) out.push({ dir, where: `${dir}/${file}`, kind: 'bullet', text: words(line) });
    }
  }
  return out;
}

/** Share of content words two items have in common (Jaccard). */
function overlap(a, b) {
  const set = (text) => new Set(text.split(' ').filter((word) => word && !STOP.has(word)));
  const [x, y] = [set(a), set(b)];
  if (x.size < 3 || y.size < 3) return 0; // a list value, not a rule
  const shared = [...x].filter((word) => y.has(word)).length;
  return shared / (x.size + y.size - shared);
}

test('a .tsx read is at most 10k tokens', () => {
  const { trigger } = measureRules();
  assert.deepEqual(trigger['.tsx'].dirs, ['react', 'typescript', 'web']);
  assert.ok(trigger['.tsx'].tokens <= 10000, `a .tsx read loads ${trigger['.tsx'].tokens} tokens of rules`);
  // S9's figures: the dedup trims the React and web layers, never the base past what it was.
  assert.ok(trigger['.ts'].tokens <= 1837, `a .ts read loads ${trigger['.ts'].tokens} tokens`);
  assert.ok(trigger['.js'].tokens <= 1837, `a .js read loads ${trigger['.js'].tokens} tokens`);
});

test("no heading's rule appears in two of typescript/react/web", () => {
  const all = DIRS.flatMap(entries);
  assert.ok(all.length > 100, `only ${all.length} headings and list items were read`);
  const twice = [];
  for (const [i, a] of all.entries()) {
    for (const b of all.slice(i + 1)) {
      if (a.dir === b.dir || a.kind !== b.kind) continue;
      const same = a.kind === 'heading' ? a.text === b.text : overlap(a.text, b.text) >= 0.5;
      if (same) twice.push(`${a.kind} "${a.text}" in ${a.where} and "${b.text}" in ${b.where}`);
    }
  }
  assert.deepEqual(twice, []);
});

/**
 * Every security rule the three security files held before S12, by a phrase that states it.
 * The dedup may move a rule to the co-loaded file that says it best; it may not lose one.
 */
const SECURITY_RULES = [
  /process\.env\.API_KEY/, /security-reviewer/, /react-reviewer/,
  /dangerouslySetInnerHTML=\{\{ __html: DOMPurify\.sanitize/, /allowlisting tags, not denylisting/,
  /sanitized at the \*\*same call site\*\*/, /`javascript:` and `data:` URLs/, /rel="noopener noreferrer"/,
  /same trust level as a public API endpoint/, /Authenticate inside the action/, /Authorize: confirm the current user/,
  /Rate limit sensitive actions/, /NEXT_PUBLIC_\*/, /Never store sessions in `localStorage`/,
  /Render-gating in JSX prevents display, not access/, /CSRF tokens or `SameSite=Strict`\/`Lax`/,
  /double-submit cookies or origin verification/, /frame-ancestors 'none'/, /Avoid `unsafe-inline` and `unsafe-eval`/,
  /per-request nonces/, /CSS-in-JS libraries — document the tradeoff/, /attacker controls __proto__/,
  /never concatenate user input into the surrounding HTML template/, /`npm audit` before adding any UI library/,
  /accept HTML strings as props/, /without source maps/, /'nonce-\{RANDOM\}'/, /Never inject unsanitized HTML/,
  /Escape dynamic template values/, /Use SRI when serving from a CDN/, /Strict-Transport-Security/,
  /X-Content-Type-Options: nosniff/, /X-Frame-Options: DENY/, /Permissions-Policy/,
  /CSRF protection on state-changing forms/, /Rate limiting on submission endpoints/, /Validate client and server side/,
];

test('every security file keeps its rules', () => {
  const text = DIRS.map((dir) => fs.readFileSync(path.join(ROOT, 'rules', dir, 'security.md'), 'utf8')).join('\n');
  assert.deepEqual(SECURITY_RULES.filter((rule) => !rule.test(text)).map(String), []);
});
