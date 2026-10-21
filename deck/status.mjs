/**
 * What a slice table is, and where the `Yours` column comes from.
 *
 * This is the deck's second vocabulary module, beside `deck/items.mjs`: it
 * reads no file, opens no socket and emits no HTML, so the store (which decides
 * what may be written down) and `ui/render.mjs` (which decides what a browser
 * sees) can both depend on it without depending on each other.
 *
 * A run's table is `Slice | State | Yours`, and only two of those three columns
 * are written by anybody. `slice` names the slice and `state` is free text the
 * pilot types — "PR #16 at 91cbb89, draft, walkthrough on
 * http://localhost:3260/jobs" — and `deck_status` replaces the whole table at
 * once, because a pilot that has just re-read its own artefact knows the state
 * of every slice and not just the one that moved. A row may carry two more
 * things, neither of them a column: `after` names the rows this one comes after,
 * and `graphOf` below is where they are read; `delivers` is accepted from an
 * older pilot and discarded (A2).
 *
 * `Yours` is the third column and nobody writes it. It is a join: the run's
 * repository and the row's slice against the items posted from that repository
 * and attached to that slice, of which the newest open one
 * of a kind the deck knows (A11) is the user's next action. That is the whole
 * point of L4 — the status table and the queue are one view — and it is why a
 * row carrying a `yours` of its own is refused rather than stored. A typed
 * `Yours` would go stale the moment the pilot resolved the thread, and the user
 * would be told to do something the deck knows is already done.
 *
 * Retention (L14, locked by the user on 2026-09-14). The deck keeps every item
 * for ever: nothing is capped, nothing is archived to a second file, nothing is
 * discarded. What keeps the home screen from growing with the history is that
 * it renders the queue — `queueOf` below — and links to everything else at
 * `/items`. If that is ever revisited, this is the one block to read: a cap
 * would go in `store.postItem`, and the page would not have to change.
 */

import { KIND_USER, MAX_SLICE_CHARS, appearsInYours, isBehind, isQueued, newestSaidFirst, repoKey } from './items.mjs';

/**
 * What a slice may be called, in characters. The number lives in `items.mjs`
 * because an item names a slice too and the two are joined on; it is re-exported
 * here because a cell of this table is where it is read.
 */
export { MAX_SLICE_CHARS };

/**
 * The most slices one run's table may hold. A feature cut into more than this
 * many slices has been cut too thin to read at a glance, which is the only
 * thing the home screen is for.
 */
export const MAX_SLICES = 32;

/** The bound that keeps a cell a cell rather than a paragraph in a table. */
export const MAX_STATE_CHARS = 400;

/**
 * What a row may carry. Everything else is a mistake worth saying out loud.
 * `branch`, `worktree` and `pr` are where the slice's work is, for the run
 * record a fresh session is handed (L5 of run-record); the page does not draw them.
 */
const ROW_FIELDS = ['slice', 'state', 'after', 'branch', 'worktree', 'pr'];

/** Refusal of a table that is not one. Its own class so the store can rewrap it. */
export class SliceRefusal extends Error {
  constructor(message) {
    super(message);
    this.name = 'SliceRefusal';
  }
}

/**
 * How a row and an item agree that they are about the same slice. The pilot
 * writes the slice name twice — once in its status table, once on the item it
 * posts — and typing "4 Status Table" one time and "4 status table" the other
 * is not a different slice.
 */
const sliceKey = (name) => String(name ?? '').trim().toLowerCase();

/**
 * What a row and an item are joined on, or null when one of them cannot be.
 *
 * Both halves matter. The slice is matched the way `sliceKey` matches it,
 * because the pilot types it twice. The repository is matched because a slice
 * name is not unique to a feature — "4 status table" is the same four words in
 * every repository on this machine — and a join on the name alone would put one
 * repository's sign-off in the `Yours` of every other repository's table.
 *
 * It is keyed on the repository and not on the run id, deliberately. Items are
 * kept for ever (L14) and runs are not: keying on the run would empty the column
 * the moment that session closed, and would hide the item from a second session
 * opened on the same feature. Two sessions in one repository are looking at one
 * piece of work, and they share the column.
 *
 * The repository is keyed with `repoKey`, the deck's one spelling of "the same
 * directory" (L13), so `Yours` joins exactly the items `sameRepo` says are
 * this repository's: case folds on Windows only.
 */
const NOT_IN_EITHER_HALF = '\u0000';

function joinKey(repo, slice) {
  const where = typeof repo === 'string' && repo.trim() !== '' ? repoKey(repo.trim()) : '';
  const what = sliceKey(slice);
  return where === '' || what === '' ? null : `${where}${NOT_IN_EITHER_HALF}${what}`;
}

function requireCell(field, value, most) {
  if (typeof value !== 'string') throw new SliceRefusal(`${field} must be a string`);
  const text = value.trim();
  if (text.length > most) {
    throw new SliceRefusal(
      `that ${field} is longer than a cell of the deck's table (${most} characters). ` +
        'The status table is read at a glance; post the detail as an item.',
    );
  }
  return text;
}

/**
 * `requireCell`, refused a second time when what came back is empty. `blank`
 * is the refusal for that second case; `state` never calls this, because an
 * empty state is a slice nobody has started rather than a mistake (D8's kin).
 */
function requireNonEmptyCell(field, value, most, blank) {
  const text = requireCell(field, value, most);
  if (text === '') throw new SliceRefusal(blank);
  return text;
}

/**
 * The rows a slice comes after, trimmed: a non-empty list of names, none blank
 * (one named twice is `requireGraph`'s to refuse). A string is one name. Never
 * longer than a table can be, so the list is bounded where the schema is not.
 */
function requireBlockers(slice, after) {
  const names = typeof after === 'string' ? [after] : after;
  const says = `${slice}: after names the rows it comes after, as a list of S<n> or names. ` +
    'Leave it out for a slice that comes first.';
  if (!Array.isArray(names) || names.length === 0 || names.length > MAX_SLICES) throw new SliceRefusal(says);
  // `Array.from` rather than `map`, which steps over a hole and keeps it.
  return Array.from(names, (name) => requireNonEmptyCell(`after of ${slice}`, name, MAX_SLICE_CHARS, says));
}

function requireRow(row) {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) {
    throw new SliceRefusal('each row must be a slice and the state it is in');
  }
  for (const name of Object.keys(row)) {
    if (name === 'yours') {
      throw new SliceRefusal(
        'a slice row takes no yours: the deck renders that column from the slice\'s open item. ' +
          'Post the item with deck_post and give it this slice.',
      );
    }
    if (name === 'delivers') continue; // accepted from an older pilot and discarded (A2)
    if (!ROW_FIELDS.includes(name)) {
      const takes = `${ROW_FIELDS.slice(0, -1).join(', ')} and ${ROW_FIELDS.at(-1)}`;
      throw new SliceRefusal(`a slice row takes no ${name}. It takes ${takes}.`);
    }
  }

  const slice = requireNonEmptyCell(
    'slice',
    row.slice,
    MAX_SLICE_CHARS,
    'slice must name the slice this row is about',
  );
  const cells = {
    slice,
    state: row.state === undefined ? '' : requireCell('state', row.state, MAX_STATE_CHARS),
  };

  // A row that comes first carries no `after` at all, rather than an empty one:
  // the field stays absent from `deck.json` for every root-level row (D1, D8).
  // An `after` that was sent but says nothing is the pilot meaning something it
  // did not type, so it is refused here rather than read as coming first. A
  // string is a row 0.7.20 wrote, and is stored as the list it means (L5).
  // `delivers` is not read at all (A2).
  if (row.after !== undefined) cells.after = requireBlockers(slice, row.after);

  // Where the slice's work lives. Absent until the slice has one, and a blank
  // one is refused for `after`'s reason: sent but saying nothing.
  for (const field of ['branch', 'worktree']) {
    if (row[field] === undefined) continue;
    cells[field] = requireNonEmptyCell(
      field,
      row[field],
      MAX_STATE_CHARS,
      `${slice}: ${field} says nothing; leave it out until the slice has one.`,
    );
  }
  if (row.pr !== undefined) {
    if (!Number.isInteger(row.pr) || row.pr <= 0) {
      throw new SliceRefusal(`${slice}: pr must be the pull request's number, not ${JSON.stringify(row.pr)}`);
    }
    cells.pr = row.pr;
  }
  return cells;
}

/**
 * That every row's `after` entries name rows of the same table, by full name or
 * by identifier (L4), that no two rows share an identifier, and that following
 * blockers from any row never arrives back at it.
 *
 * The refusals are this module's rather than the renderer's (D2): this is the
 * only place that sees the whole call, and a bad `after` drawn quietly as a
 * first slice would have the deck draw a design that is not the design, the one
 * thing a picture of the plan must never do. The walk is depth first over at
 * most `MAX_SLICES` rows, each finished once.
 */
function requireGraph(table) {
  const byId = new Map();
  for (const row of table) {
    const id = identifierOf(row.slice);
    if (id === null) continue;
    const other = byId.get(sliceKey(id));
    if (other !== undefined) {
      throw new SliceRefusal(`${other.slice} and ${row.slice} are both ${id}; one identifier is one slice.`);
    }
    byId.set(sliceKey(id), row);
  }

  const resolve = resolverOf(table);
  const done = new Set();
  const visit = (row, path) => {
    if (done.has(row)) return;
    const at = path.indexOf(row);
    if (at >= 0) {
      const cycle = [...path.slice(at), row].map((link) => link.slice);
      throw new SliceRefusal(
        `${cycle.join(' comes after ')}; that chain closes on itself, so this table has no graph. ` +
          'One of those rows comes first: drop its after.',
      );
    }
    path.push(row);
    const named = new Set();
    for (const entry of blockersOf(row)) {
      const next = resolve(entry);
      if (next === undefined) {
        throw new SliceRefusal(
          `${row.slice} comes after ${entry}, which no row of this table names. ` +
            'after names other slices of this table, by S<n> or as that row spells it.',
        );
      }
      if (named.has(next)) throw new SliceRefusal(`${row.slice} comes after ${next.slice} twice; name it once.`);
      named.add(next);
      visit(next, path);
    }
    path.pop();
    done.add(row);
  };
  for (const row of table) visit(row, []);
}

/**
 * One run's table, validated. An empty list is a run clearing its own rows,
 * which is the only way a row ever leaves: `deck_status` replaces wholesale.
 *
 * The rows are read first and their blockers second, because `after` may name a
 * row the call has not listed yet: the artefact's order is the pilot's, and a
 * slice that blocks another is not always written above it.
 */
export function newSliceTable(slices) {
  if (!Array.isArray(slices)) {
    throw new SliceRefusal('slices must be this run\'s whole table, as a list of rows');
  }
  if (slices.length > MAX_SLICES) {
    throw new SliceRefusal(`the deck shows at most ${MAX_SLICES} slices on one table`);
  }

  const named = new Set();
  const table = slices.map((row) => {
    const cells = requireRow(row);
    const key = sliceKey(cells.slice);
    if (named.has(key)) {
      throw new SliceRefusal(`the table names ${cells.slice} twice; one row is one slice`);
    }
    named.add(key);
    return cells;
  });

  requireGraph(table);
  return table;
}

/**
 * A call's rows laid over the table already stored (independence spec 22.2), so a
 * status call names only the rows that moved. A row matched by `sliceKey` takes the
 * cells the call sent and keeps the rest (`after` can be changed but never blanked, so
 * clearing one is a drop and a later re-add); an unmatched row is appended; `{ slice, drop: true }` is how a row leaves.
 * A full table therefore still lands as sent. The result is validated as a whole, so
 * a drop that strands another row's `after` is refused, and a stored string `after` or
 * `delivers` comes back as a list or not at all (L5, A2).
 */
export function mergeSliceTable(stored, rows) {
  if (!Array.isArray(rows)) throw new SliceRefusal('slices must be a list of rows');
  const table = Array.isArray(stored) ? [...stored] : [];
  const named = new Set();
  for (const row of rows) {
    const key = sliceKey(row?.slice);
    if (key !== '' && named.has(key)) throw new SliceRefusal(`the call names ${row.slice} twice; one row is one slice`);
    named.add(key);
    const at = table.findIndex((old) => sliceKey(old.slice) === key);
    if (row !== null && typeof row === 'object' && 'drop' in row) {
      if (row.drop !== true || Object.keys(row).length !== 2 || key === '') {
        throw new SliceRefusal('a row that leaves is { slice, drop: true } and nothing else');
      }
      if (at >= 0) table.splice(at, 1);
      continue;
    }
    const cells = requireRow(row);
    if (at < 0) {
      table.push(cells);
      continue;
    }
    const merged = { ...table[at] };
    for (const field of Object.keys(row)) {
      if (field in cells) merged[field] = cells[field];
      else delete merged[field];
    }
    table[at] = merged;
  }
  return newSliceTable(table);
}

/**
 * A row's blockers as a list (L5's read half): a row written before `after`
 * was a list carries one name as a string, and a row that comes first none.
 */
export function blockersOf(row) {
  return row?.after == null ? [] : [].concat(row.after);
}

/**
 * How an `after` entry finds its row (L4), on write and on read alike: by full
 * name, else by identifier, ignoring case either way.
 */
export function resolverOf(table) {
  const byKey = new Map(table.map((row) => [sliceKey(row.slice), row]));
  const byId = new Map();
  for (const row of table) {
    const id = identifierOf(row.slice);
    if (id !== null && !byId.has(sliceKey(id))) byId.set(sliceKey(id), row);
  }
  return (entry) => byKey.get(sliceKey(entry)) ?? byId.get(sliceKey(entry));
}

/** The leading `S<n>` of a slice name, the only text the graph draws (spec 6). */
export function identifierOf(name) {
  return /^S\d+\b/.exec(String(name ?? '').trim())?.[0] ?? null;
}

/**
 * The run as a git graph (L1–L3), computed from the flat rows at render time
 * and never stored. Only rows with an identifier are dots (L7); an `after`
 * entry names a row as `resolverOf` finds it (L4), a row with no dot stands for
 * its own blockers so the dependency is still drawn (A7), and an entry that
 * names nothing is ignored here, because refusing it is the write path's job.
 *
 * Rows are laid out in topological order, table order among the ready, and a
 * blocker reachable through another blocker is dropped (L3). Then lanes are
 * given the way `git log --graph` gives them (L2): a dot takes the leftmost
 * lane whose open edge targets it, or the first free lane; its first child
 * keeps that lane and each other child opens the first free one; a dot nothing
 * comes after keeps its lane open to the end point, row `dots.length`, lane 0.
 */
export function graphOf(slices) {
  const table = Array.isArray(slices) ? slices : [];
  const rows = table.filter((row) => identifierOf(row.slice) !== null);
  const resolve = resolverOf(table);
  const dotsBefore = (row) =>
    blockersOf(row).flatMap((entry) => {
      const to = resolve(entry);
      if (to === undefined) return [];
      return identifierOf(to.slice) === null ? dotsBefore(to) : [rows.indexOf(to)];
    });
  const blockers = rows.map((row, at) => [...new Set(dotsBefore(row))].filter((to) => to !== at));

  // Topological order, table order among the ready. The write path refuses a
  // cycle; one in a hand-edited record leaves its rows undrawn rather than the page.
  const order = [];
  const placed = new Set();
  while (order.length < rows.length) {
    const next = rows.findIndex((_, at) => !placed.has(at) && blockers[at].every((from) => placed.has(from)));
    if (next === -1) break;
    order.push(next);
    placed.add(next);
  }

  // Everything above each row, then its blockers less any reachable through another.
  const above = new Map();
  for (const at of order) above.set(at, new Set(blockers[at].flatMap((from) => [from, ...above.get(from)])));
  const reduced = rows.map((_, at) =>
    blockers[at].filter((from) => !blockers[at].some((other) => other !== from && above.get(other).has(from))),
  );

  const rowOf = new Map(order.map((at, row) => [at, row]));
  const children = order.map(() => []);
  for (const at of order) for (const from of reduced[at]) children[rowOf.get(from)].push(rowOf.get(at));

  const end = order.length;
  const open = []; // open[lane] = the row the edge running down it ends in, or null when free
  const freeLane = () => {
    const lane = open.indexOf(null);
    return lane === -1 ? open.length : lane;
  };
  const dots = [];
  const edges = [];
  order.forEach((at, row) => {
    const incoming = open.flatMap((target, lane) => (target === row ? [lane] : []));
    const lane = incoming.length ? incoming[0] : freeLane();
    for (const ended of incoming) open[ended] = null;
    const name = rows[at].slice;
    dots.push({ id: identifierOf(name), name, phase: phaseOf(rows[at].state), row, lane });

    const [first, ...others] = children[row].length ? children[row] : [end];
    open[lane] = first;
    edges.push({ from: row, to: first, lane });
    for (const to of others) {
      const opened = freeLane();
      open[opened] = to;
      edges.push({ from: row, to, lane: opened });
    }
  });
  return { lanes: open.length, dots, edges };
}

/**
 * The three phases a slice can be in, by the first word the pilot typed. The
 * words are the pilot's vocabulary and live here beside the rest of it;
 * the glyph each phase is drawn as is `ui/render.mjs`'s, because this module
 * emits no HTML by construction (D4).
 */
const PHASES = new Map([
  ['planned', 'planned'],
  ['implementing', 'doing'],
  ['draft', 'doing'],
  ['in', 'doing'],
  ['fixing', 'doing'],
  ['integrated', 'done'],
  ['ready', 'done'],
  ['merged', 'done'],
]);

/**
 * Which phase a state is in, or null when its first word is not one of those.
 * The state is free text, so "blocked on CI" is given no phase at all rather
 * than the nearest-looking one: a wrong marker on a tree is worse than none.
 * Only the leading letters are read, so "draft, walkthrough on …" is a draft.
 */
export function phaseOf(state) {
  const [word = ''] = /^[a-z]+/.exec(String(state ?? '').trim().toLowerCase()) ?? [];
  return PHASES.get(word) ?? null;
}

/**
 * Every item that could be somebody's `Yours`, indexed by what it is joined on.
 * Built once for the page rather than scanned once per row of every run's table,
 * so a deck holding a long history costs the home screen one pass and not one
 * pass per row.
 */
export function yoursIndex(items) {
  const index = new Map();
  // Items are oldest first, so the last write wins and the newest one is kept.
  for (const item of items ?? []) {
    const key = appearsInYours(item) ? joinKey(item.repo, item.slice) : null;
    if (key !== null) index.set(key, item);
  }
  return index;
}

/**
 * The item this row's `Yours` is rendered from, or null when nothing is waiting
 * on the user for this slice. The newest one wins: a slice whose walkthrough is
 * still open when the sign-off arrives is asking for the sign-off now.
 */
export function yoursFor(run, row, index) {
  const key = joinKey(run?.repo, row?.slice);
  return (key === null ? null : index.get(key)) ?? null;
}

/**
 * The queue: what is open, whichever slice it belongs to and whether it belongs
 * to one at all. A question the pilot asked before any slice existed is still
 * waiting on the user, and the home screen is the only inbox there is. A chat is
 * open and never waiting, so it is never in the queue (L6). A user thread is,
 * below every item that waits on the user's answer (2026-09-28); each group is
 * newest message first (L13), the order the overview draws and the thread arrows
 * walk. A tab's queue is this one narrowed (`tabsOf`). The Tickets queue is not
 * this one; it keeps deck order, the order its arrows set.
 */
export const queueOf = (items) =>
  items
    .filter(isQueued)
    .sort((a, b) => (a.kind === KIND_USER) - (b.kind === KIND_USER) || newestSaidFirst(a, b));

/**
 * The shown queue (overview-one-ticket L3, L4; ADR 0065): a queue, the deck's or a tab's, less
 * what waits behind its repository's ticket in hand. What the overview and a tab list, the
 * thread arrows walk and the strip counts; `queueOf` itself stays whole for the Stop hook and `/items`.
 */
export const shownOf = (queue, items) => queue.filter((item) => !isBehind(item, items));
