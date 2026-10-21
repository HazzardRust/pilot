/**
 * `pilot status`: whether a deck is up at the deck's url, which version it runs against the
 * plugin's, how long it has been up, who is on it, and deck.log's last 20 lines either way
 * (daemon-lifecycle spec 8, 9; L6, A3). Reads only: one health probe, one `GET /api/agents`
 * and the log file.
 */

import fs from 'node:fs';
import path from 'node:path';

import { bearer } from '../hooks/lib/deck-secret.js';
import { oneLine } from './one-line.mjs';
import { probeDeck } from './probe.mjs';
import { storeDir } from './store-dir.mjs';
import { deckUrl } from './tools.mjs';
import { PLUGIN_VERSION, isOlder } from './version.mjs';

const LOG_LINES = 20;

/**
 * A string from the deck or its log with every C0 and C1 control character shown as `?`: the
 * roster's repository keys and the log carry text any local process can send, and an escape
 * sequence printed raw would rewrite the user's terminal.
 */
const plain = (text) => oneLine(text);

function uptime(startedAt, now) {
  const ms = now - Date.parse(startedAt ?? '');
  if (!Number.isFinite(ms) || ms < 0) return 'unknown';
  const minutes = Math.floor(ms / 60_000);
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

/** One line per repository: each agent type there, with a count when there is more than one. */
function agentLines(agents) {
  if (!agents) return ['agents   unknown: the deck did not list them'];
  const repos = Object.entries(agents);
  if (!repos.length) return ['agents   none'];
  return [
    'agents',
    ...repos.map(([repo, list]) => {
      const counts = new Map();
      for (const { agentType } of Array.isArray(list) ? list : []) counts.set(agentType, (counts.get(agentType) ?? 0) + 1);
      const types = [...counts].map(([type, n]) => plain(n > 1 ? `${type} x${n}` : type)).join(', ');
      return `  ${plain(repo)}: ${types}`;
    }),
  ];
}

export function statusLines({ url, probe, agents, logTail, pluginVersion, now }) {
  const lines = [];
  if (probe.state === 'deck') {
    const stale = isOlder(probe.version, pluginVersion) ? ', stale' : '';
    lines.push(
      `deck     ${url}`,
      // A deck from before deck-spawn-root names no root, and then no line says one.
      ...(probe.root ? [`root     ${plain(probe.root)}${probe.checkout ? ', checkout' : ''}`] : []),
      `pid      ${probe.pid}`,
      `version  ${plain(probe.version ?? 'none')} (plugin ${pluginVersion})${stale}`,
      `uptime   ${uptime(probe.startedAt, now)}`,
      ...agentLines(agents),
    );
  } else if (probe.state === 'none') {
    lines.push(`no deck is running at ${url}`);
  } else {
    lines.push(`something that is not a deck answers at ${url}: ${plain(probe.why)}`);
  }
  if (logTail.length) lines.push(`deck.log, last ${LOG_LINES} lines:`, ...logTail.map(plain));
  return lines;
}

/** deck.log's last lines; none when there is no log, and the reason when it cannot be read. */
function tailOf(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    return [`(${file} could not be read: ${err.message})`];
  }
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  return lines.slice(-LOG_LINES);
}

/** The live roster, or undefined from a deck that has no `GET /api/agents` (one before 0.9.3). */
async function agentsAt(url) {
  try {
    const response = await fetch(`${url}/api/agents`, { headers: bearer(), redirect: 'error', signal: AbortSignal.timeout(1000) });
    if (!response.ok) return undefined;
    const { agents } = await response.json();
    return agents && typeof agents === 'object' ? agents : undefined;
  } catch {
    return undefined;
  }
}

export async function main({ url = deckUrl(), probe = probeDeck, logFile = path.join(storeDir(), 'deck.log'), now = Date.now } = {}) {
  const found = await probe(url);
  const agents = found.state === 'deck' ? await agentsAt(url) : undefined;
  const lines = statusLines({ url, probe: found, agents, logTail: tailOf(logFile), pluginVersion: PLUGIN_VERSION, now: now() });
  process.stdout.write(`${lines.join('\n')}\n`);
  return found.state === 'deck' ? 0 : 1;
}
