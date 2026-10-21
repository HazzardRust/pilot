#!/usr/bin/env node
/**
 * A slice file's Tests are the implementer's red steps, so each must aim at a seam the
 * slice declares: `` N. `<name>`: `<Interface symbol>` → <observable result> ``, the
 * symbol present in the slice's Interface block. The file also carries one
 * `Rewrite check:` line (what stays true if the implementation behind the interface were
 * replaced) and stays at or under 60 lines. ADR 0082; deep-modules L2-L4. Each blocker in the
 * header's `after:` field names what it shares, `S<n> (<file or seam>)` (design-docs-only L8).
 * The header, above the first `## ` section, states the implementer's model and why:
 * `Model: sonnet — <reason>` or `Model: opus — <reason>` (cheaper-crew L2); a slice whose
 * `Reviewers:` line names `pilot:security-reviewer` hits the security trigger and says opus (A2).
 *
 * Usage: node scripts/check-slices.mjs <path>...
 *   A directory means its *.md files; a SKILL.md means its ````markdown worked example(s).
 *   Only the paths given are checked (L3): earlier features' slice files predate the shape.
 *   An architecture.md is checked by `checkSpec` instead: every §2 spec line carries a bar
 *   (architect-deeper spec 3, L2-L4).
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_LINES = 60;
const TEST_ITEM = /^\s*(?:\d+[.)]|[-*+])(?:\s|$)/;
const SEAM_FIRST = /^\d+\.\s+`[^`]+`:\s+`([^`]+)`\s+→\s+\S/;
/** A blocker naming another ticket's PR, `#<digits>`. */
const PR_WAIT = /^#\d+\b/;
const AFTER_FIELD = /·\s*after:\s*(.*?)\s*(?:·|$)/;
const REASONED = /^S\d+\w*\s+\(.*\S.*\)$/;
const NONE = new Set(['', '–', '-', '—']);
const MODEL_LINE = /^Model: (?:sonnet|opus) — \S/;
const SECURITY_REVIEWED = /^Reviewers:.*\bpilot:security-reviewer\b/;

/** Per line, true when it sits inside a ``` fence (the fence lines themselves included). */
function fenced(lines) {
  let open = false;
  return lines.map((line) => {
    if (!line.startsWith('```')) return open;
    open = !open;
    return true;
  });
}

/** The lines of a `## <name>` section, with their 1-based line numbers; a fenced `## ` line does not end it. */
function section(lines, inFence, name) {
  const start = lines.findIndex((line, i) => !inFence[i] && line.trim() === `## ${name}`);
  if (start === -1) return null;
  const body = [];
  for (let i = start + 1; i < lines.length && (inFence[i] || !lines[i].startsWith('## ')); i++) {
    body.push({ line: i + 1, text: lines[i] });
  }
  return { line: start + 1, body };
}

/** True when `symbol` stands in `text` as a whole token, not inside a longer name. */
function names(text, symbol) {
  [text, symbol] = [text, symbol].map((s) => s.replace(/[ 	]+/g, ' '));
  for (let at = text.indexOf(symbol); at !== -1; at = text.indexOf(symbol, at + 1)) {
    const before = text[at - 1] ?? '';
    const after = text[at + symbol.length] ?? '';
    if (!/[\w-]/.test(before) && !/[\w-]/.test(after)) return true;
  }
  return false;
}

/** The `after:` field's blockers, split on the commas outside brackets. */
function blockers(field) {
  const parts = [''];
  let depth = 0;
  for (const ch of field) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) parts.push('');
    else parts[parts.length - 1] += ch;
  }
  return parts.map((part) => part.trim());
}

/** Problems with one slice file's text; [] when it is seam-first. */
export function checkSlice(text) {
  const lines = text.replace(/(?:\r?\n)+$/, '').split(/\r?\n/);
  const inFence = fenced(lines);
  const problems = [];
  const problem = (line, rule, message) => problems.push({ line, rule, message });

  const tests = section(lines, inFence, 'Tests');
  const iface = section(lines, inFence, 'Interface');
  const interfaceText = iface ? iface.body.map(({ text: t }) => t).join('\n') : '';
  const items = tests ? tests.body.filter(({ text: t }) => TEST_ITEM.test(t)) : [];
  const shape = '`<name>`: `<Interface symbol>` → <observable result>';

  if (items.length === 0) problem(tests ? tests.line : 1, 'tests-shape', `no numbered Tests lines reading ${shape}`);
  for (const { line, text: item } of items) {
    const match = SEAM_FIRST.exec(item);
    if (!match) problem(line, 'tests-shape', `does not read ${shape}`);
    else if (!names(interfaceText, match[1])) {
      problem(line, 'symbol-not-in-interface', `\`${match[1]}\` is not in the Interface block`);
    }
  }

  const rewrites = lines.flatMap((t, i) => (!inFence[i] && /^Rewrite check:\s*\S/.test(t) ? [i + 1] : []));
  if (rewrites.length !== 1) {
    const at = rewrites[1] ?? (tests ? tests.line : 1);
    problem(at, 'rewrite-check', `needs exactly one "Rewrite check:" line, found ${rewrites.length}`);
  }

  const header = lines.findIndex((t, i) => !inFence[i] && AFTER_FIELD.test(t));
  if (header !== -1) {
    const field = AFTER_FIELD.exec(lines[header])[1];
    if (!NONE.has(field)) {
      for (const blocker of blockers(field).filter((b) => !REASONED.test(b))) {
        if (PR_WAIT.test(blocker)) {
          problem(header + 1, 'after-ticket', `\`${blocker}\` waits on another ticket's PR; a green ticket is on pilot already, and the order between tickets is the deck queue`);
          continue;
        }
        problem(header + 1, 'after-reason', `\`${blocker}\` in after: names no reason; write S<n> (<file or seam>)`);
      }
    }
  }

  const firstSection = lines.findIndex((t, i) => !inFence[i] && t.startsWith('## '));
  const headerLines = firstSection === -1 ? lines : lines.slice(0, firstSection);
  const model = headerLines.findIndex((t, i) => !inFence[i] && MODEL_LINE.test(t));
  if (model === -1) {
    problem(1, 'model-line', 'the header has no "Model: sonnet|opus — <reason>" line above the first ## section');
  } else if (lines[model].startsWith('Model: sonnet') && headerLines.some((t, i) => !inFence[i] && SECURITY_REVIEWED.test(t))) {
    problem(model + 1, 'model-security', 'Reviewers names pilot:security-reviewer, so the slice hits the security trigger and runs on opus (A2)');
  }

  if (lines.length > MAX_LINES) {
    problem(MAX_LINES + 1, 'length', `${lines.length} lines; a slice file stays at or under ${MAX_LINES}`);
  }

  return problems.sort((a, b) => a.line - b.line);
}

/** A word after which a numeral names a thing rather than bounding it (L4). */
const REFERENCE = /^(?:spec|line|adr|step|slice|item|ticket|pr)s?$/i;
const NUMERAL = /^(?!0\d)\d+(?:[.,]\d+)?(?:[–-]\d+|%|ms|s|m|h|k|x|kb|mb|gb|px|-[a-z]+)?$/i;
const NUMBER_WORD = /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/i;
const BOUND = /\b(?:at most|at least|exactly|within|under|no more than|fewer than)\b/i;
const ID_CELL = /^(?:#|t|tickets?)$/i;
const TABLE_RULE = /^\|?(?:\s*:?-+:?\s*\|)+\s*(?::?-+:?\s*)?$/;
const EDGE = /^[("'*_[<>≤≥~]+|[)"'*_\],.;:!?]+$/g;

/** The body of the `## <n>` section, `## <n>` to the next `## `, with 1-based line numbers. */
function sectionLines(lines, n) {
  const inFence = fenced(lines);
  const heading = new RegExp(`^## ${n}(?:[.\\s]|$)`);
  const start = lines.findIndex((line, i) => !inFence[i] && heading.test(line));
  if (start === -1) return [];
  const body = [];
  for (let i = start + 1; i < lines.length && (inFence[i] || !lines[i].startsWith('## ')); i++) {
    body.push({ line: i + 1, text: lines[i] });
  }
  return body;
}

/** True when the text, code spans removed, holds a numeral, a number word or a bound phrase. */
function hasBar(text) {
  const prose = text.replace(/`[^`]*`/g, ' ');
  if (NUMBER_WORD.test(prose) || BOUND.test(prose)) return true;
  // A bar token is short; a long one is skipped so EDGE never backtracks over a hostile run.
  const tokens = prose.split(/\s+/).map((token) => (token.length > 64 ? '' : token.replace(EDGE, '')));
  return tokens.some((token, i) => NUMERAL.test(token) && !REFERENCE.test(tokens[i - 1] ?? ''));
}

/** §2's spec lines: each list item with its continuation, and each table body row without its id cells. */
function specLines(body) {
  const found = [];
  let idCells = new Set([0]);
  for (let k = 0; k < body.length; k++) {
    const { line, text } = body[k];
    const row = text.trimStart().startsWith('|');
    if (!row) idCells = new Set([0]);
    if (row) {
      const cells = text.replace(/`[^`]*`/g, ' ').trim().replace(/^\||\|$/g, '').split('|');
      if (TABLE_RULE.test(text.trim())) continue;
      if (TABLE_RULE.test(body[k + 1]?.text.trim() ?? '')) {
        idCells = new Set(cells.flatMap((cell, i) => (ID_CELL.test(cell.trim()) ? [i] : [])));
        continue;
      }
      found.push({ line, text: cells.filter((_, i) => !idCells.has(i)).join(' ') });
    } else if (TEST_ITEM.test(text)) {
      let item = text.replace(TEST_ITEM, ' ');
      while (k + 1 < body.length && /^\s{2,}\S/.test(body[k + 1].text) && !TEST_ITEM.test(body[k + 1].text)) {
        item += ` ${body[++k].text}`;
      }
      found.push({ line, text: item });
    }
  }
  return found;
}

/**
 * Problems with an architecture artefact's text: rule `spec-bar` for each §2 line with no bar,
 * `spec-practitioner` when §2 holds no `practitioner:` tag and `spec-red-team` when §6 and §8
 * hold no `red team:` line (spec 4, A1); a marker inside a code span or a fence does not count.
 */
export function checkSpec(markdown) {
  const lines = markdown.replace(/(?:\r?\n)+$/, '').split(/\r?\n/);
  const second = sectionLines(lines, 2);
  const spec = specLines(second);
  if (spec.length === 0) return [{ line: 1, rule: 'spec-bar', message: 'no `## 2` section with spec lines (a list or a table)' }];
  const problems = spec
    .filter(({ text }) => !hasBar(text))
    .map(({ line }) => ({
      line,
      rule: 'spec-bar',
      message: 'carries no bar: a numeral outside code and identifiers, a number word or a bound phrase such as "at most"',
    }));
  const inFence = fenced(lines);
  const marked = (body, marker) => body.some(({ line, text }) => !inFence[line - 1] && marker.test(text.replace(/`[^`]*`/g, ' ')));
  if (!marked(second, /\bpractitioner:/i)) {
    problems.push({ line: second[0].line - 1, rule: 'spec-practitioner', message: '§2 carries no `practitioner:` tag from the depth step' });
  }
  const sixth = sectionLines(lines, 6);
  if (!marked([...sixth, ...sectionLines(lines, 8)], /\bred team:/i)) {
    problems.push({ line: sixth.length ? sixth[0].line - 1 : 1, rule: 'spec-red-team', message: '§6 and §8 carry no `red team:` line' });
  }
  return problems;
}

/** Each slice text a path stands for, with the line its text starts after. */
function slicesAt(target) {
  if (fs.statSync(target).isDirectory()) {
    return fs
      .readdirSync(target)
      .filter((name) => name.endsWith('.md'))
      .sort()
      .flatMap((name) => slicesAt(path.join(target, name)));
  }
  const text = fs.readFileSync(target, 'utf8');
  if (path.basename(target) === 'architecture.md') return [{ file: target, offset: 0, text, check: checkSpec }];
  if (path.basename(target) !== 'SKILL.md') return [{ file: target, offset: 0, text, check: checkSlice }];
  const examples = [...text.matchAll(/^````markdown\r?\n([\s\S]*?)\r?\n````/gm)].map((match) => ({
    file: target,
    offset: text.slice(0, match.index).split('\n').length,
    text: match[1],
    check: checkSlice,
  }));
  if (examples.length === 0) throw new Error(`${target} has no \`\`\`\`markdown worked example`);
  return examples;
}

function main(argv) {
  if (argv.length === 0) {
    console.error('usage: node scripts/check-slices.mjs <path>...');
    process.exit(2);
  }
  let slices;
  try {
    slices = argv.flatMap(slicesAt);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  if (slices.length === 0) {
    console.error(`no slice files in ${argv.join(', ')}`);
    process.exit(2);
  }
  const failures = slices.flatMap(({ file, offset, text, check }) =>
    check(text).map(({ line, rule, message }) => `${file}:${offset + line} ${rule} ${message}`),
  );
  if (failures.length) {
    for (const failure of failures) console.log(failure);
    process.exitCode = 1;
    return;
  }
  const noun = slices.every(({ check }) => check === checkSlice) ? 'slice file(s)' : 'file(s)';
  console.log(`${slices.length} ${noun} checked`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
