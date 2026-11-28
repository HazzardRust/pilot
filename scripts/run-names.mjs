/**
 * Which run owns a branch name (remote-run-branches L2, L3, L6, L8). Pure: names in, answers out.
 * A **known run** is a slug with a `feat/<s>` ref, or a `design/<s>` ref where `s` does not end
 * `-recut`. A run owns `feat|design|fix|qa/<slug>`, `fix|slice|qa/<slug>-<any>` and
 * `design/<slug>-recut`, unless a longer known run names the branch too: the longest known slug
 * that names a branch is its owner. The name is only the first guard; `deleteMerged`'s merged
 * check is the second, so a misattributed name can only lose a ref whose commits are landed.
 */

const RUN_REF = /^(feat|design)\/(.+)$/;
const RUN_BRANCH = /^(feat|design|fix|slice|qa)\/(.+)$/;

/** The known runs among `names` (branch names, no `refs/heads/`). */
export function knownRuns(names) {
  const known = new Set();
  for (const name of names) {
    const [, prefix, slug] = RUN_REF.exec(String(name)) ?? [];
    if (slug && !(prefix === 'design' && slug.endsWith('-recut'))) known.add(slug);
  }
  return known;
}

/** Whether `branch` is run `slug`'s: its name names `slug`, and no longer run in `known` names it. */
export function runOwns(branch, slug, known) {
  const [, prefix, rest] = RUN_BRANCH.exec(String(branch)) ?? [];
  if (!rest || !slug) return false;
  const named = rest === slug
    ? prefix !== 'slice'
    : rest.startsWith(`${slug}-`) && (prefix === 'design' ? rest === `${slug}-recut` : prefix !== 'feat');
  if (!named) return false;
  for (const run of known) if (run.length > slug.length && (rest === run || rest.startsWith(`${run}-`))) return false;
  return true;
}
