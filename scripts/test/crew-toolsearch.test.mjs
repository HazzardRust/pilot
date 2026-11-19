import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { split, listOf } from '../measure-prompt.mjs';

const AGENTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'agents');
const DECK_TOOL = 'mcp__plugin_pilot_deck__';

/**
 * The crew agents granted a deck tool but not ToolSearch, by file name without `.md`, sorted.
 * A session whose deck MCP failed at start still loads its tools through ToolSearch; an agent
 * granted the deck tools without it has no way to reach them in that session (never-stuck S15).
 */
export function crewToolsLackingSearch(agentsDir) {
  return fs
    .readdirSync(agentsDir)
    .filter((name) => name.endsWith('.md'))
    .filter((name) => {
      const tools = listOf(split(fs.readFileSync(path.join(agentsDir, name), 'utf8')).front, 'tools');
      return tools.some((tool) => tool.startsWith(DECK_TOOL)) && !tools.includes('ToolSearch');
    })
    .map((name) => name.slice(0, -'.md'.length))
    .sort();
}

test('every crew agent with a deck tool can load it', () => {
  assert.deepEqual(crewToolsLackingSearch(AGENTS), []);
});

test('the check catches a missing grant', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-toolsearch-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const name of fs.readdirSync(AGENTS).filter((file) => file.endsWith('.md'))) {
    fs.copyFileSync(path.join(AGENTS, name), path.join(dir, name));
  }
  const lander = path.join(dir, 'pilot-lander.md');
  const source = fs.readFileSync(lander, 'utf8');
  fs.writeFileSync(lander, source.replace(/^(tools:.*?), ToolSearch\b/m, '$1'));
  assert.deepEqual(crewToolsLackingSearch(dir), ['pilot-lander']);
});
