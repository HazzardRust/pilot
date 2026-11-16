/**
 * S9 of the deck-workspace run pins four rules the pilot's own files either stated
 * wrongly or never stated at all. Each one is a habit that cost a real run:
 *
 * - The interview asked strictly one question at a time even where the answers had
 *   nothing to do with each other, so a frontier of five independent decisions took
 *   five round trips through a human who was willing to answer all five at once.
 * - An explorer's diagnosis was taken as a verdict. Its timeout theory was wrong and
 *   one `grep` of the transcript settled it, after the fix had been designed around it.
 * - Briefs named worktrees after the repository, so three runs of one repository gave
 *   the deck three tabs with the same label.
 * - Slices had no canonical address, so "the second slice" meant whichever artefact
 *   the reader had open.
 *
 * What stays are the forbidden-pattern scans (no unconditional one-at-a-time rule, no
 * prose hand-off file, no browser-bound walkthrough, no restated code rule), each
 * marked `// lint:`, and the hook output the guard prints. A required phrase is not
 * a test target (ADR 0180).
 */
import './lib/fake-home.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runHook } from './lib/run-hook.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

/** What a pilot reads about itself: its definition, which carries its workflow (ADR 0046). */
const PILOT_FILES = ['agents/pilot.md'];

/**
 * Those two, the vendored skill whose override note states the same rule, and the
 * two rules files both of them point a pilot at by name. The rules tree is copied
 * into a machine's own `~/.claude/rules/`, so a stale sentence there is read as
 * law by a pilot that never opens this repository.
 */
const QUESTION_FILES = [
  ...PILOT_FILES,
  'skills/grilling/SKILL.md',
  'rules/orchestration.md',
  'rules/vertical-execution.md',
];

/**
 * Every file that could *restate* it, which is what the absence scan has to read.
 * A file with nothing to say about questioning is fine; a file with the old rule in
 * it is not, wherever it sits.
 *
 * The excerpt is the rules tree's hazard one step further out: a friend is invited to
 * paste it into their own `CLAUDE.md`, where it is read as law by a pilot on a machine
 * with no copy of this repository at all. The two ledger fragments say what each
 * vendored file adapted and why, and the grilling row is the override itself written
 * out in prose.
 *
 * `VENDOR.md` is not here and does not need to be: it is generated from those two
 * fragments (`scripts/build-vendor-ledger.mjs`, whose `--check` fails when it is
 * stale), so every row it carries is scanned at its source, and scanning it as well
 * would report each finding twice under a path nobody edits.
 */
const RESTATING_FILES = [
  ...QUESTION_FILES,
  'CLAUDE.excerpt.md',
  'vendor/methodology.md',
  'vendor/toolbox.md',
];

/**
 * One block of a markdown file: a paragraph, a list item, a table row, a heading.
 * These files are hard-wrapped, so a newline inside a paragraph is not a boundary of
 * anything and joining those lines back up is what makes a sentence a sentence.
 */
const blocks = (source) => {
  const out = [];
  let current = [];
  const flush = () => {
    if (current.length) out.push(current.join(' '));
    current = [];
  };
  for (const line of source.split('\n')) {
    if (!line.trim()) flush();
    else {
      // A list item, a table row, a heading, a quote, a frontmatter or code fence
      // and the opening of an HTML comment all start something; a wrapped line does
      // not. `<!--` is what keeps a vendored file's provenance header off the `---`
      // that closes the frontmatter above it, and the fence keeps the slice diagram
      // in `rules/vertical-execution.md` off the line that closes it.
      if (/^\s*(?:[-*+]\s|\d+\.\s|\||#|>|-{3,}\s*$|<!--|```)/.test(line)) flush();
      current.push(line.trim());
    }
  }
  flush();
  return out;
};

/**
 * One sentence. A table cell is its own sentence too, because that is how these files
 * carry a rule — the `grilling` row of the pilot's methodology table is one cell
 * holding four of them.
 */
const sentences = (source) =>
  blocks(source)
    .flatMap((block) => block.split(/(?<=[.;!?])\s+|\s\|\s/))
    .map((piece) => piece.replace(/\s+/g, ' ').replace(/^\||\|$/g, '').trim())
    .filter(Boolean);

/** "one question at a time", "one deck item at a time", "one thing at a time". */
const ONE_AT_A_TIME = /\bone\b[^.;:|\n]{0,48}?\bat a time\b/i;

/**
 * The two things these files still do strictly one at a time, and are right to:
 * `rules/orchestration.md` asks an agent for *large reads* one at a time, because a
 * context reading only exists between turns; and the `wizard` posts a walkthrough's
 * stages one at a time, because a stage nobody has finished cannot be followed by the
 * next one. Naming them is what keeps the scan below blind to everything else —
 * neither requires the sentence to mention a question, so "the pilot asks one thing at
 * a time" cannot slip past for want of the word.
 *
 * `large` is load-bearing in the first of them. A bare `read` exempted any sentence
 * that happened to use the word, which is how `CLAUDE.excerpt.md` stated the old rule
 * beside "an explorer that reads" and was read past.
 */
const NOT_A_QUESTION = /\blarge reads?\b|\bwalkthrough\b/i;

/**
 * What makes one at a time an exception rather than a standing rule — and it has to
 * be **attached to the phrase**, not merely present in the same sentence. A reviewer
 * defeated the loose version of this with a wording no adversary would need:
 * "ask one question at a time, independent of whether the answers affect each other"
 * states the old rule outright and carried three of the old conditional words.
 */
const ONLY_WHERE = /\bat a time\b[^.;:|\n]{0,40}?\bonly (where|when)\b/i;

// lint: no sentence states one at a time without its condition. A deliberate exception (ADR 0180):
// it tolerates only the `only where|when` qualifier, so rewording that qualifier turns it red.
// It stays because no code can hold this prompt rule, the user set it, and it has regressed before.
test('no unconditional one-at-a-time rule survives anywhere it was stated (spec 13)', () => {
  // The artefact found the rule in ten places; this scan found two more, in the
  // Legend of the skill and in the question queue of `rules/orchestration.md`. A
  // rewrite that misses one leaves the pilot a file saying the opposite of the file
  // beside it, and the pilot obeys whichever it read last. This is the assertion
  // that has to be exhaustive, so it scans rather than naming lines that move — and
  // over every file that could restate the rule, not only the ones that own it.
  for (const rel of RESTATING_FILES) {
    for (const line of sentences(read(rel))) {
      if (!ONE_AT_A_TIME.test(line) || NOT_A_QUESTION.test(line)) continue;
      assert.ok(
        ONLY_WHERE.test(line),
        `${rel} still states one at a time unconditionally: ${line}`,
      );
    }
  }
});

// lint: pilot.md names no `spec` item or kind
test("pilot.md names no `spec` item or kind (thread-kinds spec 25, L15)", () => {
  assert.doesNotMatch(read('agents/pilot.md'), /kind `spec`|`spec` item|`spec`,/, 'pilot.md still names a `spec` item or kind');
});

// --- run-record S3: the hand-off without prose ------------------------------

/**
 * The pilot's own notice, as the guard prints it: `post-tool.js` run on a pilot's
 * payload (no `agent_id`) at 260,000 tokens, its status line's snapshot saying so,
 * with a deck holding work for its directory. The notice is cut from the printed
 * context from "SYSTEM NOTICE: you are at" to the first "Said once." after it,
 * since the other lanes may add their own. Run once and shared.
 */
let printed;
const pilotNotice = () => {
  printed ??= runHook('hooks/post-tool.js', (home) => {
    const cwd = path.join(home, 'repo');
    return {
      input: { hook_event_name: 'PostToolUse', session_id: 'sess-pilot', cwd, tool_name: 'Bash' },
      runs: [cwd],
      items: [{ id: 'itm_fixture', kind: 'question', title: 'work on the deck', repo: cwd }],
      files: { '.claude/context-usage-state.json': JSON.stringify({ ctx: 26, session_id: 'sess-pilot' }) },
    };
  }).then((out) => /SYSTEM NOTICE: you are at[\s\S]*?Said once\./.exec(out?.hookSpecificOutput?.additionalContext ?? '')?.[0]);
  return printed;
};

/**
 * The hand-off as each place a pilot is told it: its definition and the guard. The
 * definition's own copy went in independence S4; the workflow's is the one kept.
 */
const HANDOFFS = async () => [
  ['agents/pilot.md', /\n## When your own context fills\n([\s\S]*?)(?=\n## )/.exec(read('agents/pilot.md'))?.[1]],
  ['hooks/context-size-guard.js', await pilotNotice()],
];

test("the pilot's context notice is what the guard prints", async () => {
  const notice = await pilotNotice();
  assert.ok(notice, 'the guard printed no notice for a pilot at its hard mark');
  assert.ok(/`pilot handoff`/.test(notice) && !/`wip:`/.test(notice), "the notice printed is not the pilot's own");
});

// lint: no hand-off instruction points at a prose file
test('no hand-off instruction names a prose file (run-record spec 3, L8)', async () => {
  for (const [where, text] of await HANDOFFS()) {
    assert.ok(text, `${where} has no hand-off of the pilot's own`);
    assert.doesNotMatch(text, /prompt file|hand-?off file|file it wrote/i, `${where} still points the pilot at a prose file`);
  }
});

// --- independence S4: the rules S3 made code ----------------------------

// lint: no pilot file restates a rule that is now code
test('no pilot file restates a rule S3 made code: a slugless `deck_status`, a question body over a screen (independence spec 8, L7)', () => {
  for (const rel of [...PILOT_FILES, 'hooks/context-size-guard.js']) {
    const text = read(rel).replace(/['"`]\s*\+\s*['"`]/g, '').replace(/\s+/g, ' ');
    assert.doesNotMatch(text, /without `slug` writes no record/, `${rel} still says a slugless call is accepted`);
    assert.doesNotMatch(text, /a screen at most/i, `${rel} still states the question length the daemon now refuses`);
  }
});

// lint: pilot.md has no exception that waits for the user before restarting `pilot wait`
test('the pilot never waits for the user to restart `pilot wait` (ticket-states A10)', () => {
  const flat = read('agents/pilot.md').replace(/\s+/g, ' ');
  assert.doesNotMatch(flat, /restart it when the user says/, 'no exception that waits for the user');
});

/**
 * deck-press-feedback S9 (spec 18, 19): a walkthrough is what QA posts when something
 * is left that only the user can step through, not a browser procedure every run
 * owes; a feature with nothing to walk reaches Gate 2 on QA's evidence. And a step
 * that is a command says where it runs, through the post's `dir`.
 */
const part = (source, heading) => {
  const rest = source.split(`\n${heading}\n`)[1];
  assert.ok(rest, `no "${heading}" section`);
  return rest.split(/\n#{2,3} /)[0];
};

// lint: neither pilot.md nor pilot-qa.md makes a walkthrough mandatory
test('neither pilot.md nor pilot-qa.md makes a walkthrough mandatory', () => {
  // walkthrough-surface S4 amends walkthrough-taste QA Q4: QA walks nothing on `surface: false`.
  for (const file of ['agents/pilot.md', 'agents/pilot-qa.md']) {
    const mandatory = sentences(read(file)).filter((s) => /\bwalkthrough\b/i.test(s) && /\b(always|must)\b/i.test(s));
    assert.deepEqual(mandatory, [], `${file} makes a walkthrough mandatory`);
  }
});

// lint: no agent file binds a walkthrough to a browser
test('no agent file calls a walkthrough a browser procedure', () => {
  const dir = path.join(ROOT, 'agents');
  const BROWSER_BOUND = /\bbrowser (procedure|walkthrough)\b|\bwalkthrough (in|through) a browser\b|`(url|login)`[^.]*\bfor a preview\b/i;
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const hits = sentences(read(`agents/${name}`)).filter((s) => BROWSER_BOUND.test(s));
    assert.deepEqual(hits, [], `agents/${name} binds a walkthrough to a browser`);
  }
});
