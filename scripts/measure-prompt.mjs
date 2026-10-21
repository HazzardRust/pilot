#!/usr/bin/env node
/**
 * Measures each crew agent's initial prompt cost from the files that build it
 * (independence S1, spec line 7). Per agent (`agents/pilot*.md`):
 *
 *   definition  the agent file's body, after its frontmatter (the frontmatter is
 *               metadata the caller sees, not the agent's own prompt)
 *   skills      the bodies of the skills its frontmatter preloads: `skills:` and
 *               the skill an `initialPrompt: /plugin:skill` invokes
 *   rules       every `~/.claude/rules/**.md` with no `paths:` frontmatter, whole,
 *               plus `~/.claude/CLAUDE.md`; the same for every agent
 *   tools       the JSON of each deck tool schema the agent's `tools:` grants
 *
 * Built-in tool schemas and hook injections are not counted: the first are the same
 * for every agent and the second fire per event, not at start.
 *
 *   node scripts/measure-prompt.mjs [--json] [--root <repo>] [--home <dir>]
 *
 * Prints a table in tokens (bytes / 4, rounded); `--json` prints the rows in bytes.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DECK_TOOL_PREFIX = 'mcp__plugin_pilot_deck';
export const BYTES_PER_TOKEN = 4;

const bytes = (text) => Buffer.byteLength(text, 'utf8');

/** Splits a markdown file into its frontmatter lines and its body. */
export function split(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { front: [], body: text };
  return { front: match[1].split(/\r?\n/), body: text.slice(match[0].length) };
}

/** The value of one frontmatter key as a list: `k: a, b`, `k: [a, b]` or a `- a` block. */
export function listOf(front, key) {
  const at = front.findIndex((line) => line.startsWith(`${key}:`));
  if (at < 0) return [];
  const inline = front[at].slice(key.length + 1).trim().replace(/^\[|\]$/g, '');
  if (inline) return inline.split(',').map((word) => word.trim()).filter(Boolean);
  const block = [];
  for (const line of front.slice(at + 1)) {
    const item = /^\s*-\s+(.+)$/.exec(line);
    if (!item) break;
    block.push(item[1].trim());
  }
  return block;
}

function skillBytes(root, name) {
  const file = path.join(root, 'skills', name, 'SKILL.md');
  if (!fs.existsSync(file)) throw new Error(`preloaded skill "${name}" has no ${file}`);
  return bytes(split(fs.readFileSync(file, 'utf8')).body);
}

function unconditionalRuleBytes(home) {
  const claude = path.join(home, '.claude');
  const rules = path.join(claude, 'rules');
  const files = fs.existsSync(rules)
    ? fs.readdirSync(rules, { recursive: true }).filter((file) => file.endsWith('.md')).map((file) => path.join(rules, file))
    : [];
  const loaded = files
    .map((file) => fs.readFileSync(file, 'utf8'))
    .filter((text) => !split(text).front.some((line) => line.startsWith('paths:')));
  const claudeMd = path.join(claude, 'CLAUDE.md');
  if (fs.existsSync(claudeMd)) loaded.push(fs.readFileSync(claudeMd, 'utf8'));
  return loaded.reduce((sum, text) => sum + bytes(text), 0);
}

function grantedToolBytes(tools, granted) {
  const all = granted.includes(DECK_TOOL_PREFIX);
  return tools
    .filter((tool) => all || granted.includes(`${DECK_TOOL_PREFIX}__${tool.name}`))
    .reduce((sum, { name, description, inputSchema }) => sum + bytes(JSON.stringify({ name, description, inputSchema })), 0);
}

/** One row per crew agent, every column in bytes. */
export async function measure({ root = REPO, home = os.homedir() } = {}) {
  const { TOOLS } = await import(pathToFileURL(path.join(root, 'deck', 'tools.mjs')).href);
  const rules = unconditionalRuleBytes(home);
  const agents = fs.readdirSync(path.join(root, 'agents'))
    .filter((file) => /^pilot(-.+)?\.md$/.test(file))
    .sort((a, b) => a.slice(0, -3).localeCompare(b.slice(0, -3)));
  return agents.map((file) => {
    const { front, body } = split(fs.readFileSync(path.join(root, 'agents', file), 'utf8'));
    const initial = listOf(front, 'initialPrompt').map((command) => /^\/(?:[\w-]+:)?([\w-]+)/.exec(command)?.[1]).filter(Boolean);
    const skills = [...new Set([...listOf(front, 'skills'), ...initial])].reduce((sum, name) => sum + skillBytes(root, name), 0);
    const row = {
      agent: listOf(front, 'name')[0] ?? path.basename(file, '.md'),
      definition: bytes(body),
      skills,
      rules,
      tools: grantedToolBytes(TOOLS, listOf(front, 'tools')),
    };
    return { ...row, total: row.definition + row.skills + row.rules + row.tools };
  });
}

/** The rows as a markdown table in tokens. */
export function formatTable(rows) {
  const tokens = (n) => Math.round(n / BYTES_PER_TOKEN);
  return [
    '| Agent | Definition | Preloaded skills | Unconditional rules | Deck tool schemas | Total |',
    '|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.agent} | ${[r.definition, r.skills, r.rules, r.tools, r.total].map(tokens).join(' | ')} |`),
  ].join('\n');
}

/** The figure every prompt pin counts, in tokens and unrounded. */
export const ownShare = (row) => (row.definition + row.skills + row.tools) / BYTES_PER_TOKEN;

/** Each agent's pin: the `own <= n` of the scripts/test test( block that finds `row.agent === '<agent>'`. */
export function pinsOf(root) {
  const dir = path.join(root, 'scripts', 'test');
  const pins = new Map();
  if (!fs.existsSync(dir)) return pins;
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.test.mjs'))) {
    for (const block of fs.readFileSync(path.join(dir, file), 'utf8').split(/^test\(/m).slice(1)) {
      const agent = /row\.agent === '([\w-]+)'/.exec(block)?.[1];
      const pin = /\bown <= ([\d.]+)/.exec(block)?.[1];
      if (agent && pin) pins.set(agent, Number(pin));
    }
  }
  return pins;
}

/** Each row's own share against its pin; `null` where the agent has none. */
export function pinned(rows, pins) {
  return rows.map((row) => {
    const own = ownShare(row);
    const pin = pins.get(row.agent) ?? null;
    return { agent: row.agent, own, pin, headroom: pin === null ? null : pin - own };
  });
}

/** The pinned shares as a markdown table. */
export function formatPinned(list) {
  const cell = (n) => (n === null ? '–' : String(n));
  return [
    '| Agent | Own share | Pin | Headroom |',
    '|---|---|---|---|',
    ...list.map((r) => `| ${r.agent} | ${r.own} | ${cell(r.pin)} | ${cell(r.headroom)} |`),
  ].join('\n');
}

function option(argv, flag) {
  const at = argv.indexOf(flag);
  if (at < 0) return undefined;
  if (!argv[at + 1]) throw new Error(`${flag} needs a directory`);
  return path.resolve(argv[at + 1]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const rows = await measure({ root: option(argv, '--root'), home: option(argv, '--home') });
  const root = option(argv, '--root') ?? REPO;
  console.log(argv.includes('--json')
    ? JSON.stringify(rows, null, 2)
    : `tokens = bytes / ${BYTES_PER_TOKEN}\n\n${formatTable(rows)}\n\n${formatPinned(pinned(rows, pinsOf(root)))}`);
}
