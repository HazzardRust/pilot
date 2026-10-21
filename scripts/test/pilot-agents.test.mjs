/**
 * Slice 6 moves the pilot and its crew out of one machine's `~/.claude` and into the
 * plugin. The judgement text is the user's and is copied unchanged; what these tests
 * hold is everything a careless copy would break — the address of every agent, the
 * model each one runs on, the transport it asks the human through, and the paths it
 * resolves its own package by.
 *
 * Each assertion here stands for a way the crew is dead on arrival on a friend's
 * machine: an upstream address nothing answers, an `AskUserQuestion` that pops a
 * dialog nobody is watching, a plugin-root path pointing at a file this package does
 * not ship, or an `Agent(...)` list that silently forbids the reviewer a child was
 * told to spawn.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkReferences, pluginRootPaths } from '../check-references.mjs';
import { TEACH_ME } from '../../deck/items.mjs';
import { TOOLS } from '../../deck/tools.mjs';
import { MAX_WALKTHROUGH_BODY_LINES } from '../../deck/walkthrough-shape.mjs';
import { sectionOf, flat, frontmatterOf as leadingFrontmatter, bodyOf } from './lib/area-file.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The seven crew agents, plus the pilot that spawns them. */
const CREW = [
  'pilot',
  'pilot-architect',
  'pilot-auditor',
  'pilot-explorer',
  'pilot-implementer',
  'pilot-co-pilot',
  'pilot-lander',
  'pilot-fundamentalist',
  'pilot-qa',
  'pilot-teacher',
];

/** Slice 8's toolbox: the children a crew agent is allowed to spawn. */
const TOOLBOX = [
  'build-error-resolver',
  'code-explorer',
  'cpp-reviewer',
  'database-reviewer',
  'docs-lookup',
  'go-reviewer',
  'pilot-evidence-runner',
  'pilot-fact-sheet',
  'python-reviewer',
  'react-build-resolver',
  'react-reviewer',
  'rust-reviewer',
  'security-reviewer',
  'silent-failure-hunter',
  'typescript-reviewer',
];

/**
 * The deck vocabulary the pilot holds (slices 2 to 5, and ticket-making S2). `deck_wait` left
 * it in crew-waits L5: the pilot waits through a background `pilot wait`.
 */
const DECK_TOOLS = [
  'deck_post',
  'deck_read',
  'deck_reply',
  'deck_resolve',
  'deck_status',
  'deck_ticket',
];

/**
 * Capability order, cheapest first. "Above its table default" is a claim about this
 * ordering: an agent may be dropped to a cheaper model for a mechanical slice, and
 * may never be quietly promoted past what the Models table budgeted for it.
 */
const MODEL_RANK = ['haiku', 'sonnet', 'opus', 'fable'];

/** Normalised to LF: git checks these out with CRLF on Windows, and the assertions are about content. */
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

const agentSource = (name) => read(`agents/${name}.md`);

const frontmatterOf = (source) => {
  const block = leadingFrontmatter(source);
  assert.ok(block, 'the file needs YAML frontmatter to be invocable');
  return block;
};

const fieldOf = (source, key) => {
  const match = new RegExp(`^${key}:[ \\t]*(.*)$`, 'm').exec(frontmatterOf(source));
  return match ? match[1].trim() : null;
};

/** The defaults the Models table in the pilot's definition budgets for each role. */
function modelDefaults() {
  const skill = read('agents/pilot.md');
  const defaults = new Map();
  for (const line of skill.split('\n')) {
    // The first word of the Default cell is the default: `Opus; Sonnet on a precise slice` budgets Opus.
    const row = /^\|\s*([a-z-]+)\s*\|\s*([A-Za-z]+)[^|]*\|/.exec(line.replace(/`/g, ''));
    if (row && CREW.includes(row[1])) defaults.set(row[1], row[2].toLowerCase());
  }
  return defaults;
}

/**
 * The agent types named inside an orchestrator's `tools:` `Agent(...)` restriction, as written:
 * the pilot's by default; the co-pilot's bind its grandchildren on yellow.
 */
function spawnableTypes(name = 'pilot') {
  const tools = fieldOf(agentSource(name), 'tools');
  assert.ok(tools, `agents/${name}.md must declare a tools list`);
  const list = /Agent\(([^)]*)\)/.exec(tools);
  assert.ok(list, `agents/${name}.md must restrict Agent(...) to the types it may spawn`);
  return list[1].split(',').map((entry) => entry.trim()).filter(Boolean);
}

/**
 * The `pilot:<name>` addresses a file names as a child. `claude --agent pilot:pilot` is
 * how a human starts the pilot — a CLI flag, not an Agent-tool address — so it is not
 * a spawn and the pilot is never its own child.
 */
function childAddressesIn(source) {
  const spawns = source.replace(/--agent pilot:pilot/g, '');
  return [...spawns.matchAll(/\bpilot:([a-z][a-z0-9-]*)\b/g)].map(([, named]) => named);
}

test('the pilot and its six crew agents ship in the plugin', () => {
  for (const name of CREW) {
    const rel = `agents/${name}.md`;
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `${rel} is missing`);
    assert.equal(fieldOf(read(rel), 'name'), name, `${rel} must be addressable as pilot:${name}`);
    assert.match(frontmatterOf(read(rel)), /^description: \S/m, `${rel} needs a description`);
  }
});

test('the pilot runs on Fable, which is the only model this workflow was written for', () => {
  assert.equal(fieldOf(agentSource('pilot'), 'model'), 'fable');
});

test('no crew agent is promoted above the model its own table budgets for it', () => {
  const defaults = modelDefaults();
  assert.equal(defaults.size, CREW.length, 'the Models table must name every crew role');

  for (const name of CREW) {
    const declared = fieldOf(agentSource(name), 'model');
    assert.ok(declared, `agents/${name}.md declares no model`);
    const budget = defaults.get(name);
    assert.ok(MODEL_RANK.includes(declared), `agents/${name}.md declares unknown model ${declared}`);
    assert.ok(MODEL_RANK.includes(budget), `the Models table gives ${name} the unknown model ${budget}`);
    assert.ok(
      MODEL_RANK.indexOf(declared) <= MODEL_RANK.indexOf(budget),
      `agents/${name}.md runs ${declared}; the Models table budgets ${budget}`,
    );
  }
});

test('the pilot may spawn every agent its crew names, under the plugin-scoped address', () => {
  // Two findings, both paid for by a real run. Slice 1: a main session's Agent(...) list
  // binds every agent it spawns, so a reviewer the implementer is told to use but the
  // pilot never listed cannot be reached at all — the list is the union, not the pilot's
  // own shortlist. Slice 6: the entries must be the scoped `pilot:<name>`, because that
  // is the only address that reaches this package's copy. A bare name resolves to a
  // same-named agent in the user's own ~/.claude/agents, which shadows the plugin's, and
  // to nothing for the toolbox agents nobody has a personal copy of.
  const spawnable = spawnableTypes();

  for (const entry of spawnable) {
    assert.ok(
      entry === 'Explore' || entry.startsWith('pilot:'),
      `agents/pilot.md lists ${entry} bare; only pilot:${entry} reaches this package's own agent`,
    );
  }

  const scoped = new Set(
    spawnable.filter((entry) => entry.startsWith('pilot:')).map((entry) => entry.slice('pilot:'.length)),
  );

  for (const name of [...CREW.filter((role) => role !== 'pilot'), ...TOOLBOX]) {
    assert.ok(scoped.has(name), `agents/pilot.md cannot spawn pilot:${name}, so no crew agent can either`);
  }

  const shipped = new Set(
    fs.readdirSync(path.join(ROOT, 'agents')).map((file) => path.basename(file, '.md')),
  );
  for (const name of CREW) {
    for (const named of childAddressesIn(agentSource(name))) {
      if (!shipped.has(named)) continue;
      assert.ok(
        scoped.has(named),
        `agents/${name}.md names pilot:${named} as a child, which agents/pilot.md does not list`,
      );
    }
  }

  for (const name of scoped) {
    assert.ok(
      shipped.has(name),
      `agents/pilot.md lists pilot:${name}, which this package does not ship`,
    );
  }
});

test('the implementer names a reviewer for Go, Rust and C++', () => {
  // deck-press-feedback S11 (spec 21): a Rust slice was reviewed by the language-neutral
  // fallback because no Rust reviewer shipped. The three now ship, so the implementer's
  // review sentence must list them among the language reviewers and drop Rust from the
  // fallback's languages.
  const prose = agentSource('pilot-implementer').replace(/\s+/g, ' ');
  const reviewers = /the reviewer matching the language where one ships \(([^)]*)\)/.exec(prose);
  assert.ok(reviewers, 'pilot-implementer.md no longer names its language reviewers');
  for (const name of ['go-reviewer', 'rust-reviewer', 'cpp-reviewer']) {
    assert.ok(reviewers[1].includes(`\`pilot:${name}\``), `pilot-implementer.md does not name pilot:${name}`);
  }
  const fallback = /`pilot:silent-failure-hunter` \(([^)]*)\)/.exec(prose);
  assert.ok(fallback, 'pilot-implementer.md no longer names its language-neutral fallback');
  assert.doesNotMatch(fallback[1], /rust|\bgo\b|c\+\+/i, 'a language with its own reviewer is still sent to the fallback');
});

test('the pilot asks through the deck and has no dialog to fall back on', () => {
  const pilot = agentSource('pilot');
  assert.doesNotMatch(pilot, /AskUserQuestion/, 'the deck is the only inbox (ADR 0004)');
  assert.match(fieldOf(pilot, 'tools'), /mcp__plugin_pilot_deck__/, 'the pilot must hold the deck tools');
});

// user-threads-open L5: the user closes a thread they opened; the pilot only answers it.
test('pilot.md answers a user thread with deck_reply and never says "until you deck_resolve it"', () => {
  const pilot = agentSource('pilot');
  assert.ok(pilot.includes('The chat and a thread the user opened (Create, Add) are answered with `deck_reply`, never `deck_resolve`; the chat never closes, and the user closes the thread.'));
  assert.doesNotMatch(pilot, /until you `deck_resolve` it/);
});

test("the pilot's tools field grants deck_ticket", () => {
  const tools = (name) => fieldOf(agentSource(name), 'tools').split(',').map((entry) => entry.trim());
  for (const tool of DECK_TOOLS) {
    assert.ok(grantsMcp(tools('pilot'), `mcp__plugin_pilot_deck__${tool}`), `the pilot is not granted ${tool}`);
  }
  // Ticket-making A5: moving the queue is the pilot's alone. merge-first L11: the architect
  // holds deck_ticket for its one merge, which its prose limits to the `merge` action.
  for (const name of CREW.filter((agent) => agent !== 'pilot' && agent !== 'pilot-architect')) {
    assert.ok(!grantsMcp(tools(name), 'mcp__plugin_pilot_deck__deck_ticket'), `agents/${name}.md is granted deck_ticket`);
  }
});

/**
 * An MCP tool an agent's prose tells it to call, and whether its `tools:` field actually
 * grants it. Two forms grant: the exact tool name, or the server it belongs to
 * (`mcp__plugin_pilot_deck` grants every tool on that server). A third form — `mcp__*` —
 * grants nothing at all: the harness drops it silently, and the agent starts with no MCP
 * tools and no error to say why.
 *
 * That is not a hypothetical. A live run of `pilot:pilot-qa` came up with **13 tools, 0
 * of them MCP**, and the agent stopped and reported it could reach neither the deck nor
 * a browser; the same run's `pilot:pilot` — which names its servers properly — came up
 * with 77 tools, 64 of them MCP. Nothing in the package noticed, because an instruction
 * file that addresses a tool it was never granted still reads perfectly.
 */
const mcpAddressesIn = (source) => [
  ...new Set(
    // The hyphen is load-bearing: the server is `chrome-devtools`, and a character class
    // without it matches nothing in the one address both these agents live by. The `*` is
    // the form the prose uses for "every tool on this server", and it is granted by the
    // server entry rather than by name.
    (source.slice(source.indexOf('\n---', 4)).match(/mcp__[a-z0-9_-]+__[a-z0-9_*-]+/gi) ?? []).map(
      (address) => address.replace(/_+$/, ''),
    ),
  ),
];

const grantsMcp = (tools, address) => {
  const server = address.slice(0, address.indexOf('__', 5));
  return tools.includes(address) || tools.includes(server);
};

test('every MCP tool a crew agent is told to call is one its own tools field grants', () => {
  for (const name of CREW) {
    const source = agentSource(name);
    const tools = fieldOf(source, 'tools')
      .split(',')
      .map((entry) => entry.trim());

    assert.ok(
      !tools.includes('mcp__*'),
      `agents/${name}.md grants \`mcp__*\`, which the harness drops silently — name the ` +
        'servers (mcp__plugin_pilot_deck) or the tools instead',
    );

    for (const address of mcpAddressesIn(source)) {
      assert.ok(
        grantsMcp(tools, address),
        `agents/${name}.md tells the agent to call ${address}, which its tools field does not grant`,
      );
    }
  }
});

test('the skills that put a question to the user wait on it, argue with it and close it', () => {
  // Slice 7 vendored these three when the deck could only post and read. Slices 2 and 3
  // gave it waiting, push-back and resolution, and a skill that never learned them leaves
  // the agent polling `deck_read` and leaves every thread it opened open for ever.
  for (const name of ['grilling', 'wizard', 'diagnosing-bugs']) {
    const source = read(`skills/${name}/SKILL.md`);
    assert.ok(
      source.includes('mcp__plugin_pilot_deck__deck_wait'),
      `skills/${name}/SKILL.md asks the user something and never waits on the answer`,
    );
  }

  // Grilling and the wizard own their threads end to end; diagnosing-bugs hands its
  // walkthrough back to whoever is driving the bug, so it only has to wait.
  for (const name of ['grilling', 'wizard']) {
    const source = read(`skills/${name}/SKILL.md`);
    assert.ok(
      source.includes('mcp__plugin_pilot_deck__deck_reply'),
      `skills/${name}/SKILL.md cannot push back on an answer, which makes its item a form`,
    );
    assert.ok(
      source.includes('mcp__plugin_pilot_deck__deck_resolve'),
      `skills/${name}/SKILL.md never closes the thread it opened`,
    );
  }

  // The ledger is what a re-sync against a newer upstream reads, so the row has to say
  // that the deck vocabulary is part of the adaptation and not only the posting of it.
  const ledger = read('vendor/methodology.md');
  for (const name of ['grilling', 'wizard', 'diagnosing-bugs']) {
    const row = ledger.split('\n').find((line) => line.includes(`\`skills/${name}/SKILL.md\``));
    assert.ok(row, `vendor/methodology.md has no row for skills/${name}/SKILL.md`);
    assert.match(row, /deck_wait/, `the ledger row for ${name} does not say the wait is part of the adaptation`);
  }
});

test('nothing the crew loads reaches for a user dialog instead of the deck', () => {
  const surfaces = [
    ...CREW.map((name) => `agents/${name}.md`),
    'agents/pilot.md',
    'skills/vertical-slicing/SKILL.md',
    'rules/orchestration.md',
    'rules/vertical-execution.md',
  ];
  for (const rel of surfaces) {
    assert.doesNotMatch(read(rel), /AskUserQuestion/, `${rel} still asks the user through a dialog`);
  }
});

test('the pilot drives the status table and the two gates through the deck', () => {
  const skill = read('agents/pilot.md');
  assert.match(skill, /kind `walkthrough`/, 'a QA walkthrough is a walkthrough item on the deck');
});

test('pilot.md posts Gate 1 as kind gate1 and Gate 2 as kind gate2', () => {
  // thread-kinds S5 (spec 14, L5, L19): each gate is a thread of its own kind carrying its
  // evidence as fields; the retired `gate` tag is refused by the deck (S2), and Sign off on
  // QA's walkthrough no longer records Gate 2: the pilot's `gate2` thread does.
  const skill = read('agents/pilot.md').replace(/\s+/g, ' ');
  const gate1 = /\*\*Gate 1\*\* is the user signing off.*?(?=At the \*every\* depth)/.exec(skill);
  assert.ok(gate1, 'agents/pilot.md must carry the Gate 1 paragraph');
  assert.match(gate1[0], /kind `gate1`/, 'Gate 1 is a gate1 thread');
  for (const field of ['artefact', 'sha', 'locked', 'slices']) {
    assert.ok(gate1[0].includes('`' + field + '`'), `the gate1 thread carries ${field}`);
  }
  const gate2 = /\*\*Gate 2\*\* is the user signing off.*?(?=the press frees the lane)/.exec(skill);
  assert.ok(gate2, 'agents/pilot.md must carry the Gate 2 paragraph');
  assert.match(gate2[0], /kind `gate2`/, 'Gate 2 is a gate2 thread');
  for (const field of ['pr', 'sha', 'walkthrough']) {
    assert.ok(gate2[0].includes('`' + field + '`'), `the gate2 thread carries ${field}`);
  }
  assert.doesNotMatch(gate2[0], /record(s|ed)? Gate 2/i, 'Sign off on the walkthrough no longer records Gate 2');
  assert.doesNotMatch(skill, /kind `signoff` with/, 'no gate is a signoff item');
});

test('the pilot says a gate passes only on the Sign off press and typed approval is answered by asking for it', () => {
  // merge-first S5 (spec 6, L12): the one spelling, in the Gate 1 paragraph.
  const skill = read('agents/pilot.md').replace(/\s+/g, ' ');
  const gate1 = /\*\*Gate 1\*\* is the user signing off.*?(?=At the \*every\* depth)/.exec(skill);
  assert.ok(gate1, 'agents/pilot.md must carry the Gate 1 paragraph');
  assert.ok(
    gate1[0].includes('A gate passes only when the user presses Sign off; typed approval gets a reply asking for the press, and the gate stays open.'),
    'the Gate 1 paragraph carries the one spelling',
  );
});

test('no swept file says a gate is "the user saying"', () => {
  // merge-first S5 (spec 6, §3 F6): typed words never pass a gate, so no swept line says they do.
  const rot = /user saying|sa(?:ys?|id) (?:they are|I am) satisfied|are you satisfied|on the user's word|pass neither on the user's|When the user is satisfied/i;
  for (const file of ['agents/pilot.md', 'agents/pilot-qa.md', 'CLAUDE.excerpt.md', 'CONTEXT.md', 'rules/vertical-execution.md', 'rules/orchestration.md']) {
    assert.doesNotMatch(read(file).replace(/\s+/g, ' '), rot, file);
  }
});

test("pilot-qa.md's procedure carries no gate", () => {
  const procedure = /## The procedure\n([\s\S]*?)(?=\n## )/.exec(read('agents/pilot-qa.md'));
  assert.ok(procedure, 'agents/pilot-qa.md must carry its procedure section');
  const text = procedure[1].replace(/\s+/g, ' ');
  assert.match(text, /`kind: "walkthrough"`/, 'the procedure is a walkthrough post');
  assert.doesNotMatch(text, /`gate:/, 'the walkthrough carries no gate tag');
  assert.match(text, /then post the `gate2`/, 'three-lanes S8: QA posts the gate2 once the walkthrough is signed');
});

test('no agent or skill file sends gate: "1" or gate: "2"', () => {
  const files = [];
  const walk = (rel) => {
    for (const entry of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      const child = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith('.md')) files.push(child);
    }
  };
  walk('agents');
  walk('skills');
  for (const rel of files) {
    assert.ok(!/gate: ?"[12]"/.test(read(rel)), `${rel} still sends the retired gate tag`);
  }
});

test('the pilot is told deck_status takes `after`, and after names a row of the same call', () => {
  // Slice 4 of deck-tree added the two fields. Independence S4 deleted agents/pilot.md's
  // deck tool table as a restatement of the tool schema, so the pin reads the two places
  // the pilot is told now: the skill's artefact section here, and the schema below.
  const artefact = /### The artefact is the state\n([\s\S]*?)(?=\n### |$)/.exec(read('agents/pilot.md'))[1];
  assert.match(artefact, /`after`/, 'the artefact section names the after field');
  assert.doesNotMatch(artefact, /`delivers`/, 'slice-graph A2: the pilot no longer mirrors delivers');
});

test("the after field's description names the rows it comes after", () => {
  // The schema as the model receives it, not the source it is built from.
  const slices = TOOLS.find((tool) => tool.name === 'deck_status').inputSchema.properties.slices;
  assert.match(slices.items.properties.after.description, /the rows it comes after, by S<n> or name/, 'the schema says after names rows by identifier or name');
});

test('the artefact section and the architect status-table section carry the blockers and the spec lines delivered', () => {
  // Slice 4: agents/pilot.md describes the status table the pilot mirrors to
  // the deck, and agents/pilot-architect.md describes the table the architect
  // writes for the pilot to inherit. Both now carry a slice's blocker (`after`)
  // and the spec lines it delivers, alongside slice, state, branch and worktree.
  // Scoped to the named section/item itself, not the whole file, so a stray
  // "blocker" anywhere else in either file cannot make this pass by accident.
  const skill = read('agents/pilot.md');
  const architect = agentSource('pilot-architect');

  const artefactSection = /### The artefact is the state\n([\s\S]*?)(?=\n### |$)/.exec(skill);
  assert.ok(artefactSection, 'the artefact section "The artefact is the state" must exist');
  const artefactText = artefactSection[1];
  assert.match(artefactText, /blocker/, 'the artefact section names the blocker a slice comes after');
  assert.match(
    artefactText,
    /spec lines (it|each slice)\s+delivers/,
    'the artefact section names the spec lines delivered',
  );

  const statusTableItem = /10\.\s+\*\*Status table\*\*:([\s\S]*?)\n\n/.exec(architect);
  assert.ok(statusTableItem, 'the architect must still have a numbered "Status table" item');
  const statusTableText = statusTableItem[1];
  assert.match(statusTableText, /blocker/, 'the architect status-table item names the blocker column');
  assert.match(statusTableText, /spec lines it delivers/, 'the architect status-table item names the spec-lines-delivered column');
});

test('ADR 0014 records the tree, the after validation, the edge tabs and the details bookmark, and ADR 0101 supersedes its tree', () => {
  const adrPath = path.join(ROOT, 'docs', 'adr', '0014-the-deck-draws-a-run-as-a-tree.md');
  assert.ok(fs.existsSync(adrPath), 'ADR 0014 must exist in the form of 0012 and 0013');
  const adr = fs.readFileSync(adrPath, 'utf8').replace(/\r\n/g, '\n');

  assert.match(adr, /\*\*Consequences\*\*:/, 'the ADR closes with the Consequences line the format uses');
  assert.doesNotMatch(adr, /^#{2,}\s/m, 'the format has no sections beyond the title and the Consequences line');

  assert.match(adr, /treeOf/, 'the ADR records D1: the tree is computed at render time, never stored');
  assert.match(adr, /cycle/, 'the ADR records D2: after is validated and a cycle is refused');
  assert.match(adr, /edge/, 'the ADR records D9: both views live at the edges of the page');
  assert.match(adr, /details/, 'the ADR records D10: a tab is a details/summary element');
  assert.match(adr, /bookmark/, 'the ADR records the edge tab strip as the pattern later features reuse');
  assert.match(adr, /^superseded_by: \[0101\]$/m, 'slice-graph L1: ADR 0101 replaces the tree');
});

test("the pilot is told to name the run: the artefact section and the architect's status table both send `feature`", () => {
  // Independence S4 deleted agents/pilot.md's deck_status row, a restatement of this section.
  const artefact = /### The artefact is the state\n([\s\S]*?)(?=\n### |$)/.exec(read('agents/pilot.md'))[1];
  assert.match(artefact, /`feature`/, 'the artefact section names the feature field');
  assert.match(artefact, /working directory/, 'the artefact section replaces the directory name on the tab');
  assert.match(artefact, /omits\s+it keeps the name/, 'the artefact section says the same about an omitted feature (A2)');

  const table = /10\.\s+\*\*Status table\*\*:([\s\S]*?)\n\n/.exec(agentSource('pilot-architect'))[1];
  assert.match(table, /`feature`/, 'the architect status-table item names the feature field');
});

test('ADR 0015 records D1, D3, D4, D6 and D11 for the run tabs', () => {
  const adrPath = path.join(ROOT, 'docs', 'adr', '0015-the-deck-shows-one-run-at-a-time.md');
  assert.ok(fs.existsSync(adrPath), 'ADR 0015 must exist in the form of 0012-0014');
  const adr = fs.readFileSync(adrPath, 'utf8').replace(/\r\n/g, '\n');

  assert.match(adr, /\*\*Consequences\*\*:/, 'closes with the Consequences line the format uses');
  assert.doesNotMatch(adr, /^#{2,}\s/m, 'no sections beyond the title and the Consequences line');

  assert.match(adr, /run=/, 'D1: selection lives in the URL');
  assert.match(adr, /sameRepo/, 'D3: a tab is a repository, matched with sameRepo');
  assert.match(adr, /registerRun/, "D4: an ended run's record is kept while it has an open item");
  assert.match(adr, /no status table/, 'D6: the overview carries no status table or tree');
  assert.match(adr, /sole live run/, 'D11: land on the sole live run when exactly one is live');
});

test('the file that tells the pilot how to wait says a turn does not end on an unanswered item', () => {
  // 2026-09-16: the pilot posted, parked three times on a two-minute wait, ended
  // its turn with a status line, and never heard the answer that arrived fourteen
  // minutes later. The hook that now holds the turn open is the net; these
  // sentences are the rule, and a file that lost one would teach the old habit
  // back the next time it was read. Since ADR 0046 one file carries them.
  for (const rel of ['agents/pilot.md']) {
    const source = read(rel);
    assert.match(
      source,
      /turn never ends with an item you posted still unanswered/,
      `${rel} lets the pilot end a turn on a question nobody has answered`,
    );
    // Independence spec 19, 20 (background-wait fix): a background `pilot wait` restarts
    // every 110 minutes (ticket-states A10) and the pilot stops on the record's word.
    for (const rule of [/while a run\s+is live you keep listening on the deck/, /110\s+minutes/, /pilot wait/, /`finished`/]) {
      assert.match(source, rule, `${rel} does not say how the pilot keeps listening: ${rule}`);
    }
  }
});

test('QA runs once per feature, the fundamentalist reports and the pilot decides, and no slice PR leaves draft', () => {
  // 2026-09-15: the user moved QA from the end of every slice to the end of the feature,
  // put the pilot between the fundamentalist's findings and whoever fixes them, made the
  // review subtract before it judges, and made the QA agent's step-by-step procedure the
  // last gate's evidence. These hold the files that describe the loop to one shape: a
  // crew whose skill says one thing and whose agent file says another does whichever it
  // read last.
  const skill = read('agents/pilot.md');
  const fundamentalist = agentSource('pilot-fundamentalist');
  const qa = agentSource('pilot-qa');
  const implementer = agentSource('pilot-implementer');
  const architect = agentSource('pilot-architect');
  const pilot = agentSource('pilot');
  const execution = read('rules/vertical-execution.md');

  // The run starts by building the spec with the user, and the artefact carries it.
  assert.match(skill, /### 1\. Problem and spec, with the user/, 'step 1 builds the spec with the user');
  assert.match(architect, /\*\*Spec\*\*/, 'the artefact has a Spec section');

  // One QA pass, on the integration branch, never per slice.
  assert.match(skill, /no slice PR is ever marked ready/, 'the skill says no slice PR leaves draft');
  assert.doesNotMatch(skill, /QA per slice/i, 'QA is no longer a per-slice step');
  assert.match(qa, /feat\/<slug>/, 'the QA agent works on the integration branch');
  // gate-no-stall L6: only `pilot land` flips the feature PR, never the pilot or QA.
  assert.doesNotMatch(skill, /gh pr ready/, 'the pilot runs no ready press of its own');
  assert.doesNotMatch(qa, /gh pr ready <n>/, 'the QA agent no longer flips a slice PR');
  assert.match(qa, /kind: "walkthrough"/, 'the procedure is a walkthrough item on the deck');
  assert.match(execution, /\*\*Gate 2\*\* is before the feature PR/, 'the rule puts Gate 2 on the feature PR');

  // The fundamentalist subtracts first and reports; the pilot decides; an implementer fixes.
  assert.match(fundamentalist, /## The subtraction pass/, 'subtraction is a pass of its own, before the principles');
  assert.match(fundamentalist, /net line/, 'every finding carries its net line change');
  assert.doesNotMatch(fundamentalist, /QA agent,? (who|to) fix/i, 'the fundamentalist no longer routes findings to the QA agent');
  assert.match(pilot, /\*\*The verdicts\.\*\*/, 'the verdict on a finding is the pilot\'s and never delegated');
  assert.match(implementer, /## A fix brief/, 'the implementer is the fixer, given a fix brief');
  assert.doesNotMatch(qa, /fundamentalist's (blocking )?findings/, 'the QA agent no longer carries the fundamentalist\'s findings');
});

test('the runner carries the mutation-safety rule', () => {
  // 2026-09-17: a mutant of deck/store.mjs that ignored PILOT_DECK_DIR sent two
  // mutation runs' fixtures into the user's own live deck, and the user answered two
  // of them thinking they were real. The rule that stops it has to survive a copy.
  // cheaper-crew S2 (spec 3, L7): it lives with the agent that mutates, and only there.
  const runner = agentSection('pilot-evidence-runner', 'Never mutate[^\\n]*');
  assert.match(
    runner,
    /store\.mjs/,
    'the runner must forbid mutating a module that resolves a store path, named for this project',
  );
  assert.match(
    runner,
    /USERPROFILE/,
    'the runner must point HOME and USERPROFILE at a scratch directory for every mutation pass',
  );
  assert.doesNotMatch(agentSource('pilot-fundamentalist'), /store\.mjs/, 'no second copy in the fundamentalist');
});

test('the QA agent never goes looking for a process by the file it runs', () => {
  // 2026-09-19: sweeps matching `daemon.mjs` and `client.mjs` in a command line killed
  // the user's live deck twice and the pilot's own bridge once, in one run. Every
  // session on the machine runs those same two files, so the rule that says to ask a
  // port for its pid instead has to survive a copy.
  const qa = agentSource('pilot-qa');
  assert.match(
    qa,
    /daemon\.mjs/,
    'the QA agent must be told not to match a process by the file it runs, naming the file',
  );
  assert.match(
    qa,
    /\/api\/health/,
    'and must be told where a daemon\'s pid actually comes from: its own port',
  );
});

test('the inheritance finding is written down where it is acted on', () => {
  // The rule used to say the Agent(...) list bound the main session alone. It does
  // not, and a crew that believes it will keep shipping unreachable reviewers.
  const orchestration = read('rules/orchestration.md');
  assert.doesNotMatch(
    orchestration,
    /restricts only an agent running as the main session/,
    'the inherited-restriction finding contradicts this sentence; it must go',
  );
  assert.match(orchestration, /inherit/i, 'the rule must say the restriction is inherited');
});

test('every skill a crew agent preloads is one this package ships', () => {
  for (const name of CREW) {
    const declared = fieldOf(agentSource(name), 'skills');
    if (!declared) continue;
    for (const skill of declared.replace(/[[\]]/g, '').split(',')) {
      const clean = skill.trim();
      if (!clean) continue;
      assert.ok(
        fs.existsSync(path.join(ROOT, 'skills', clean, 'SKILL.md')),
        `agents/${name}.md preloads ${clean}, which this package does not ship`,
      );
    }
  }
});

test('the crew resolves its own package by variable, never by a path on one machine', () => {
  const { ok, failures } = checkReferences(ROOT);
  assert.deepEqual(failures, [], 'reference problems in the shipped surface');
  assert.ok(ok);
});

test('every plugin-root path the crew names is a file this package actually ships', () => {
  const found = pluginRootPaths(ROOT);
  assert.ok(found.length > 0, 'no plugin-root path is referenced anywhere');
  for (const { file, target } of found) {
    // A JSON string's escaped closing quote is not part of the path: on POSIX `x.js\` is another file.
    assert.doesNotMatch(target, /\\/, `${file} names ${target}, a path with a backslash in it`);
    assert.ok(fs.existsSync(path.join(ROOT, target)), `${file} points at ${target}, which does not exist`);
  }
  assert.ok(
    found.some(({ file }) => file === 'agents/pilot.md'),
    'the pilot must reach its rules through the plugin root',
  );
});

/**
 * A tree with one instance of every way a file can work here and nowhere else, plus a
 * clean file that has to survive the sweep.
 *
 * The two tests above run the checker over a tree that is correct by construction, so
 * they can only ever watch it pass — and a checker that has never been seen to fail is
 * not evidence about the surface, it is a green tick. This is the other half: the
 * failure path, with the exact line of every planted fault known in advance.
 *
 * The forbidden addresses are spelled out here rather than assembled from pieces the way
 * `scripts.test.mjs` does, because `SURFACE` is `agents`, `skills`, `rules`, `commands`,
 * `hooks` and `.mcp.json` — `scripts/` is in none of them, so nothing scans this file and
 * these strings are fixture data rather than a reference.
 */
function plantedFaults(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-references-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'agents'));

  const write = (rel, lines) => fs.writeFileSync(path.join(root, rel), lines.join('\n'), 'utf8');

  write('agents/upstream.md', [
    '---',
    'name: upstream',
    '---',
    '',
    'Review the diff with ecc:code-review before committing.',
    '',
    'Write the failing test first, the way mattpocock-skills:tdd puts it.',
  ]);

  write('agents/machine.md', [
    '---',
    'name: machine',
    '---',
    '',
    'The orchestration rule is at C:\\Users\\Someone\\.claude\\rules\\orchestration.md.',
    '',
    'On the other machine it is at /home/someone/.claude/rules/orchestration.md.',
    '',
    'Which plugin is installed is in ~/.claude/plugins/installed_plugins.json.',
  ]);

  write('agents/dangling.md', [
    '---',
    'name: dangling',
    '---',
    '',
    'Read ${CLAUDE_PLUGIN_ROOT}/skills/not-shipped/SKILL.md before you start.',
  ]);

  write('agents/clean.md', [
    '---',
    'name: clean',
    '---',
    '',
    'Read ${CLAUDE_PLUGIN_ROOT}/agents/clean.md, which is this file.',
    '',
    'The rule for a language is ${CLAUDE_PLUGIN_ROOT}/rules/<name>.md, whichever applies.',
  ]);

  return root;
}

test('the checker names every planted fault, with its file and its line', (t) => {
  const root = plantedFaults(t);

  const { ok, failures, checked, references } = checkReferences(root, ['agents']);

  assert.equal(ok, false, 'a tree with five forbidden patterns in it is not a clean tree');
  assert.deepEqual(failures, [
    'agents/machine.md:5: "C:\\\\Users\\\\S" names one machine\'s home directory; use ${CLAUDE_PLUGIN_ROOT}',
    'agents/machine.md:7: "/home/s" names one machine\'s home directory; use ${CLAUDE_PLUGIN_ROOT}',
    'agents/machine.md:9: "installed_plugins.json" reads the harness\'s private plugin registry at runtime; use ${CLAUDE_PLUGIN_ROOT}',
    'agents/upstream.md:5: "ecc:" addresses a plugin this package does not ship; use the pilot: name it vendored to',
    'agents/upstream.md:7: "mattpocock-skills:" addresses a plugin this package does not ship; use the skills/ copy it vendored to',
    'agents/dangling.md:5: ${CLAUDE_PLUGIN_ROOT}/skills/not-shipped/SKILL.md is not a file this package ships',
  ]);

  assert.deepEqual(
    checked,
    ['agents/clean.md', 'agents/dangling.md', 'agents/machine.md', 'agents/upstream.md'],
    'every file in the tree is read, including the clean one',
  );
  assert.equal(references, 2, 'the resolvable path and the dangling one; the placeholder is not one');
  assert.ok(
    !failures.some((failure) => failure.startsWith('agents/clean.md')),
    'a resolvable path and a placeholder are both fine, and neither may be reported',
  );
});

test('run as a command, the checker says what is wrong and exits non-zero', (t) => {
  const root = plantedFaults(t);
  const script = path.join(ROOT, 'scripts', 'check-references.mjs');

  let status = 0;
  let stderr = '';
  let stdout = '';
  try {
    stdout = execFileSync(process.execPath, [script, 'agents'], { cwd: root, encoding: 'utf8' });
  } catch (err) {
    status = err.status;
    stdout = err.stdout;
    stderr = err.stderr;
  }

  assert.equal(status, 1, 'a surface with dead references must fail the gate that checks it');
  assert.match(stdout, /4 file\(s\) checked; 2 plugin-root reference\(s\) resolved\./);
  assert.match(stderr, /^FAIL agents\/machine\.md:5: /m);
  assert.match(stderr, /6 reference problem\(s\) in agents$/m);
});

/**
 * crew-voice-rules S11 (spec 11, 12; L14): a rules file is copied into a fresh install's
 * `~/.claude/rules/`, where there is no CLAUDE.md, no `rules/common/` and only the skills
 * this package ships. A re-sync from upstream brings those references back, so each
 * kind is planted beside lines of the same shape that do resolve, and only the dead
 * one may be named.
 */
function plantedRules(t, line) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-rules-references-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (rel, lines) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), lines.join('\n'), 'utf8');
  };

  write('skills/tdd-workflow/SKILL.md', ['---', 'name: tdd-workflow', '---']);
  write('rules/typescript/coding-style.md', ['# TypeScript coding style']);
  write('rules/react/hooks.md', ['# React hooks']);
  write('rules/react/coding-style.md', [
    '# React coding style',
    '',
    '> This file extends [typescript/coding-style.md](../typescript/coding-style.md).',
    'See [hooks.md](./hooks.md#rules) and [the guide](https://react.dev/learn/thinking-in-react.md).',
    'Each language has its own [file](../<name>/coding-style.md).',
    'See skill: `tdd-workflow` for the loop; the skill is skills/tdd-workflow/SKILL.md.',
    line,
  ]);
  return root;
}

test('a planted CLAUDE.md reference in a rules file goes red', (t) => {
  const root = plantedRules(t, 'Follow the project CLAUDE.md before this file.');
  const { ok, failures } = checkReferences(root, ['rules']);
  assert.equal(ok, false);
  assert.deepEqual(failures, [
    'rules/react/coding-style.md:7: "CLAUDE.md" defers to a CLAUDE.md a fresh install does not have',
  ]);
});

test('a planted dead relative link goes red', (t) => {
  const root = plantedRules(t, '> This file extends [common/coding-style.md](../common/coding-style.md).');
  const { ok, failures } = checkReferences(root, ['rules']);
  assert.equal(ok, false);
  assert.deepEqual(failures, [
    'rules/react/coding-style.md:7: ../common/coding-style.md does not resolve beside this file',
  ]);
});

test('a dead relative link with a title, in angle brackets or as a reference definition goes red', (t) => {
  const root = plantedRules(t, [
    'See [style](../common/style.md "the common style").',
    'See [hooks](<../common/hooks.md>) and [real](<./hooks.md>).',
    '[testing]: ../common/testing.md',
  ].join('\n'));
  const { failures } = checkReferences(root, ['rules']);
  assert.deepEqual(failures, [
    'rules/react/coding-style.md:7: ../common/style.md does not resolve beside this file',
    'rules/react/coding-style.md:8: ../common/hooks.md does not resolve beside this file',
    'rules/react/coding-style.md:9: ../common/testing.md does not resolve beside this file',
  ]);
});

test('a planted unshipped skill: goes red', (t) => {
  const root = plantedRules(
    t,
    'See skill: `react-patterns`; ECC skills: `tdd-workflow`, `frontend-patterns`; skills/api-design/SKILL.md.',
  );
  const { ok, failures } = checkReferences(root, ['rules']);
  assert.equal(ok, false);
  assert.deepEqual(failures, [
    'rules/react/coding-style.md:7: skill `react-patterns` is not one skills/ ships',
    'rules/react/coding-style.md:7: skill `api-design` is not one skills/ ships',
    'rules/react/coding-style.md:7: skill `frontend-patterns` is not one skills/ ships',
  ]);
});

test('a bare skill name, a skills: list without ECC and a singular ECC skill: go red', (t) => {
  const root = plantedRules(t, ['See skill: nope', 'Skills: `tdd-workflow`, `gone`', 'ECC skill: `lost`'].join('\n'));
  assert.deepEqual(checkReferences(root, ['rules']).failures, [
    'rules/react/coding-style.md:7: skill `nope` is not one skills/ ships',
    'rules/react/coding-style.md:9: skill `lost` is not one skills/ ships',
    'rules/react/coding-style.md:8: skill `gone` is not one skills/ ships',
  ]);
});

test('a dead link with a #fragment goes red, and an absolute path is not checked', (t) => {
  const root = plantedRules(t, 'See [a](../common/a.md#top) and [b](/abs/none.md).');
  assert.deepEqual(checkReferences(root, ['rules']).failures, [
    'rules/react/coding-style.md:7: ../common/a.md does not resolve beside this file',
  ]);
});

test('the real tree is green', () => {
  const { ok, failures, checked } = checkReferences(ROOT, ['rules']);
  assert.ok(checked.length > 100, 'every rules file is read');
  assert.ok(ok, failures.join('\n'));
});

test('step 9 merges only onto the pilot branch; the default branch is the user\'s to merge', () => {
  // Spec line 13 said merging was out of scope, with a standing rule to opt in. pilot-branch
  // L15 and L23 (ADR 0083) replace it: the pilot lands on `pilot` and never merges the
  // default branch, so no standing rule is offered; the merge order is the closing report's.
  // gate2-lands L7 (ADR 0111): the deck lands on the Sign off press, so the pilot makes no merge.
  const skill = read('agents/pilot.md');
  const gate2Section = /### 9\. Gate 2 and ready\n([\s\S]*?)(?=\n## |$)/.exec(skill);
  assert.ok(gate2Section, 'step 9, "Gate 2 and ready", must exist');
  const text = gate2Section[1].replace(/\s+/g, ' ');

  assert.match(text, /the deck lands it/);
  assert.doesNotMatch(text, /standing rule/, 'no standing rule lets the pilot merge the default branch');
});

/** The flattened text of pilot-qa.md § The procedure. */
function qaProcedure() {
  const section = sectionOf(read('agents/pilot-qa.md'), 'The procedure');
  assert.ok(section, 'the "The procedure" section must exist');
  return flat(section);
}

test("QA's steps are where → what good looks like, one line", () => {
  // walkthrough-taste spec 1 (replaces spec line 14's `do this → correct result`): the
  // walkthrough holds only what a human judges by eye. The user's earlier words still
  // hold: "dot points, unlabelled", and "truly you can verify that one on your own."
  const text = qaProcedure();
  assert.match(text, /`where (→|->) what good looks like`/, 'the steps are written `where → what good looks like`');
  assert.doesNotMatch(text, /do this[^\n]*(→|->)[^\n]*correct result/, 'the old `do this → correct result` form is gone');
  assert.match(text, /one line/, 'each step is one line');
  assert.match(text, /no numbering or label/i, 'the steps carry no numbering or label');
  assert.match(text, /left running, already in the state to look at/, 'url is the environment QA left running (spec 2)');
  assert.match(
    text,
    /never write a step asking[^.]*verify[^.]*already\s+checked/i,
    'no step asks the user to verify what the agent already checked',
  );
});

test('no cap is stated: the walkthrough is a few pushes, not a script', () => {
  // walkthrough-taste spec 4, L6. The user: "i dont want a hard cap really … generalised
  // pushes in the right direction on where to look. what i do is click through all the
  // buttons i can and see if it feels good."
  const text = qaProcedure();
  assert.doesNotMatch(text, /forty|\b\d+ steps\b|up to \w+ steps/i, 'no step count is stated');
  assert.match(text, /a few pushes on where to look and what to click through/, 'a few pushes toward where to look');
  assert.match(text, /judge how it feels/, 'the user judges feel');
  assert.match(text, /not a script/, 'never a script');
});

test('QA posts the checks table to the PR before the walkthrough', () => {
  // short-by-default spec 3, L4: the table moved out of the walkthrough body into the one QA comment,
  // posted before the walkthrough (it replaces walkthrough-taste A2's "the table is the body" pin).
  const text = qaProcedure();
  const comment = text.indexOf('`gh pr comment <pr>`');
  assert.notEqual(comment, -1, 'QA posts its comment with `gh pr comment <pr>`');
  assert.ok(comment < text.indexOf('deck_post'), 'the QA comment comes before the walkthrough deck_post');
  assert.match(text, /\(spec line \| result \| evidence\)/, 'the comment carries the checks table');
  assert.match(text, /one step at the closest observable thing/, 'no-surface shape');
  assert.match(text, /Never a command, script or env line in a step/, 'no step runs a command (spec 2)');
});

test('the walkthrough body is a summary naming the QA comment', () => {
  // short-by-default spec 3: at most S1's MAX_WALKTHROUGH_BODY_LINES non-blank lines, four parts.
  const text = qaProcedure();
  assert.match(text, new RegExp(`at most ${MAX_WALKTHROUGH_BODY_LINES} non-blank lines`), 'the deck cap is named');
  assert.match(text, /what was built, the tip, one line on anything left as is, and the QA comment's link/, 'the four body parts, in order');
});

test('sign-off edits the one QA comment by the id recorded when it was posted', () => {
  // short-by-default L4, amended: `--edit-last` edits the account's last comment, which may be the user's own.
  assert.match(qaProcedure(), /record its id from the URL `gh pr comment` prints/, 'QA records the comment id when it posts');
  const signOff = flat(sectionOf(read('agents/pilot-qa.md'), 'When the user signs off'));
  assert.match(signOff, /`gh api -X PATCH repos\/\{owner\}\/\{repo\}\/issues\/comments\/<id> -F body=@<file>`/, 'step 3 edits the QA comment by id');
  assert.match(signOff, /migrations[^.]*fixes[^.]*seed data[^.]*prerequisites[^.]*never a credential's value/, 'the sign-off items join it, no credential among them');
  assert.doesNotMatch(read('agents/pilot-qa.md'), /--edit-last/, "never the account's last comment");
});

test('the walkthrough body carries no deployment notes', () => {
  // walkthrough-taste spec 10: env vars, flags, apply order and migrations to eyeball stay
  // in QA's PR comment, not the walkthrough body.
  const text = qaProcedure();
  assert.doesNotMatch(text, /environment variables|apply-order|flags|eyeball/i);
});

test('no pilot prompt or tool list names deck_launch or headless, and the explorer may answer on a thread (L10)', () => {
  // The daemon starts no session (ADR 0039), so no agent is granted a tool that
  // would start one and no pilot prompt tells it about a session nobody watches.
  for (const name of CREW) {
    assert.doesNotMatch(agentSource(name), /deck_launch|headless/i, `agents/${name}.md`);
  }
  assert.doesNotMatch(read('agents/pilot.md'), /deck_launch|headless/i, 'agents/pilot.md');
  const explorer = agentSource('pilot-explorer');
  assert.match(fieldOf(explorer, 'tools'), /mcp__plugin_pilot_deck__deck_reply/, 'the explorer answers a question where it was asked');
  assert.doesNotMatch(fieldOf(explorer, 'tools'), /deck_(post|wait|resolve|read)/, 'and holds no thread');
});

test("the explorer's thread reply is the answer alone; paths and evidence go to main", () => {
  // short-by-default spec 2 (QA F1): `## Voice` is the pinned copy of the answer's shape.
  const reply = flat(agentSource('pilot-explorer')).match(/The one write:[^]*?Never resolve it\./)?.[0] ?? '';
  assert.match(reply, /`mcp__plugin_pilot_deck__deck_reply` \(the answer\)/, 'the reply is the answer, its shape left to Voice');
  assert.match(reply, /no paths or evidence/, 'the reply carries no paths or evidence');
});

test('the teacher owns its lesson thread: it posts, waits on and closes that one, and reads no other', () => {
  // Small ticket itm_9aaece4a409c, ADR 0053. The teaching moved out of the pilot's
  // thread into a `lesson` the teacher posts and owns, so the teacher now holds the
  // three tools an owner needs. Its wait hears only threads it owns (ADR 0041), so
  // it swallows nothing meant for the pilot; it still has no `deck_read`.
  // crew-waits L12: it waits through `pilot wait` in Bash, so `deck_wait` left the list.
  const teacher = agentSource('pilot-teacher');
  const tools = fieldOf(teacher, 'tools')
    .split(',')
    .map((entry) => entry.trim());

  assert.deepEqual(
    tools,
    [
      'Read', 'Grep', 'Glob', 'Bash', 'SendMessage',
      'mcp__plugin_pilot_deck__deck_post', 'mcp__plugin_pilot_deck__deck_reply',
      'mcp__plugin_pilot_deck__deck_resolve',
    ],
    'read the repository, post, hold and close its lesson, report to main: nothing that reads the deck',
  );
  assert.match(teacher, /kind `lesson`/, 'the teacher posts a lesson');
  assert.match(teacher, /never resolve[^.]*thread you teach/i, 'and never closes the thread it teaches');
  assert.match(teacher, /deck_resolve[^.]*lesson|lesson[^.]*deck_resolve/i, 'it concludes the lesson itself');
  assert.match(teacher, /trial/i, "a question's options come back as a trial, never the decision");
  // Spec 7: the report carries what the lesson showed about the user, and the teacher may ask main.
  assert.match(teacher, /`extracted`/, 'the report names an extracted section');
  assert.match(teacher, /extracted[^.]*(understands|conceptuali[sz]ation)/i, "it is the user's own understanding");
  assert.match(teacher, /only what (would )?changes? (a|the) decision/i, 'and only what changes a decision');
  assert.match(teacher, /ask `main`[^.]*(question|SendMessage)|SendMessage[^.]*question[^.]*`main`/i, 'it may ask the pilot while live');
  assert.equal(fieldOf(teacher, 'model'), 'sonnet', 'a lesson from a brief is not Opus work');
  assert.match(fieldOf(teacher, 'skills'), /teaching-a-decision/, 'the teacher preloads the skill that shapes the lesson');
  // Spec 11, L14: the teacher now teaches by asking, so the old pin that it never
  // asks a question back is replaced by the loop's own rules, not deleted.
  // Independence S4 deleted the definition's copy of the loop, a restatement of the
  // skill it preloads, so the loop's pins read the two together as the agent does.
  const body = [teacher, read('skills/teaching-a-decision/SKILL.md')].join(' ').replace(/\s+/g, ' ');
  assert.doesNotMatch(body, /never ask[^.]*question back/i, 'the teacher asks now; the old ban would contradict the loop');
  assert.doesNotMatch(body, /one reply, at most a screen/i, 'the lesson is no longer one screen in one reply');
  assert.match(body, /first reply is one diagnostic question/i, 'it opens by gauging the user, never with the lesson');
  assert.match(body, /one step/i, 'one step per reply');
  assert.match(body, /never answer[^.]*own question/i, 'and never answers its own question in the same reply');
  assert.match(body, /explain[- ]back/i, 'the steps end in an explain-back of the decision');
  assert.match(body, /only (the part|what) (they|the user) missed/i, 're-explaining only the missed part');
  assert.match(body, /what is decided[^.]*main alternative[^.]*why the default/i, '"you have it" is a criterion on the explain-back');
  assert.match(body, /worked step/i, 'and a worked step is the fallback');
  assert.match(body, /just tell me[^.]*two stalls|two stalls[^.]*just tell me/i, 'on "just tell me" or two stalls');
  assert.match(body, /`teaching: live`/, 'the report ends teaching: live while the loop runs');
  assert.match(body, /`teaching: done`/, 'and teaching: done when the explain-back holds');
});

/** The numbered rules under a file's "The six rules" heading, one string per rule. */
const sixRules = (source) => {
  const section = /## The six rules[^\n]*\n([\s\S]*?)(?=\n## )/.exec(source);
  assert.ok(section, 'the file must carry the six rules under their own heading');
  return section[1]
    .split(/\n(?=\d\. )/)
    .filter((chunk) => /^\d\. /.test(chunk))
    .map((chunk) => chunk.replace(/\s+/g, ' '));
};

test('each of the teacher\'s six rules names its source, and a secondary one says so (L14)', () => {
  // Spec 11. A rule borrowed from the literature without its source is a rule
  // nobody can check, and one cited from a page the author never opened is worse.
  // Independence S4: the six rules live in the skill alone; the teacher preloads it,
  // and its definition's copy was a restatement.
  assert.doesNotMatch(read('agents/pilot-teacher.md'), /## The six rules/, 'the teacher restates its skill again');
  for (const rel of ['skills/teaching-a-decision/SKILL.md']) {
    const rules = sixRules(read(rel));
    assert.equal(rules.length, 6, `${rel} carries L14's six rules`);
    const authors = [/Ausubel/, /VanLehn/, /Roediger (&|and) Karpicke/, /Chi\b/, /Bloom/, /Graesser/];
    rules.forEach((rule, index) => {
      assert.match(rule, authors[index], `${rel} rule ${index + 1} cites its author`);
      // Outside the URL: a DOI such as 10.1111/j.1467-9280.2006 carries a year of its own.
      const prose = rule.replace(/https:\/\/\S+/g, '');
      assert.match(prose, /\b(19|20)\d\d\b/, `${rel} rule ${index + 1} cites the year`);
      assert.match(rule, /https:\/\/\S+/, `${rel} rule ${index + 1} cites a URL`);
    });
    assert.match(rules[0], /secondary/i, 'Ausubel 1968 was not opened, so rule 1 labels it secondary');
    assert.match(rules[3], /teach-back/i, 'rule 4 is the teach-back');
    assert.match(rules[5], /Khanmigo/, 'rule 6 carries the Khanmigo abandonment');
  }
});

test('the pilot hands a "Teach me" reply to the teacher, and a follow-up on that thread to the same one', () => {
  // Spec 17, D23. Two halves that have to agree: the string the button posts,
  // which is `deck/items.mjs`'s to define, and the rule that reads it, which is
  // the pilot's. Asserting the second against the first is what stops a rename
  // of one from silently teaching nothing.
  const pilot = agentSource('pilot');

  const rule = /- \*\*The teaching\.\*\*([\s\S]*?)(?=\n- \*\*|\n## )/.exec(pilot);
  assert.ok(rule, 'the hand-off rule must sit with the other things that are the pilot\'s own');
  const text = rule[1].replace(/\s+/g, ' ');

  assert.ok(text.includes(`\`${TEACH_ME}\``), `the rule must quote the reply the button posts, which is ${TEACH_ME}`);
  assert.match(text, /pilot:pilot-teacher/, 'and name the agent it hands off to');

  // Independence S4: the brief and the follow-up were restated here and in step 6 of
  // the skill; step 6 keeps them (its resume rule is pinned by the next test but one),
  // and the crew table went as a restatement of the Agent tool's own list.
  const step = /### 6\. [^\n]*\n([\s\S]*?)(?=\n## )/.exec(read('agents/pilot.md'))[1].replace(/\s+/g, ' ');
  assert.match(step, /thread/, 'briefed with the thread');
  assert.match(step, /artefact/, 'the artefact section behind the decision');
  assert.match(step, /ADR/, 'and the ADR');
});

test('the pilot writes a question short, and the detail is behind "Teach me" (spec 18)', () => {
  // Independence S4 moved this from agents/pilot.md to step 3 of the skill, where the
  // questions are posted, and dropped "a screen at most": deck_post now refuses a
  // question body over 1,200 characters (L7), and pilot-rules.test.mjs pins its absence.
  const section = /### 3\. Grilling, with the user\n([\s\S]*?)(?=\n## )/.exec(read('agents/pilot.md'));
  assert.ok(section, 'step 3 must exist');
  const text = section[1].replace(/\s+/g, ' ');

  assert.match(text, /the decision in a sentence/, 'the rule names what a question body opens with');
  assert.match(text, /recommended default/, 'and the recommended default');
  assert.match(text, /trade-?off|trades away/, 'and what taking the default trades away');
  assert.match(text, /evidence/, 'and the evidence that prompted it');
  assert.match(text, /`Teach me`/, 'and where the detail goes instead');
});

test('step 6 of the pilot workflow relays a "Teach me" reply to the teacher', () => {
  const step = /### 6\. Questions while the crew works, with the user\n([\s\S]*?)(?=\n## )/.exec(
    read('agents/pilot.md'),
  );
  assert.ok(step, 'step 6 must exist');
  const text = step[1].replace(/\s+/g, ' ');

  assert.ok(text.includes(`\`${TEACH_ME}\``), 'the step must name the reply that triggers the relay');
  assert.match(text, /pilot-teacher/, 'and the agent the pilot spawns for it');
  assert.match(text, /`lesson`/, 'the teaching runs in a lesson thread');
  assert.match(
    text,
    /own turn never writes|own context/i,
    "and that the lesson is not written in the pilot's own turn, which is the whole point of the hand-off",
  );
  assert.match(text, /relay no typed reply/i, "the lesson is the teacher's thread: the pilot relays nothing on it");
  assert.match(text, /option press on the (original|source) (question|thread)[^.]*is (still )?the decision/i, 'the decision stays on the original');
  assert.match(text, /`teaching: done`/, "the teacher's report still ends teaching: done");
  assert.match(text, /`extracted`[^.]*(artefact|run record)/i, 'the pilot records the extraction');
});

test('the teaching skill is an ask, one reply per attempt, then done, and credits the /teach whose principles it borrows', () => {
  // D24. The skill is this project's own text, so the header is attribution
  // rather than a re-sync anchor — but it is written in the vendoring format all
  // the same, because that is the one shape `check-provenance.mjs` reads and a
  // credit nothing checks is a credit that rots.
  const rel = 'skills/teaching-a-decision/SKILL.md';
  assert.ok(fs.existsSync(path.join(ROOT, rel)), `${rel} is missing`);
  const source = read(rel);
  const frontmatter = leadingFrontmatter(source);

  assert.ok(frontmatter, 'the skill needs frontmatter to be invocable');
  assert.match(frontmatter, /^name: teaching-a-decision$/m, 'addressable as the teacher preloads it');
  assert.match(frontmatter, /^description: \S/m, 'a skill with no description is never loaded');
  assert.match(frontmatter, /origin: hazzard/, 'the text is this project\'s own');
  assert.ok(
    source.indexOf('<!-- provenance') > source.length - bodyOf(source).length - 1,
    'the header follows the frontmatter, or the harness sees no frontmatter at all',
  );

  const header = /<!-- provenance\n([\s\S]*?)-->/.exec(source);
  assert.ok(header, 'the borrowed principles are credited in a provenance header');
  assert.match(header[1], /^upstream: mattpocock-skills \S+ - skills\/productivity\/teach\/SKILL\.md$/m);
  assert.match(header[1], /^copyright: Copyright \(c\) 2026 Matt Pocock$/m);
  assert.match(header[1], /^licence: MIT - see THIRD-PARTY-NOTICES\.md$/m);
  assert.match(header[1], /^adapted: principles borrowed, text original/m, 'the header says it is not a copy');
  assert.match(header[1], /^ledger: vendor\/methodology\.md$/m);
  assert.ok(
    read('vendor/methodology.md').includes(`\`${rel}\``),
    'and the ledger carries its row, which is the other half check-provenance.mjs reads',
  );

  const body = source.slice(source.indexOf('-->')).replace(/\s+/g, ' ');
  assert.doesNotMatch(body, /one reply, at most a screen/i, 'the one-screen lesson is gone (spec 11)');
  assert.match(body, /first reply is one diagnostic question/i, 'an ask first, never the lesson');
  assert.match(body, /one reply per attempt/i, 'then one reply per attempt');
  assert.match(body, /never both a lesson and a question/i, 'and a reply is never both a lesson and a question');
  assert.match(body, /`teaching: done`/, 'then done');
  assert.match(body, /mission/i, 'why this decision matters to this run is still a step');
  assert.match(body, /alternatives/i, 'the alternatives and what each costs');
  assert.match(body, /would change the answer/, 'and what evidence would change the answer');
  assert.match(body, /docs\/design/, 'citing the artefact section by path');
  assert.match(body, /docs\/adr/, 'and the ADR');
  assert.match(body, /never answer[^.]*own question/i, 'and it never answers its own question in the same reply');
  assert.match(body, /`deck_resolve`|never resolve/i, 'and never closing the thread');
  assert.match(body, /answer (they|the user) can now give/, 'ending with the answer the user can now give');
});

test('the pilot asks how deep to grill once per run, and recommends a depth from the draft spec (D25)', () => {
  // D25, spec 18. Two rules lower the bar and neither ever asks how much the user
  // wants to see: step 3's "if the architect's assumed default is the one the user
  // would pick, do not ask" and their own standing "ask only when no assumption is
  // safe". The run that wrote this put six items on the deck against twenty-one
  // locked decisions, so the depth is asked rather than inferred. A flat
  // "recommend *forks*" default was itself replaced: schema, auth, money, a public
  // API and irreversible data are exactly the decisions too expensive to re-open
  // once slices stand on them, so the recommendation reads the draft spec instead.
  const step = /### 1\. Problem and spec, with the user\n([\s\S]*?)(?=\n### )/.exec(
    read('agents/pilot.md'),
  );
  assert.ok(step, 'step 1 must exist');
  const text = step[1].replace(/\s+/g, ' ');

  assert.match(text, /how deep/i, 'step 1 never asks how deep the grilling goes');
  assert.match(text, /`question`/, 'and the ask is a deck item like everything else the user is asked');
  assert.match(text, /three options/, 'three depths: every, forks, and No grilling');
  assert.match(text, /\*every\*/, 'the first: every locked decision reaches the user');
  assert.match(text, /\*forks\*/, 'the second: only the decisions whose paths fork');
  assert.match(text, /materially different/, 'which is what makes a decision a fork');
  assert.match(text, /\*No grilling\*/, 'the third: straight from the agreed spec to Gate 1');
  assert.doesNotMatch(text, /Recommend[^.]*No grilling/, 'the user picks No grilling; the pilot never recommends it (A1)');
  assert.match(text, /\*No grilling\*[^.]*no design question[^.]*step 3/, 'No grilling skips step 3, its standing question with it (L10)');
  assert.match(text, /\*assumed\*/, "and the architect's stashes stand assumed");
  assert.match(text, /`gate1` (is )?next/, 'and the gate1 is the next item');
  assert.match(text, /draft spec/i, 'the recommendation is read from the draft spec, not a flat default');
  assert.match(text, /schema|migrations/i, 'schema or migration work recommends *every*');
  assert.match(text, /auth/i, 'auth work recommends *every*');
  assert.match(text, /money/i, 'money work recommends *every*');
  assert.match(text, /public API/i, 'a public API recommends *every*');
  assert.match(text, /irreversible/i, 'irreversible data recommends *every*');
  assert.match(text, /\*forks\* otherwise/, 'and *forks* is the recommendation everywhere else');
  assert.match(text, /locked decisions/, "and the answer is recorded in the artefact's locked decisions");
  assert.match(text, /standing question/, 'it is standing, asked on every run');
  assert.match(text, /what environment/, "and it points at step 3's rather than restating the pattern");
});

test('at the *every* depth Gate 1 walks the locked decisions one at a time before the gate1 (D25)', () => {
  // D25. A signoff on the whole artefact is one item however many decisions it
  // holds, which is exactly how twenty-one of them reached the user as one
  // question. At *every* the walk is the grilling the run did not do.
  const step = /### 3\. Grilling, with the user\n([\s\S]*?)(?=\n## )/.exec(read('agents/pilot.md'));
  assert.ok(step, 'step 3 must exist');
  const gate1 = step[1].indexOf('**Gate 1**');
  assert.ok(gate1 > -1, 'step 3 must carry the Gate 1 paragraph');
  const text = step[1].slice(gate1).replace(/\s+/g, ' ');

  // Each depth named in the same sentence as its consequence, so a paragraph
  // that swapped the two over would fail rather than still carry both words.
  assert.match(text, /\*every\*[^.]*is a walk/, '*every* is not the depth that turns Gate 1 into a walk');
  assert.match(text, /\*forks\*[^.]*no walk/, 'and *forks* is not the depth that leaves Gate 1 alone');
  assert.match(text, /one `question` item per locked decision/, 'the walk is not one item per locked decision');
  assert.match(text, /trades away/, 'a walked item carries what its default trades away');
  assert.match(text, /rejected/, 'and the path that was rejected');
  assert.ok(text.includes(TEACH_ME), `and ${TEACH_ME}, which is what makes a walked decision answerable`);
  assert.match(text, /before the `gate1`/, 'the gate1 on the whole artefact comes after the walk, not instead of it');
});

test('vertical-execution.md defines Gate 1 and Gate 2 in one section, with no exception to either', () => {
  // S7 (spec 17, 20): the two gates are defined once, in rules/vertical-execution.md's
  // "The two human gates" section. ticket-states S11 (spec 10) retired the small ticket, the
  // one exception to Gate 1 that section used to state, so every ticket has both gates.
  const execution = read('rules/vertical-execution.md');
  const gates = /## The two human gates\n([\s\S]*?)(?=\n## |$)/.exec(execution);
  assert.ok(gates, '"The two human gates" section must exist');
  const text = gates[1].replace(/\s+/g, ' ');

  assert.match(text, /\*\*Gate 1\*\* is before implementation/, 'Gate 1 is still defined here');
  assert.match(text, /\*\*Gate 2\*\* is before the feature PR/, 'Gate 2 is still defined here');
  assert.match(text, /every ticket has one/, 'Gate 2 applies to every ticket');
  assert.doesNotMatch(execution, /small ticket|has no Gate 1|stands in for it/i, 'no ticket skips Gate 1 (spec 10)');
});

test('orchestration.md and agents/pilot.md name no exception to Gate 1', () => {
  const orchestration = read('rules/orchestration.md').replace(/\s+/g, ' ');
  const pilot = read('agents/pilot.md');

  assert.match(
    orchestration,
    /Gate 1 is signed off before you write the brief, since the brief \*is\* the approved plan/,
    'orchestration.md clears Gate 1 before every brief',
  );
  assert.doesNotMatch(orchestration, /small ticket|except for/i, 'orchestration.md names no exception (spec 10)');

  const step = /### 3\. Grilling, with the user\n([\s\S]*?)(?=\n## )/.exec(pilot);
  assert.ok(step, 'step 3 must exist');
  const gate1 = step[1].indexOf('**Gate 1**');
  assert.ok(gate1 > -1, 'step 3 must still carry the Gate 1 paragraph');
  assert.doesNotMatch(step[1].slice(gate1), /small ticket|stands in for it/i, 'agents/pilot.md names no exception');
});

test("the pilot's own file points at the steps that carry the gates and the grilling (D25)", () => {
  // Independence S4 deleted this file's copy of the grilling depth, a restatement of
  // steps 1 and 3 of the skill, which the two tests above pin. What stays here is that
  // the gates are the pilot's own and where they are defined.
  const pilot = agentSource('pilot');

  const gates = /- \*\*The gates\*\*([\s\S]*?)(?=\n- \*\*|\n## )/.exec(pilot);
  assert.ok(gates, 'the gates must sit with the other things that are the pilot\'s own');
  assert.match(gates[1], /steps 3 and 9/, 'the gates bullet never says where the gates are defined');

  const row = pilot.split('\n').find((line) => line.startsWith('| `grilling` |'));
  assert.ok(row, 'the methodology table must carry the grilling row');
  assert.match(row, /[Ss]teps 1 and 3/, 'the row never says the grilling runs at steps 1 and 3');
});

test("the vendored `grilling` skill keeps its own adaptation and takes none of S13's (D25)", () => {
  // D25's prohibition, and the same reasoning as the one-question-at-a-time
  // override before it: an adaptation this header does not record is one a
  // re-sync against a newer upstream drops without saying so.
  // Two things are pinned and no more: the `adapted:` line verbatim, and the
  // absence of S13's vocabulary anywhere in the file. A typo fix elsewhere in it
  // would pass here; that the blob is byte-identical to the feature tip is checked
  // at the slice's gate, where a ref to compare against exists, not by a test.
  const source = read('skills/grilling/SKILL.md');
  const header = /<!-- provenance\n([\s\S]*?)-->/.exec(source);
  assert.ok(header, 'the vendored skill carries a provenance header');

  const adapted = /^adapted: (.*)$/m.exec(header[1]);
  assert.ok(adapted, 'the header records what was adapted');
  assert.equal(
    adapted[1],
    'the frontier goes to the deck as an item per question instead of a numbered round (ADR 0004) — independent questions together, one at a time only where one answer would change another question — waited on, argued with and closed on the deck\'s own tools; one decision per item, split bundles, short by default, probe harder, pushback as its own paragraph, and a default resting on outside practice, an API or a rule researched before it goes up, with one `Research:` line (research-first L8)',
    'the deck, the research rule (research-first S1) and the question\'s voice (crew-voice-rules S4) are the only adaptations of this skill',
  );

  for (const word of ['depth', 'forks', 'locked decision']) {
    assert.ok(
      !source.toLowerCase().includes(word),
      `the depth override belongs in the pilot's files, not the vendored skill; found "${word}"`,
    );
  }
});

test('QA loads `diagnosing-bugs` on demand, not at spawn (independence L8)', () => {
  // Most QA runs fix nothing, so a preloaded diagnosis loop is paid for and never read.
  const qa = agentSource('pilot-qa');
  assert.doesNotMatch(fieldOf(qa, 'skills'), /diagnosing-bugs/, 'pilot-qa still preloads diagnosing-bugs');
  assert.match(qa, /Skill tool[^.]*`pilot:diagnosing-bugs`/, 'the Fixes section never says to load it when a bug needs diagnosing');
});

// --- debug-workflow S1 (spec 1, 2; L6, L7, L11): the crew's bug path ---

test('the implementer loads diagnosing-bugs on demand', () => {
  // The implementer writes every fix, so it loads the bug path on a fix brief and on a
  // `regression`; most slices fix no bug, so a preload would be paid and never read (L6).
  const implementer = agentSource('pilot-implementer');
  assert.doesNotMatch(fieldOf(implementer, 'skills'), /diagnosing-bugs/, 'L6: pilot-implementer preloads diagnosing-bugs');
  for (const heading of ['A fix brief', 'The loop']) {
    assert.match(
      flat(sectionOf(implementer, heading)),
      /Skill tool[^.]*`pilot:diagnosing-bugs`/,
      `spec 1: "${heading}" never says to load diagnosing-bugs with the Skill tool`,
    );
  }
});

test("the co-pilot's fix brief names the bug path", () => {
  const steps = flat(sectionOf(agentSource('pilot-co-pilot'), 'Steps 4 to 8'));
  const sentence = steps.split(/(?<=\.) /).find((s) => /diagnosing-bugs/.test(s));
  assert.ok(sentence, 'L7: "Steps 4 to 8" never names diagnosing-bugs');
  assert.match(sentence, /fix brief/, 'L7: the sentence naming diagnosing-bugs is not about the fix brief');
});

test('the bug path is recorded and the skill exists', () => {
  // The landing numbers the NNNN placeholder and refreshes the index (adr-allocate), so on the
  // feature branch the ADR exists unnumbered and `adr-index --check` holds the README.
  const front = leadingFrontmatter(read('docs/adr/NNNN-debug-workflow.md'));
  assert.match(front, /^status: proposed$/m, 'spec 2: the ADR is proposed until it lands');
  const paths = /^paths: \[(.*)\]$/m.exec(front);
  assert.ok(paths, 'spec 2: the ADR names its paths');
  for (const file of ['agents/pilot-implementer.md', 'agents/pilot-co-pilot.md']) {
    assert.ok(paths[1].split(', ').includes(file), `spec 2: the ADR's paths omit ${file}`);
  }
  assert.ok(fs.existsSync(path.join(ROOT, 'skills/diagnosing-bugs/SKILL.md')), 'the bug path names a skill that is not vendored');
});

/** The report-shape section each crew reporter carries; pilot-explorer's lives under a differently named heading. */
const DEFAULT_REPORT_SECTION = /## Report\n([\s\S]*?)(?=\n## )/;
const REPORT_SECTION = {
  'pilot-architect': DEFAULT_REPORT_SECTION,
  'pilot-implementer': DEFAULT_REPORT_SECTION,
  'pilot-qa': DEFAULT_REPORT_SECTION,
  'pilot-fundamentalist': DEFAULT_REPORT_SECTION,
  'pilot-explorer': /## Answering\n([\s\S]*?)(?=\n## )/,
};

test('every crew report shape names friction, and the closing report names the ranked section (spec 23)', () => {
  // Agent efficiency in the target repo is part of the product's philosophy: a crew
  // agent that pays a repo's bad tooling in time or tokens is expected to say so, not
  // just push through it. The pilot collects those rows and the closing report is
  // where the user sees them ranked. The teacher is not a crew reporter and is skipped.
  for (const [name, pattern] of Object.entries(REPORT_SECTION)) {
    const source = agentSource(name);
    const match = pattern.exec(source);
    assert.ok(match, `agents/${name}.md must still carry its report-shape section`);
    assert.match(match[1], /friction/i, `agents/${name}.md's report shape never names friction`);
  }

  const ending = /## Ending a run\n([\s\S]*?)$/.exec(read('agents/pilot.md'));
  assert.ok(ending, 'agents/pilot.md must still carry "Ending a run"');
  assert.match(ending[1], /friction/i, 'the closing report never names the friction rows it collected');
  assert.match(
    ending[1],
    /make agents cheaper here/i,
    'the closing report never ends with the ranked "make agents cheaper here" section',
  );
});

test("the README states agent efficiency is one of the product's principles (spec 23)", () => {
  const principles = read('README.md').split(/^## Principles\s*$/m)[1]?.split(/^## /m)[0] ?? '';
  const third = /^3\. .*(?:\n(?!\d+\. ).+)*/m.exec(principles)?.[0] ?? '';
  assert.match(third, /tokens and attention/i,
    'README never makes spending tokens and attention on purpose a principle (readme-pitch: principle 3)');
  assert.match(third, /every agent reports its friction/i, 'README never names friction as the mechanism');
});

test('ADR 0036 records friction as collected-and-reported, scoped to the target repo, with no separate audit pass', () => {
  const adrPath = path.join(ROOT, 'docs', 'adr', '0036-friction-is-collected-and-reported-never-auto-fixed.md');
  assert.ok(fs.existsSync(adrPath), 'ADR 0036 must exist in the form of 0012-0015');
  const adr = fs.readFileSync(adrPath, 'utf8').replace(/\r\n/g, '\n');

  assert.match(adr, /\*\*Consequences\*\*:/, 'closes with the Consequences line the format uses');
  assert.doesNotMatch(adr, /^#{2,}\s/m, 'no sections beyond the title and the Consequences line');

  assert.match(adr, /make agents cheaper here/i, 'records the ranked closing section by name');
  assert.match(adr, /node_modules/, 'records the false-failure example');
  assert.match(adr, /usage\.test\.mjs|clock-dependent/, 'records the clock-dependent flake example');
  assert.match(adr, /typecheck|lint script/, 'records the missing typecheck/lint script example');
  assert.match(adr, /react\//i, 'records the path-scoped rules example');
  assert.match(adr, /target repo/i, 'scopes friction to the target repo, not the pilot itself');
  assert.match(adr, /no separate audit pass|nothing changes automatically/i, 'records that nothing auto-applies');
});

// run-chaining S4 (spec 6, 8, 10): agreed work is stored as a ticket on the deck, never
// unasked, and the closing report is a `report` item, so it lands under Closing reports.
test('the pilot stores agreed work as a ticket', () => {
  const pilot = agentSource('pilot');
  assert.match(pilot, /`deck_post` of kind `ticket`/, 'agreed new work is not posted as a ticket');
  assert.match(pilot, /kind `ticket`[^.]*body[^.]*thread id/, "the ticket's body never names the thread it was agreed on");
});

test('the pilot never stores unasked', () => {
  const pilot = agentSource('pilot');
  assert.match(pilot, /user's words/, 'a ticket may be stored without the user agreeing to it');
  assert.match(pilot, /a default you took is no yes/i, 'an assumed default reads as agreement to store a ticket');
});

// handoff-closed-on-pickup spec 4: a proposal missed as a chat reply on a closing thread.
test('a proposal is an item of its own', () => {
  const inbox = /## The deck is the only inbox\n([\s\S]*?)(?=\n## )/.exec(agentSource('pilot'));
  assert.ok(inbox, 'the inbox section must exist');
  const clause = /[^.]*proposal is a `question` of its own[^.]*\./.exec(inbox[1].replace(/\s+/g, ' '));
  assert.ok(clause, 'the thread clause says a ticket proposal is a question of its own');
  assert.match(clause[0], /Yes \/ Change[^.]*naming its thread/, 'with Yes / Change, naming the thread it came from');
  assert.match(clause[0], /never a chat reply/, 'and never as a chat reply');
  assert.match(clause[0], /never on a thread closed or closing that turn/, 'and never on a thread closed or closing that turn');
});

// ticket-states spec 15 (B1): full auto is replaced by the modes, and no agent names it.
test('no agent names full auto', () => {
  for (const name of fs.readdirSync(path.join(ROOT, 'agents')).filter((file) => file.endsWith('.md'))) {
    assert.doesNotMatch(read(`agents/${name}`).replace(/\s+/g, ' '), /full[ -]?auto/i, `agents/${name} still names full auto`);
  }
});

test('the closing report is a report', () => {
  const ending = /## Ending a run\n([\s\S]*?)$/.exec(read('agents/pilot.md'));
  assert.ok(ending, 'agents/pilot.md must still carry "Ending a run"');
  assert.match(ending[1], /closing report is a `report` item/, 'the closing report is not a report item');
  assert.doesNotMatch(ending[1], /`walkthrough`/, 'the closing report is still a walkthrough item');
});

// gate-no-stall S3 (spec 1, L6) made `pilot land` the only ready press; one-integration-line
// (spec 3) removed it: the feature PR targets pilot and the landing merges it.
test('step 9 runs no gh pr ready', () => {
  const step9 = /\*\*Gate 2\*\* is the user signing off[\s\S]*?(?=\n## |\n### )/.exec(read('agents/pilot.md'));
  assert.ok(step9, 'agents/pilot.md must carry the Gate 2 paragraph');
  const text = step9[0].replace(/\s+/g, ' ');
  assert.doesNotMatch(text, /gh pr ready/, 'step 9 still tells the pilot to run the ready press');
  assert.doesNotMatch(text, /`pr ready failed`/, 'step 9 still names the removed ready step');
});

// clean-landing S10 (spec 7, L5, L10): the landing removes the run's worktrees, the feature's
// included, so the close prunes nothing after the PR merges; it relays what the landing kept.
test('the close no longer prunes after the PR merges', () => {
  const ending = /## Ending a run\n([\s\S]*?)$/.exec(read('agents/pilot.md'));
  assert.ok(ending, 'agents/pilot.md must still carry "Ending a run"');
  const text = ending[1].replace(/\s+/g, ' ');
  assert.doesNotMatch(text, /once the feature PR merges|`pilot worktrees prune`/i, 'the close still prunes worktrees itself');
  assert.doesNotMatch(text, /`feat\/<slug>` stays/, 'the feature worktree still stays while its PR is open (L10)');
  assert.match(text, /landing[^.]*\bkept\b[^.]*\bstate\b/i, 'the close never relays each worktree the landing kept, with its state');
});

// S10 (spec 19, L13): a fundamentalist finding whose fix would exceed the
// small-diff limit no longer defaults to a question for the user — it is
// built as an added slice, but only within its rails. Scoped to step 7's own
// section (the pattern used above for steps 3 and 6) so the six rails must
// actually sit together in this one rule, not merely appear somewhere in the
// ~10k-token file.
function step7() {
  const section = /### 7\. Feature-level principles review and fix round, once, AFK\n([\s\S]*?)(?=\n### 8\.)/.exec(agentSource('pilot'));
  assert.ok(section, 'step 7 must exist');
  return section[1].replace(/\s+/g, ' ');
}

test('a fix over the small-diff limit becomes an added slice only within its rails', () => {
  const step = step7();
  assert.match(
    step,
    /whose fix would exceed the small-diff limit becomes an added slice within its rails/,
    'the small-diff-limit finding becomes an added slice, not a question, by default',
  );
  assert.match(step, /its own PR and reviewer/, 'rail: its own PR and reviewer');
  // bigger-jobs S2 (L3): no count and no agreed-spec-line rail; the slice brings its own line.
  assert.match(step, /its own spec line, marked added/, 'rail: its own spec line, marked added');
  assert.match(step, /moves no locked decision/, 'rail: moves no locked decision');
  assert.match(step, /within the per-slice diff limit/, 'rail: within the per-slice diff limit');
  assert.match(step, /recorded in the status table as added/, 'rail: recorded in the status table as added');
  assert.match(step, /the Gate 2 walkthrough names it as built/, 'rail: the Gate 2 walkthrough names it as built');
});

test('a fix that would move a locked decision is still asked', () => {
  const step = step7();
  assert.match(
    step,
    /Only one that would move a locked decision stays a question for the user/,
    'the locked-decision rail is the one that still makes a question (bigger-jobs L3)',
  );
});

test("QA's walkthrough covers every spec line in a step or a table row and names each added slice as built", () => {
  // walkthrough-taste spec 1, 3, 4 (signed at Gate 1) replaced "every spec line covered by at least one step":
  // a look for taste is never exhaustive, so a machine-checked line is covered by its table row.
  const qa = agentSource('pilot-qa');
  assert.match(
    qa,
    /every spec line in a step or a table row, and each added\s+slice named as built, without asking/,
    "the walkthrough names each added slice as built, without asking",
  );
});

// --- thread-kinds S11: the record is the save state from step 1 (spec 22, 24) ---

test('pilot.md sends deck_status with next at step 1 and with every row move', () => {
  const skill = read('agents/pilot.md');
  const step1 = /### 1\. Problem and spec, with the user\n([\s\S]*?)(?=\n### 2\.)/.exec(skill)[1].replace(/\s+/g, ' ');
  assert.ok(
    step1.split(/(?<=\.) /).some((s) => /first `deck_status`/.test(s) && /`slug`/.test(s) && /`feature`/.test(s)
      && /`next` naming the open items and the design branch/.test(s) && /before the architect is spawned/.test(s)),
    'step 1 sends the first deck_status, with slug, feature and next, before the architect is spawned',
  );
  const artefact = /### The artefact is the state\n([\s\S]*?)(?=\n### |\n## )/.exec(skill)[1].replace(/\s+/g, ' ');
  assert.match(artefact, /every `deck_status` that moves a row carries the current `next`/i, 'next is the save state (spec 24)');
  const step5 = /### 5\. Integrate the slice, AFK\n([\s\S]*?)(?=\n### )/.exec(skill)[1].replace(/\s+/g, ' ');
  assert.match(step5, /`deck_status` with `slug`, the current `next` and the slice's row/, "step 5's row move carries next");
});

// clear-waits-co-pilot S2 (spec 2, 4, 6; L8, L12, A1): the deck knows the co-pilot before it exists.
test('pilot.md tells the deck before spawning a co-pilot and releases a paused one', () => {
  const yellow = /## Yellow\n([\s\S]*?)(?=\n## )/.exec(read('agents/pilot.md'))[1].replace(/\s+/g, ' ');
  assert.match(yellow, /With no live co-pilot of yours, `deck_ticket co-pilot` the implementing head; unrefused, spawn `pilot-co-pilot`:/, 'spec 2, A1');
  assert.match(yellow, /`release` a stopped or `paused` one\./, 'L8, L12');
  assert.doesNotMatch(read('agents/pilot.md'), /says whether the\s+sub-deck is starting/, 'the stale gate1 sentence paid for it');
});

test("pilot.md names both lanes' states and both SWITCH protocols", () => {
  const yellow = /## Yellow\n([\s\S]*?)(?=\n## )/.exec(read('agents/pilot.md'))[1].replace(/\s+/g, ' ');
  assert.match(yellow, /Of the three lanes, `planning` and `concluding` are yours and `co-pilot` the co-pilot's; each is `held`, `queued`, `empty` or `switching`\./, '§4; three-lanes S10');
  assert.match(yellow, /never an implementing ticket; the deck refuses a second per stage\./, 'spec 6; three-lanes S10 (spec 1)');
  assert.match(yellow, /Mid-switch, no other take or co-pilot call\./, 'spec 9');
  assert.match(yellow, /`SWITCH <from> -> <to>`: stash the work in hand, then `deck_ticket take <to>`\./, 'L14');
  assert.match(yellow, /`SWITCH co-pilot`: send the co-pilot the pause; on its `paused` hand-back \(at once from `none`\), `deck_ticket co-pilot <to>` and spawn `<to>`'s co-pilot\./, 'L18, L23');
  assert.match(yellow, /`SWITCH cancelled`: carry on\./, 'spec 13, 18');
});

test('pilot.md answers a recovered notice as a hand-off, with no thread to reply on', () => {
  const section = /## When your own context fills\n([\s\S]*?)(?=\n## )/.exec(read('agents/pilot.md'))[1].replace(/\s+/g, ' ');
  assert.match(section, /A recovered notice[^.]*answered as a hand-off is[^.]*no thread to reply on/);
});

// --- co-pilot-reports S1 (spec 1, 2, 4, 5; L1, L2, L5, A4): the crew reports to its spawner ---

/** One `## <heading>` section of an agent file, on one line. */
const agentSection = (name, heading) => {
  const match = new RegExp(`\\n## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`).exec(agentSource(name));
  assert.ok(match, `agents/${name}.md has no "## ${heading}" section`);
  return match[1].replace(/\s+/g, ' ');
};

test('the co-pilot greets each child so the child can address it', () => {
  const steps = agentSection('pilot-co-pilot', 'Steps 4 to 8');
  const hello = steps.split(/(?<=\.) /).find((s) => /the hello/.test(s));
  assert.ok(hello, 'L1: "Steps 4 to 8" never names the hello');
  assert.match(hello, /[Rr]ight after each `Agent\(\.\.\.\)` spawn/, 'spec 2: right after the spawn');
  assert.match(hello, /`SendMessage` the child's agentId/, 'L1: sent to the child by its agentId');
  assert.match(steps, /`co-pilot of <ticket>: send me what your definition sends main`/, 'A4: the hello text');
  assert.match(steps, /Every brief you write opens `co-pilot of <ticket>` \(the ticket id, never an agent id\)/, 'L1: the brief names the co-pilot, as the children expect');
});

test('the co-pilot sends main only four things', () => {
  const source = agentSource('pilot-co-pilot');
  assert.doesNotMatch(source, /## Questions go to main/, 'the section is renamed');
  assert.doesNotMatch(source.replace(/\s+/g, ' '), /Your crew sends its own questions to `main`/, 'spec 1: the crew reports to the co-pilot now');
  const toMain = agentSection('pilot-co-pilot', 'What goes to main');
  assert.match(toMain, /four things and nothing else/, 'spec 4: only four');
  assert.match(toMain, /a question for the user/, 'spec 4: 1');
  assert.match(toMain, /a seam change that moves a spec line or a locked decision/, 'spec 4: 2');
  assert.match(toMain, /a crew hand-off you cannot resolve/, 'spec 4: 3');
  assert.match(toMain, /your hand-back table/, 'spec 4: 4');
  assert.match(toMain, /record it as \*assumed\*/, 'spec 4: the rest is decided and recorded');
});

test("a seam change inside the rails is the co-pilot's", () => {
  const steps = agentSection('pilot-co-pilot', 'Steps 4 to 8');
  assert.match(
    steps,
    /A seam change inside the rails[^.]*is yours: record it in the owning slice file on `feat\/<slug>`/,
    'spec 5: the co-pilot records it where the pilot would',
  );
});

test('an implementer addresses its spawner', () => {
  const addressee = addresseeRule('pilot-implementer').replace(/\s+/g, ' ');
  assert.match(
    addressee,
    /the agent that spawned you: the `from` of the co-pilot's hello when a co-pilot spawned you, `main` when no co-pilot did/,
    'spec 1: the addressee is the spawner',
  );
});

test('an implementer waits for the hello, never falls back to main', () => {
  const addressee = addresseeRule('pilot-implementer').replace(/\s+/g, ' ');
  assert.match(
    addressee,
    /When a co-pilot spawned you, nothing goes out before its hello arrives, and you never fall back to `main`/,
    'L2: only a co-pilot\'s child waits for the hello, and it never falls back to main',
  );
});

// --- co-pilot-reports S2 (spec 1, 3; L2, L3): QA and the fundamentalist report to their spawner too ---

/** The paragraph of an agent file that defines its addressee, on one line. */
const addresseeRule = (name) => {
  const match = /\n\nYour addressee is the agent that spawned you([\s\S]*?)\n\n/.exec(agentSource(name));
  assert.ok(match, `agents/${name}.md never defines its addressee`);
  return match[0].trim();
};

/** QA's switch back to `main` once the co-pilot has handed back (L3). */
const QA_HAND_BACK =
  /Once your walkthrough-posted report has gone to the co-pilot, your addressee is `main`: the co-pilot has handed back, and a message to it would resume it\./;

test('QA addresses its spawner until the walkthrough report, then main', () => {
  const flat = (text) => text.replace(/\s+/g, ' ');
  assert.equal(flat(addresseeRule('pilot-qa')), flat(addresseeRule('pilot-implementer')), "spec 1: S1's addressee rule, worded as the implementer's");
  const procedure = agentSection('pilot-qa', 'The procedure');
  assert.match(procedure, QA_HAND_BACK, 'L3: after the walkthrough-posted report, QA addresses main');
  assert.match(procedure, /Spawned by the co-pilot, report to it once it is posted and stop\./, 'spec 1: the walkthrough-posted report goes to the co-pilot');
});

test('the fundamentalist reports to its spawner', () => {
  const flat = (text) => text.replace(/\s+/g, ' ');
  assert.equal(flat(addresseeRule('pilot-fundamentalist')), flat(addresseeRule('pilot-implementer')), "spec 1: S1's addressee rule, worded as the implementer's");
  const report = agentSection('pilot-fundamentalist', 'Report');
  assert.doesNotMatch(report, /One message to `main`/, 'spec 1: the verdict goes to the spawner');
  assert.match(report, /One message to your addressee, under about sixty-five lines/, 'spec 1: the verdict goes to the spawner');
});

test('no crew definition sends to a bare main', () => {
  for (const name of ['pilot-implementer', 'pilot-qa', 'pilot-fundamentalist']) {
    const flat = agentSource(name).replace(addresseeRule(name), '').replace(/\s+/g, ' ');
    const rest = name === 'pilot-qa' ? flat.replace(QA_HAND_BACK, '') : flat;
    assert.doesNotMatch(rest, /\bmain\b/, `spec 1: every \`main\` in agents/${name}.md sits inside the addressee sentence`);
  }
});

// --- co-pilot-reports S3 (spec 7, 8; L9, A2): a pushback row in every crew report, one PR-title format ---

test('every crew report carries a pushback row and no crew agent posts its own question', () => {
  for (const name of ['pilot-implementer', 'pilot-qa', 'pilot-fundamentalist']) {
    assert.match(
      agentSection(name, 'Report'),
      /\*\*pushback on the brief\*\*: what you would have decided differently, and the consequence/,
      `spec 7: agents/${name}.md's report carries no pushback row`,
    );
  }
  for (const name of ['pilot-implementer', 'pilot-fundamentalist']) {
    assert.doesNotMatch(fieldOf(agentSource(name), 'tools'), /deck_post/, `spec 7: agents/${name}.md can post on the deck`);
  }
  const kinds = [...agentSource('pilot-qa').matchAll(/deck_post`[^.]*?`kind: "(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(kinds, ['walkthrough'], 'spec 7: QA posts its walkthrough and nothing else, so its pushback goes to its addressee');
});

test('the pilot names the three PR-title formats', () => {
  const pilot = read('agents/pilot.md');
  const step4 = /\n### 4\. Implement per slice[^\n]*\n([\s\S]*?)(?=\n### )/.exec(pilot);
  assert.ok(step4, 'agents/pilot.md has no step 4');
  assert.match(step4[1].replace(/\s+/g, ' '), /the PR title, `feat\(<slug>\): S<n> <title>`/, "spec 8: step 4's brief carries the slice title in its format");
  // three-lanes S9 (spec 9): the architect writes brief.md now.
  const brief = read('agents/pilot-architect.md').split(/\n\s*\n/).find((p) => p.startsWith('Once §6 is settled, write `docs/design/<slug>/brief.md`'));
  assert.ok(brief, "agents/pilot-architect.md never says what brief.md's headings are");
  const flat = brief.replace(/\s+/g, ' ');
  for (const format of ['`feat(<slug>): S<n> <title>` for a slice, the title lower-case first', '`fix(<slug>): <what>` for a fix round', '`feat(<slug>): <feature>` for the feature PR']) {
    assert.ok(flat.includes(format), `spec 8: brief.md's headings never carry ${format}`);
  }
});

// design-docs-only S3: the architect's re-anchor rule. The tests pin the command names and the
// never-clause, not the sentence.
const architectWhereYouWork = () => flat(sectionOf(read('agents/pilot-architect.md'), 'Where you work'));

test('the architect re-anchors by rebase', () => {
  assert.match(architectWhereYouWork(), /git rebase <remote>\/pilot/);
});

test('the architect never replays pilot onto its branch', () => {
  assert.match(architectWhereYouWork(), /never (?:merge|cherry-pick|replay)[^.]*(?:merge|cherry-pick|replay)[^.]*(?:merge|cherry-pick|replay)/i);
});

test("the architect's check is git cherry", () => {
  const text = architectWhereYouWork();
  assert.match(text, /git cherry <remote>\/pilot/);
  assert.match(text, /only `\+`/);
});

test('the fact sheet ships on Haiku with read-only tools', () => {
  // cheaper-crew S1 (spec 1, L10): the implementer's first-read sweep on the cheapest model,
  // with no Bash and no web, so a machine read never sits beside a fetch.
  const source = read('agents/pilot-fact-sheet.md');
  assert.equal(fieldOf(source, 'name'), 'pilot-fact-sheet');
  assert.equal(fieldOf(source, 'model'), 'haiku');
  const tools = fieldOf(source, 'tools').split(',').map((tool) => tool.trim()).sort();
  assert.deepEqual(tools, ['Glob', 'Grep', 'Read'], 'Read, Grep and Glob only');
});

test("the co-pilot's list can reach the fact sheet", () => {
  // cheaper-crew S1 (spec 5): an orchestrator's Agent(...) list binds every agent below it,
  // the co-pilot's on yellow included, so a child missing from it is unreachable there. The
  // pilot's list is "the pilot may spawn every agent its crew names".
  assert.ok(spawnableTypes('pilot-co-pilot').includes('pilot:pilot-fact-sheet'), "the co-pilot's list names it");
});

test('the implementer spawns the sheet first and treats it as a lead', () => {
  // cheaper-crew S1 (spec 1, 4; L5, L9): the sheet lands in the context that uses it, on a
  // slice brief only, and a path:line on it is read again before any edit stands on it.
  const loop = agentSection('pilot-implementer', 'The loop');
  const spawn = loop.indexOf('pilot:pilot-fact-sheet');
  assert.ok(spawn >= 0, '"The loop" names pilot:pilot-fact-sheet');
  const gate = loop.indexOf('The phase gate');
  assert.ok(gate >= 0, '"The loop" still names the phase gate');
  assert.ok(spawn < gate, 'before the phase gate');
  assert.match(loop, /never a fix brief/, 'L9: slice briefs only');
  assert.match(loop, /before your first `Read`/, 'spawned before the first Read');
  assert.match(loop, /\blead\b/, 'the sheet is a lead');
  assert.match(loop, /read (?:a|its) `path:line` yourself before (?:you )?edit/, 'and a path:line is read before an edit');
  assert.match(loop, /Children are Sonnet[^.]*Haiku/, 'the Haiku exception is named');
});

/** cheaper-crew S2 (L3): the stacks the runner's table carries a column for, and its six checks. */
const RUNNER_STACKS = ['Node', 'Python', 'Go', 'Rust', 'JVM', '.NET', 'PHP'];
const RUNNER_CHECKS = ['Diff coverage', 'Diff mutation', 'Complexity', 'Duplication', 'Dead code', 'Dependency shape'];

/** The runner's command table: its header cells and each check row's cells. */
function runnerTable() {
  const lines = agentSource('pilot-evidence-runner').split('\n');
  const start = lines.findIndex((line) => line.startsWith('| Check |'));
  assert.ok(start >= 0, 'agents/pilot-evidence-runner.md has no "| Check |" table');
  const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
  const rows = [];
  for (let i = start + 2; i < lines.length && lines[i].startsWith('|'); i += 1) rows.push(cells(lines[i]));
  return { header: cells(lines[start]), rows };
}

test('the runner ships on Haiku and never writes', () => {
  // cheaper-crew S2 (spec 2, L3): the fundamentalist's six tool runs on the cheapest model,
  // with a shell to run them and nothing that edits a file or reaches the network.
  const source = read('agents/pilot-evidence-runner.md');
  assert.equal(fieldOf(source, 'name'), 'pilot-evidence-runner');
  assert.equal(fieldOf(source, 'model'), 'haiku');
  const tools = fieldOf(source, 'tools').split(',').map((tool) => tool.trim()).sort();
  assert.deepEqual(tools, ['Bash', 'Glob', 'PowerShell', 'Read'], 'Bash, PowerShell, Read and Glob only');
});

test('the fundamentalist spawns the runner and runs no tool itself', () => {
  // cheaper-crew S2 (spec 2, 4, 5; A4): the runner starts first, its rows are read after the
  // test pass, a failed runner is "not run", and no fallback puts the tools back in Opus.
  const evidence = agentSection('pilot-fundamentalist', 'The evidence pass[^\n]*');
  assert.match(evidence, /pilot:pilot-evidence-runner/, 'the evidence pass names the runner');
  assert.match(evidence, /before the subtraction pass/, 'spawned before the subtraction pass');
  assert.match(evidence, /"not run"/, 'a failed runner is reported as not run');
  assert.doesNotMatch(evidence, /stryker|jscpd|knip|madge|diff-cover|lizard/i, 'no tool table left to run');
  assert.match(evidence, /You run none of those checks yourself/, 'the fundamentalist runs none of them');
  assert.match(evidence, /never running the tools in its place/, 'and has no fallback');
  const scope = agentSection('pilot-fundamentalist', 'Scope discipline');
  assert.doesNotMatch(scope, /do not spawn agents/);
  assert.match(scope, /one child, `pilot:pilot-evidence-runner`, once, and no other/, 'Scope discipline allows that one child');
  assert.ok(spawnableTypes('pilot-co-pilot').includes('pilot:pilot-evidence-runner'), "the co-pilot's list names it");
});

test('the runner names six checks per stack and runs nothing outside the table', () => {
  // cheaper-crew S2 (L3 as amended on itm_16a6e9ba75e4): one command per check per stack,
  // each with its cwd and a scratch HOME and USERPROFILE, and mutation never on the four
  // modules that decide where state lives.
  const { header, rows } = runnerTable();
  assert.deepEqual(header, ['Check', ...RUNNER_STACKS], 'a column per stack');
  assert.deepEqual(rows.map((row) => row[0]), RUNNER_CHECKS, 'six check rows');
  for (const row of rows) {
    assert.equal(row.length, RUNNER_STACKS.length + 1, `${row[0]} has a cell per stack`);
    row.slice(1).forEach((cell, i) => {
      if (!cell) return;
      const where = `${row[0]} on ${RUNNER_STACKS[i]}`;
      assert.match(cell, /^`\$W` · `HOME=\$S USERPROFILE=\$S PILOT_DECK_DIR=\$S\/deck` · `[^`]+`$/, `${where} names its cwd, env and command`);
      if (row[0] === 'Diff mutation') assert.match(cell, /\$\{?MUTATE\b/, `${where} mutates only $MUTATE`);
    });
  }
  const node = RUNNER_STACKS.indexOf('Node') + 1;
  const nodeTools = [/c8 .*diff-cover/, /stryker/, /eslint .*complexity/, /jscpd/, /knip/, /madge/];
  rows.forEach((row, i) => assert.match(row[node], nodeTools[i], `the Node ${row[0]} cell runs its tool`));
  const never = agentSection('pilot-evidence-runner', 'Never mutate[^\\n]*');
  for (const module of ['store', 'client', 'daemon', 'server']) {
    assert.match(never, new RegExp(`deck/${module}\\.mjs`), `$MUTATE drops deck/${module}.mjs`);
  }
  const text = flat(agentSource('pilot-evidence-runner'));
  assert.match(text, /nothing outside this table/i, 'the table is the whole command surface');
});

test('the rule budgets the fundamentalist one child', () => {
  // cheaper-crew S2 (spec 4): the budget follows the helper.
  const rule = flat(read('rules/orchestration.md'));
  assert.doesNotMatch(rule, /a fundamentalist none/);
  assert.match(rule, /a fundamentalist one, its evidence runner/);
});
