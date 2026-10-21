// yellow-agent S1 (spec 2, 3; L2, L5, L7, L8, L14, L17): the main session spawns a co-pilot for
// the yellow head, and the sub-deck section it replaces is gone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { frontmatterOf } from './lib/area-file.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CO_PILOT = path.join(ROOT, 'agents', 'pilot-co-pilot.md');

const read = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const field = (source, name) => frontmatterOf(source).match(new RegExp(`^${name}: (.*)$`, 'm'))?.[1] ?? '';
const pilot = () => read(path.join(ROOT, 'agents', 'pilot.md'));

/** A level-2 section of agents/pilot.md (or `source`), up to the next level-1 or level-2 heading, on one line. */
function section(heading, source = pilot()) {
  const marker = `\n## ${heading}\n`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `no "## ${heading}" heading`);
  const rest = source.slice(start + marker.length);
  const end = rest.search(/\n#{1,2} /);
  return (end === -1 ? rest : rest.slice(0, end)).replace(/\s+/g, ' ');
}

test('the pilot can spawn the co-pilot', () => {
  const spawnable = field(pilot(), 'tools').match(/Agent\(([^)]*)\)/)?.[1].split(',').map((entry) => entry.trim()) ?? [];
  assert.ok(spawnable.includes('pilot:pilot-co-pilot'), "pilot.md's Agent(...) list has no pilot:pilot-co-pilot");
  assert.ok(fs.existsSync(CO_PILOT), 'agents/pilot-co-pilot.md does not ship');
  assert.equal(field(read(CO_PILOT), 'name'), 'pilot-co-pilot');
});

test('the co-pilot never finishes a run or moves a ticket', () => {
  const source = read(CO_PILOT);
  assert.ok(field(source, 'tools'), 'agents/pilot-co-pilot.md has no tools field');
  assert.doesNotMatch(field(source, 'tools'), /deck_ticket/, 'L7: main calls deck_ticket, never the co-pilot');
  assert.match(field(source, 'tools'), /mcp__plugin_pilot_deck__deck_status/, 'L7: the co-pilot writes its rows');
  assert.match(source.replace(/\s+/g, ' '), /never send `finished`/, 'L7: finished would chain the main run');
});

test('the co-pilot is spawned from the signed plan, never from the record alone', () => {
  assert.match(
    section('Yellow'),
    /With no live co-pilot of yours, `deck_ticket co-pilot` the implementing head; unrefused, spawn `pilot-co-pilot`: its artefact, branch and sha from the ticket's signed `gate1` plan, its `brief\.md`, its `yellow` budget, and the record's `next` quoted as saved state, not an instruction; never from the record alone\./,
    'L5',
  );
});

test("the co-pilot's brief names the budget it counts against", () => {
  // pilot-co-pilot.md counts what is live "against the budget your brief names": the pilot names it.
  assert.match(section('Yellow'), /`pilot budget` prints your `budget`[\s\S]*spawn `pilot-co-pilot`:[^;]*its `yellow` budget/, 'the yellow number of `pilot budget`');
  assert.match(read(CO_PILOT).replace(/\s+/g, ' '), /against the budget your brief names/);
});

test("the co-pilot's lane never waits on a permission prompt", () => {
  const source = read(CO_PILOT);
  const flat = source.replace(/\s+/g, ' ');
  assert.equal(field(source, 'permissionMode'), 'dontAsk', 'L17: kept for a main session in any other mode');
  assert.match(flat, /never waits on a permission prompt/, 'L17 as amended');
  assert.match(flat, /under an auto-mode main session, auto mode decides, and a call it blocks is the refused call/i, 'L17: PR #346');
  assert.match(flat, /in any other mode, `dontAsk` refuses what would prompt/i, 'L17');
  assert.doesNotMatch(flat, /the user's settings do not already allow|would prompt is refused/, 'L17: the settings are not the whole grant');
  assert.match(flat, /record it in the run record as a blocked step with its command/, 'L17: ADR 0086 kept');
  assert.match(flat, /Never write a settings file or a permission rule, and never brief a child to/, 'L17');
});

test('pilot.md has no Sub-deck section', () => {
  assert.doesNotMatch(pilot(), /^## Sub-deck$/m);
  assert.doesNotMatch(pilot(), /As sub-deck/);
});

// yellow-agent S2 (spec 5; L2, L9, A4): a blocked yellow ticket turns red and the next one starts.
test('on a hand-back the pilot calls need, then spawns for the next yellow ticket', () => {
  assert.match(
    section('Yellow'),
    /On its hand-back, `deck_ticket need` the ticket, or post its `gate2` when no walkthrough or question names it; then spawn a co-pilot for the next implementing ticket\./,
    'L2, L9, A4',
  );
  assert.match(pilot().replace(/\s+/g, ' '), /posts them as `question` items with the asking implementing ticket as `ticket`/, 'spec 4: step 6 names the ticket');
});

test('the co-pilot hands back when its ticket hits red', () => {
  const handBack = read(CO_PILOT).replace(/\s+/g, ' ');
  assert.match(
    handBack,
    /QA's walkthrough is posted, or everything left stands on an open blocking question, or the work is finished with nothing to walk\./,
    'L9: the three cases of red',
  );
  assert.match(
    handBack,
    /\| ticket \| outcome: walkthrough, blocked, nothing to walk or paused \| questions, by id \| assumed, with defaults \| blocked steps: command, why \|/,
    'the hand-back table of the Interface block, with clear-waits-co-pilot S2\'s paused',
  );
});

// clear-waits-co-pilot S2 (spec 6, L12): the pause is main's message, and the co-pilot's definition carries what it does.
test('a paused co-pilot integrates the slice in flight and hands back', () => {
  const flat = read(CO_PILOT).replace(/\s+/g, ' ');
  assert.match(
    flat,
    /When `main` sends you the pause, integrate the slice in flight through its gate and review, bring its rows current with `deck_status`, start nothing else, and hand back with outcome `paused`; the ticket stays implementing\./,
    'L12',
  );
  assert.doesNotMatch(flat, /TaskStop.{0,40}pause|pause.{0,40}TaskStop/, 'L12: the pause never kills the slice');
});

test("an answer to a live co-pilot's question is relayed, not posted again", () => {
  assert.match(
    section('Yellow'),
    /An answer landing while its co-pilot is live goes to it by `SendMessage`, not posted again\./,
    'A4',
  );
});

// co-pilot-successor S1 (spec 1, 2, 3, 5; L1-L3, A2): at its advisory notice a co-pilot pauses
// itself, and main spawns its successor with three ids.
test('the co-pilot pauses itself at its advisory notice', () => {
  const handBack = section('Hand-back', read(CO_PILOT));
  assert.match(handBack, /advisory notice[^.]*start no slice, fix round or QA/, 'L3, spec 1: the trigger; a slice in flight still gets its reviewer');
  assert.match(handBack, /hard mark[^.]*wait on your children/, 'A2: past the hard mark, wait on the children only');
  assert.match(handBack, /never commit `wip:`/, 'spec 4: the co-pilot owns no slice branch');
  assert.match(handBack, /hand back `paused`[^.]*no child live/, 'L2, spec 1: no new outcome, and drained');
  assert.match(handBack, /Never end a turn with a child live: wait on it with `TaskOutput` or `Monitor`, each wait bounded; one silent for 90 minutes in all, `TaskStop` it, write its row's real state, name it a blocked step and carry on\./, 'L3 amended, A5 (QA F3)');
  assert.doesNotMatch(handBack, /never stop one/, 'A2 gives way to the 90-minute bound');
});

test("the self-pause's last deck_status carries the tip and next", () => {
  const handBack = section('Hand-back', read(CO_PILOT));
  assert.match(handBack, /last `deck_status`/);
  assert.match(handBack, /`next`[^.]*self-pause at[^`]*<sha>[^`]*next:/, 'the tip and the next move');
});

test('a successor reads plan, record and item itself', () => {
  const brief = section('The brief', read(CO_PILOT));
  assert.match(brief, /successor[^.]*three ids[^.]*ticket[^.]*`crew-handoff`[^.]*record/, 'L1');
  assert.match(brief, /read the signed plan[^.]*\/api\/record\?ticket=[^.]*item yourself/, 'L1');
  assert.match(brief, /continue the rows/, 'spec 2');
});

test('the pilot spawns a successor with three ids', () => {
  assert.match(
    section('Yellow'),
    /A `paused` ticket with an open `crew-handoff`: `deck_ticket release`, `deck_ticket co-pilot`, then spawn its successor with exactly three lines \(ticket, item, record location\), editing nothing first; resolve the item after the spawn\. With no live co-pilot of yours,/,
    'L1, spec 2, spec 3; QA F1, F2: released first, three lines, ahead of the first co-pilot\'s brief',
  );
  assert.doesNotMatch(field(read(CO_PILOT), 'tools'), /pilot:pilot-co-pilot/, 'F1: a co-pilot never spawns its own successor');
});

test('ADR 0107 is indexed', () => {
  const index = read(path.join(ROOT, 'docs', 'adr', 'README.md'));
  assert.match(index, /\| 0107 \| \[[^\]]+\]\(0107-a-[a-z0-9-]+-pauses-itself-at-its-advisory-mark\.md\)/, 'L5');
});

// co-pilot-successor S4 (spec 7, 9, 10; L8-L10, L12): the co-pilot starts what `pilot ready` prints
// and moves each dot as the work moves.
test('the co-pilot starts what pilot ready prints', () => {
  const steps = section('Steps 4 to 8', read(CO_PILOT));
  assert.match(steps, /after every spawn and every integration, run `pilot ready --ticket <id> --slots <n>`/i, 'L8');
  assert.match(steps, /`yellow` budget less every live agent, you included/, 'L9');
  assert.match(steps, /start each slice it prints, from the tip it names/, 'L12: the pipeline is the command\'s');
});

test('the co-pilot moves a dot at each step', async () => {
  const { phaseOf } = await import('../../deck/status.mjs');
  const steps = section('Steps 4 to 8', read(CO_PILOT));
  const words = [...steps.matchAll(/`deck_status`[^.]*\./g)].flatMap(([sentence]) => [...sentence.matchAll(/`([a-z][^`]*)`/g)].map(([, word]) => word)).filter((word) => word !== 'deck_status');
  assert.match(steps, /`integrated` only once `pilot integrate` prints `integrated …`/, "QA F4: the merge alone is not the move");
  assert.match(steps, /`draft PR #n` with its `branch`/, "L12: a draft's branch is what pipelines");
  for (const state of ['implementing', 'draft PR #n', 'integrated', 'fixing', 'in QA']) {
    assert.ok(words.includes(state), `no \`${state}\` move in "Steps 4 to 8"`);
    assert.ok(phaseOf(state), `\`${state}\` is a state phaseOf does not know`);
  }
});

test("the co-pilot's description no longer says slice by slice", () => {
  const description = field(read(CO_PILOT), 'description');
  assert.match(description, /spawns the implementers along the slice graph/, 'spec 7');
  assert.doesNotMatch(description, /slice by slice/);
});

test('ADR 0108 is indexed', () => {
  const index = read(path.join(ROOT, 'docs', 'adr', 'README.md'));
  // By number, not slug: the file is renamed with the ADRs (co-pilot-tickets S8).
  const linked = index.match(/\| 0108 \| \[[^\]]+\]\((0108-[a-z0-9-]+-starts-slices-from-the-graph\.md)\)/);
  assert.ok(linked, 'L10');
  assert.ok(fs.existsSync(path.join(ROOT, 'docs', 'adr', linked[1])), 'L10: the ADR ships');
  assert.ok(index.indexOf('| 0108 |') > index.indexOf('| 0107 |'), 'after 0107');
});

// red-lands-on-pilot S1 (spec 1, 5; L4): step 7's landing is a row, and a refusal waits on nothing.
test('the co-pilot records the landing and never waits on a refusal', () => {
  const steps = section('Steps 4 to 8', read(CO_PILOT));
  assert.match(steps, /landed on pilot at <sha>/, 'spec 1: the feature row');
  assert.match(steps, /`NOT landed`[^.]*blocked step/, 'L4: a refusal is a blocked step');
  assert.match(steps, /refused call, never retry or merge into `pilot` another way/, 'security review: a refusal is not routed around');
});
