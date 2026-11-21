/**
 * The Agents panel as data (rune-deck-ui S14, L11): the live roster the page's `renderAgents` draws, each agent
 * with whole seconds since its last tool call and `quiet` from 30 s. The roster's 90 s window is `listAgents`'s,
 * so an agent past it is not here at all.
 */
import { authorKind } from '../items.mjs';
import { landingFor, tabFor, tabsOf } from '../tabs.mjs';

/** Seconds of silence from which a row dims (L11). */
export const QUIET_S = 30;

export function agentsView(reads, query = {}, now = Date.now()) {
  const { run = null } = query;
  const tabs = tabsOf(reads.runs, reads.items, reads.numbers, reads.agents, reads.added, reads.lanes);
  const tab = run === null ? landingFor(tabs) : tabFor(tabs, run);
  const roster = tab ? tab.agents : tabs.flatMap((each) => each.agents);
  const agents = roster.map((agent) => {
    const quietS = Math.max(Math.floor((now - Date.parse(agent.lastSeen)) / 1000), 0);
    return { name: agent.agentType, kind: authorKind(agent.agentType), since: agent.since, quietS, quiet: quietS >= QUIET_S };
  });
  return { agents };
}

export default ({ reads, query }) => agentsView(reads, query);
