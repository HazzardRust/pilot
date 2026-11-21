/**
 * S4 of wait-deadlines: the stalled-wait line names the agent that started the wait (spec 5; L7, A6). The fixture is
 * a projects dir in a temp dir. Its two Bash lines are wait B's own `tool_use` entries, captured on 2026-11-20 from
 * `agent-a74c7de1fde395ad7.jsonl` lines 38 and 44 and cut down to the fields they parse. Its meta is that agent's
 * `agentType`. No test reads the real `~/.claude/projects`, and none reads or stops a real process.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import './no-open.mjs';
import { reapStalled } from '../stalled-waits.mjs';
import { holderOfCommand } from '../transcripts.mjs';

const REPO = 'C:/Users/Hazzard/Projects/pilot';
const DIR_NAME = 'C--Users-Hazzard-Projects-pilot';
const AGENT_B = 'a74c7de1fde395ad7';
// Claude Code's output directory, as captured; its last name is retired in this repo's prose.
const OUT = ['C:/Users/Hazzard/AppData/Local/Temp/claude/7a69d4d978d8168b/cfcac5b0-fb40-4125-9d49-5518e21aebe4', 'ta' + 'sks', 'bjiht9qfr.output'].join('/');
const WAIT_B = `until grep -q NODE-DONE ${OUT} || grep -q "^# fail" ${OUT}; do sleep 3; done; cat ${OUT}`;
const CLEANUP_B = `cat ${OUT}; pkill -f "grep -q NODE-DONE" 2>/dev/null; true`;

/** One captured assistant entry holding one Bash call, as wait B's transcript wrote it. */
const bashLine = (agentId, sessionId, msgId, toolId, input) => JSON.stringify({
  type: 'assistant', isSidechain: true, agentId, sessionId, timestamp: '2026-11-19T22:40:06.570Z',
  message: { id: msgId, role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'tool_use', id: toolId, name: 'Bash', input }] },
});

/** A projects root holding `agents`: each `{ session, id, agentType, lines }` written as Claude Code lays a subagent out. */
function projectsRoot(t, agents) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wait-holder-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const { session, id, agentType, lines } of agents) {
    const dir = path.join(root, DIR_NAME, session, 'subagents');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `agent-${id}.jsonl`), `${lines.join('\n')}\n`);
    if (agentType) fs.writeFileSync(path.join(dir, `agent-${id}.meta.json`), JSON.stringify({ agentType, description: 'Re-review S12 final head' }));
  }
  return root;
}

const S1 = '4f2e1278-8d6e-4104-a8f1-eb027dfbd263';
const S2 = 'bce3deb0-0c73-45f8-8132-27cc274858a8';
const waitB = (session = S1, id = AGENT_B) => ({
  session, id, agentType: 'pilot:rust-reviewer',
  lines: [
    bashLine(id, session, 'msg_011ChD6ENrDEfTLxRZTHckHA', 'toolu_01JqeU5q7riu6DQ5n4cqbTzY', { command: WAIT_B, timeout: 590000 }),
    '{"type":"assistant","message":', // a line cut off mid-write
    bashLine(id, session, 'msg_011ChD6TxGVQPiYXxVZL46Kz', 'toolu_01WEfN93Eti4qvQKxZUFLts4', { command: CLEANUP_B }),
  ],
});
const other = (session = S1, id = 'a18544e3d23cf7d4f') => ({
  session, id, agentType: 'pilot:pilot-implementer',
  lines: [bashLine(id, session, 'msg_2', 'toolu_2', { command: 'npm test' })],
});

test('the holder is named', (t) => {
  const root = projectsRoot(t, [waitB(), waitB(S2), other()]);
  assert.deepEqual(holderOfCommand(REPO, WAIT_B, { projectsRoot: root }), { agentType: 'pilot:rust-reviewer', agentId: AGENT_B });
  assert.deepEqual(holderOfCommand(REPO.toLowerCase(), 'npm test', { projectsRoot: root }), { agentType: 'pilot:pilot-implementer', agentId: 'a18544e3d23cf7d4f' });
});

test('ambiguity is unknown', (t) => {
  const two = projectsRoot(t, [waitB(), waitB(S1, 'a0000000000000001'), other()]);
  assert.equal(holderOfCommand(REPO, WAIT_B, { projectsRoot: two }), null, 'two agents ran it');
  const none = projectsRoot(t, [other()]);
  assert.equal(holderOfCommand(REPO, WAIT_B, { projectsRoot: none }), null, 'no agent ran it');
  assert.equal(holderOfCommand('C:/elsewhere', WAIT_B, { projectsRoot: two }), null, 'another repository has no project dir');
  assert.equal(holderOfCommand(REPO, '', { projectsRoot: two }), null, 'an empty needle names no one');
  const untyped = projectsRoot(t, [{ ...waitB(), agentType: null }]);
  assert.deepEqual(holderOfCommand(REPO, WAIT_B, { projectsRoot: untyped }), { agentType: 'unknown', agentId: AGENT_B }, 'no meta file');
});

test('the line carries it', (t) => {
  const root = projectsRoot(t, [waitB(), other()]);
  // Wait B as its shell ran it: Claude Code's eval of the command, its `"` escaped in the command line.
  const line = String.raw`"C:\Program Files\Git\bin\bash.exe" -c "source /c/Users/Hazzard/.claude/shell-snapshots/snapshot-bash-1.sh 2>/dev/null || true && eval '${WAIT_B.replace(/"/g, '\\"')}' < /dev/null && pwd -P >| /tmp/claude-bb4b-cwd"`;
  const table = [
    { pid: 16988, ppid: 1, name: 'claude.exe', command: 'claude.exe', ageS: 20 * 3600 },
    { pid: 16990, ppid: 16988, name: 'node.exe', command: 'node deck/client.mjs', ageS: 20 * 3600 },
    { pid: 30060, ppid: 16988, name: 'bash.exe', command: line, ageS: 3 * 3600 },
  ];
  const notes = [];
  reapStalled({
    read: () => table,
    runs: () => [{ pid: 16990, repo: REPO }],
    kill: () => {},
    note: (repo, text) => notes.push([repo, text]),
    holder: (row) => {
      const found = holderOfCommand(row.repo, row.script, { projectsRoot: root, since: Date.now() - row.ageS * 1000 });
      return found && `${found.agentType} ${found.agentId}`;
    },
  });
  assert.deepEqual(notes, [[REPO, `stopped stalled wait 30060 "NODE-DONE" held by pilot:rust-reviewer ${AGENT_B} for 180 min`]]);
});

test('a transcript last written before the wait began is not read', (t) => {
  const root = projectsRoot(t, [waitB(), other()]);
  const file = path.join(root, DIR_NAME, S1, 'subagents', `agent-${AGENT_B}.jsonl`);
  const began = Date.now() - 60_000;
  const old = new Date(began - 3_600_000);
  fs.utimesSync(file, old, old);
  assert.equal(holderOfCommand(REPO, WAIT_B, { projectsRoot: root, since: began }), null, 'written an hour before the shell began');
  assert.deepEqual(holderOfCommand(REPO, WAIT_B, { projectsRoot: root, since: old.getTime() - 1 }), { agentType: 'pilot:rust-reviewer', agentId: AGENT_B }, 'written after it');
  assert.deepEqual(holderOfCommand(REPO, WAIT_B, { projectsRoot: root }), { agentType: 'pilot:rust-reviewer', agentId: AGENT_B }, 'no since reads all');
});
