/**
 * The release PR: the one open PR `pilot → main`, labelled `release`, which the user merges
 * (pilot-develop-line spec 1; L3, L4, A4; one-integration-line A1, A6). Every landing rewrites
 * its title and body whole from git: one row per first-parent `Merge feat/<slug> into pilot` in
 * main..pilot, oldest first. Rows carry the feature, its PR and the landing sha, never a ticket
 * or a closing report, which live on the local deck (A4). Every `gh` call is argv, never a shell
 * string.
 */

import { firstLine, PILOT_BRANCH, remoteDefaultBranch } from './pilot-branch.mjs';
import { runRef, runRemote } from './remotes.mjs';

const LABEL = 'release';
const TITLE_MAX = 120;
/** A landing's subject, `landingMessage`'s shape; a slug of ref-safe characters only, so no row breaks the table. */
const LANDING = new RegExp(`^Merge feat/([A-Za-z0-9._/-]+) into ${PILOT_BRANCH}$`);

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
 * and `mainRef` are refs git takes literally; `prs` is `gh pr list --base pilot --state merged`'s
 * `{ number, headRefName, isCrossRepository }` list (the newest 200; an older one reads `–`), the
 * feature PR of each row, never a fork's, the highest number when several.
 */
export function releaseNotes({ git, pilotRef, mainRef, prs }) {
  const log = git(['log', '--first-parent', '--reverse', '--format=%H%x09%P%x09%s', `${mainRef}..${pilotRef}`]);
  const rows = [];
  for (const line of String(log).split(/\r?\n/)) {
    const [sha, parents, subject] = line.split('\t');
    const slug = LANDING.exec(subject ?? '')?.[1];
    if (!slug || parents.split(' ').length !== 2) continue;
    const numbers = prs.filter((pr) => pr?.headRefName === `feat/${slug}` && pr.isCrossRepository !== true && Number.isSafeInteger(pr.number) && pr.number > 0).map((pr) => pr.number);
    rows.push({ slug, pr: numbers.length ? Math.max(...numbers) : null, sha });
  }
  const table = ['| Feature | PR | Landing |', '| --- | --- | --- |', ...rows.map(({ slug, pr, sha }) => `| ${slug} | ${pr === null ? '–' : `#${pr}`} | ${sha} |`)];
  return { title: titleOf(rows.map((row) => row.slug)), body: rows.length ? table.join('\n') : `No feature landed on ${PILOT_BRANCH} since main.`, rows };
}

/**
 * Main gets pilot through the release PR (A1, A6): the open one from this repository's pilot to
 * the default branch, rewritten with `releaseNotes` and labelled, else one opened ready with them
 * and the label, which is created first (`--force`, so an existing one stands). Answers
 * `{ number, opened }`, with `why` too when gh could not make the label and the PR went without it; under a run remote other than origin, or `none`, `{ number: null, byHand }`,
 * the pilot to open one from, with no gh call; when git or gh cannot answer, `{ number: null, why }`.
 * `already`, the feature on pilot before this landing, rewrites an open one but opens none: with
 * none, `{ number: null, none: true }`. Never merges and never throws: the feature is already landed.
 */
export function releasePr({ git, gh, already = false }) {
  const unknown = (why) => ({ number: null, opened: false, why });
  let runs;
  let base;
  try {
    runs = runRemote(git);
    if (runs === 'origin') base = remoteDefaultBranch(git);
  } catch (err) {
    return unknown(firstLine(err));
  }
  if (runs !== 'origin') return { number: null, opened: false, byHand: runs === null ? PILOT_BRANCH : `${runs}/${PILOT_BRANCH}` };
  const listed = (args) => {
    const said = JSON.parse(gh(args));
    if (!Array.isArray(said)) throw new Error('did not answer a list');
    return said;
  };
  let open;
  try {
    const prs = listed(['pr', 'list', '--head', PILOT_BRANCH, '--base', base, '--state', 'open', '--json', 'number,headRefName,baseRefName,isCrossRepository']);
    // A fork's branch named pilot is never the release PR.
    open = prs.find((pr) => pr?.headRefName === PILOT_BRANCH && pr.baseRefName === base && pr.isCrossRepository === false && Number.isSafeInteger(pr.number) && pr.number > 0);
  } catch (err) {
    return unknown(`gh pr list failed: ${firstLine(err)}`);
  }
  if (!open && already) return { number: null, opened: false, none: true };
  let notes;
  try {
    const features = listed(['pr', 'list', '--base', PILOT_BRANCH, '--state', 'merged', '--limit', '200', '--json', 'number,headRefName,isCrossRepository']);
    notes = releaseNotes({ git, pilotRef: runRef(runs, PILOT_BRANCH), mainRef: runRef(runs, base), prs: features });
  } catch (err) {
    return unknown(`release notes failed: ${firstLine(err)}`);
  }
  const step = (args) => {
    try {
      return { said: gh(args) };
    } catch (err) {
      return { why: `gh ${args.slice(0, 2).join(' ')} failed: ${firstLine(err)}` };
    }
  };
  // A label gh cannot make costs the label, never the PR: its why rides on the answer.
  const label = step(['label', 'create', LABEL, '--force']);
  const labelled = (flag) => (label.why ? [] : [flag, LABEL]);
  const answer = (number, opened) => ({ number, opened, ...(label.why && { why: label.why }) });
  if (open) {
    const edit = step(['pr', 'edit', String(open.number), '--title', notes.title, '--body', notes.body, ...labelled('--add-label')]);
    return edit.why ? unknown(edit.why) : answer(open.number, false);
  }
  const create = step(['pr', 'create', '--base', base, '--head', PILOT_BRANCH, '--title', notes.title, '--body', notes.body, ...labelled('--label')]);
  if (create.why) return unknown(create.why);
  const number = Number(/\/pull\/(\d+)\s*$/.exec(String(create.said))?.[1]);
  if (!Number.isSafeInteger(number) || number <= 0) return unknown('gh pr create printed no PR URL');
  return answer(number, true);
}
