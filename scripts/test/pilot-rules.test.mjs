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
 * The wording is the thing being pinned, because the wording is what a future pilot
 * obeys: these files are read as instructions, not compiled. A pin here is therefore
 * a phrase and its condition in the *same sentence* — three independent words would
 * still pass on a sentence that said the opposite.
 *
 * L14 of the artefact puts this slice's pins in their own file rather than appending
 * them to `pilot-agents.test.mjs`, so the three crew slices of this run do not
 * serialise on one file. The one assertion that had to stay there is the verbatim
 * `adapted:` line of the vendored `grilling` skill, which already lived there and
 * moves with this change.
 */
import './lib/fake-home.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TOOLS } from '../../deck/tools.mjs';
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
 *
 * These are the files that *carry* the rule, which is why the two tests below asking
 * for something to be present read this list and not the wider one.
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

/**
 * Which questions may go up together, as a phrase. The bare word "independent" is
 * not enough: an independent contractor is not a rule about a frontier.
 */
const INDEPENDENT = /independent questions|do not affect one another/i;

test('the pilot posts independent questions together (spec 13)', () => {
  // The user's own words: "the questions are still coming one at a time, if they
  // don't affect one another, then just send multiple to the deck at once." Each
  // question is still its own thread; what changed is how many may be open.
  for (const rel of PILOT_FILES) {
    const said = sentences(read(rel));

    const together = said.filter(
      (line) => /\btogether\b/.test(line) && /question/i.test(line),
    );
    assert.ok(
      together.length > 0,
      `${rel} never says independent questions go to the deck together`,
    );
    assert.ok(
      together.some((line) => INDEPENDENT.test(line)),
      `${rel} says questions go together without saying which ones: ${together[0]}`,
    );
  }
});

test('one at a time is what an answer that changes another question buys (spec 13)', () => {
  // The exception has to be stated as an exception. A file that only dropped the
  // old rule would pass the scan below and leave a pilot with no rule at all for
  // the case the user kept: a question whose answer reshapes the next one.
  for (const rel of PILOT_FILES) {
    const exception = sentences(read(rel)).filter(
      (line) => ONE_AT_A_TIME.test(line) && ONLY_WHERE.test(line),
    );
    assert.ok(
      exception.length > 0,
      `${rel} never says when one at a time is still the rule`,
    );
  }
});

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

test('a numbered round of the whole frontier is still never posted (spec 13)', () => {
  // The half of the old rule the user kept. Several threads are several
  // conversations; one item holding a numbered list is a form to fill in, which is
  // what overriding Matt Pocock's round was for in the first place.
  for (const rel of QUESTION_FILES) {
    const refused = sentences(read(rel)).filter(
      (line) => /numbered (round|list|batch)/i.test(line) && /\b(never|not|overridden|refus)/i.test(line),
    );
    assert.ok(refused.length > 0, `${rel} no longer refuses the numbered round`);
  }
});

test("a crew agent's diagnosis is evidence, not a verdict (spec 12)", () => {
  // `pilot-explorer.md` already tells the explorer to return evidence. Nothing told
  // the pilot how to treat it, and on the run before this one a timeout theory was
  // designed around before anyone checked it.
  const bullet = /- \*\*Verification\.\*\*([\s\S]*?)(?=\n- \*\*|\n## )/.exec(read('agents/pilot.md'));
  assert.ok(bullet, 'verification must stay among the things that are the pilot\'s own');
  const text = bullet[1].replace(/\s+/g, ' ');

  assert.match(text, /evidence, not a verdict/, 'the bullet never says a report is evidence, not a verdict');
  assert.match(text, /diagnosis/, 'nor that a diagnosis is the case it matters most for');
  // The claim and where it is checked in one clause: "check a claim" and "the code"
  // as separate words would pass on a bullet that checked a claim against the report.
  assert.match(text, /one claim[^.]*against the code/, 'nor that one claim of it is checked against the code');
  assert.match(text, /before you act/, 'nor that the check comes before acting on it');
});

test("a brief names its worktree for the branch it carries, not the repository (spec 16)", () => {
  // The deck's tab falls back to the directory's basename, so the name of the
  // worktree is the name of the deck. This is a rule line in the pilot's definition and no code.
  const said = sentences(read('agents/pilot.md')).filter((line) =>
    line.includes('`<repo>-<branch-slug>`'),
  );
  assert.ok(said.length > 0, 'the pilot never gives briefs the worktree name to use');
  assert.ok(
    said.some((line) => /never the repository alone/i.test(line)),
    `the name is given without refusing the one it replaces: ${said[0]}`,
  );
});

test('a slice is addressed `S‹n› <title>` in the artefact and in `deck_status` (spec 10)', () => {
  // ADR 0022. "S2 in D4" addresses one slice of one run only if both halves are
  // canonical, and the deck half is useless while the artefact and the status table
  // disagree about what a slice is called.
  const skill = sentences(read('agents/pilot.md')).filter((line) =>
    line.includes('`S‹n› <title>`'),
  );
  assert.ok(skill.length > 0, 'the pilot never requires the `S‹n› <title>` form of a slice');
  assert.ok(
    skill.some((line) => /deck_status/.test(line)),
    `the form is required of the artefact but not of the status table: ${skill[0]}`,
  );

  const numbering = read('agents/pilot.md');
  assert.match(numbering, /`L‹n›`/, 'a locked decision is `L‹n›` from this run on');
  assert.match(numbering, /`A‹n›`/, 'an assumed one stays `A‹n›`');
  assert.match(numbering, /`D‹n›`/, 'and `D‹n›` is a deck and nothing else');
  assert.match(numbering, /`S2` in `D4`/, 'the address the numbering exists for is what it is worth stating');
  // Independence S4 deleted agents/pilot.md's deck tool table, a restatement of the
  // tool schemas; the form lives in the sentence above, which names `deck_status`.
});

test("pilot.md's step 3 posts no spec item and waits on none (thread-kinds spec 25, L15)", () => {
  // The spec kind is retired: the user agrees the spec through grilling and reads it at
  // Gate 1 in the artefact's §2. The daemon's open-question refusal stays for the verdicts.
  const skill = read('agents/pilot.md');
  const step = (n) => skill.split(`\n### ${n}. `)[1].split('\n### ')[0];

  assert.doesNotMatch(skill, /kind `spec`|`spec` item|`spec`,/, 'pilot.md still names a `spec` item or kind');
  assert.ok(
    sentences(step(3)).some((line) => /§2/.test(line) && /Gate 1/.test(line) && /no `spec`|nothing/.test(line)),
    "step 3 never says the spec is agreed in the artefact's §2, read at Gate 1, with nothing posted for it",
  );
  assert.ok(
    sentences(step(3)).some(
      (line) => /daemon refuses a `signoff`/.test(line) && /`gate1`/.test(line) && /`question`/.test(line) && /open/.test(line),
    ),
    'step 3 never says the daemon refuses a signoff or a gate while a question is open',
  );
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

test('no hand-off instruction names a prose file (run-record spec 3, L8)', async () => {
  for (const [where, text] of await HANDOFFS()) {
    assert.ok(text, `${where} has no hand-off of the pilot's own`);
    assert.doesNotMatch(text, /prompt file|hand-?off file|file it wrote/i, `${where} still points the pilot at a prose file`);
  }
});

test('the hand-off is `deck_status` with `next`, then `pilot handoff`, with `/clear` only after (run-record spec 3 and 10, L8, L20)', async () => {
  // The user, 2026-09-28: "i dont want the step to be manual at all." The mirror's
  // commit and the `handoff` item moved into one command; typing `/clear` is the
  // fallback off `pilot run`, named after it and never a step before it.
  for (const [where, text] of await HANDOFFS()) {
    const said = sentences(text);
    const at = (what, ok) => {
      const i = said.findIndex(ok);
      assert.ok(i >= 0, `${where}: the hand-off never ${what}`);
      return i;
    };
    const status = at(
      'sends `deck_status` with `slug` and `next` in one sentence',
      (line) => /`deck_status`/.test(line) && /`slug`/.test(line) && /`next`/.test(line),
    );
    const command = at(
      'runs `pilot handoff`, which commits `docs/design/<slug>/run.json` and posts the `handoff` item',
      (line) => /`pilot handoff`/.test(line) || (/`docs\/design\/<slug>\/run\.json`/.test(line) && /`handoff` item/.test(line)),
    );
    at('commits the mirror as `chore(<slug>): run record`', (line) => /`chore\(<slug>\): run record`/.test(line));
    const clear = said.findIndex((line, i) => i > command && /`\/clear`/.test(line));
    assert.ok(status < command && clear > command, `${where}: the steps are out of order`);
    assert.ok(!said.slice(0, command).some((line) => /`\/clear`/.test(line)), `${where}: /clear comes before the command`);
  }
});

test('step 5 commits the mirror after each slice merge (run-record spec 10, L19)', () => {
  const skill = read('agents/pilot.md');
  const step5 = sentences(skill.split('\n### 5. ')[1].split('\n### ')[0]);
  assert.ok(
    step5.some((line) => /`docs\/design\/<slug>\/run\.json`/.test(line) && /`deck_status`/.test(line)),
    'step 5 never writes the mirror from what `deck_status` returns',
  );
  assert.ok(
    step5.some((line) => /`chore\(<slug>\): run record`/.test(line)),
    'step 5 never commits the mirror',
  );
});

test('the artefact is the plan and the run record is the live state (run-record L9)', () => {
  const section = read('agents/pilot.md').split('\n### The artefact is the state\n')[1].split('\n### ')[0];
  assert.ok(
    sentences(section).some((line) => /run record/.test(line) && /live state/.test(line) && /plan/.test(line)),
    'the pilot never says the record is the live state and the artefact the plan',
  );
});

test("deck_status's description names its mirror (run-record spec 10, L20)", () => {
  assert.match(
    TOOLS.find((tool) => tool.name === 'deck_status').description,
    /docs\/design\/<slug>\/run\.json/,
    'the tool the pilot calls never says where its record is mirrored',
  );
});

// --- deferred-ledger S3: the chat is answered, never resolved ---------------

test('the chat is where the user talks to the pilot, and it is answered, never resolved (S3, spec 7-8)', () => {
  const said = sentences(read('agents/pilot.md'));
  assert.ok(
    said.some((line) => /\bchat\b/i.test(line) && /where the user talks to you/i.test(line)),
    'the pilot never says the chat is where the user talks to it',
  );
  assert.ok(
    said.some((line) => /`deck_reply`/.test(line) && /never `deck_resolve`/.test(line)),
    'the pilot never says to answer the chat with deck_reply and never resolve it',
  );
});

// --- independence S4: the rules S3 made code ----------------------------

test('no pilot file restates a rule S3 made code: a slugless `deck_status`, a question body over a screen (independence spec 8, L7)', () => {
  for (const rel of [...PILOT_FILES, 'hooks/context-size-guard.js']) {
    const text = read(rel).replace(/['"`]\s*\+\s*['"`]/g, '').replace(/\s+/g, ' ');
    assert.doesNotMatch(text, /without `slug` writes no record/, `${rel} still says a slugless call is accepted`);
    assert.doesNotMatch(text, /a screen at most/i, `${rel} still states the question length the daemon now refuses`);
  }
});

test('the pilot restarts `pilot wait` on any exit, silently when no reply came (ticket-states A10)', () => {
  // 2026-10-02: Claude Code's 2-hour cap on a background command killed a 600-minute wait, and the
  // prose told the pilot to say so and wait for the user, so an unattended run stopped listening.
  const flat = read('agents/pilot.md').replace(/\s+/g, ' ');
  assert.match(flat, /restart it on any exit, never two at once/);
  assert.match(flat, /after 110 minutes with none \(`NO REPLY after 110 minutes`\), inside Claude Code's 2-hour cap on a background command, and you restart that one silently/);
  assert.doesNotMatch(flat, /restart it when the user says/, 'no exception that waits for the user');
});

test('the pilot reads the wait\'s output before any exit label the harness gives', () => {
  // 2026-10-01: a wait that took the user's thread was labelled "stopped at the time limit", and
  // the pilot believed the label and never read the output (user-thread-listener spec 3, L1).
  const flat = read('agents/pilot.md').replace(/\s+/g, ' ');
  assert.match(flat, /Read its output before any exit label the harness gives\./);
});

// --- audit-fixes S11: agents find ADRs through the index ----------------

const ADR_INDEX = /\bADR through `docs\/adr\/README\.md` first\b/;

test('the README Layout table links docs/adr', () => {
  const readme = read('README.md');
  assert.ok(readme.includes('\n## Layout\n'), 'the README has no Layout section');
  const layout = readme.split('\n## Layout\n')[1].split('\n## ')[0];
  assert.match(layout, /^\| \[`docs\/adr\/`\]\(docs\/adr\/README\.md\) \|/m, 'no Layout row links `docs/adr/` to its index');
});

for (const [who, rel] of [['pilot', 'agents/pilot.md'], ['architect', 'agents/pilot-architect.md']]) {
  test(`the ${who} reads the ADR index before opening an ADR`, () => {
    assert.ok(
      sentences(read(rel)).some((line) => ADR_INDEX.test(line) && !/\b(never|not)\b/i.test(line)),
      `${rel} never says to read \`docs/adr/README.md\` first, before an ADR`,
    );
  });
}

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

test('pilot-qa.md posts its walkthrough unconditionally; the pilot keeps the evidence-only path', () => {
  // walkthrough-taste QA Q4: a feature with nothing to look at still gets the table and Sign off (spec 3).
  const procedure = sentences(part(read('agents/pilot-qa.md'), '## The procedure'));
  assert.ok(!procedure.some((s) => /\bonly when\b[^.]*\bonly the user can\b/i.test(s)), 'QA posts the walkthrough whatever is left');
  const step8 = sentences(part(read('agents/pilot.md'), "### 8. Feature QA and the user's procedure, AFK to start"));
  assert.ok(
    step8.some((s) => /\bwhen only the user can\b[^.]*\bposts the \*\*procedure\*\*/i.test(s)),
    "the pilot's step 8 has QA post the procedure only when the user alone can step through it",
  );
  assert.ok(step8.some((s) => /^else it reports its evidence\b/i.test(s)), 'and otherwise report its evidence');
  for (const file of ['agents/pilot.md', 'agents/pilot-qa.md']) {
    const mandatory = sentences(read(file)).filter((s) => /\bwalkthrough\b/i.test(s) && /\b(always|must)\b/i.test(s));
    assert.deepEqual(mandatory, [], `${file} makes a walkthrough mandatory`);
  }
});

test('the wizard says to set dir for a command step', () => {
  assert.ok(
    sentences(read('skills/wizard/SKILL.md')).some((s) => /`dir`[^.]*\bwhenever\b[^.]*\bstep is a command\b/i.test(s)),
    'the wizard sets `dir` whenever a step is a command',
  );
  assert.match(read('skills/wizard/SKILL.md'), /`url`[^\n]*rather than (in )?the body/, 'the wizard puts the locator in `url`');
});

test('pilot.md posts gate2 without walkthrough when QA posted none', () => {
  const step9 = sentences(part(read('agents/pilot.md'), '### 9. Gate 2 and ready'));
  assert.ok(
    step9.some((s) => /`gate2`/.test(s) && /\bevidence\b[^.]*\bposted none\b/i.test(s)),
    "the gate2 sentence names QA's evidence as what it stands on when QA posted no walkthrough",
  );
});

test('no agent file calls a walkthrough a browser procedure', () => {
  const dir = path.join(ROOT, 'agents');
  const BROWSER_BOUND = /\bbrowser (procedure|walkthrough)\b|\bwalkthrough (in|through) a browser\b|`(url|login)`[^.]*\bfor a preview\b/i;
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const hits = sentences(read(`agents/${name}`)).filter((s) => BROWSER_BOUND.test(s));
    assert.deepEqual(hits, [], `agents/${name} binds a walkthrough to a browser`);
  }
});
