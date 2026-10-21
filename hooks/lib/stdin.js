#!/usr/bin/env node
/**
 * A hook's whole stdin as one string. A read that errs answers what arrived before it,
 * so a hook reading a half payload fails to parse it and says nothing, as it would anyway.
 */

'use strict';

function readStdin() {
  return new Promise(function (resolve) {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', function (chunk) { raw += chunk; });
    process.stdin.on('end', function () { resolve(raw); });
    process.stdin.on('error', function () { resolve(raw); });
  });
}

module.exports = { readStdin: readStdin };
