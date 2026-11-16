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

test('the pilot asks through the deck and has no dialog to fall back on', () => {
  const pilot = agentSource('pilot');
  // lint: forbidden pattern
  assert.doesNotMatch(pilot, /AskUserQuestion/, 'the deck is the only inbox (ADR 0004)');
  assert.match(fieldOf(pilot, 'tools'), /mcp__plugin_pilot_deck__/, 'the pilot must hold the deck tools');
});

// user-threads-open L5: the user closes a thread they opened; the pilot only answers it.
test('pilot.md never says "until you deck_resolve it"', () => {
  // lint: forbidden pattern
  assert.doesNotMatch(agentSource('pilot'), /until you `deck_resolve` it/);
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

test('nothing the crew loads reaches for a user dialog instead of the deck', () => {
  const surfaces = [
    ...CREW.map((name) => `agents/${name}.md`),
    'agents/pilot.md',
    'skills/vertical-slicing/SKILL.md',
    'rules/orchestration.md',
    'rules/vertical-execution.md',
  ];
  for (const rel of surfaces) {
    // lint: forbidden pattern
    assert.doesNotMatch(read(rel), /AskUserQuestion/, `${rel} still asks the user through a dialog`);
  }
});

test('no pilot prose posts a gate as a signoff item', () => {
  // lint: forbidden pattern (thread-kinds S5)
  assert.doesNotMatch(read('agents/pilot.md').replace(/\s+/g, ' '), /kind `signoff` with/, 'no gate is a signoff item');
});

test('no swept file says a gate is "the user saying"', () => {
  // merge-first S5 (spec 6, §3 F6): typed words never pass a gate, so no swept line says they do.
  const rot = /user saying|sa(?:ys?|id) (?:they are|I am) satisfied|are you satisfied|on the user's word|pass neither on the user's|When the user is satisfied/i;
  for (const file of ['agents/pilot.md', 'agents/pilot-qa.md', 'CLAUDE.excerpt.md', 'CONTEXT.md', 'rules/vertical-execution.md', 'rules/orchestration.md']) {
    // lint: forbidden pattern
    assert.doesNotMatch(read(file).replace(/\s+/g, ' '), rot, file);
  }
});

test("pilot-qa.md's procedure carries no gate", () => {
  const procedure = /## The procedure\n([\s\S]*?)(?=\n## )/.exec(read('agents/pilot-qa.md'));
  // lint: the section exists, and the retired gate tag is absent
  assert.ok(procedure, 'agents/pilot-qa.md must carry its procedure section');
  assert.doesNotMatch(procedure[1].replace(/\s+/g, ' '), /`gate:/, 'the walkthrough carries no gate tag');
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
    // lint: forbidden pattern
    assert.ok(!/gate: ?"[12]"/.test(read(rel)), `${rel} still sends the retired gate tag`);
  }
});

test('the pilot\'s artefact section no longer mirrors delivers', () => {
  const artefact = /### The artefact is the state\n([\s\S]*?)(?=\n### |$)/.exec(read('agents/pilot.md'));
  // lint: the section exists, and a forbidden field is absent (slice-graph A2)
  assert.ok(artefact, 'agents/pilot.md must carry its artefact section');
  assert.doesNotMatch(artefact[1], /`delivers`/, 'slice-graph A2: the pilot no longer mirrors delivers');
});

test('the loop files keep their headings and carry no retired step', () => {
  const skill = read('agents/pilot.md');
  const fundamentalist = agentSource('pilot-fundamentalist');
  const qa = agentSource('pilot-qa');
  const implementer = agentSource('pilot-implementer');

  // lint: heading exists
  assert.match(skill, /### 1\. Problem and spec, with the user/, 'step 1 builds the spec with the user');
  assert.match(fundamentalist, /## The subtraction pass/, 'subtraction is a pass of its own, before the principles');
  assert.match(implementer, /## A fix brief/, 'the implementer is the fixer, given a fix brief');
  // lint: forbidden patterns
  assert.doesNotMatch(skill, /QA per slice/i, 'QA is no longer a per-slice step');
  assert.doesNotMatch(skill, /gh pr ready/, 'the pilot runs no ready press of its own');
  assert.doesNotMatch(qa, /gh pr ready <n>/, 'the QA agent no longer flips a slice PR');
  assert.doesNotMatch(fundamentalist, /QA agent,? (who|to) fix/i, 'the fundamentalist no longer routes findings to the QA agent');
  assert.doesNotMatch(qa, /fundamentalist's (blocking )?findings/, 'the QA agent no longer carries the fundamentalist\'s findings');
});

// pilot-develop-line S4 (spec 3; A3, A8): a slice reaches `feat/<slug>` as a pushed branch `pilot integrate`
// merges, never as a PR, so no agent file may still describe one.
const sliceAgents = () => fs.readdirSync(path.join(ROOT, 'agents')).filter((name) => name.endsWith('.md')).map((name) => [name, read(`agents/${name}`)]);

test('the implementer opens no PR', () => {
  const implementer = read('agents/pilot-implementer.md');
  // lint: the section exists under its current heading and the old one is gone
  assert.match(implementer, /^## Commit, push, report$/m, 'the section is named for what it does now');
  assert.doesNotMatch(implementer, /^## Commit, push, draft PR$/m);
  // lint: forbidden command
  assert.equal(implementer.match(/gh pr create/g)?.length ?? 0, 0, 'the implementer runs no gh pr create');
  for (const [name, text] of sliceAgents()) {
    assert.doesNotMatch(text, /slice\s+PR\b|draft\s+PR\s+#/,`${name} still describes a slice PR`);
  }
});

test('no pilot prose reads the security verdict from a slice PR body', () => {
  // lint: forbidden pattern
  assert.doesNotMatch(read('agents/pilot.md'), /slice PR body/i, 'the security verdict is read from the report, not a PR body');
});

test('the fundamentalist carries no copy of the runner\'s mutation-safety rule', () => {
  // lint: the rule lives with the agent that mutates, and only there (cheaper-crew S2, L7)
  assert.doesNotMatch(agentSource('pilot-fundamentalist'), /store\.mjs/, 'no second copy in the fundamentalist');
});

test('the inheritance finding is written down where it is acted on', () => {
  // The rule used to say the Agent(...) list bound the main session alone. It does
  // not, and a crew that believes it will keep shipping unreachable reviewers.
  const orchestration = read('rules/orchestration.md');
  // lint: forbidden pattern
  assert.doesNotMatch(
    orchestration,
    /restricts only an agent running as the main session/,
    'the inherited-restriction finding contradicts this sentence; it must go',
  );
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

  // lint: the section exists, and a forbidden pattern is absent
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
  // lint: forbidden pattern
  assert.doesNotMatch(text, /do this[^\n]*(→|->)[^\n]*correct result/, 'the old `do this → correct result` form is gone');
});

test('no cap is stated: the walkthrough is a few pushes, not a script', () => {
  // walkthrough-taste spec 4, L6. The user: "i dont want a hard cap really … generalised
  // pushes in the right direction on where to look. what i do is click through all the
  // buttons i can and see if it feels good."
  const text = qaProcedure();
  // lint: forbidden pattern
  assert.doesNotMatch(text, /forty|\b\d+ steps\b|up to \w+ steps/i, 'no step count is stated');
});

test('sign-off edits the one QA comment by the id recorded when it was posted', () => {
  // short-by-default L4, amended: `--edit-last` edits the account's last comment, which may be the user's own.
  // lint: forbidden pattern
  assert.doesNotMatch(read('agents/pilot-qa.md'), /--edit-last/, "never the account's last comment");
});

test('the walkthrough body carries no deployment notes', () => {
  // walkthrough-taste spec 10: env vars, flags, apply order and migrations to eyeball stay
  // in QA's PR comment, not the walkthrough body.
  const text = qaProcedure();
  // lint: forbidden pattern
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
  assert.equal(fieldOf(teacher, 'model'), 'sonnet', 'a lesson from a brief is not Opus work');
  assert.match(fieldOf(teacher, 'skills'), /teaching-a-decision/, 'the teacher preloads the skill that shapes the lesson');
  const body = [teacher, read('skills/teaching-a-decision/SKILL.md')].join(' ').replace(/\s+/g, ' ');
  // lint: forbidden patterns
  assert.doesNotMatch(body, /never ask[^.]*question back/i, 'the teacher asks now; the old ban would contradict the loop');
  assert.doesNotMatch(body, /one reply, at most a screen/i, 'the lesson is no longer one screen in one reply');
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

test('the skill carries the six rules and the teacher keeps no copy (L14)', () => {
  // Spec 11. A rule borrowed from the literature without its source is a rule
  // nobody can check, and one cited from a page the author never opened is worse.
  // Independence S4: the six rules live in the skill alone; the teacher preloads it,
  // and its definition's copy was a restatement.
  // lint: the definition carries no copy of the rules; the skill's rules section holds six
  assert.doesNotMatch(read('agents/pilot-teacher.md'), /## The six rules/, 'the teacher restates its skill again');
  const rules = sixRules(read('skills/teaching-a-decision/SKILL.md'));
  assert.equal(rules.length, 6, "the skill carries L14's six rules");
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

  // lint: the prose quotes the constant the deck's button posts
  assert.ok(text.includes(`\`${TEACH_ME}\``), `the rule must quote the reply the button posts, which is ${TEACH_ME}`);
});

test('step 6 of the pilot workflow relays a "Teach me" reply to the teacher', () => {
  const step = /### 6\. Questions while the crew works, with the user\n([\s\S]*?)(?=\n## )/.exec(
    read('agents/pilot.md'),
  );
  assert.ok(step, 'step 6 must exist');
  const text = step[1].replace(/\s+/g, ' ');

  // lint: the prose quotes the constant the deck's button posts
  assert.ok(text.includes(`\`${TEACH_ME}\``), 'the step must name the reply that triggers the relay');
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
  assert.match(header[1], /^adapted: \S/m, 'the header records what was adapted');
  assert.match(header[1], /^ledger: vendor\/methodology\.md$/m);
  assert.ok(
    read('vendor/methodology.md').includes(`\`${rel}\``),
    'and the ledger carries its row, which is the other half check-provenance.mjs reads',
  );

  const body = source.slice(source.indexOf('-->')).replace(/\s+/g, ' ');
  // lint: forbidden pattern
  assert.doesNotMatch(body, /one reply, at most a screen/i, 'the one-screen lesson is gone (spec 11)');
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

  // lint: the step exists, and a forbidden pattern is absent
  assert.doesNotMatch(text, /Recommend[^.]*No grilling/, 'the user picks No grilling; the pilot never recommends it (A1)');
});

test('vertical-execution.md defines Gate 1 and Gate 2 in one section, with no exception to either', () => {
  // S7 (spec 17, 20): the two gates are defined once, in rules/vertical-execution.md's
  // "The two human gates" section. ticket-states S11 (spec 10) retired the small ticket, the
  // one exception to Gate 1 that section used to state, so every ticket has both gates.
  const execution = read('rules/vertical-execution.md');
  const gates = /## The two human gates\n([\s\S]*?)(?=\n## |$)/.exec(execution);
  assert.ok(gates, '"The two human gates" section must exist');
  // lint: the section exists, and a forbidden pattern is absent
  assert.doesNotMatch(execution, /small ticket|has no Gate 1|stands in for it/i, 'no ticket skips Gate 1 (spec 10)');
});

test('orchestration.md and agents/pilot.md name no exception to Gate 1', () => {
  const orchestration = read('rules/orchestration.md').replace(/\s+/g, ' ');
  const pilot = read('agents/pilot.md');

  // lint: forbidden patterns
  assert.doesNotMatch(orchestration, /small ticket|except for/i, 'orchestration.md names no exception (spec 10)');

  const step = /### 3\. Grilling, with the user\n([\s\S]*?)(?=\n## )/.exec(pilot);
  assert.ok(step, 'step 3 must exist');
  const gate1 = step[1].indexOf('**Gate 1**');
  assert.ok(gate1 > -1, 'step 3 must still carry the Gate 1 paragraph');
  assert.doesNotMatch(step[1].slice(gate1), /small ticket|stands in for it/i, 'agents/pilot.md names no exception');
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

  // lint: the header records an `adapted:` line, and S13's vocabulary is absent
  assert.match(header[1], /^adapted: \S/m, 'the header records what was adapted');

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
  // lint: the skills field does not preload it
  assert.doesNotMatch(fieldOf(qa, 'skills'), /diagnosing-bugs/, 'pilot-qa still preloads diagnosing-bugs');
});

// --- debug-workflow S1 (spec 1, 2; L6, L7, L11): the crew's bug path ---

test('the implementer loads diagnosing-bugs on demand', () => {
  // The implementer writes every fix, so it loads the bug path on a fix brief and on a
  // `regression`; most slices fix no bug, so a preload would be paid and never read (L6).
  const implementer = agentSource('pilot-implementer');
  // lint: the skills field does not preload it
  assert.doesNotMatch(fieldOf(implementer, 'skills'), /diagnosing-bugs/, 'L6: pilot-implementer preloads diagnosing-bugs');
});

test('the bug path is recorded and the skill exists', () => {
  // The landing numbers the NNNN placeholder and refreshes the index (adr-allocate), so on the
  // feature branch the ADR exists unnumbered and `adr-index --check` holds the README.
  const front = leadingFrontmatter(read('docs/adr/0175-debug-workflow.md'));
  assert.match(front, /^status: proposed$/m, 'spec 2: the ADR is proposed until it lands');
  const paths = /^paths: \[(.*)\]$/m.exec(front);
  assert.ok(paths, 'spec 2: the ADR names its paths');
  for (const file of ['agents/pilot-implementer.md', 'agents/pilot-co-pilot.md']) {
    assert.ok(paths[1].split(/,\s*/).includes(file), `spec 2: the ADR's paths omit ${file}`);
  }
  assert.ok(fs.existsSync(path.join(ROOT, 'skills/diagnosing-bugs/SKILL.md')), 'the bug path names a skill that is not vendored');
});

test('ADR 0036 records friction as collected-and-reported, scoped to the target repo, with no separate audit pass', () => {
  const adrPath = path.join(ROOT, 'docs', 'adr', '0036-friction-is-collected-and-reported-never-auto-fixed.md');
  assert.ok(fs.existsSync(adrPath), 'ADR 0036 must exist in the form of 0012-0015');
  const adr = fs.readFileSync(adrPath, 'utf8').replace(/\r\n/g, '\n');

  // lint: the ADR format's Consequences line exists, and no extra sections
  assert.match(adr, /\*\*Consequences\*\*:/, 'closes with the Consequences line the format uses');
  assert.doesNotMatch(adr, /^#{2,}\s/m, 'no sections beyond the title and the Consequences line');
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
  // lint: the section exists, and a forbidden pattern is absent
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
});

// --- thread-kinds S11: the record is the save state from step 1 (spec 22, 24) ---

// clear-waits-co-pilot S2 (spec 2, 4, 6; L8, L12, A1): the deck knows the co-pilot before it exists.
test('pilot.md tells the deck before spawning a co-pilot and releases a paused one', () => {
  // lint: forbidden pattern
  assert.doesNotMatch(read('agents/pilot.md'), /says whether the\s+sub-deck is starting/, 'the stale gate1 sentence paid for it');
});

// --- co-pilot-reports S1 (spec 1, 2, 4, 5; L1, L2, L5, A4): the crew reports to its spawner ---

/** One `## <heading>` section of an agent file, on one line. */
const agentSection = (name, heading) => {
  const match = new RegExp(`\\n## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`).exec(agentSource(name));
  assert.ok(match, `agents/${name}.md has no "## ${heading}" section`);
  return match[1].replace(/\s+/g, ' ');
};

test('the co-pilot sends main only four things', () => {
  const source = agentSource('pilot-co-pilot');
  // lint: forbidden patterns
  assert.doesNotMatch(source, /## Questions go to main/, 'the section is renamed');
  assert.doesNotMatch(source.replace(/\s+/g, ' '), /Your crew sends its own questions to `main`/, 'spec 1: the crew reports to the co-pilot now');
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

test('the fundamentalist reports to its spawner', () => {
  const report = agentSection('pilot-fundamentalist', 'Report');
  // lint: forbidden pattern
  assert.doesNotMatch(report, /One message to `main`/, 'spec 1: the verdict goes to the spawner');
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
  // lint: the tools field grants no deck_post, and QA posts only a walkthrough
  for (const name of ['pilot-implementer', 'pilot-fundamentalist']) {
    assert.doesNotMatch(fieldOf(agentSource(name), 'tools'), /deck_post/, `spec 7: agents/${name}.md can post on the deck`);
  }
  const kinds = [...agentSource('pilot-qa').matchAll(/deck_post`[^.]*?`kind: "(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(kinds, ['walkthrough'], 'spec 7: QA posts its walkthrough and nothing else, so its pushback goes to its addressee');
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
  // lint: the section exists and carries no tool table
  assert.doesNotMatch(evidence, /stryker|jscpd|knip|madge|diff-cover|lizard/i, 'no tool table left to run');
  const scope = agentSection('pilot-fundamentalist', 'Scope discipline');
  // lint: forbidden pattern
  assert.doesNotMatch(scope, /do not spawn agents/);
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
  // lint: the mutation-safety section exists and names the four state modules
  const never = agentSection('pilot-evidence-runner', 'Never mutate[^\\n]*');
  for (const module of ['store', 'client', 'daemon', 'server']) {
    assert.match(never, new RegExp(`deck/${module}\\.mjs`), `$MUTATE drops deck/${module}.mjs`);
  }
});

test('the rule budgets the fundamentalist one child', () => {
  // cheaper-crew S2 (spec 4): the budget follows the helper.
  const rule = flat(read('rules/orchestration.md'));
  // lint: forbidden pattern
  assert.doesNotMatch(rule, /a fundamentalist none/);
});
