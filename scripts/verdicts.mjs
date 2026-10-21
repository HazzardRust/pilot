/**
 * The grammar of an artefact's assumed decisions (verdict-pass §4, L3, L6): pure, no I/O.
 * §6 runs from its `## 6` heading to the next `## ` heading. An assumed decision (A‹n›) is a
 * top-level list item there whose first bold token is `A<n>`, as `- **A3 Title.** …` or
 * `- **A1** …` (any list marker, so another shape is never a way past the check); it ends at
 * the next top-level item or heading. Its verdict is an indented line inside it,
 * `Verdict: stands[ — <why>]` or `Verdict: overturned: <why>`.
 */

const ITEM = /^(?:[-*+]|\d+\.) /;
const BULLET = /^(?:[-*+]|\d+\.) \*\*(A\d+)\b/;
const VERDICT = /^\s+Verdict: (?:stands(?:\s+[—–-]\s+\S.*)?\s*|overturned:\s*\S.*)$/;

/** A verdict message line, `A<n> <verdict line>`; whether the verdict line is one is VERDICT's call. */
const MESSAGE_LINE = /^(A\d+) (.*)$/;
const PREFIX = 'Verdict: ';

/**
 * §6's A‹n› bullets in order, each as `{ id, head, lines, at }`: the index of its item line, and
 * the text and index of every line after it; none when §6 is absent or empty.
 */
function bullets(markdown) {
  const out = [];
  let inSix = false;
  let current = null;
  String(markdown).split(/\r?\n/).forEach((line, index) => {
    if (/^## /.test(line)) {
      inSix = /^## 6\b/.test(line);
      current = null;
    } else if (!inSix) {
      return;
    } else if (ITEM.test(line) || line.startsWith('#')) {
      const id = BULLET.exec(line)?.[1];
      current = id ? { id, head: index, lines: [], at: [] } : null;
      if (current) out.push(current);
    } else if (current) {
      current.lines.push(line);
      current.at.push(index);
    }
  });
  return out;
}

/**
 * The pilot's verdict message as `{ A<n>: verdict }`: one `A<n> Verdict: <verdict>` per non-blank
 * line, the verdict as VERDICT reads it, without its `Verdict: ` prefix. Throws naming the first
 * line that is not one, or an id given twice.
 */
export function parseVerdictMessage(text) {
  const record = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const [, id, verdict] = MESSAGE_LINE.exec(line) ?? [];
    if (!id || !VERDICT.test(`  ${verdict}`)) throw new Error(`not a verdict line: ${line}`);
    if (Object.hasOwn(record, id)) throw new Error(`${id} has two verdict lines`);
    record[id] = verdict.slice(PREFIX.length);
  }
  return record;
}

/** §6's verdict per A‹n› that has one, without the `Verdict: ` prefix; a bullet's several lines are joined with `\n`, so they match no one-line record. */
export function verdictsOf(markdown) {
  const out = {};
  for (const bullet of bullets(markdown)) {
    const found = bullet.lines.filter((each) => VERDICT.test(each));
    if (found.length > 0) out[bullet.id] = found.map((line) => line.trim().slice(PREFIX.length)).join('\n');
  }
  return out;
}

/**
 * The markdown with each §6 bullet's verdict line, `  Verdict: <verdict>` from the record, after the
 * bullet's last line of text, replacing every verdict line already there; the rest unchanged, line
 * endings kept. Throws naming the ids on one side only; the verdicts are parseVerdictMessage's.
 */
export function writeVerdicts(markdown, record) {
  const text = String(markdown);
  const list = bullets(text);
  const ids = list.map((bullet) => bullet.id);
  const unanswered = ids.filter((id) => !Object.hasOwn(record, id));
  const unknown = Object.keys(record).filter((id) => !ids.includes(id));
  if (unanswered.length || unknown.length) {
    const sides = [unanswered.length && `no verdict for ${unanswered.join(', ')}`, unknown.length && `not in §6: ${unknown.join(', ')}`];
    throw new Error(sides.filter(Boolean).join('; '));
  }
  const drop = new Set();
  const after = new Map();
  for (const { id, head, lines, at } of list) {
    const line = `  ${PREFIX}${record[id]}`;
    let last = head;
    lines.forEach((each, i) => {
      if (VERDICT.test(each)) drop.add(at[i]);
      else if (each.trim()) last = at[i];
    });
    after.set(last, line);
  }
  const out = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (!drop.has(index)) out.push(line);
    if (after.has(index)) out.push(after.get(index));
  });
  return out.join(text.includes('\r\n') ? '\r\n' : '\n');
}

/** The A‹n› ids of §6, in order. */
export function assumedIds(markdown) {
  return bullets(markdown).map((bullet) => bullet.id);
}

/** The A‹n› ids of §6 whose bullet holds no verdict line, in order. */
export function unverdicted(markdown) {
  return bullets(markdown)
    .filter((bullet) => !bullet.lines.some((line) => VERDICT.test(line)))
    .map((bullet) => bullet.id);
}
