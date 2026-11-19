#!/usr/bin/env node
/**
 * A pilot lane's shell edit of a git-tracked file is refused before it runs (audit-f12 spec 1, 4-7).
 *
 * Runs on PreToolUse for Bash. `sed -i` through Git Bash mangles escapes and line endings, so
 * the call is denied (L1) with a reason naming the file and the Edit and Write tools. Tracked
 * means `git ls-files` at hook time, asked only once a candidate exists, once per target dir
 * (L2). Every error fails open (L4); nothing is posted, and the reason says it is not a blocked
 * step. A relative target after a leading literal `cd <dir> &&` resolves against that dir; after
 * any other `cd` a relative target names an unknown dir and passes (L7).
 */

'use strict';

const { execFileSync } = require('child_process');
const path = require('path');
const { readStdin } = require('./lib/stdin.js');
const { isWindows } = require('./lib/platform.js');
const { isPilotLane } = require('./permission-denied.js');

const SEPARATORS = ['&&', '||', ';', '|', '&', '\n', '(', ')'];
const OPERATOR = /^(?:&&|\|\||&>>?|>>|>&|>\||<<<|<<-?|[<>;&|()\n])/;

/** Shell words and operators; a word is `lit` when no expansion or glob can change it. */
function tokens(command) {
  const out = [];
  let word = null;
  let lit = true;
  const end = () => { if (word !== null) out.push({ w: word, lit }); word = null; lit = true; };
  for (let i = 0; i < command.length;) {
    const c = command[i];
    if (c === "'") {
      const stop = command.indexOf("'", i + 1);
      word = (word || '') + command.slice(i + 1, stop < 0 ? command.length : stop);
      i = stop < 0 ? command.length : stop + 1;
    } else if (c === '"') {
      let j = i + 1;
      word = word || '';
      for (; j < command.length && command[j] !== '"'; j++) {
        if (command[j] === '\\' && j + 1 < command.length) j++;
        else if (command[j] === '$' || command[j] === '`') lit = false;
        word += command[j];
      }
      i = j + 1;
    } else if (c === '\\') {
      const joined = /^\\\r?\n/.exec(command.slice(i)); // a line continuation is nothing
      if (joined) i += joined[0].length;
      else { word = (word || '') + (command[i + 1] || ''); i += 2; }
    } else if (c === ' ' || c === '\t' || c === '\r') {
      end();
      i++;
    } else {
      const op = OPERATOR.exec(command.slice(i));
      if (op) {
        if (word !== null && /^\d+$/.test(word) && /[<>]/.test(op[0])) word = null; // an fd number
        end();
        out.push({ op: op[0] });
        i += op[0].length;
      } else {
        if ('$`*?[~'.includes(c)) lit = false;
        word = (word || '') + c;
        i++;
      }
    }
  }
  end();
  return out;
}

/** Simple commands in order: their words (redirections dropped) and the operator that ends each. */
function commands(toks) {
  const list = [];
  let words = [];
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t.op && SEPARATORS.includes(t.op)) { list.push({ words, sep: t.op }); words = []; }
    else if (t.op) k++; // a redirection and its target
    else if (!(words.length === 0 && (t.w === '{' || t.w === '}'))) words.push(t);
  }
  list.push({ words, sep: '' });
  return list.filter((c) => c.words.length > 0);
}

/** The file operands of a `sed` that edits in place, else none. */
function sedInPlaceFiles(words) {
  let i = 0;
  while (i < words.length && /^\w+=/.test(words[i].w)) i++;
  if (!words[i] || !/^g?sed(\.exe)?$/.test(path.basename(words[i].w))) return [];
  let inPlace = false;
  let script = false;
  let options = true;
  const files = [];
  for (let k = i + 1; k < words.length; k++) {
    const a = words[k].w;
    if (options && a === '--') options = false;
    else if (options && a.startsWith('--')) {
      if (/^--in-place(=|$)/.test(a)) inPlace = true;
      else if (/^--(expression|file|line-length)$/.test(a)) { script = script || a !== '--line-length'; k++; }
      else if (/^--(expression|file)=/.test(a)) script = true;
    } else if (options && a.length > 1 && a[0] === '-') {
      for (let j = 1; j < a.length; j++) {
        if (a[j] === 'i') { inPlace = true; break; }
        if ('efl'.includes(a[j])) { script = script || a[j] !== 'l'; if (j === a.length - 1) k++; break; }
      }
    } else if (!script) script = true;
    else files.push(words[k]);
  }
  return inPlace ? files : [];
}

/** A Git Bash `/c/...` path as `C:/...` on win32 (L5). */
function native(p) {
  const m = isWindows() && /^\/([a-zA-Z])(\/.*)?$/.exec(p);
  return m ? `${m[1].toUpperCase()}:${m[2] || '/'}` : p;
}

/** The absolute paths a command would edit in place, resolved against `cwd` (L5, L7). */
function writeTargets(command, cwd) {
  const targets = [];
  let base = cwd;
  commands(tokens(command)).forEach(({ words, sep }, n) => {
    if (words[0].w === 'cd') {
      const literal = n === 0 && sep === '&&' && words.length === 2 && words[1].lit;
      base = literal ? path.resolve(cwd, native(words[1].w)) : null;
      return;
    }
    for (const file of sedInPlaceFiles(words)) {
      const p = native(file.w);
      if (!file.lit || (!path.isAbsolute(p) && base === null)) continue;
      targets.push({ path: path.resolve(base || cwd, p), form: 'sed -i' });
    }
  });
  return targets;
}

/** The tracked subset of `paths`: one `git ls-files` per directory; a dir git errors on counts as untracked. */
function isTracked(paths) {
  const byDir = new Map();
  for (const p of paths) byDir.set(path.dirname(p), (byDir.get(path.dirname(p)) || []).concat(p));
  const tracked = [];
  for (const [dir, list] of byDir) {
    const names = list.map((p) => path.basename(p));
    let out;
    try {
      out = execFileSync('git', ['--literal-pathspecs', '-C', dir, 'ls-files', '-z', '--', ...names], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000, windowsHide: true,
      });
    } catch (_err) {
      continue; // one missing or non-repo dir must not unguard the others (L4 per dir)
    }
    const listed = new Set(out.split('\0'));
    tracked.push(...list.filter((p) => listed.has(path.basename(p))));
  }
  return tracked;
}

/** The PreToolUse deny for a pilot lane's shell edit of a tracked file, else null (fails open). */
function decide(payload, deps) {
  try {
    if (!payload || typeof payload !== 'object' || !isPilotLane(payload)) return null;
    const command = payload.tool_input && payload.tool_input.command;
    if (typeof command !== 'string') return null;
    const targets = writeTargets(command, typeof payload.cwd === 'string' ? payload.cwd : process.cwd());
    if (targets.length === 0) return null;
    const tracked = ((deps && deps.isTracked) || isTracked)([...new Set(targets.map((t) => t.path))]);
    if (tracked.length === 0) return null;
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `A shell edit (sed -i) of the tracked file ${tracked.join(', ')} is not allowed: ` +
          'it mangles escapes and line endings. Redo the change with the Edit or Write tool. ' +
          'This is not a blocked step: post nothing and ask no one, make the edit with Edit or Write and carry on.',
      },
    };
  } catch (_err) {
    return null;
  }
}

async function main() {
  let output = null;
  try {
    output = decide(JSON.parse(await readStdin()));
  } catch (_err) {
    // An unreadable payload lets the call run (L4).
  }
  if (output) process.stdout.write(JSON.stringify(output));
  process.exitCode = 0;
}

module.exports = { decide, writeTargets, isTracked };

if (require.main === module) {
  main();
}
