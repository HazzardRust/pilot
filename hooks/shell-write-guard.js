#!/usr/bin/env node
/**
 * A pilot lane's shell edit of a git-tracked file is refused before it runs (audit-f12 spec 1, 4-7).
 *
 * Runs on PreToolUse for Bash. `sed -i`, a heredoc fed to `cat`/`tee` and an `echo`/`printf`
 * redirected into a file (L3) mangle escapes and line endings through Git Bash, so the call is
 * denied (L1) with a reason naming the file and the Edit and Write tools. Heredoc bodies and
 * quoted strings are data, never commands or redirections (L5). Tracked
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

const WRITES = new Set(['>', '>>', '>|', '&>', '&>>']);
const HEREDOC = new Set(['<<', '<<-', '<<<']);
const KEYWORDS = new Set(['!', 'if', 'then', 'elif', 'else', 'while', 'until', 'do']);
const PREFIXES = new Set(['command', 'env', 'exec', 'nohup', 'sudo', 'time']);

/** The index past the heredoc bodies starting at `i`, one per pending delimiter, in order (L5). */
function skipBodies(command, i, pending) {
  for (const { delim, tabs } of pending) {
    const start = i;
    for (;;) {
      if (i >= command.length) return start; // no terminator: scan its lines rather than hide them
      const nl = command.indexOf('\n', i);
      const stop = nl < 0 ? command.length : nl;
      const line = command.slice(i, stop).replace(/\r$/, '');
      i = stop + 1;
      if ((tabs ? line.replace(/^\t+/, '') : line) === delim) break;
    }
  }
  return i;
}

/** Shell words and operators, heredoc bodies dropped; a word is `lit` when no expansion or glob can change it. */
function tokens(command) {
  const out = [];
  const pending = [];
  let heredoc = null;
  let word = null;
  let lit = true;
  const end = () => {
    if (word !== null) {
      out.push({ w: word, lit });
      if (heredoc) pending.push({ delim: word, tabs: heredoc === '<<-' });
      heredoc = null;
    }
    word = null; lit = true;
  };
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
    } else if (c === '#' && word === null) {
      const nl = command.indexOf('\n', i); // a comment runs to the end of its line
      i = nl < 0 ? command.length : nl;
    } else if (/^\$?\(\(/.test(command.slice(i, i + 3))) {
      const close = command.indexOf('))', i); // arithmetic: its `<<` is a shift, not a heredoc
      word = (word || '') + command.slice(i, close < 0 ? command.length : close + 2);
      lit = false;
      i = close < 0 ? command.length : close + 2;
    } else {
      const op = OPERATOR.exec(command.slice(i));
      if (op) {
        if (word !== null && /^\d+$/.test(word) && /[<>]/.test(op[0])) word = null; // an fd number
        end();
        out.push({ op: op[0] });
        i += op[0].length;
        if (op[0] === '<<' || op[0] === '<<-') heredoc = op[0];
        if (op[0] === '\n') i = skipBodies(command, i, pending.splice(0));
      } else {
        if ('$`*?['.includes(c) || (c === '~' && word === null)) lit = false; // bash expands `~` only at a word's start
        word = (word || '') + c;
        i++;
      }
    }
  }
  end();
  return out;
}

/** Simple commands in order: their words, their redirections and the operator that ends each. */
function commands(toks) {
  const list = [];
  let cmd = { words: [], redirs: [] };
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t.op && SEPARATORS.includes(t.op)) { list.push({ ...cmd, sep: t.op }); cmd = { words: [], redirs: [] }; }
    else if (t.op) { if (toks[k + 1] && !toks[k + 1].op) cmd.redirs.push({ op: t.op, to: toks[++k] }); }
    else if (!(cmd.words.length === 0 && (t.w === '{' || t.w === '}'))) cmd.words.push(t);
  }
  list.push({ ...cmd, sep: '' });
  return list.filter((c) => c.words.length > 0);
}

/** The words from the program a simple command runs, past assignments, keywords and prefixes; none for `command -v`. */
function program(words) {
  let prefix = null;
  for (let i = 0; i < words.length; i++) {
    const w = words[i].w;
    if (/^\w+=/.test(w) || KEYWORDS.has(w)) continue;
    if (PREFIXES.has(w)) { prefix = w; continue; }
    if (!prefix || w[0] !== '-') return words.slice(i);
    if (prefix === 'command' && /^-[vV]$/.test(w)) return [];
    if ((prefix === 'sudo' && /^-[ugCDhpRrtTU]$/.test(w)) || (prefix === 'env' && /^-[uCS]$/.test(w))) i++;
  }
  return [];
}

/** The file operands of a `sed` that edits in place, else none. */
function sedInPlaceFiles(words) {
  let inPlace = false;
  let script = false;
  let options = true;
  const files = [];
  for (let k = 1; k < words.length; k++) {
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

/** What a simple command writes with bytes the shell typed (L3); a program's own output is not one. */
function shellWrites({ words, redirs }) {
  const args = program(words);
  if (args.length === 0) return [];
  const name = path.basename(args[0].w).replace(/\.exe$/, '');
  if (/^g?sed$/.test(name)) return sedInPlaceFiles(args).map((file) => ({ file, form: 'sed -i' }));
  const outs = redirs.filter((r) => WRITES.has(r.op) || (r.op === '>&' && !/^(\d+|-)$/.test(r.to.w))).map((r) => r.to);
  if (name === 'echo' || name === 'printf') return outs.map((file) => ({ file, form: 'echo' }));
  if (!redirs.some((r) => HEREDOC.has(r.op))) return [];
  if (name === 'cat') return outs.map((file) => ({ file, form: 'heredoc' }));
  if (name === 'tee') return outs.concat(args.slice(1).filter((a) => a.w[0] !== '-')).map((file) => ({ file, form: 'heredoc' }));
  return [];
}

/** The longest `timeout <n>` that bounds a wait, in seconds: 50 minutes (wait-deadlines A4). */
const MAX_WAIT_MINUTES = 50;
const LOOP_OPENERS = new Set(['until', 'while', 'for', 'select']);
const COMMAND_START = new Set(['do', 'then', 'else', 'elif', '!', '{', 'until', 'while', 'if', 'time']);
const SHELLS = /^(?:ba|da|z|k)?sh$/;

const baseName = (w) => path.basename(w).replace(/\.exe$/i, '');

/** For each token, whether it starts a command: the first, or one after a separator or a keyword that starts one. */
function commandStarts(toks) {
  const starts = [];
  toks.forEach((t, k) => {
    const prev = toks[k - 1];
    starts.push(!prev || (prev.op ? SEPARATORS.includes(prev.op) : COMMAND_START.has(prev.w) && starts[k - 1]));
  });
  return starts;
}

/** The first grep pattern or test operand of a loop's condition, else null. */
function markerOf(toks) {
  for (const { words } of commands(toks)) {
    const args = program(words);
    if (args.length === 0) continue;
    const name = baseName(args[0].w);
    if (/^(?:[ef]?grep|rg)$/.test(name)) {
      for (let k = 1; k < args.length; k++) {
        const a = args[k].w;
        if (a === '-e' || a === '--regexp') return args[k + 1] ? args[k + 1].w : null;
        if (a[0] !== '-') return a;
      }
    } else if (name === 'test' || name === '[' || name === '[[') {
      const operand = args.slice(1).find((a) => a.lit && !/^(?:-\w+|!|\]\]?|=+|!=)$/.test(a.w));
      if (operand) return operand.w;
    }
  }
  return null;
}

/** The seconds a `timeout` duration allows, else null; 0 never fires, so it is null too. */
function seconds(word) {
  const m = word.lit && /^(\d+(?:\.\d+)?)([smhd]?)$/.exec(word.w);
  const n = m ? Number(m[1]) * { '': 1, s: 1, m: 60, h: 3600, d: 86400 }[m[2]] : 0;
  return n > 0 ? n : null;
}

/** The program words under a leading `timeout [options] <n>`, and whether that `timeout` is within A4. */
function underTimeout(words) {
  const args = program(words);
  if (args.length === 0 || baseName(args[0].w) !== 'timeout') return { args, bounded: false };
  let k = 1;
  for (; k < args.length && args[k].w[0] === '-'; k++) if (/^-[ks]$|^--(?:kill-after|signal)$/.test(args[k].w)) k++;
  const n = args[k] ? seconds(args[k]) : null;
  return { args: program(args.slice(k + 1)), bounded: n !== null && n <= MAX_WAIT_MINUTES * 60 };
}

/** Whether the simple command starting at token `k` runs `sleep`, past prefixes and a per-call `timeout <n>`. */
function runsSleep(toks, k) {
  const words = [];
  for (; k < toks.length && !toks[k].op; k++) words.push(toks[k]);
  const { args } = underTimeout(words);
  return args.length > 0 && baseName(args[0].w) === 'sleep';
}

/** The `-c` script of a shell a simple command runs, and whether a `timeout` within A4 bounds it. */
function shellScript(words) {
  const { args, bounded } = underTimeout(words);
  if (args.length === 0 || !SHELLS.test(baseName(args[0].w))) return null;
  let dashC = false;
  for (let k = 1; k < args.length; k++) {
    const a = args[k].w;
    if (/^[-+]O$|^[-+]o$/.test(a)) k++;
    else if (/^-[a-zA-Z]+$/.test(a)) dashC = dashC || a.includes('c');
    else if (a[0] !== '-' && a[0] !== '+') return dashC ? { script: a, bounded } : null;
  }
  return null;
}

/** Each until/while loop that sleeps, with its marker and the words of its condition, nested shells included. */
function waitLoops(command, depth = 0) {
  const toks = tokens(command);
  const found = [];
  const open = [];
  const starts = commandStarts(toks);
  toks.forEach((t, k) => {
    if (t.op || !starts[k]) return;
    if (LOOP_OPENERS.has(t.w)) open.push({ form: t.w, start: k, body: false, sleeps: false });
    else if (t.w === 'do') {
      const loop = open.length > 0 && open[open.length - 1];
      if (loop && !loop.body) { loop.body = true; loop.cond = toks.slice(loop.start + 1, k); }
    } else if (t.w === 'done') {
      const loop = open.pop();
      if (loop && loop.body && loop.sleeps && (loop.form === 'until' || loop.form === 'while')) found.push(loop);
    } else if (runsSleep(toks, k)) {
      for (const loop of open) loop.sleeps = true;
    }
  });
  const waits = found.sort((a, b) => a.start - b.start).map((loop) => ({
    form: loop.form, marker: markerOf(loop.cond), reads: loop.cond.filter((c) => c.w).map((c) => c.w),
  }));
  if (depth < 3) {
    for (const { words } of commands(toks)) {
      const inner = shellScript(words);
      if (inner && !inner.bounded) waits.push(...waitLoops(inner.script, depth + 1));
    }
  }
  return waits;
}

/** Each until/while loop whose body sleeps with no `timeout <n>` of at most 50 minutes around it (wait-deadlines S2). */
function unboundedWaits(command) {
  return waitLoops(command).map(({ form, marker }) => ({ form, marker }));
}

/** The PreToolUse deny for an unbounded wait, else null; a tool call's own timeout is never a bound (L2). */
function waitDenial(command) {
  const waits = waitLoops(command);
  if (waits.length === 0) return null;
  const tasks = waits.some((w) => w.reads.some((r) => /(?:^|[\\/])tasks[\\/][^\\/]*\.output$/.test(r)));
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `A wait loop (${waits.map((w) => w.form).join(', ')}) that sleeps with no bound can wait ` +
        'forever and outlive you: the tool call\'s timeout stops applying once it is backgrounded. Wait on a file with ' +
        `\`pilot wait-for --file F --match RE --timeout M\` (M at most ${MAX_WAIT_MINUTES}); run a test suite with ` +
        'run_in_background and end your turn; a counted retry goes as `for i in $(seq N); do …; done`. ' +
        (tasks ? 'A subagent reports by message, not its output file: end your turn. ' : '') +
        'This is not a blocked step: post nothing and carry on.',
    },
  };
}

/** A Git Bash `/c/...` path as `C:/...` on win32 (L5). */
function native(p) {
  const m = isWindows() && /^\/([a-zA-Z])(\/.*)?$/.exec(p);
  return m ? `${m[1].toUpperCase()}:${m[2] || '/'}` : p;
}

/** The absolute paths a command would write from the shell, with the form of each, resolved against `cwd` (L3, L5, L7). */
function writeTargets(command, cwd) {
  const targets = [];
  let base = cwd;
  commands(tokens(command)).forEach((cmd, n) => {
    const { words, sep } = cmd;
    if (words[0].w === 'cd') {
      const literal = n === 0 && sep === '&&' && words.length === 2 && words[1].lit;
      base = literal ? path.resolve(cwd, native(words[1].w)) : null;
      return;
    }
    for (const { file, form } of shellWrites(cmd)) {
      const p = native(file.w);
      if (!file.lit || p.startsWith('/dev/') || (!path.isAbsolute(p) && base === null)) continue;
      targets.push({ path: path.resolve(base || cwd, p), form });
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
    const wait = waitDenial(command);
    if (wait) return wait;
    const targets = writeTargets(command, typeof payload.cwd === 'string' ? payload.cwd : process.cwd());
    if (targets.length === 0) return null;
    const tracked = ((deps && deps.isTracked) || isTracked)([...new Set(targets.map((t) => t.path))]);
    if (tracked.length === 0) return null;
    const forms = [...new Set(targets.filter((t) => tracked.includes(t.path)).map((t) => t.form))].join(', ');
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `A shell edit (${forms}) of the tracked file ${tracked.join(', ')} is not allowed: ` +
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

module.exports = { decide, writeTargets, isTracked, unboundedWaits };

if (require.main === module) {
  main();
}
