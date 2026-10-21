#!/usr/bin/env node
/**
 * The one place a blocked step becomes a deck item (gate-no-stall L2, L4).
 *
 * A blocked step is a call that was not run because auto mode denied it, or a hook refused
 * its prompt. Both reach the user the same way: as one question on the deck naming the
 * command, the reason and the agent, `blocking` on the ticket the deck files that agent's lane
 * under (`filedTicket`), so the gate2 it holds up waits for it.
 * `permission-denied.js` is the first caller; `permission-refuse.js` is the second (S2).
 *
 * Fails open like every deck hook: no live run in `repo`, a deck that does not answer, or a
 * post the deck refuses all come back as null with nothing thrown. A repeat of the same
 * command in the same session is claimed by a file (L3), so it posts once a window; a post
 * that failed gives its claim back, so the next denial of that command may still post. A
 * claim older than the window is free, whether its post landed or its hook was killed
 * mid-post, so a repeat after it posts again rather than being held for good.
 *
 * The command goes to the post and nowhere else: the deck's credential check runs on what
 * it is given, and a log line would be a second copy that no check reads.
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const client = require('./deck.js');

const TITLE_MOST = 80;
const COMMAND_MOST = 600;
const RAN = 'I ran it';
const SKIP = 'Skip it';
const WINDOW_MS = 10 * 60 * 1000; // how long one claim holds its step

/** Why the step was not run, by its `source`: the caller says which, so the item never guesses. */
const LEAD = {
  denied: 'Auto mode denied this call, so it was not run',
  refused: "Its permission prompt was refused by the pilot's hook, so this call was not run",
};

/** The claim file for one step: a hash of session and command, so neither reaches a file name. */
function claimPath(dir, session, command) {
  const key = crypto.createHash('sha256').update(String(session) + '\0' + command).digest('hex').slice(0, 32);
  return path.join(dir, key + '.claim');
}

/** True when this step is newly claimed; false when it already was. An unwritable dir errs towards posting. */
function claim(file, now) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.closeSync(fs.openSync(file, 'wx'));
    return true;
  } catch (err) {
    if (err.code !== 'EEXIST') return true;
    if (!isExpired(file, now)) return false;
    release(file);
    return claim(file, function () { return -Infinity; }); // once: a fresh claim never expires
  }
}

/** Whether a claim is older than one window. */
function isExpired(file, now) {
  try {
    return now() - fs.statSync(file).mtimeMs > WINDOW_MS;
  } catch (_err) {
    return false;
  }
}

function release(file) {
  try {
    fs.unlinkSync(file);
  } catch (_err) {
    // Already gone, or never written: either way nothing holds the step.
  }
}

function itemFor(step, ticket) {
  const item = {
    kind: 'question',
    title: 'Blocked: ' + step.command.slice(0, TITLE_MOST),
    body:
      LEAD[step.source] +
      '; it is not retried and not routed around.\n\n' +
      'Command: ' + step.command.slice(0, COMMAND_MOST) + '\n\n' +
      'Reason: ' + (step.reason || 'none given').slice(0, COMMAND_MOST) + '\n\n' +
      'Agent: ' + step.agent + '\n\n' +
      'Run it yourself and press ' + RAN + ', or press ' + SKIP + ' to go on without it.',
    options: [RAN, SKIP],
    recommended: SKIP,
    repo: step.repo,
  };
  if (ticket) {
    item[client.STORED.field] = ticket.id;
    item.blocking = true;
  }
  return item;
}

/** The item id in the deck's prose answer to a post ("Posted itm_x to the deck. ..."), or null. */
function postedId(answer) {
  const text = answer && answer.content && answer.content[0] && answer.content[0].text;
  const found = typeof text === 'string' ? /\bitm_\w+/.exec(text) : null;
  return found ? found[0] : null;
}

/**
 * Post one blocked step: the item id, or null when nothing was posted. `step.source` is
 * `denied` (auto mode denied the call) or `refused` (a hook refused its prompt).
 * `deps.deck` is the deck client (`./deck.js` by default), `deps.claims` the claim directory,
 * `deps.now` the clock a claim is aged by, `deps.live` true when the caller already found a
 * live run in `step.repo`, so the deck is not asked twice.
 */
async function postBlocked(step, deps) {
  const deck = (deps && deps.deck) || client;
  const claims = (deps && deps.claims) || path.join(os.tmpdir(), 'pilot-blocked');
  const now = (deps && deps.now) || Date.now;
  if (!step || typeof step.repo !== 'string' || typeof step.session !== 'string' || step.session === '') return null;
  if (typeof step.command !== 'string' || step.command === '') return null;

  if (!(deps && deps.live)) {
    try {
      if (!client.isOnDeck(await deck.runs(), step.repo)) return null;
    } catch (_err) {
      return null; // no deck: nothing to post to
    }
  }

  const file = claimPath(claims, step.session, step.command);
  if (!claim(file, now)) return null;
  try {
    // The deck names the denied lane's ticket by agent type (blocked-yellow-yields spec 7); none, or no answer,
    // and the run is still live: a plain question still reaches the user.
    const ticket = await Promise.resolve()
      .then(function () { return deck.filedTicket(step.repo, String(step.agent)); })
      .catch(function () { return null; });
    const id = postedId(await deck.post(itemFor(step, ticket)));
    if (id === null) throw new Error('the deck named no item');
    return id;
  } catch (_err) {
    release(file); // not posted, so not claimed: the next denial of this command may post
    return null;
  }
}

module.exports = { postBlocked: postBlocked };
