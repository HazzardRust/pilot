/**
 * The legacy path (audit-f14 A3): only a run whose record base is `pilot` reaches it, until none is
 * in flight; a main-cut run's landing ends on its own feature PR (`featureLine`) instead.
 *
 * The release PR: the one open PR `pilot → main`, labelled `release`, which the user merges
 * (pilot-develop-line spec 1; L3, L4, A4; one-integration-line A1, A6). Every landing rewrites
 * its title and body whole from git: one row per first-parent `Merge feat/<slug> into pilot` in
 * main..pilot, oldest first. Rows carry the feature, its PR and the landing sha, never a ticket
 * or a closing report, which live on the local deck (A4). Every `gh` call is argv, never a shell
 * string.
 */

import { firstLine, landingSubjects, LEGACY_PILOT, pilotBranch, remoteDefaultBranch } from './pilot-branch.mjs';
import { runRef, runRemote } from './remotes.mjs';

const LABEL = 'release';
const TITLE_MAX = 120;
/** A merge of a feature, a slug of ref-safe characters only, so no row breaks the table; a landing when `landingSubjects` names it. */
const FEATURE_MERGE = /^Merge (feat\/([A-Za-z0-9._/-]+)) into \S+$/;

/** `Release: a, b, c +N more`, as many slugs as fit in `TITLE_MAX` characters. */
function titleOf(slugs) {
  const names = [...new Set(slugs)];
  if (!names.length) return 'Release';
  for (let n = names.length; ; n--) {
    const more = names.length - n;
    const title = `Release:${n ? ` ${names.slice(0, n).join(', ')}` : ''}${more ? ` +${more} more` : ''}`;
    if (title.length <= TITLE_MAX || n === 0) return title;
  }
}

/**
 * The release PR's title, body and rows from git (L3). `git` is `(args) => string`; `pilotRef`
 * and `mainRef` are refs git takes literally, `pilotRef` the ref of the pilot branch `name`; a row is
 * each merge `landingSubjects` names, onto that branch or the legacy pilot (L8).
 * `prs` is the host's merged **Review**s into pilot
 * (the newest 200; an older one reads `–`), the feature PR of each row, never a fork's, the
 * highest number when several.
 */
export function releaseNotes({ git, name, pilotRef, mainRef, prs }) {
  const log = git(['log', '--first-parent', '--reverse', '--format=%H%x09%P%x09%s', `${mainRef}..${pilotRef}`]);
  const rows = [];
  for (const line of String(log).split(/\r?\n/)) {
    const [sha, parents, ...rest] = line.split('\t');
    const subject = rest.join('\t');
    const [, head, slug] = FEATURE_MERGE.exec(subject) ?? [];
    if (!slug || !landingSubjects(head, name).includes(subject) || parents.split(' ').length !== 2) continue;
    const numbers = prs.filter((pr) => pr?.head === `feat/${slug}` && pr.crossRepo !== true && Number.isSafeInteger(pr.number) && pr.number > 0).map((pr) => pr.number);
    rows.push({ slug, pr: numbers.length ? Math.max(...numbers) : null, sha });
  }
  const table = ['| Feature | PR | Landing |', '| --- | --- | --- |', ...rows.map(({ slug, pr, sha }) => `| ${slug} | ${pr === null ? '–' : `#${pr}`} | ${sha} |`)];
  return { title: titleOf(rows.map((row) => row.slug)), body: rows.length ? table.join('\n') : `No feature landed on ${name} since main.`, rows };
}

/**
 * Main gets pilot through the release PR (A1, A6): the open one from this repository's pilot to
 * the default branch, rewritten with `releaseNotes` and labelled, else one opened ready with them
 * and the label; a label the host cannot make costs the label, never the PR (the adapter drops it).
 * Answers `{ number, opened }`; under a run remote other than origin, or with no host (`none`),
 * `{ number: null, byHand }`, the pilot to open one from, with no host call; when git or the host
 * cannot answer, `{ number: null, why }`. `already`, the feature on pilot before this landing,
 * rewrites an open one but opens none: with none, `{ number: null, none: true }`. Never merges and
 * never throws: the feature is already landed.
 * `name` is the pilot branch, `pilotBranch`'s when none is passed.
 * @param {{ git: (args: string[]) => string, host: import('../deck/host.mjs').Host | null, name?: string, already?: boolean }} options
 */
export function releasePr({ git, host, name, already = false }) {
  const unknown = (why) => ({ number: null, opened: false, why });
  let runs;
  let base;
  try {
    name ??= pilotBranch(git);
    runs = runRemote(git);
    if (runs === 'origin' && host !== null) base = remoteDefaultBranch(git);
  } catch (err) {
    return unknown(firstLine(err));
  }
  if (host === null || runs !== 'origin') return { number: null, opened: false, byHand: runs === null || runs === 'origin' ? name : `${runs}/${name}` };
  let open;
  try {
    // A fork's branch of that name is never the release PR.
    open = host.reviews({ head: name, base, state: 'open' })
      .find((pr) => pr.head === name && pr.base === base && pr.crossRepo === false && Number.isSafeInteger(pr.number) && pr.number > 0);
  } catch (err) {
    return unknown(`${host.cli} pr list failed: ${firstLine(err)}`);
  }
  if (!open && already) return { number: null, opened: false, none: true };
  let notes;
  try {
    // A landing from before the move (L8) has its PR merged into the legacy pilot.
    const merged = (into) => host.reviews({ base: into, state: 'merged', limit: 200 });
    const features = name === LEGACY_PILOT ? merged(name) : [...merged(name), ...merged(LEGACY_PILOT)];
    notes = releaseNotes({ git, name, pilotRef: runRef(runs, name), mainRef: runRef(runs, base), prs: features });
  } catch (err) {
    return unknown(`release notes failed: ${firstLine(err)}`);
  }
  const { title, body } = notes;
  const verb = open ? 'edit' : 'create';
  try {
    if (open) {
      const { why } = host.edit(open.number, { title, body, label: LABEL });
      return { number: open.number, opened: false, ...(why === undefined ? {} : { labelWhy: why }) };
    }
    const { number, why } = host.open({ base, head: name, title, body, label: LABEL });
    return { number, opened: true, ...(why === undefined ? {} : { labelWhy: why }) };
  } catch (err) {
    return unknown(`${host.cli} pr ${verb} failed: ${firstLine(err)}`);
  }
}
