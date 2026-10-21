#!/usr/bin/env node
/**
 * The last thing an agent's transcript says about how full its context is,
 * read from the end of the file.
 *
 * The constraint is the whole design. A transcript is JSONL that only ever
 * grows, this machine's run to hundreds of megabytes, and the caller is a lane
 * of the PostToolUse process — which fires after *every single tool call*. A
 * `readFileSync` here would be a hundred-megabyte read per tool call, so there
 * is none, and the slice's test enforces that by taking `fs.readFileSync` away
 * before it calls this and asserting the answer still comes back.
 *
 * So: open once, read 64KB from the end, look for the last assistant message in
 * it, and only widen if that chunk did not contain one — which it does, all but
 * always, because an assistant record is a few kilobytes. The widening is
 * bounded at 4MB because a transcript whose last assistant message is further
 * back than that has something wrong with it, and a hook is not the place to
 * find out what.
 *
 * Bytes are kept as bytes until the last moment. Reading at an arbitrary offset
 * lands in the middle of a UTF-8 sequence as often as not, and decoding each
 * chunk on its own would scatter replacement characters through the text; one
 * decode of the concatenated buffer puts the only damaged boundary at the very
 * front, inside the partial line that is dropped anyway.
 */

'use strict';

const fs = require('fs');

/** What one look at the end of a transcript reads. One assistant record fits. */
const CHUNK_BYTES = 64 * 1024;

/** And the most this will ever read before giving up and saying nothing. */
const MAX_TAIL_BYTES = 4 * 1024 * 1024;

/**
 * The context this message was sent with: everything the model was given,
 * whether it came fresh, was written to the cache, or was read back from it.
 * What the model *wrote* (`output_tokens`) is not in the sum — it is not part
 * of the request that was measured, and the next message's figures include it.
 */
function contextTokens(usage) {
  if (!usage || typeof usage !== 'object') return 0;
  const add = function (value) { return typeof value === 'number' && value > 0 ? value : 0; };
  return add(usage.input_tokens) +
    add(usage.cache_creation_input_tokens) +
    add(usage.cache_read_input_tokens);
}

/**
 * The last assistant record in `text`, newest first. `whole` says whether the
 * text starts at byte zero of the file; when it does not, the first line is a
 * fragment of a line whose beginning has not been read and is dropped. Lines
 * that do not parse are skipped rather than thrown over: the last line of a
 * live transcript is regularly half-written by the process still appending
 * to it.
 */
function lastAssistantIn(text, whole) {
  const lines = text.split('\n');
  const first = whole ? 0 : 1;
  for (let i = lines.length - 1; i >= first; i -= 1) {
    const line = lines[i];
    if (line === '' || line.charCodeAt(0) !== 123 /* { */) continue;

    let record;
    try {
      record = JSON.parse(line);
    } catch (err) {
      continue;
    }
    if (!record || record.type !== 'assistant' || !record.message) continue;

    const model = record.message.model;
    const tokens = contextTokens(record.message.usage);
    if (typeof model !== 'string' || model === '' || tokens <= 0) continue;
    return { model: model, tokens: tokens };
  }
  return null;
}

/**
 * `{ model, tokens }` from the end of a transcript, or null for anything at all
 * that goes wrong — no file, no permission, no assistant message within the
 * bound. Null is always "say nothing", never "assume zero".
 */
function lastAssistantUsage(file) {
  if (typeof file !== 'string' || file === '') return null;

  let handle;
  try {
    handle = fs.openSync(file, 'r');
  } catch (err) {
    return null;
  }

  try {
    const size = fs.fstatSync(handle).size;
    const chunks = [];
    let read = 0;

    while (read < size && read < MAX_TAIL_BYTES) {
      const want = Math.min(CHUNK_BYTES, size - read);
      const from = size - read - want;
      const buffer = Buffer.allocUnsafe(want);
      const got = fs.readSync(handle, buffer, 0, want, from);
      if (got <= 0) break;

      chunks.unshift(buffer.subarray(0, got));
      read += got;

      const found = lastAssistantIn(Buffer.concat(chunks).toString('utf8'), from === 0);
      if (found) return found;
    }
    return null;
  } catch (err) {
    return null;
  } finally {
    try { fs.closeSync(handle); } catch (err) { /* nothing left to do about it */ }
  }
}

module.exports = {
  CHUNK_BYTES: CHUNK_BYTES,
  MAX_TAIL_BYTES: MAX_TAIL_BYTES,
  lastAssistantUsage: lastAssistantUsage,
};
