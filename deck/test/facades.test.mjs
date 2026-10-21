/**
 * Feature audit-f1-f7, spec 13 (L9, L14, ADR 0113): the deck files over 800 lines
 * are split into flat siblings, and each old path stays a facade.
 *
 * The facade's export names are the list taken at the base, so every import of the old
 * path keeps resolving; and no deck source file is over the bar, so a split did not
 * just move the problem next door.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const DECK = path.resolve(import.meta.dirname, '..');
const BAR = 800;

/** The facade names at the base of each split, sorted. */
const FACADES = {
  'server.mjs': [
    'DECK_HOST', 'DECK_PORT', 'DEFAULT_WAIT_MS', 'KINDS', 'MAX_POLL_MS', 'MAX_READ_ITEMS', 'MAX_WAIT_MS',
    'TOOLS', 'browserCount', 'callTool', 'createDeckHttpServer', 'deckPort', 'deckUrl', 'waiterCount',
  ],
  'items.mjs': [
    'ASSUME_DEFAULT', 'AUTHOR_KINDS', 'CLOSABLE_KINDS', 'CLOSED', 'CLOSED_BY_USER', 'CLOSED_WITH',
    'DISMISSED_BY_USER', 'GATED_KINDS', 'HANDOFF_ACK_MS', 'HANDOFF_FAILED', 'HELPER_KINDS', 'KINDS', 'KIND_AUDIT',
    'KIND_CHAT', 'KIND_CREW_HANDOFF', 'KIND_GATE1', 'KIND_GATE2', 'KIND_HANDOFF', 'KIND_LESSON', 'KIND_QUESTION',
    'KIND_REPORT', 'KIND_SIGNOFF', 'KIND_TICKET', 'KIND_USER', 'KIND_WALKTHROUGH', 'LANE_STATES', 'MAX_OPTIONS', 'MAX_SCREENS',
    'MAX_SLICE_CHARS', 'NOTE_SEPARATOR', 'NOT_YET', 'OWNER_ANSWER_MS', 'OWNER_KINDS', 'OWNER_PICK_UP_MS',
    'PASS_KINDS', 'POSTABLE_KINDS', 'RECORD_KINDS', 'REOPENED', 'SIGN_OFF', 'SILENT_KINDS', 'STANDING_KINDS', 'TEACH_ME',
    'TICKET_STATES', 'accentOf', 'appearsInYours', 'askFor', 'authorKind', 'buttonsFor', 'chosenOf', 'coPilotStateOf', 'extraFieldsFor',
    'gate2Blockers', 'handsTo', 'holdsGates', 'inHandOf', 'isAnswered', 'isBehind', 'isBlocking', 'isChainHandoff', 'isGate', 'isKnownKind', 'isLanding', 'isOpen', 'isPaused',
    'isQueued', 'isRecord', 'isShortPath', 'isStanding', 'isUnacknowledged', 'laneOfState', 'lastSaid', 'lastSaidAt', 'livePhaseOf', 'liveTicketOf',
    'mergeDecisionOf', 'messagesOf', 'newestSaidFirst', 'nextTicketOf', 'noteFor', 'noticesOf',
    'openQuestionsOf', 'ownerOf', 'pausedOn', 'pilotWrites', 'replyPrompt', 'repoKey', 'sameRepo', 'specFor', 'standingOf',
    'stateOf', 'stepParts', 'switchOf', 'threadState', 'ticketQueueOf', 'ticketWornBy', 'unansweredBlockers', 'waiterKind', 'waitingOn',
  ],
  'run.mjs': ['RESUME_PROMPT', 'claimNameFor', 'claudeArgs', 'clearOnce', 'firstPrompt', 'holdFor', 'loadPty', 'logLine', 'run', 'runEnv', 'startPlain', 'takeClaim', 'watch'],
  'store.mjs': [
    'DeckRefusal', 'KINDS', 'LANDING_INTERRUPTED', 'MAX_TEXT_BYTES', 'MAX_WAIT_REPLIES', 'addDeck', 'addPilotMessage',
    'addReply', 'archiveOld', 'archivedItem', 'beginLanding', 'budgetFor', 'cancelSwitch', 'clearAllNotices', 'clearNotice', 'closeItem', 'coPilotFor', 'createThread', 'currentSeq',
    'deckLanes', 'defaultStoreDir', 'dismissItem', 'dismissRun', 'fallBack', 'fallbackDue', 'findCredential',
    'interruptLandings', 'listAdded', 'listDeckNumbers', 'listItems', 'listLiveRuns', 'listRuns',
    'listStoredRuns', 'markDelivered', 'mergeTicket', 'moveTicket', 'namedWorktrees', 'needTicket', 'noteLanding', 'noteLaneFilled', 'ownerFilter', 'parkTicket',
    'parkedTicketOf', 'pivotTicket', 'postItem', 'recordFor', 'recordForTicket', 'recordVerdicts', 'recordsFor', 'refuseLaneSwitch', 'refusePoster',
    'registerRun', 'releaseCoPilot', 'removeDeck', 'reopenItem', 'repliesSince', 'requestSwitch', 'resolveItem',
    'resumableRecordFor', 'setBudget', 'setCoPilot', 'setSlices', 'settleLanding', 'storeDir', 'storeFile',
    'storedTabFor', 'takeTicket', 'yellowHeadOf', 'yieldTicket',
  ],
  'ui/render.mjs': [
    'OVERVIEW_HREF', 'RECENT_DAYS', 'TICKET_MAKING_TITLE', 'capRefusal', 'daySections', 'renderDeckPage',
    'renderHomePage', 'renderTemplate', 'renderThreadPage',
  ],
};

const linesOf = (file) => fs.readFileSync(path.join(DECK, file), 'utf8').split('\n').length;

/** Every non-test deck source file (spec 13): `deck/*.mjs` and `deck/ui/*.mjs`. */
const sources = () =>
  ['.', 'ui'].flatMap((dir) =>
    fs.readdirSync(path.join(DECK, dir))
      .filter((name) => name.endsWith('.mjs') && !name.endsWith('.test.mjs'))
      .map((name) => path.posix.join(dir, name)),
  );

test('no deck source file is over the bar', () => {
  const files = sources();
  assert.ok(files.includes('store-core.mjs') && files.includes('ui/render.mjs'), 'the scan reaches both directories');
  const over = files.filter((file) => linesOf(file) > BAR).map((file) => `${file} has ${linesOf(file)} lines`);
  assert.deepEqual(over, [], `over ${BAR}`);
});

test("server's names are unchanged", async () => {
  const names = Object.keys(await import('../server.mjs')).sort();
  assert.deepEqual(names, FACADES['server.mjs']);
});

test("store's names are unchanged", async () => {
  const names = Object.keys(await import('../store.mjs')).sort();
  assert.deepEqual(names, FACADES['store.mjs']);
});

test('store.mjs is a facade', () => {
  assert.ok(linesOf('store.mjs') < 50, `store.mjs has ${linesOf('store.mjs')} lines, a facade is under 50`);
});

test("render's names are unchanged", async () => {
  const names = Object.keys(await import('../ui/render.mjs')).sort();
  assert.deepEqual(names, FACADES['ui/render.mjs']);
});

test('render.mjs is a facade', () => {
  assert.ok(linesOf('ui/render.mjs') < 50, `render.mjs has ${linesOf('ui/render.mjs')} lines, a facade is under 50`);
});

test("run's names are unchanged", async () => {
  const names = Object.keys(await import('../run.mjs')).sort();
  assert.deepEqual(names, FACADES['run.mjs']);
});

test("items' names are unchanged", async () => {
  const names = Object.keys(await import('../items.mjs')).sort();
  assert.deepEqual(names, FACADES['items.mjs']);
});

test('items-bounds imports nothing from items', () => {
  const source = fs.readFileSync(path.join(DECK, 'items-bounds.mjs'), 'utf8');
  assert.doesNotMatch(source, /from\s+['"]\.\/items\.mjs['"]/);
});
