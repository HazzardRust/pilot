/** S7 of thread-kinds: the audit item reads in a glance (spec 1, 2, 3; L1, L2, A8). */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { rankRows, renderReport, specFor, validateReport } from '../audit.mjs';
import { renderMarkdown } from '../ui/markdown.mjs';
import { eighteenRows } from './fixtures/audit-18-rows.mjs';

/** The fixture's deck body under the renderer before S7, measured once at feat/thread-kinds 0305827. */
const BODY_CHARS_BEFORE = 10930;
/** The fixture's `.md` table, saved JSON and every row's spec text before S7: L2 keeps them byte-identical (re-measured at co-pilot-tickets S4, whose rename reworded them). */
const TABLE_SHA = '35bd40058c0086b098cbf9f94eb866f15abead0a4122913b55cdbdfab2906baf';
const JSON_SHA = '1912abdcdc27bb814e5b312dd88145ee0e6ec36dd4af2b3dac89280f04d11c98';
const SPECS_SHA = 'df8338e9ca5bc062d99f5597d2b00cce2eb66e68a68305142e8c9124389d03c6';

const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const report = eighteenRows();
const ranked = rankRows(report.rows);
const findings = ranked.filter((row) => row.saving.minutes + row.saving.tokens > 0);
const baselines = ranked.filter((row) => row.saving.minutes + row.saving.tokens === 0);
const { deckBody, table } = renderReport(report);
const lines = deckBody.split('\n');

/** The finding's block: its headline and the lines indented under it. */
function blockOf(id) {
  const start = lines.findIndex((line) => line.startsWith(`- **${id}** `));
  assert.ok(start >= 0, `${id} has a headline`);
  const block = [lines[start]];
  for (const line of lines.slice(start + 1)) {
    if (!/^ {2}\S/.test(line)) break;
    block.push(line);
  }
  return block;
}

test('the fixture is a valid report with fifteen findings and three baselines', () => {
  assert.deepEqual(validateReport(report), []);
  assert.equal(ranked.length, 18);
  assert.equal(findings.length, 15);
  assert.equal(baselines.length, 3);
});

test("each finding's Evidence and Fix start their own lines with bold labels", () => {
  for (const row of findings) {
    const [, evidence, fix, ...rest] = blockOf(row.id);
    assert.deepEqual(rest, [], `${row.id}: a headline and two lines`);
    assert.match(evidence ?? '', /^ {2}\*\*Evidence\*\* `[^`\n]+` \((exit -?\d+|timed out)\)$/, `${row.id} evidence`);
    assert.match(fix ?? '', /^ {2}\*\*Fix\*\* \S/, `${row.id} fix`);
    assert.ok(fix.length <= 2 + 8 + 161, `${row.id}: the fix is cut to about 160 characters`);
  }
  assert.match(blockOf('F11')[1], /\(timed out\)$/, 'a timed-out command says so');
  assert.match(blockOf('F1')[1], /\(exit 128\)$/);
});

test('findings run in rankRows order and each headline shows its score', () => {
  const order = lines.map((line) => line.match(/^- \*\*(F\d+)\*\* .* · score /)?.[1]).filter(Boolean);
  assert.deepEqual(order, findings.map((row) => row.id));
  assert.doesNotMatch(deckBody, /^\s*\d+\. /m, 'a row shows its F-id only, never an ordinal a user could type for another row');

  const [f1] = blockOf('F1');
  assert.match(f1, / · score 13 · saves 5 min \+ 8000 tokens\/run · effort S$/);
  assert.match(blockOf('F7')[0], / · score 3\.9 · /, 'a fractional score, two significant figures');
  assert.match(blockOf('F15')[0], / · score 0\.58 · saves 0 min \+ 578 tokens\/run · /);
  for (const row of findings) {
    const finding = blockOf(row.id)[0].match(/^- \*\*F\d+\*\* (.*) · score /)[1];
    assert.ok(finding.length <= 101, `${row.id}: the finding is cut to about 100 characters (${finding.length})`);
  }
});

test("the deck draws each finding's Evidence and Fix under its headline, by its F-id alone", () => {
  const html = renderMarkdown(deckBody);
  assert.doesNotMatch(html, /<ol>/, 'no ordinal list beside the F-ids');
  const items = [...html.matchAll(/<li>(.*?)<\/li>/g)].map((m) => m[1]);
  for (const row of findings) {
    const item = items.find((candidate) => candidate.startsWith(`<strong>${row.id}</strong> `));
    assert.match(item, /<br \/><strong>Evidence<\/strong> .*<br \/><strong>Fix<\/strong> /, `${row.id}`);
  }
  assert.doesNotMatch(html, /<p><strong>Evidence<\/strong>/, 'never a paragraph at the left margin');
});

test('rows saving nothing are under a Baselines heading after every finding', () => {
  const heading = lines.indexOf('### Baselines');
  assert.ok(heading > 0, 'a Baselines heading');
  const lastFinding = lines.findIndex((line) => line.startsWith(`- **${findings.at(-1).id}** `));
  assert.ok(heading > lastFinding, 'after every finding');
  const after = lines.slice(heading + 1);
  for (const row of baselines) {
    const line = after.find((candidate) => candidate.startsWith(`- **${row.id}** `));
    assert.ok(line, `${row.id} is one line under Baselines`);
    assert.doesNotMatch(lines.slice(0, heading).join('\n'), new RegExp(`\\*\\*${row.id}\\*\\*`), `${row.id} not among the findings`);
  }
  const ids = deckBody.match(/\*\*F\d+\*\*/g);
  assert.equal(ids.length, 18, 'no row dropped and none repeated');
  assert.match(lines.at(-1), /F1, F3.*none/, 'the reply prompt is last');
  assert.match(deckBody, /91100 tokens, 12 min\./, 'the cost line stays');
});

test("the 18-row fixture's deck body is under 55% of today's length (A8)", () => {
  assert.ok(
    deckBody.length < BODY_CHARS_BEFORE * 0.55,
    `${deckBody.length} characters against ${BODY_CHARS_BEFORE} before (limit ${Math.floor(BODY_CHARS_BEFORE * 0.55)})`,
  );
});

// bigger-jobs S7 (spec 11, 12; L7, A4): the fundamentalist's verdicts, one per row, in the report JSON.
const CALLS = { F2: 'unnecessary', F5: 'overengineering', [baselines[0].id]: 'unnecessary', F1: 'keep' };
const argued = () => {
  const fresh = eighteenRows();
  const idOf = new Map(ranked.map((row) => [row.finding, row.id]));
  for (const row of fresh.rows) {
    const call = CALLS[idOf.get(row.finding)];
    if (call) row.verdict = { call, reason: `${call} because of ${idOf.get(row.finding)}` };
  }
  return fresh;
};

test('cut rows render below the kept ones with reasons', () => {
  assert.equal(Object.keys(CALLS).length, 4, 'the baseline is not one of F1, F2 or F5');
  const mixed = argued();
  assert.deepEqual(validateReport(mixed), []);
  const rendered = renderReport(mixed);
  const at = rendered.deckBody.split('\n');
  const cutHeading = at.indexOf('### Cut');
  assert.ok(cutHeading > at.indexOf('### Baselines'), 'the Cut section comes after every kept row');

  const kept = at.slice(0, cutHeading).join('\n');
  const cutSection = at.slice(cutHeading + 1).join('\n');
  const cutIds = Object.keys(CALLS).filter((id) => CALLS[id] !== 'keep');
  for (const id of cutIds) {
    assert.doesNotMatch(kept, new RegExp(`\\*\\*${id}\\*\\*`), `${id} is not among the kept rows`);
    assert.match(cutSection, new RegExp(`^- \\*\\*${id}\\*\\* .* · ${CALLS[id]}: ${CALLS[id]} because of ${id}$`, 'm'), `${id} with its call and reason`);
  }
  assert.match(kept, /^- \*\*F1\*\* .* · score /m, 'a kept verdict stays a finding, by its F-id');
  assert.doesNotMatch(rendered.deckBody, /^\s*\d+\. /m, 'F4 is never shown as 3');
  assert.match(cutSection, /^Argued down by the fundamentalist; each can still be picked\.$/m, 'the cut rows say they can still be picked');
  assert.match(rendered.table, /^## Cut$/m, 'the .md has its Cut section');
  assert.equal(rendered.deckBody.match(/\*\*F\d+\*\*/g).length, 18, 'no cut row dropped (A4: still pickable)');
  assert.match(at.at(-1), /F1, F3.*none/, 'the reply prompt is still last');
  for (const id of cutIds) {
    assert.match(rendered.table, new RegExp(`${id} \\(${CALLS[id]}\\): ${CALLS[id]} because of ${id}`), `${id} in the .md`);
  }
});

test('a malformed verdict is refused', () => {
  for (const verdict of [{ call: 'drop', reason: 'no' }, { call: 'unnecessary' }, { call: 'keep', reason: '  ' }, 'keep', null]) {
    const bad = eighteenRows();
    bad.rows[2].verdict = verdict;
    const problems = validateReport(bad);
    assert.equal(problems.length, 1, JSON.stringify(verdict));
    assert.match(problems[0], /^row 3: verdict /);
  }
});

test('the .md table and specFor output are byte-identical to before', () => {
  assert.equal(sha(table), TABLE_SHA, 'the .md report');
  const saved = JSON.stringify({ ...report, rows: ranked }, null, 2);
  assert.equal(sha(saved), JSON_SHA, 'the saved JSON');
  assert.equal(sha(ranked.map((row) => specFor(saved, [row.id])).join('\n')), SPECS_SHA, 'audit spec per row');
});
