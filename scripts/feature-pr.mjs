/**
 * `pilot pr --ticket <id>`: the deck's one writer of a run's feature PR (deck-writes-github spec 2;
 * L1, L2, L3, L7'). It reads the ticket's run record from the deck (`/api/record`, as `pilot ready`
 * does) and the artefact from `origin/feat/<slug>`, then makes GitHub match them:
 *
 *   no open PR for `feat/<slug>`  -> one `gh pr create --draft` on the record's base
 *   a body or a base that differs -> one `gh pr edit <n>` carrying only what differs
 *   both the same                 -> nothing
 *
 * The body is the artefact's §2, the record's slice table and the brief's PR footer, and always
 * goes through a file, never argv. The PR is found by its head every time; its number is never
 * stored (L3). A run remote other than origin, or a `feat/<slug>` origin does not have yet, prints
 * one line and exits 0. Any failure is one line naming the step, exit 1.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { bearer } from '../hooks/lib/deck-secret.js';
import { hostIn } from '../deck/host.mjs';
import { RUN_BASE, SLUG } from '../deck/runs.mjs';
import { deckUrl } from '../deck/tools.mjs';
import { listeningRepo } from '../deck/wait.mjs';
import { firstLine, git as gitAt, PILOT_BRANCH } from './pilot-branch.mjs';
import { runRemote } from './remotes.mjs';

const USAGE = 'usage: pilot pr --ticket <itm_id>';
const TICKET = /^itm_[0-9a-f]+$/;
/** How long the deck has to answer before this calls it down. */
const TIMEOUT_MS = 5000;

/** A failure that already names its step. */
class StepError extends Error {}

/** One table cell: a pipe escaped, line breaks folded, so a row stays one row. */
const cell = (value) => String(value ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();

/**
 * The feature PR's body: `spec` (the artefact's §2) as it stands, the record's slices as a
 * `Slice | State | PR` table, one row per record row, and `footer` last when there is one.
 */
export function featureBody(spec, record, footer) {
  const rows = (record.slices ?? []).map((row) => {
    const pr = Number.isInteger(row.pr) ? `#${row.pr}` : '';
    return `| ${cell(row.slice)} | ${cell(row.state)} | ${pr} |`;
  });
  const parts = [spec.trimEnd(), ['| Slice | State | PR |', '| --- | --- | --- |', ...rows].join('\n')];
  if (footer?.trim()) parts.push(footer.trim());
  return `${parts.join('\n\n')}\n`;
}

/** The `## 2` section of `markdown`, its heading to the next `## ` outside a fence; throws when absent. */
function specOf(markdown) {
  const lines = markdown.split(/\r?\n/);
  let fenced = false;
  let start = -1;
  let end = lines.length;
  for (let at = 0; at < lines.length; at++) {
    if (/^\s*(```|~~~)/.test(lines[at])) fenced = !fenced;
    if (fenced) continue;
    if (start === -1 && /^## 2(?:[.\s]|$)/.test(lines[at])) start = at;
    else if (start !== -1 && lines[at].startsWith('## ')) {
      end = at;
      break;
    }
  }
  if (start === -1) throw new StepError('artefact: no ## 2 section');
  return lines.slice(start, end).join('\n');
}

/** The fenced block under the brief's `## PR footer`, or '' when there is none. */
function footerOf(brief) {
  const match = /^## PR footer\s*\n+```[^\n]*\n([\s\S]*?)\n```/m.exec(brief.replace(/\r\n/g, '\n'));
  return match ? match[1] : '';
}

/** Line ends and trailing space aside, the same text: GitHub hands a body back with CRLF. */
const sameText = (a, b) => String(a ?? '').replace(/\r\n/g, '\n').trimEnd() === String(b ?? '').replace(/\r\n/g, '\n').trimEnd();

/** Runs a gh call, rethrowing a failure as `gh <group> <verb>: <first line>`. */
function step(gh, args) {
  try {
    return gh(args);
  } catch (err) {
    throw new StepError(`gh ${args[0]} ${args[1]}: ${firstLine(err)}`);
  }
}

/** Runs a git call, rethrowing a failure as `git <verb>: <first line>`. */
function gitStep(git, args) {
  try {
    return git(args);
  } catch (err) {
    throw new StepError(`git ${args[0]}: ${firstLine(err)}`);
  }
}

/** Writes `body` to a file in a fresh private temp dir, hands its path to `use`, and removes the dir. */
function withBodyFile(body, use) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-pr-'));
  try {
    const file = path.join(dir, 'body.md');
    fs.writeFileSync(file, body, { mode: 0o600 });
    return use(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Throws unless the record names a slug and a base `gh` and git may take as argv. */
function checked(record) {
  if (!record || typeof record !== 'object') throw new StepError('record: none');
  if (typeof record.slug !== 'string' || !SLUG.test(record.slug)) throw new StepError(`record: slug ${JSON.stringify(record.slug)} is not a slug`);
  const base = record.base ?? PILOT_BRANCH;
  if (typeof base !== 'string' || !RUN_BASE.test(base)) throw new StepError(`record: base ${JSON.stringify(base)} is not ${PILOT_BRANCH} or feat/<slug>`);
  const artefact = record.artefact ?? `docs/design/${record.slug}/architecture.md`;
  if (typeof artefact !== 'string' || !/^[\w./-]+$/.test(artefact) || artefact.split('/').includes('..')) {
    throw new StepError(`record: artefact ${JSON.stringify(artefact)} is not a repository path`);
  }
  return { slug: record.slug, base, artefact, feature: typeof record.feature === 'string' && record.feature.trim() ? record.feature.trim() : record.slug };
}

/**
 * Makes the feature PR of `record` match it: `{ line, number?, wrote }`, `wrote` one of `created`,
 * `edited`, `none`. `gh` is the host's runner and `git` is `(args) => string` in the repository,
 * both argv only. Throws, naming the step, on a failure.
 */
export function syncFeaturePr({ gh, git, record }) {
  const { slug, base, artefact, feature } = checked(record);
  const head = `feat/${slug}`;

  let runs;
  try {
    runs = runRemote(git);
  } catch (err) {
    throw new StepError(`run remote: ${firstLine(err)}`);
  }
  if (runs !== 'origin') return { line: `no PR: run remote ${runs ?? 'none'}`, wrote: 'none' };

  try {
    git(['ls-remote', '--exit-code', '--heads', 'origin', `refs/heads/${head}`]);
  } catch (err) {
    if (err.status === 2) return { line: `no PR yet: origin has no ${head}`, wrote: 'none' };
    throw new StepError(`git ls-remote: ${firstLine(err)}`);
  }
  gitStep(git, ['fetch', '-q', 'origin', `+refs/heads/${head}:refs/remotes/origin/${head}`]);
  const tip = `refs/remotes/origin/${head}`;
  const spec = specOf(gitStep(git, ['show', `${tip}:${artefact}`]));
  const briefPath = `docs/design/${slug}/brief.md`;
  const hasBrief = gitStep(git, ['ls-tree', '--name-only', tip, '--', briefPath]).trim() !== '';
  const footer = hasBrief ? footerOf(gitStep(git, ['show', `${tip}:${briefPath}`])) : '';
  const body = featureBody(spec, record, footer);

  let open;
  const listed = step(gh, ['pr', 'list', '--head', head, '--state', 'open', '--json', 'number,body,baseRefName', '--limit', '1']);
  try {
    open = JSON.parse(listed);
  } catch {
    throw new StepError('gh pr list: an answer that is not JSON');
  }
  if (!Array.isArray(open)) throw new StepError('gh pr list: an answer that is not a list');

  if (open.length === 0) {
    const out = withBodyFile(body, (file) =>
      step(gh, ['pr', 'create', '--draft', '--base', base, '--head', head, '--title', `feat(${slug}): ${feature}`, '--body-file', file]));
    const number = Number(/\/pull\/(\d+)\s*$/.exec(String(out).trim())?.[1]);
    if (!Number.isInteger(number)) throw new StepError('gh pr create: no PR url in its answer');
    return { line: `feature PR #${number} opened`, number, wrote: 'created' };
  }

  const pr = open[0];
  if (!Number.isInteger(pr?.number) || pr.number < 1) throw new StepError('gh pr list: a PR with no number');
  const flags = pr.baseRefName === base ? [] : ['--base', base];
  const bodyChanged = !sameText(pr.body, body);
  if (!bodyChanged && flags.length === 0) return { line: `feature PR #${pr.number} unchanged`, number: pr.number, wrote: 'none' };
  const edit = ['pr', 'edit', String(pr.number), ...flags];
  if (bodyChanged) withBodyFile(body, (file) => step(gh, [...edit, '--body-file', file]));
  else step(gh, edit);
  return { line: `feature PR #${pr.number} updated`, number: pr.number, wrote: 'edited' };
}

/** The deck's record for `ticket`, read as `pilot ready` reads it; null when the deck has none. */
const deckRecord = (cwd) => async (ticket) => {
  const query = new URLSearchParams({ repo: listeningRepo(cwd), ticket });
  const response = await fetch(`${deckUrl()}/api/record?${query}`, { headers: bearer(), signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) {
    const refusal = await response.json().catch(() => ({}));
    throw new Error(refusal.error ?? `the deck answered ${response.status}`);
  }
  return (await response.json())?.record ?? null;
};

/**
 * `pilot pr --ticket <itm_id>`'s entry point from `bin/pilot.mjs`: prints one line and answers 0
 * when it wrote, skipped or had nothing to do, 1 on any failure.
 */
export async function main(argv, inject = {}) {
  const cwd = process.cwd();
  const say = inject.say ?? ((text) => process.stdout.write(text));
  if (argv.length !== 2 || argv[0] !== '--ticket' || !TICKET.test(argv[1])) {
    say(`${USAGE}\n`);
    return 1;
  }
  const gh = inject.gh ?? hostIn(cwd);
  const git = inject.git ?? ((args) => gitAt(cwd, ...args));
  const readRecord = inject.readRecord ?? deckRecord(cwd);
  try {
    let record;
    try {
      record = await readRecord(argv[1]);
    } catch (err) {
      throw new StepError(`record: ${firstLine(err)}`);
    }
    if (!record) throw new StepError(`record: ticket ${argv[1]} has none`);
    say(`${syncFeaturePr({ gh, git, record }).line}\n`);
    return 0;
  } catch (err) {
    say(`${err instanceof StepError ? err.message : `pilot pr: ${firstLine(err)}`}\n`);
    return 1;
  }
}
