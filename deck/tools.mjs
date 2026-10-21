/**
 * The deck's vocabulary: where the deck lives, and the three tools a session may call.
 *
 * This file exists so that `deck/client.mjs` can advertise the tools and address the
 * deck without importing `deck/server.mjs`, which loads `deck/store.mjs`. L3 says the
 * daemon is the only writer, and that is a property of what the stdio client's module
 * graph *cannot reach* rather than of what it chooses not to call — so the constants and
 * the schemas both halves need live here, below both of them. `deck/server.mjs`
 * re-exports every name in this file, so nothing that already imports them from there
 * has to move.
 *
 * What it does import is the two vocabularies below it — `deck/items.mjs` and
 * `deck/status.mjs` — which read no file and open no socket, so the client's module
 * graph still cannot reach the store, and the prose in a schema below is derived from
 * the same spec table the store validates against rather than written out a second
 * time. `deck/runs.mjs` is the other way round: it is on the daemon's side of the
 * boundary, so a bound both halves need is declared here and read from there.
 */

import { KINDS, MAX_OPTIONS, MAX_SCREENS, PASS_KINDS, POSTABLE_KINDS, extraFieldsFor } from './items.mjs';
import { MAX_SLICES, MAX_SLICE_CHARS, MAX_STATE_CHARS } from './status.mjs';
import { MAX_WALKTHROUGH_BODY_LINES } from './walkthrough-shape.mjs';

/** The kinds the deck renders specially, and the thread types `deck_post` accepts. Both live in `items.mjs`. */
export { KINDS, POSTABLE_KINDS };

export const andList = (words) =>
  words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words.at(-1)}` : words.join('');

/**
 * Which kinds carry a field, named the way a schema's prose names them. Derived from the
 * spec table rather than written here, so a kind that gains or loses a field cannot leave
 * a description behind still telling the agent the old answer.
 */
const kindsWith = (field) => andList(POSTABLE_KINDS.filter((kind) => extraFieldsFor(kind).includes(field)));

export const DECK_HOST = '127.0.0.1';

/** A4: fixed, so the README, the statusline and the page can all name one URL. */
export const DECK_PORT = 4321;

/**
 * The port the deck actually uses. `PILOT_DECK_PORT` exists because `PILOT_DECK_DIR`
 * isolates the store but not the port: two worktrees on this machine collided on 4321
 * in the wild, and a test or a hand check needs to be able to stand a deck up without
 * taking the real one down. The default never moves, and nothing else in the package
 * assumes anything but 4321.
 */
export function deckPort() {
  const override = process.env.PILOT_DECK_PORT;
  if (override === undefined || override.trim() === '') return DECK_PORT;

  const port = Number(override);
  if (!Number.isInteger(port) || port <= 0 || port >= 65536) {
    // A4 says a collision is reported and never silently moved, and a mistyped override
    // is that same failure wearing a different hat: falling back to 4321 would put this
    // session on the live deck the override existed to keep it off.
    throw new Error(
      `PILOT_DECK_PORT is ${JSON.stringify(override)}, which is not a port. Unset it, or ` +
        'set it to a whole number between 1 and 65535; the deck will not quietly serve ' +
        `${DECK_PORT} instead.`,
    );
  }
  return port;
}

export function deckUrl() {
  return `http://${DECK_HOST}:${deckPort()}`;
}

/** The most items one `deck_read` serialises into an agent's context. */
export const MAX_READ_ITEMS = 20;
export const MAX_READ_LIMIT = 100;

/**
 * How long one *request* may park. Comfortably inside `fetch`'s own 300s ceiling, which
 * is why it is measured in minutes and why the daemon refuses anything longer: a socket
 * held open for hours is a socket that dies quietly somewhere in the middle.
 */
export const MAX_POLL_MS = 120_000;

/**
 * How long one `deck_wait` may wait, which is a different question and used to be the
 * same one. A human answers on their own clock — on 2026-09-16 a reply arrived fourteen
 * minutes after the question, long past any cap a single request could carry — so
 * `deck/client.mjs` makes poll after poll under `MAX_POLL_MS` until this deadline, and
 * one tool call is one wait however many requests it took.
 *
 * Fifty-five minutes (independence spec 19, 20): a wait that comes back inside the
 * one-hour prompt-cache lifetime re-parks on a cache read rather than a write. A
 * longer `timeout` is clamped to it rather than refused (`waitWindowMs`).
 */
export const MAX_WAIT_MS = 55 * 60 * 1000;
export const DEFAULT_WAIT_MS = 55_000;

/**
 * The longest name the pilot may give its run. A tab is read at a glance in a strip
 * that holds every run on the machine, so a name is a feature's name and not a
 * sentence about it; forty characters is the width at which two or three tabs still
 * fit beside the Overview.
 *
 * It is declared here rather than in `deck/runs.mjs`, which validates against it (D9 of run-tabs),
 * because both halves need it and `runs.mjs` is on the daemon's side of the boundary
 * L3 draws: the schema below has to carry the bound, and the stdio client's module
 * graph may not reach a module the daemon writes through. `runs.mjs` re-exports it, so
 * the module that owns what a run is called is still where it is read.
 */
export const MAX_FEATURE_CHARS = 40;

/**
 * The run record's bounds (L5 of run-record), declared here for `MAX_FEATURE_CHARS`'s
 * reason: the schema carries them and `deck/runs.mjs`, which validates, imports them.
 * A slug names `docs/design/<slug>/`, so it is a path segment no longer than a name.
 */
export const MAX_SLUG_CHARS = 40;
export const MAX_FINDINGS = 40;

/**
 * The longest body a question may have (L7): one screen, read and answered at a
 * glance. Declared here so the schema can name it; `deck/store.mjs` refuses past it.
 */
export const MAX_QUESTION_CHARS = 1200;

/**
 * Who wrote the message. Declared because Claude Code validates a PreToolUse hook's
 * `updatedInput` against the schema, and `hooks/deck-author.js` writes this on every
 * call it stamps, over whatever the agent put here (L1, L2, ADR 0027). On a read or a
 * wait it names the owner kind that is asking (ADR 0041).
 */
const AUTHOR = { type: 'string', description: 'set by the plugin' };

/**
 * Every word below is paid on every turn of every agent granted the tool (spec 9 of
 * independence), so a description says what the call does and what it refuses, and
 * leaves the rest to the refusal the daemon gives.
 */
export const TOOLS = [
  {
    name: 'deck_post',
    description:
      'Post one item for the human. gate1 needs artefact, sha, locked, slices, sliceCount, branch, ticket; gate2 pr, sha, ' +
      'walkthrough if any. Refused: a signoff or gate1 ' +
      "over an open question here, a gate2 while its ticket's blocking one is; a ticket off ticket-making's shape. Never post a credential.",
    inputSchema: {
      type: 'object',
      properties: {
        kind: { enum: POSTABLE_KINDS, description: 'the thread type' },
        title: { type: 'string', description: 'one line' },
        author: AUTHOR,
        body: {
          type: 'string',
          description: `the ask and your default; a question's at most ${MAX_QUESTION_CHARS} chars; a ticketed report may omit it`,
        },
        slice: {
          type: 'string',
          description: 'the deck_status row it is about',
        },
        options: {
          type: 'array',
          items: { type: 'string' },
          maxItems: MAX_OPTIONS,
          description: `${kindsWith('options')} only: one-click answers`,
        },
        recommended: { type: 'string' },
        blocking: { type: 'boolean' },
        // A ticket-making question, taught by ticket-making: it holds no gate (yellow-lane L4).
        proposal: { const: true },
        url: {
          type: 'string',
          description: `${kindsWith('url')} only: any locator`,
        },
        login: {
          type: 'string',
          description: `${kindsWith('login')} only: how to reach it; name where a credential is, never its value`,
        },
        screens: {
          type: 'array',
          items: { type: 'string' },
          maxItems: MAX_SCREENS,
          description: `${kindsWith('screens')} only: one step per action, in order`,
        },
        longer: { type: 'string', description: `${kindsWith('longer')} only: why its body needs over ${MAX_WALKTHROUGH_BODY_LINES} lines` },
        dir: { type: 'string', description: `${kindsWith('dir')} only: absolute; steps' cwd or a ticket's worktree` },
        ticket: { type: 'string', description: `${kindsWith('ticket')} only: the ticket id` },
        artefact: { type: 'string' },
        locked: { type: 'integer', minimum: 0 },
        slices: { type: 'string' },
        sliceCount: { type: 'integer', minimum: 0, description: `${kindsWith('sliceCount')} only: its size in slices` },
        surface: { type: 'boolean', description: `${kindsWith('surface')} only` },
        branch: { type: 'string' },
        pr: { type: 'string' },
        sha: { type: 'string' },
        walkthrough: { type: 'string' },
      },
      // title and body are the store's to refuse (requireText): a report with a ticket comes without them (lander-tail spec 1).
      required: ['kind'],
      additionalProperties: false,
    },
  },
  {
    name: 'deck_read',
    description:
      `Newest ${MAX_READ_ITEMS} items with the human's replies, or one by id.`,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        // L2: brief is paid for by the limit and open descriptions, the default moving into the line above.
        brief: { type: 'boolean', description: 'one line per item' },
        limit: { type: 'integer', minimum: 1, maximum: MAX_READ_LIMIT },
        open: { type: 'boolean' },
        repo: {
          type: 'string',
          description: "another repo's absolute path",
        },
        author: AUTHOR,
        // session-row L9: validated in the daemon; the default (whole under 5, else last 5) is read.mjs's.
        messages: { type: ['integer', 'string'], description: 'last N, first -N, or "all"' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'deck_reply',
    description:
      'Reply on a thread you own; the human sees it at once.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'the id deck_post returned' },
        text: { type: 'string', description: 'your words' },
        to: { enum: PASS_KINDS, description: 'pass the thread to' },
        promise: { const: true },
        author: AUTHOR,
      },
      required: ['id', 'text'],
      additionalProperties: false,
    },
  },
  {
    name: 'deck_resolve',
    description:
      'Close a thread with what was decided; a reply is not agreement. ' +
      'Never a chat or a thread the user opened: answer those with deck_reply.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'the id deck_post returned' },
        resolution: { type: 'string', description: 'what was decided, in a line or two' },
        author: AUTHOR,
      },
      required: ['id', 'resolution'],
      additionalProperties: false,
    },
  },
  {
    name: 'deck_status',
    description:
      "Update this run's slice table and run record. Send only the rows that changed: a row " +
      'matched by slice takes the cells sent, a new one is appended, { slice, drop: true } ' +
      "removes one. Yours is rendered from the slice's open item, so attach items with " +
      "deck_post's slice. after draws the graph. Name feature on the first call. A " +
      'record field left out keeps its value. Name worktree once and the deck writes ' +
      'docs/design/<slug>/run.json there on every call; pilot integrate commits it. Answers in one line.',
    inputSchema: {
      type: 'object',
      properties: {
        feature: {
          type: 'string',
          maxLength: MAX_FEATURE_CHARS,
          description: "what this run builds, as your artefact words it: your tab's name. Kept once sent; never sent, the tab is your directory",
        },
        slug: {
          type: 'string',
          maxLength: MAX_SLUG_CHARS,
          description: "the feature's slug, kebab-case; it keys the run record",
        },
        ticket: { type: 'string', description: 'its ticket id' },
        author: AUTHOR,
        branch: { type: 'string', maxLength: MAX_STATE_CHARS, description: 'feat/<slug>' },
        worktree: {
          type: 'string',
          maxLength: MAX_STATE_CHARS,
          description: "the feat/<slug> worktree's absolute path; run.json is written there",
        },
        qa: { type: 'object', description: "QA's {branch, worktree, url}" },
        artefact: {
          type: 'string',
          maxLength: MAX_STATE_CHARS,
          description: "the architecture artefact's path",
        },
        findings: {
          type: 'array',
          maxItems: MAX_FINDINGS,
          items: { type: 'string', maxLength: MAX_STATE_CHARS },
          description: 'each decided principles finding, one line, starting "kept: " or "dropped: "',
        },
        friction: {
          type: 'array',
          maxItems: MAX_FINDINGS,
          items: { type: 'object' },
          description: 'rows appended to the record, newest 40 kept: {agent, what, evidence, size?} or {kind: "drain", what, size}',
        },
        report: {
          type: 'object',
          description:
            'its data, with finished: featurePr {number, state, mergeSha?}, slices [{slice, pr, mergeSha}], ' +
            'assumed [{id: A<n>, decision, taken}], humanSteps [], worktreesLeft []; ' +
            "never friction, which the deck ranks from the record's rows",
        },
        next: { type: 'string', maxLength: MAX_STATE_CHARS, description: 'the next move, one line' },
        finished: {
          type: 'string',
          maxLength: MAX_STATE_CHARS,
          description: '"closing report posted" or "abandoned by the user"; deck_wait then stops',
        },
        slices: {
          type: 'array',
          maxItems: MAX_SLICES,
          items: {
            type: 'object',
            properties: {
              slice: {
                type: 'string',
                maxLength: MAX_SLICE_CHARS,
                description: 'named as the artefact names it',
              },
              state: {
                type: 'string',
                maxLength: MAX_STATE_CHARS,
                description: 'where it stands; a URL is a link',
              },
              after: {
                type: 'array',
                items: { type: 'string', maxLength: MAX_SLICE_CHARS },
                description: 'the rows it comes after, by S<n> or name; omit for a first slice',
              },
              branch: { type: 'string', maxLength: MAX_STATE_CHARS },
              worktree: { type: 'string', maxLength: MAX_STATE_CHARS },
              pr: { type: 'integer', minimum: 1 },
              drop: { type: 'boolean', description: 'true, with slice alone, removes the row' },
            },
            required: ['slice'],
            additionalProperties: false,
          },
        },
      },
      required: ['slices', 'slug'],
      additionalProperties: false,
    },
  },
  {
    name: 'deck_ticket',
    description: 'need: user needed; pivot: back to yellow',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        action: { enum: ['up', 'down', 'take', 'park', 'merge', 'need', 'pivot', 'co-pilot', 'release', 'verdicts'] },
        verdicts: { type: 'string' },
        author: AUTHOR,
      },
      required: ['id', 'action'],
      additionalProperties: false,
    },
  },
  {
    name: 'deck_wait',
    description:
      "Wait for the human's replies to your run's items, or a mode change; returns on one, or empty " +
      'at the timeout, at most 55 minutes. Park again on empty; ' +
      'never poll in a loop. Never end your turn with an item of yours unanswered. ' +
      '"stop listening: <reason>" means post one chat line and end.',
    inputSchema: {
      type: 'object',
      properties: {
        timeout: {
          type: 'integer',
          minimum: 1,
          description: `milliseconds before giving up (default ${DEFAULT_WAIT_MS})`,
        },
        repo: {
          type: 'string',
          description: "another repository's absolute path",
        },
        untaken: { type: 'boolean' },
        item: { type: 'string' },
        author: AUTHOR,
      },
      additionalProperties: false,
    },
  },
];
