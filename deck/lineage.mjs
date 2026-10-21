/**
 * The gate1 lineage check (design-docs-only spec 2; L4, ADR 0112), apart from `server.mjs`,
 * which names no `child_process` (deck/test/create.test.mjs): `callTool('deck_post')` calls it
 * before `postItem`.
 */

import path from 'node:path';

import { gitUnder, pilotLineage } from '../scripts/pilot-branch.mjs';
import { shortRef } from '../scripts/remotes.mjs';
import { assumedIds, unverdicted, verdictsOf } from '../scripts/verdicts.mjs';
import { SHA_FIELD } from './items-bounds.mjs';
import { repoOf } from './runs.mjs';
import { DeckRefusal } from './store.mjs';

// One 5 s deadline covers every git call S1's `pilotLineage` makes (L4).
const LINEAGE_MS = 5000;

/**
 * Refuses a gate1 whose design branch is off pilot's tip or carries copies of pilot's
 * commits (design-docs-only spec 2; L4, L5, L6, A2), read in the item's `repo` as the local
 * refs have it, with no fetch, against the run remote's `pilot` (pilot-fork spec 4). A
 * `repo` that is not a git repository is not checked. Git gets the branch name, a caller's
 * string, as an argument, never through a shell, and the repo's own `core.fsmonitor` is off
 * for every git call. `timeout` is the deadline in ms, injectable for tests.
 */
export function assertOnPilotTip(repo, branch, { timeout = LINEAGE_MS } = {}) {
  if (typeof repo !== 'string' || !path.isAbsolute(repo) || repoOf(repo) === null || typeof branch !== 'string') return;
  let lineage;
  try {
    lineage = pilotLineage(repo, branch, { timeout });
  } catch (err) {
    if (err.code === 'ETIMEDOUT') throw new DeckRefusal(`git did not answer on a gate1's branch ${branch} within 5 s; post again`);
    throw new DeckRefusal(`a gate1's branch ${branch} could not be read in ${repo}: ${err.message}`);
  }
  if (lineage.copies === 0 && lineage.tip) return;
  const base = shortRef(lineage.upstream);
  if (!('tip' in lineage)) {
    const fix = lineage.upstream.startsWith('refs/heads/') ? 'run pilot base' : `git fetch ${base.split('/')[0]} pilot`;
    throw new DeckRefusal(`a gate1 needs the pilot base: ${repo} has no ${base}; ${fix} and post again`);
  }
  const rebase = `rebase its docs commits onto pilot (git rebase ${base}) and post again`;
  if (lineage.copies > 0) {
    const copies = lineage.copies === 1 ? '1 copy' : `${lineage.copies} copies`;
    throw new DeckRefusal(`a gate1's branch ${branch} carries ${copies} of pilot's commits; ${rebase}`);
  }
  throw new DeckRefusal(`a gate1's branch ${branch} is not on pilot's tip; ${rebase}`);
}

/**
 * Refuses a gate1 whose artefact, read at the gate's `sha` and never from the working file,
 * holds an assumed decision (A‹n›) with no verdict, or whose `body` leaves an A‹n› id out
 * (verdict-pass spec 3, 5; L2-L6, A2). Its Verdict lines must equal `record`, the ticket's
 * verdict record, id for id, whoever posts it; an A‹n› with no record is refused
 * (architect-runs-red spec 4; L2, A1). An artefact unreadable at `sha` is refused, naming
 * both (L5); one with no A‹n› and no record passes (L6). A `repo` that is not a git repository is not
 * checked, and a `sha` not shaped as one is left to the store's own refusal. Git runs as
 * `cat-file`, which runs no textconv, with no shell and `core.fsmonitor` off, under one
 * deadline of `timeout` ms.
 */
export function assertVerdicts(repo, { sha: given, artefact, body } = {}, { record, timeout = LINEAGE_MS } = {}) {
  if (typeof repo !== 'string' || !path.isAbsolute(repo) || repoOf(repo) === null) return;
  // Trimmed as the store trims it, so a padded sha the store accepts is never a way past the check.
  const sha = typeof given === 'string' ? given.trim() : given;
  if (typeof sha !== 'string' || !SHA_FIELD.shape.test(sha) || typeof artefact !== 'string') return;
  let read;
  try {
    read = gitUnder(repo, { timeout })(['cat-file', 'blob', `${sha}:${artefact}`]);
  } catch (err) {
    if (err.code === 'ETIMEDOUT') throw new DeckRefusal(`git did not answer on a gate1's artefact ${artefact} within 5 s; post again`);
    throw new DeckRefusal(`a gate1's artefact ${artefact} could not be read at ${sha} in ${repo}: ${err.message}`);
  }
  if (read.status !== 0) {
    throw new DeckRefusal(`a gate1's artefact ${artefact} could not be read at ${sha} in ${repo}; commit it and post the sha that holds it`);
  }
  const open = unverdicted(read.stdout);
  if (open.length > 0) {
    throw new DeckRefusal(`a gate1's artefact has ${open.join(', ')} with no verdict at ${sha}; add a "Verdict: stands" or "Verdict: overturned: <why>" line to each, commit, and post again`);
  }
  const ids = assumedIds(read.stdout);
  if (ids.length > 0 && !record) {
    throw new DeckRefusal(`a gate1's ticket holds no verdict record for ${ids.join(', ')}; the pilot records them with deck_ticket verdicts, then post again`);
  }
  const written = verdictsOf(read.stdout);
  const differ = [...new Set([...ids, ...Object.keys(record ?? {})])].filter((id) => written[id] !== record?.[id]);
  if (differ.length > 0) {
    throw new DeckRefusal(`a gate1's artefact at ${sha} differs from the pilot's verdict record on ${differ.join(', ')}; write the recorded verdicts (pilot verdicts), commit, and post again`);
  }
  const text = typeof body === 'string' ? body : '';
  const missing = ids.filter((id) => !new RegExp(`\\b${id}\\b`).test(text));
  if (missing.length > 0) {
    throw new DeckRefusal(`a gate1's body leaves out ${missing.join(', ')}; name every assumed decision and its verdict in the body and post again`);
  }
}
