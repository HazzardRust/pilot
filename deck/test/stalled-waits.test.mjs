/**
 * S3 of wait-deadlines: the deck stops a stalled wait under a pilot run and tells the pilot (spec 5, 6, 8, 9; L5-L7).
 * The two wait rows are the CIM `CommandLine`s of two live Claude Code shells captured on 2026-11-20, shaped as
 * waits A and B were (a loop on a subagent's output file, §3); only their paths are re-rooted at this machine's temp
 * dir. The process table and the kill are injected: nothing here reads or stops a real process.
 */
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { STALL_AGE_S, reapStalled, shellScript, stalledWaits } from '../stalled-waits.mjs';

const WIN_TMP = os.tmpdir();
const TMP = WIN_TMP.replace(/\\/g, '/');
const SH_TMP = TMP.replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);
// Claude Code's output directory; its last name is retired in this repo's prose.
const OUT = [TMP, 'claude/7a69d4d978d8168b/cfcac5b0-fb40-4125-9d49-5518e21aebe4', 'ta' + 'sks'].join('/');
const SH_OUT = OUT.replace(TMP, SH_TMP);

const GIT_BASH = String.raw`C:\Program Files\Git\bin\bash.exe`;
const USR_BASH = String.raw`C:\Program Files\Git\bin\..\usr\bin\bash.exe`;
/** A captured Claude Code shell line: `program` running `script` inside its `eval '…'`, the script's `"` escaped as captured. */
const captured = (program, script, cwd) =>
  String.raw`"${program}" -c "source ${SH_TMP}/.claude/shell-snapshots/snapshot-bash-1795046101510-hfi07s.sh 2>/dev/null || true && export TEMP='${WIN_TMP}' TMP='${WIN_TMP}' && \builtin shopt -u extglob 2>/dev/null || true && { \builtin unalias -- 'which'; \builtin unset -f -- 'which'; } >/dev/null 2>&1 || true && { \builtin unalias -- 'unsetenv'; \builtin unset -f -- 'unsetenv'; } >/dev/null 2>&1 || true && eval '${script}' < /dev/null && pwd -P >| ${SH_TMP}/claude-${cwd}-cwd"`;
const SCRIPT_A = String.raw`until [ -s ${OUT}/a28aa8f6e9874cbe0.output ] && grep -q \"Verdict\" ${OUT}/a28aa8f6e9874cbe0.output; do sleep 10; done; echo ready`;
const SCRIPT_B = String.raw`until [ -s ${SH_OUT}/a18544e3d23cf7d4f.output ] && grep -q \"Verdict\" ${SH_OUT}/a18544e3d23cf7d4f.output; do sleep 10; done; echo ready`;

const REPO = path.join(os.tmpdir(), 'wait-deadlines-repo');
const H = 3600;
const CLAUDE = 16988;
const CLIENT = 16990;
const proc = (pid, ppid, name, command, ageS) => ({ pid, ppid, name, command, ageS });
const session = (claude = CLAUDE, client = CLIENT) => [
  proc(claude, 1, 'claude.exe', '"claude.exe" --agent pilot:pilot', 20 * H),
  proc(client, claude, 'node.exe', 'node deck/client.mjs', 20 * H),
];
/** A wait as Claude Code runs it: the Git `bin` bash and its `usr\bin` child, both under the session's claude. */
const pair = (parent, child, script, ageS, claude = CLAUDE) => [
  proc(parent, claude, 'bash.exe', captured(GIT_BASH, script, 'bb4b'), ageS),
  proc(child, parent, 'bash.exe', captured(USR_BASH, script, 'bb4b'), ageS),
];
const runs = [{ pid: CLIENT, repo: REPO }];

test('the recorded rows are seen', () => {
  assert.equal(STALL_AGE_S, 50 * 60);
  assert.equal(shellScript(captured(GIT_BASH, SCRIPT_A, 'bb4b')), SCRIPT_A.replace(/\\"/g, '"'));
  const table = [...session(), ...pair(9988, 46312, SCRIPT_A, 14 * H), ...pair(30060, 33432, SCRIPT_B, 3 * H)];
  const rows = stalledWaits(table, { runs });
  assert.deepEqual(
    rows.map(({ pid, kind, owner, worktree, orphan, marker, repo }) => ({ pid, kind, owner, worktree, orphan, marker, repo })),
    [
      { pid: 9988, kind: 'shell', owner: CLAUDE, worktree: REPO, orphan: 'stalled 840 min', marker: `${OUT}/a28aa8f6e9874cbe0.output`, repo: REPO },
      { pid: 30060, kind: 'shell', owner: CLAUDE, worktree: REPO, orphan: 'stalled 180 min', marker: `${SH_OUT}/a18544e3d23cf7d4f.output`, repo: REPO },
    ],
  );
});

test('only a stalled loop under a pilot run', () => {
  const OLD = 30 * H;
  const table = [
    ...session(),
    ...pair(101, 102, SCRIPT_A, 49 * 60), // under the stall age
    ...session(200, 201), // a claude whose client registered no run
    ...pair(203, 204, SCRIPT_A, OLD, 200),
    proc(301, CLAUDE, 'node.exe', `node -e "${SCRIPT_A}"`, OLD),
    proc(302, CLAUDE, 'claude.exe', captured(GIT_BASH, SCRIPT_A, 'c1'), OLD),
    proc(303, CLAUDE, 'git.exe', captured(GIT_BASH, SCRIPT_A, 'c2'), OLD),
    ...pair(304, 305, 'pilot wait-for --file out.log --match done --timeout 50', OLD),
    ...pair(306, 307, `timeout 600 bash -c 'until grep -q x f; do sleep 5; done'`, OLD),
    ...pair(308, 309, 'npm test', OLD),
  ];
  assert.deepEqual(stalledWaits(table, { runs }), []);
  assert.equal(stalledWaits([...session(), ...pair(101, 102, SCRIPT_A, STALL_AGE_S)], { runs }).length, 1, 'the bar is inclusive');
});

const reap = (table, extra = {}) => {
  const kills = [];
  const notes = [];
  const lines = reapStalled({
    read: () => table,
    runs: () => runs,
    kill: (pid, tree) => kills.push([pid, tree]),
    note: (repo, line) => notes.push([repo, line]),
    ...extra,
  });
  return { kills, notes, lines };
};

test('the stop is the shell only', () => {
  const table = [...session(), ...pair(9988, 46312, SCRIPT_A, 14 * H), ...pair(30060, 33432, SCRIPT_B, 3 * H)];
  const { kills, notes, lines } = reap(table);
  assert.deepEqual(kills, [[9988, true], [30060, true]]);
  assert.deepEqual(notes, [
    [REPO, `stopped stalled wait 9988 "${OUT}/a28aa8f6e9874cbe0.output" held by unknown for 840 min`],
    [REPO, `stopped stalled wait 30060 "${SH_OUT}/a18544e3d23cf7d4f.output" held by unknown for 180 min`],
  ]);
  assert.equal(lines.length, 2);

  const named = reap(table, { holder: (row) => (row.pid === 9988 ? 'implementer audit-f14 S2' : null) });
  assert.match(named.notes[0][1], / held by implementer audit-f14 S2 for 840 min$/);
  assert.match(named.notes[1][1], / held by unknown for 180 min$/);

  const refused = reap(table, { kill: (pid) => { if (pid === 9988) throw new Error('Access is denied'); } });
  assert.deepEqual(refused.notes.map(([, line]) => line.split(' ')[3]), ['30060'], 'a stop that failed is not told as one');
  assert.ok(refused.lines.some((line) => line.startsWith('could not stop 9988')));
});

test('an unreadable table stops nothing', () => {
  const { kills, notes, lines } = reap(null, { read: () => { throw new Error('powershell gone'); } });
  assert.deepEqual(kills, []);
  assert.deepEqual(notes, []);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /powershell gone/);
});
