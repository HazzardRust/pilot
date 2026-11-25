/**
 * The Agents panel as data (rune-deck-ui S14, L11): the live roster the page's `renderAgents` draws, each agent
 * with whole seconds since its last tool call and `quiet` from 30 s. The roster's 90 s window is `listAgents`'s,
 * so an agent past it is not here at all.
 */
import { authorKind } from '../items.mjs';
import { landingFor, tabFor, tabsOf } from '../tabs.mjs';
import { relative } from '../ui/js/time.mjs';

/** Seconds of silence from which a row dims (L11). */
export const QUIET_S = 30;

export function agentsView(reads, query = {}, now = Date.now()) {
  const { run = null } = query;
  const tabs = tabsOf(reads.runs, reads.items, reads.numbers, reads.agents, reads.added, reads.lanes);
  const tab = run === null ? landingFor(tabs) : tabFor(tabs, run);
  const row = (agent) => {
    const quietS = Math.max(Math.floor((now - Date.parse(agent.lastSeen)) / 1000), 0);
    // "3 mins ago" in the HTML deck's own words, as `view/usage.mjs` gives a reset (rune-panes S6).
    const started = relative(now - Date.parse(agent.since));
    return { name: agent.agentType, kind: authorKind(agent.agentType), since: agent.since, started, quietS, quiet: quietS >= QUIET_S };
  };
  if (tab) return { agents: tab.agents.map(row) };
  // The overview: one section per deck with anybody live, in the strip's order, as the page's `run-section`s.
  const groups = tabs.filter((each) => each.agents.length > 0).map((each) => ({ tab: each.name, agents: each.agents.map(row) }));
  return { agents: groups.flatMap((group) => group.agents), groups };
}

export default ({ reads, query }) => agentsView(reads, query);
