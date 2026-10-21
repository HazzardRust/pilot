/**
 * `crlfFiles(dir)`: the tracked paths in the repository at `dir` whose working copy git reports as
 * `w/crlf` or `w/mixed` in `git ls-files --eol`, sorted. A text-mode write on Windows leaves CRLF
 * in a file the parsers read as LF, and they then see nothing; this names the file instead.
 */

import { execFileSync } from 'node:child_process';

// One entry per tracked file: `i/lf    w/crlf  attr/text eol=lf\t<path>`, NUL-terminated under -z.
const ENTRY = /^i\/\S*\s+w\/(\S*)\s+attr\/[^\t]*\t(.*)$/s;

export function crlfFiles(dir) {
  const out = execFileSync('git', ['ls-files', '--eol', '-z'], {
    cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  const found = [];
  for (const entry of out.split('\0')) {
    if (entry === '') continue;
    const m = ENTRY.exec(entry);
    if (!m) throw new Error(`unrecognised git ls-files --eol entry: ${JSON.stringify(entry)}`);
    if (m[1] === 'crlf' || m[1] === 'mixed') found.push(m[2]);
  }
  return found.sort();
}
