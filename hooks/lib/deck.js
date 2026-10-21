#!/usr/bin/env node
/**
 * The deck, as a hook is allowed to see it.
 *
 * Two hooks need this — `inbox-alert.js` after every tool call and
 * `stop-gate.js` when the pilot tries to go idle — and both are plain CommonJS
 * that must keep working as a bare `node <path>` with no package around them.
 * The deck itself is ESM (`deck/*.mjs`) and owns a store this process must
 * never touch: L3 says the daemon is the only writer. So a hook talks to the
 * deck the way any other client does, over HTTP on the loopback port, and this
 * file is the whole of that conversation.
 *
 * `node:http` rather than `fetch`: undici keeps its sockets alive for seconds
 * after the last response, and a process that lingers is a tool call the user
 * waits on. Every request here is made on its own socket (`agent: false`) and
 * the process is free to exit the moment it has an answer.
 *
 * Nothing in here throws for a deck that is not there: a rejected promise is
 * the caller's cue to stay silent and let the session carry on (§5, "no hook
 * that fails closed").
 */

'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const { atomicWriteFileSync, privateDir } = require('./atomic-write.js');
const { bearer } = require('./deck-secret.js');
const { pathKey } = require('./platform.js');

const DECK_HOST = '127.0.0.1';
const DECK_PORT = 4321;

/** A deck on a loopback socket answers in single-digit milliseconds or not at all. */
const REQUEST_TIMEOUT_MS = 1500;

/** What a hook is willing to read into memory after every tool call. */
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/**
 * Where a hook keeps what it knows about a session. Deliberately *not* inside
 * `~/.claude/pilot/`, which is the deck's own store and has one writer: this is
 * hook state about a session, not deck state, and the two must not share a
 * directory that `PILOT_DECK_DIR` moves out from under it.
 */
const STATE_DIRNAME = 'pilot-inbox';

/**
 * The same rule `deck/tools.mjs` applies, because a hook that read a different
 * port from the session beside it would be reporting on somebody else's deck.
 * A mistyped override throws rather than falling back to 4321: falling back
 * would point a test or a spare worktree at the deck the user is really using.
 */
function deckPort() {
  const override = process.env.PILOT_DECK_PORT;
  if (override === undefined || override.trim() === '') return DECK_PORT;

  const port = Number(override);
  if (!Number.isInteger(port) || port <= 0 || port >= 65536) {
    throw new Error('PILOT_DECK_PORT is ' + JSON.stringify(override) + ', which is not a port');
  }
  return port;
}

/**
 * One request, one socket, one answer. Rejects on anything at all — a refused
 * connection, a timeout, a body that is not JSON — because every caller treats
 * "the deck did not answer" the same way whatever the reason was.
 */
function request(method, pathname, body) {
  return new Promise(function (resolve, reject) {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8');
    const headers = { accept: 'application/json' };
    // The secret on all but health (deck-token L4), read now so a rotation is taken. Health goes bare,
    // so whatever answers on the port is not handed the secret before it is known to be the deck. With
    // no file (or none readable) there is none to send: a guarded deck answers 401, which a hook meets
    // as it meets any refusal, by staying silent (§5, "no hook that fails closed").
    if (pathname !== '/api/health') {
      try {
        Object.assign(headers, bearer());
      } catch (err) {
        // sent without it
      }
    }
    if (payload) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = payload.length;
    }

    let settled = false;
    const fail = function (err) {
      if (settled) return;
      settled = true;
      reject(err);
    };

    let call;
    try {
      call = http.request(
        {
          host: DECK_HOST,
          port: deckPort(),
          path: pathname,
          method: method,
          headers: headers,
          agent: false,
          timeout: REQUEST_TIMEOUT_MS,
        },
        function (response) {
          let text = '';
          let over = false;
          response.setEncoding('utf8');
          response.on('data', function (chunk) {
            if (over) return;
            text += chunk;
            if (text.length > MAX_RESPONSE_BYTES) {
              over = true;
              response.destroy();
              fail(new Error('the deck answered with more than a hook will read'));
            }
          });
          response.on('error', fail);
          response.on('end', function () {
            if (over || settled) return;
            let parsed;
            try {
              parsed = JSON.parse(text);
            } catch (err) {
              return fail(new Error('the deck answered with something that is not JSON'));
            }
            if (response.statusCode !== 200) {
              return fail(new Error(parsed.error || 'the deck answered ' + response.statusCode));
            }
            settled = true;
            resolve(parsed);
          });
        }
      );
    } catch (err) {
      return fail(err);
    }

    call.on('timeout', function () {
      call.destroy(new Error('the deck did not answer within ' + REQUEST_TIMEOUT_MS + 'ms'));
    });
    call.on('error', fail);
    if (payload) call.write(payload);
    call.end();
  });
}

/** `GET /api/health`: whether a deck is there, and how far it has counted. */
const health = function () { return request('GET', '/api/health'); };

/**
 * `POST /api/agents`: this agent has just called a tool, for the deck's roster
 * of who is live (L8 of deck-workspace). A route rather than a tool, because
 * the roster's whole value is that it is observed rather than declared, and a
 * tool would put it in the agents' own hands.
 */
const agents = function (heartbeat) { return request('POST', '/api/agents', heartbeat); };

/**
 * `GET /api/runs?live=1`: which sessions the deck believes are pilot sessions,
 * for `isOnDeck` below to ask its identity question against. The plain
 * `/api/runs` is the page's own list and hides a run once it is stale or
 * dismissed (spec 7); a hook asking "is this session's repo on the deck at
 * all?" must not get a different answer because the *page* stopped showing a
 * run that is still alive — that would silently turn off this Stop gate and
 * reply injection until the session wrote to the deck again.
 */
const runs = function () { return request('GET', '/api/runs?live=1'); };

/**
 * `GET /api/record?repo=`: the newest run record written in this directory, as
 * `{ record }` with `record` null when there is none (L7 of run-record); with
 * `ticket`, that ticket's record and the ticket itself (ticket-states L5). A
 * route rather than `deck_read`, because a read naming a `repo` marks that
 * repository's replies delivered and this is asked at a session's start.
 */
const record = function (repo, ticket) {
  return request('GET', '/api/record?repo=' + encodeURIComponent(repo) + (ticket ? '&ticket=' + encodeURIComponent(ticket) : ''));
};

/**
 * `GET /api/tickets?repo=&agent=`: the ticket an `agent` type's Blocked item is filed under, as `{ id }`, or null
 * when its lane has none (blocked-yellow-yields spec 7). The deck decides the lane; this holds no copy of the rule.
 * Rejects when the deck does not answer or refuses the agent, and the caller decides what that means.
 */
async function filedTicket(repo, agent) {
  const view = await request('GET', '/api/tickets?repo=' + encodeURIComponent(repo) + '&agent=' + encodeURIComponent(agent));
  const filed = view && view.filed;
  return filed && typeof filed.id === 'string' ? { id: filed.id } : null;
}

/**
 * One deck tool, called the way the stdio client calls it. The answer is MCP
 * content, whose first text part is the JSON the tool returns.
 */
async function tool(name, args) {
  const result = await request('POST', '/api/tool', { name: name, arguments: args || {} });
  const text = result && result.content && result.content[0] && result.content[0].text;
  if (typeof text !== 'string') throw new Error('the deck answered ' + name + ' with no content');
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error('the deck answered ' + name + ' with something that is not JSON');
  }
}

/**
 * `deck_resolve`, called without decoding the answer as JSON. `deck_reply` and
 * `deck_resolve` answer in prose ("Closed itm_x: ..."), not JSON, and `tool()`
 * above throws trying to parse that as such — every earlier caller of `tool()`
 * with `deck_resolve` was throwing on every call, caught and dropped. A caller
 * that only needs to know the resolve did not fail uses this instead.
 */
function resolve(id, resolution) {
  return request('POST', '/api/tool', { name: 'deck_resolve', arguments: { id: id, resolution: resolution } });
}

/** `deck_post`, undecoded for the same reason: the deck answers a post in prose too. */
function post(args) {
  return request('POST', '/api/tool', { name: 'deck_post', arguments: args });
}

/**
 * The one spelling of a directory the hooks key on. The hook's `cwd` and the
 * run's `repo` are both the session's working directory, arrived at by two
 * different routes, so they agree on the directory but not always on the
 * separators, a symlink or junction on the way, or (on Windows) letter case;
 * `pathKey` in `./platform.js` folds all three (mac-linux L3).
 *
 * The hooks' side of L13; `deck/items.mjs` `repoKey` is the same `pathKey`.
 */
const repoKey = pathKey;

/** Whether two paths name the same directory. */
function samePath(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  return repoKey(left) === repoKey(right);
}

/**
 * The directory the hooks key on (L3): the session's project, else the hook's cwd. The shell's
 * cwd drifts into a worktree while the pilot integrates; the project the client registered does not.
 */
function projectDir(input, env) {
  return (env && env.CLAUDE_PROJECT_DIR) || (input && input.cwd);
}

/** Whether this thread is one the user opened (Create, or the repository's chat): the pilot's, never another session's (L6). */
function isUserOpened(item) {
  return Boolean(item && (item.kind === 'user' || item.kind === 'chat'));
}

/** Whether the pilot has closed this thread: `deck/items.mjs` `isOpen`, negated (L13). */
function isClosed(item) {
  return Boolean(item && item.resolvedAt);
}

/**
 * A gate passes only on its Sign off press (merge-first spec 6, L7, L12): the deck refuses
 * `deck_resolve` on an unsigned gate, so both hooks ask for the press instead of the close.
 */
const GATE_KINDS = ['gate1', 'gate2'];
const GATE_SENTENCE =
  'A gate passes only on its Sign off press: reply with deck_reply asking for it; never deck_resolve it unsigned.';

/** A thread the user opened (`isUserOpened`) is the user's to close (user-threads-open L4): the pilot answers it. */
const USER_THREAD_SENTENCE =
  'Answer it with deck_reply, never deck_resolve: the user closes a thread they opened, and the chat never closes.';

/** What follows a reply the pilot does not close with deck_resolve: the gate or user-thread sentence, else ''. */
function notToClose(item) {
  if (isUnsignedGate(item)) return GATE_SENTENCE;
  return isUserOpened(item) ? USER_THREAD_SENTENCE : '';
}

/** A gate's two buttons (`deck/items.mjs` `buttons: [SIGN_OFF, NOT_YET]`), the presses its replies can carry. */
const GATE_PRESSES = ['Sign off', 'Not yet'];

/**
 * Whether a gate item is unsigned: its newest press among the user's messages is not Sign off.
 * Mirrors `deck/items.mjs` `chosenOf` on a gate (gate-stays-signed spec 1): a press is an option,
 * alone or before a note, a typed reply after Sign off leaves it signed, and only a later Not yet
 * withdraws it. A pressed gate is closed with deck_resolve like any answered thread.
 */
function isUnsignedGate(item) {
  if (!item || GATE_KINDS.indexOf(item.kind) === -1) return false;
  const messages = Array.isArray(item.replies) ? item.replies : [];
  let press = null;
  messages.forEach(function (message) {
    const text = message && message.from === 'user' && typeof message.text === 'string' ? message.text : null;
    const option = text === null ? null : GATE_PRESSES.find(function (o) {
      return text === o || text.indexOf(o + '\n\n') === 0;
    });
    if (option) press = option;
  });
  return press !== 'Sign off';
}

/**
 * Whether this item is the repository's chat (L4, L6): always open, never
 * waiting, never in a hand-off's open thread ids. The one place on the hooks
 * side that spells `kind === 'chat'` — every other rule here goes through this.
 */
function isChat(item) {
  return Boolean(item && item.kind === 'chat');
}

/**
 * The stored spellings (co-pilot-tickets L11): the ticket kind, the field an item names its ticket by,
 * and the record's co-pilot keys. The one place on the hooks side that spells them; `join.test.js`
 * pins `kind` and `field` to `deck/items.mjs` and holds every other hook to reading them here.
 */
const STORED = Object.freeze({ kind: 'ticket', field: 'ticket', coPilots: 'coPilots', coPilot: 'coPilot' });

/**
 * The standing kinds (L6): open, and never waiting on the user, so never holding
 * a turn. `deck/items.mjs` `STANDING_KINDS` spelled for the hooks; `join.test.js` pins both.
 */
const STANDING_KINDS = [STORED.kind, 'report'];

function isStanding(item) {
  return Boolean(item && STANDING_KINDS.indexOf(item.kind) !== -1);
}

/**
 * The record kinds (report-record L2, ADR 0148): a record takes no reply from the user, and
 * one stored there before the store refused it waits on no pilot. `deck/items.mjs`
 * `RECORD_KINDS` spelled for the hooks; `join.test.js` pins both.
 */
const RECORD_KINDS = ['report'];

function isRecord(item) {
  return Boolean(item && RECORD_KINDS.indexOf(item.kind) !== -1);
}

/**
 * The last thing said on a thread, by whoever said it; a pass that carried the
 * user's unread replies to the pilot (spec 5) reads through to the newest of them.
 */
function lastMessage(item) {
  const messages = Array.isArray(item && item.replies) ? item.replies : [];
  const last = messages[messages.length - 1] || null;
  const carries = last && Array.isArray(last.carries) ? last.carries : [];
  const carried = messages.filter(function (message) { return carries.indexOf(message.seq) !== -1; });
  return carried[carried.length - 1] || last;
}

/**
 * Whether this thread is waiting on the pilot: open, the user spoke last, and
 * they spoke while this session was alive.
 *
 * `baseline` is what keeps a thread answered and forgotten last week from
 * holding every session opened since. A thread this session posted itself needs
 * no such guard — it cannot predate the session that made it — and passes -1.
 * A short landing's `deck` line waits on the pilot as a user reply does, until a
 * later message or the close (three-lanes L7).
 */
function awaitsPilot(item, baseline) {
  if (!item || isClosed(item)) return false; // the pilot has already closed it
  if (isRecord(item)) return false; // a record is read, never answered (ADR 0148)
  const last = lastMessage(item);
  if (!last || (last.from !== 'user' && last.from !== 'deck')) return false; // nothing said, or the pilot said it
  return Number.isInteger(last.seq) && last.seq > baseline;
}

/**
 * Whether this item, or this reply, is on a thread posted from `repo`. Slice 4
 * stamps the posting session's repository; an item written before that carries
 * none, and for those the older join (this session is on the deck at all) is
 * what there is, so neither hook falls open on every item the deck has kept.
 */
function isForThisRepo(item, repo) {
  const stamped = item && item.repo;
  if (typeof stamped !== 'string' || stamped.trim() === '') return true;
  return samePath(stamped, repo);
}

/**
 * The unanswered threads (L4): open, the pilot's (no owner reads as the pilot's,
 * ADR 0041), and the user spoke last after `baseline`; a thread in `posted` skips
 * the baseline. The one definition, so the inbox repeats a thread exactly as long
 * as the Stop gate would hold on it.
 */
function unanswered(items, posted, baseline, repo) {
  return (Array.isArray(items) ? items : []).filter(function (item) {
    if (!item) return false;
    // Another agent's thread is the pilot's once a short landing's `deck` line is the last thing said (L7).
    const last = lastMessage(item);
    if (item.owner && item.owner !== 'pilot' && !(last && last.from === 'deck')) return false;
    if (posted.indexOf(item.id) !== -1) return awaitsPilot(item, -1);
    return isForThisRepo(item, repo) && awaitsPilot(item, baseline);
  });
}

/**
 * Whether this session is one of the deck's runs.
 *
 * A session whose `cwd` is a registered run's `repo` is on the deck, and one
 * that is not is an ordinary Claude session that happens to have this plugin
 * installed. Without that check the deck's replies would be injected into every
 * session on the machine, and the Stop gate would hold sessions that have
 * nothing to do with the pilot.
 *
 * This is the coarse half of the join: it says whether this deck is any of this
 * session's business at all. Which *item* is this session's is a second question,
 * asked of the item's own `repo`, and the hooks ask it separately.
 */
function isOnDeck(listed, cwd) {
  const rows = (listed && listed.runs) || [];
  return rows.some(function (run) { return samePath(run && run.repo, cwd); });
}

function stateDir() {
  return path.join(os.homedir(), '.claude', STATE_DIRNAME);
}

function claimDir() {
  return path.join(stateDir(), 'claims');
}

/** Makes `pilot-inbox`, and `sub` inside it when given, private (mac-linux L6); returns the innermost dir. */
function privateInbox(sub) {
  const dir = privateDir(stateDir());
  return sub ? privateDir(path.join(dir, sub)) : dir;
}

/**
 * A session id, made safe to put in a file name. A missing or unusable id falls
 * back to a shared key, which over-shares state between sessions rather than
 * letting a strange id write outside the directory.
 */
function sessionKey(sessionId) {
  if (typeof sessionId !== 'string') return 'x';
  return sessionId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'x';
}

function statePath(sessionId) {
  return path.join(stateDir(), sessionKey(sessionId) + '.json');
}

/**
 * Where an agent's last heartbeat to the roster is stamped
 * (`hooks/agent-roster.js`). Hook state about an agent, so it lives beside the
 * rest of the hooks' state and `sweep` clears it with everything else; the
 * file's contents are nothing, its modification time is the record.
 *
 * Here rather than in the lane that writes it, so that this file owns every
 * name under its directory: a lane that builds its own path is a second place
 * the directory is spelled, and `sweep` has to agree with all of them.
 */
function agentStampPath(agentId) {
  return path.join(stateDir(), sessionKey(agentId) + '.agent');
}

/**
 * The claim that makes "the deck is not answering" something a session is told
 * once, and not once per hook. Both hooks notice it — the PostToolUse lane when
 * its wait fails and the Stop gate when its read does — and they share this name
 * deliberately: whichever of them reaches a dead deck first says it, and the
 * other one stays quiet. It lives here rather than twice over for that reason.
 */
const deckDownClaim = function (sessionId) {
  return sessionKey(sessionId) + '-deck-down';
};

/**
 * Where this session's reading stands, or null if it has never been recorded.
 *
 * `baseline` is the deck's sequence number when the session first reached it and
 * never moves: it is what makes "arrived while this session was alive" a
 * question with an answer. `cursor` is how far the replies have been handed
 * over and only moves forwards.
 */
function readState(sessionId) {
  const file = statePath(sessionId);
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    return null; // no file at all: this session has not arrived on the deck yet
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    parsed = null;
  }
  if (!parsed || !Number.isInteger(parsed.baseline)) {
    // There but unreadable — a write cut short by a machine going down. Take it
    // away rather than leave it: `startState` creates exclusively, so a file it
    // can never overwrite would leave this session without a baseline for good,
    // and a session without a baseline never hears another reply as long as it
    // lives. Losing a cursor costs at worst one reply offered twice, which the
    // claim refuses.
    try { fs.unlinkSync(file); } catch (err) { /* the next hook will try again */ }
    return null;
  }
  return {
    baseline: parsed.baseline,
    cursor: Number.isInteger(parsed.cursor) ? parsed.cursor : parsed.baseline,
  };
}

/** Record where a session starts reading. Exclusive: the first writer wins. */
function startState(sessionId, seq) {
  const state = { baseline: seq, cursor: seq };
  try {
    privateInbox();
    fs.writeFileSync(statePath(sessionId), JSON.stringify(state), { encoding: 'utf8', flag: 'wx' });
    return state;
  } catch (err) {
    // Another copy of this hook got there first, which is the answer either way.
    return readState(sessionId) || state;
  }
}

/**
 * Move the cursor on. Never backwards: several copies of this hook run at once
 * and the last one to write must not undo what an earlier one handed over. The
 * claim files, not this, are what makes delivery exactly once — this only saves
 * asking the deck for replies that have already been dealt with.
 */
function advanceCursor(sessionId, seq) {
  if (!Number.isInteger(seq)) return;
  const state = readState(sessionId);
  if (!state || seq <= state.cursor) return;
  try {
    atomicWriteFileSync(
      statePath(sessionId),
      JSON.stringify({ baseline: state.baseline, cursor: seq })
    );
  } catch (err) {
    /* the worst case is being offered the same reply again, which the claim refuses */
  }
}

/** How many of its own items a session is asked to remember, and how long one may be. */
const MAX_POSTED = 200;
const MAX_POSTED_ID_CHARS = 64;

function postedPath(sessionId) {
  return path.join(stateDir(), sessionKey(sessionId) + '.posted.json');
}

/**
 * The items this session posted, in the order it posted them.
 *
 * This is how the Stop gate answers "is this thread mine?", and it is an id
 * rather than a path because the path does not hold. `deck/client.mjs` registers
 * `process.cwd()` at startup, which is the directory `claude` was launched in,
 * while a hook is handed the session's own cwd. On 2026-09-16 those were a
 * parent directory and the repository inside it, so `samePath` said no to every
 * item the pilot had posted itself and the gate never fired at all. An id the
 * PostToolUse lane watched come back out of `deck_post` needs no two paths to
 * agree about anything.
 */
function readPosted(sessionId) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(postedPath(sessionId), 'utf8'));
  } catch (err) {
    return []; // never posted, or unreadable: either way this session owns nothing here
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(function (id) { return typeof id === 'string' && id !== ''; });
}

/**
 * Note one. Bounded, because a long run posts many items and this is read at
 * every attempt to end a turn; idempotent, because the lane may see the same
 * call twice. Two copies racing can lose an id, and the cost of that is one
 * thread the gate does not hold the pilot on — never a thread it invents.
 */
function recordPosted(sessionId, id) {
  // The deck's ids are short and this bounds the file whatever a caller hands it,
  // rather than leaving that to every future caller to remember.
  if (typeof id !== 'string' || id === '' || id.length > MAX_POSTED_ID_CHARS) return;
  const held = readPosted(sessionId);
  if (held.indexOf(id) !== -1) return;
  try {
    privateInbox();
    atomicWriteFileSync(postedPath(sessionId), JSON.stringify(held.concat([id]).slice(-MAX_POSTED)));
  } catch (err) {
    /* the gate falls back to the repository join, which is where it stood before */
  }
}

/**
 * The exclusive-create claim idiom, as `context-usage-alert.js` uses it: the
 * file's existence is the record that this thing has been said, and an
 * exclusive create is atomic across processes, so exactly one of the copies a
 * parallel turn spawns wins it. Nothing deletes it on the happy path, so there
 * is no lock to be left held.
 */
function claim(name) {
  try {
    privateInbox('claims');
    fs.closeSync(fs.openSync(path.join(claimDir(), name + '.claim'), 'wx'));
    return true;
  } catch (err) {
    // EEXIST means someone else has said it. Anything else (an unwritable home,
    // a full disk) errs towards saying it twice rather than never.
    return !err || err.code !== 'EEXIST';
  }
}

/**
 * Whether a claim has already been taken, without taking it.
 *
 * `claim` answers "may I say this?" and records the answer in the same breath,
 * which is what makes it exactly-once across processes. The Stop gate needs the
 * question on its own as well: it has to know whether it has already told the
 * pilot about a thread *before* it decides to spend nine minutes waiting on one,
 * and a peek that claimed would use up the very thing it was checking.
 */
function claimed(name) {
  try {
    return fs.existsSync(path.join(claimDir(), name + '.claim'));
  } catch (err) {
    return false; // unreadable errs towards saying it again, the way `claim` does
  }
}

/**
 * Where a delivered hand-off waits for its session's first tool call (S5, L3,
 * ADR 0080): written by `session-handoff.js`, judged by `post-tool.js`.
 */
function pickupPath(sessionId) {
  return path.join(stateDir(), 'pickups', sessionKey(sessionId) + '.json');
}

/**
 * The held marker (handoff-closed-on-pickup L5, ADR 0115): the hand-off this session was
 * delivered, which the Stop gate holds its turn on until it is resolved. A file of its own,
 * so the pickup marker's judge-once deletion (ADR 0080) is left as it is. Only a session id
 * that is already file-safe holds one, so no two sessions can share a marker through `sessionKey`'s fallback.
 */
const HELD_ITEM = /^itm_\w{1,40}$/;

function heldPath(sessionId) {
  if (typeof sessionId !== 'string' || sessionKey(sessionId) !== sessionId) return null;
  return path.join(stateDir(), 'pickups', sessionId + '.held.json');
}

function holdHandoff(sessionId, itemId) {
  const file = heldPath(sessionId);
  if (!file || typeof itemId !== 'string' || !HELD_ITEM.test(itemId)) return;
  try {
    privateInbox('pickups');
    atomicWriteFileSync(file, JSON.stringify({ item: itemId }));
  } catch (err) { // unwritten, so never held: the gate errs towards letting the turn end
    require('./wrapper-log.js').log('lane: held marker not written (' + (err && err.message ? err.message : String(err)) + ')');
  }
}

function heldHandoff(sessionId) {
  const file = heldPath(sessionId);
  try {
    const item = file && JSON.parse(fs.readFileSync(file, 'utf8')).item;
    return typeof item === 'string' ? item : null;
  } catch (err) {
    return null; // none, or unreadable: nothing is held
  }
}

function dropHeldHandoff(sessionId) {
  const file = heldPath(sessionId);
  if (file) try { fs.unlinkSync(file); } catch (err) { /* already gone */ }
}

function unclaim(name) {
  try { fs.unlinkSync(path.join(claimDir(), name + '.claim')); } catch (err) { /* fine */ }
}

/**
 * Give a delivered claim back so the next session start says it again (S5,
 * ADR 0080): `claim`'s inverse, answering whether there was one to give. The
 * name comes off a marker file, so only a claim's own alphabet is accepted.
 */
function release(name) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9_-]+$/.test(name)) return false;
  try {
    fs.unlinkSync(path.join(claimDir(), name + '.claim'));
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Stamp the end of a turn of the session `pilot run` started, for `deck/run.mjs`,
 * which types nothing into that session until it has ended a turn since the
 * hand-off was posted: keys written while a permission prompt was open answered
 * the prompt instead (2026-09-29). Keyed on the wrapper's pid, and only in its
 * directory, because every session started from inside this one inherits both;
 * the project's, since the shell's drifts into a worktree while the pilot integrates.
 */
function markTurnEnded(env, cwd) {
  if (!env.PILOT_RUN_PID || !samePath(env.PILOT_RUN_REPO, projectDir({ cwd: cwd }, env))) return;
  try {
    privateInbox('claims');
    fs.writeFileSync(path.join(claimDir(), 'turn-ended-' + sessionKey(env.PILOT_RUN_PID) + '.stamp'), String(Date.now()));
  } catch (err) { /* the wrapper waits, then gives up and types nothing */ }
}

/** Claims and session state outlive their session; drop what is plainly stale. */
function sweep(maxAgeMs) {
  const cutoff = Date.now() - (maxAgeMs || 7 * 24 * 60 * 60 * 1000);
  for (const dir of [claimDir(), stateDir(), path.join(stateDir(), 'pickups')]) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const full = path.join(dir, entry.name);
      try {
        if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
      } catch (err) { /* next sweep */ }
    }
  }
}

/** How many open items a hook asks the deck for. The deck's own default is twenty. */
const OPEN_READ_LIMIT = 20;

/** What the two hooks call. Nothing else here is anybody's business. */
module.exports = {
  STORED: STORED,
  OPEN_READ_LIMIT: OPEN_READ_LIMIT,
  log: require('./wrapper-log.js').log,
  GATE_SENTENCE: GATE_SENTENCE,
  USER_THREAD_SENTENCE: USER_THREAD_SENTENCE,
  notToClose: notToClose,
  advanceCursor: advanceCursor,
  awaitsPilot: awaitsPilot,
  agentStampPath: agentStampPath,
  agents: agents,
  claim: claim,
  claimed: claimed,
  deckDownClaim: deckDownClaim,
  deckPort: deckPort,
  dropHeldHandoff: dropHeldHandoff,
  health: health,
  heldHandoff: heldHandoff,
  holdHandoff: holdHandoff,
  isChat: isChat,
  isClosed: isClosed,
  isForThisRepo: isForThisRepo,
  isUnsignedGate: isUnsignedGate,
  GATE_PRESSES: GATE_PRESSES,
  isOnDeck: isOnDeck,
  isUserOpened: isUserOpened,
  filedTicket: filedTicket,
  lastMessage: lastMessage,
  isStanding: isStanding,
  isRecord: isRecord,
  markTurnEnded: markTurnEnded,
  pickupPath: pickupPath,
  privateInbox: privateInbox,
  projectDir: projectDir,
  readPosted: readPosted,
  readState: readState,
  record: record,
  recordPosted: recordPosted,
  release: release,
  repoKey: repoKey,
  post: post,
  resolve: resolve,
  runs: runs,
  samePath: samePath,
  sessionKey: sessionKey,
  startState: startState,
  sweep: sweep,
  tool: tool,
  unanswered: unanswered,
  unclaim: unclaim,
};
