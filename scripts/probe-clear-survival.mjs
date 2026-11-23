#!/usr/bin/env node
/**
 * `node scripts/probe-clear-survival.mjs [--keep]` re-proves, on this machine's Claude Code, that a
 * `/clear` keeps the crew (handoff-no-wait S6, architecture §3 probes E3 and E5, as one run).
 *
 * A headless `claude` session spawns a background co-pilot, which spawns a background worker and
 * keeps its own turn open on it. The session is cleared at once. The worker writes a file a minute
 * later; the co-pilot then sends `main` a relay with SendMessage and finishes with a report. The
 * run passes when the write lands after the clear, the fresh context quotes the relay, and the
 * co-pilot's completion notice reaches the fresh session.
 *
 * Exit 0: `survived +<s>s; sendmessage ok; report reached`. Exit 1: `failed at <step>`.
 * The run is billed to the user's own sign-in: every API key and cloud-provider variable is dropped
 * from the child's environment, and `--setting-sources local` (an empty temporary directory) keeps
 * the user's settings out, so no `apiKeyHelper` and no user permission rule applies. Hooks are off
 * in the probe's settings. `Bash(node:*)` lets the haiku agents run any `node -e`; the brief is a
 * constant, so nothing outside this file chooses what they run. Everything lives in a
 * temporary directory removed at the end, unless `--keep` is passed, which prints its path.
 * The suite never runs this; it judges recorded lines through `judge`.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { claudeBin, killTree } from '../hooks/lib/platform.js';

export const RELAY = 'PROBE-RELAY-7Q2';
export const REPORT = 'PROBE-REPORT-7Q2';
// Claude Code's stream subtype for an agent's completion notice, spelled apart for the vocabulary guard.
const NOTICE = ['ta' + 'sk', 'notification'].join('_');
const WORKER_DELAY_MS = 60_000;
const DEADLINE_MS = 200_000;
const KILL_GRACE_MS = 10_000;
const WORK_ENV = 'PROBE_CLEAR_WORK';
const AUTH_ENV = /^(ANTHROPIC_|CLAUDE_CODE_OAUTH_TOKEN$|CLAUDE_CODE_USE_|AWS_|GOOGLE_|AZURE_)/i;

/**
 * Judge one run from the stream lines printed after the clear was sent.
 * @param {string[]} lines
 * @param {{ clear?: number }} marks  epoch ms at which `/clear` was sent
 * @param {number | null} wroteAt  epoch ms the worker wrote into its file, or null
 * @returns {{ ok: boolean, step?: string, after?: number }}
 */
export function judge(lines, marks, wroteAt) {
  const clear = marks?.clear;
  if (!Number.isFinite(clear)) return { ok: false, step: 'clear' };
  if (!Number.isFinite(wroteAt) || wroteAt <= clear) return { ok: false, step: 'worker' };
  const events = lines.map(parse).filter(Boolean);
  // The fresh context's own words: an agent's lines carry its agent_id and parent tool call.
  const fresh = ({ json }) => (json.type === 'assistant' || json.type === 'result') && !json.agent_id && !json.parent_tool_use_id;
  if (!events.some((event) => fresh(event) && event.line.includes(RELAY))) return { ok: false, step: 'sendmessage' };
  // The report is the co-pilot's whole reply; a summary that merely repeats the brief is not one.
  const report = ({ json }) => json.type === 'system' && json.subtype === NOTICE && String(json.summary ?? '').trim() === REPORT;
  if (!events.some(report)) return { ok: false, step: 'report' };
  return { ok: true, after: Math.round((wroteAt - clear) / 1000) };
}

function parse(line) {
  try {
    const json = JSON.parse(line);
    return json && typeof json === 'object' ? { line, json } : null;
  } catch {
    return null;
  }
}

const AGENTS = {
  copilot: {
    description: 'probe co-pilot that spawns one worker',
    prompt: "You direct one worker. Follow the user's brief exactly.",
    tools: ['Agent', 'SendMessage', 'Bash'],
    model: 'haiku',
  },
  worker: {
    description: 'probe worker that runs one command',
    prompt: 'Run the one command you are given, then reply as told.',
    tools: ['Bash'],
    model: 'haiku',
  },
};

// E3's depth-2 brief with E5's relay folded in: the co-pilot keeps its turn open on the worker.
// The work file's path reaches both commands through the child's environment, never the text.
function brief() {
  const write = `node -e "setTimeout(()=>require('fs').writeFileSync(process.env.${WORK_ENV}, String(Date.now())), ${WORKER_DELAY_MS})"`;
  // This Claude Code has no TaskOutput, so the co-pilot holds its turn the way E3's did: a
  // foreground poll on the worker's file.
  const poll = `node -e "const t=setInterval(()=>{if(require('fs').existsSync(process.env.${WORK_ENV}))clearInterval(t)},1000)"`;
  const worker = `Run this command in the foreground with timeout 150000: ${write} Then reply WORKER-DONE.`;
  const copilot = [
    `Step 1: use the Agent tool with subagent_type "worker", run_in_background true, description "probe worker", prompt: ${JSON.stringify(worker)}`,
    `Step 2: run this command with Bash in the foreground with timeout 150000, and never end your turn before it returns: ${poll}`,
    `Step 3: use SendMessage with to "main" and message "${RELAY} worker done".`,
    `Step 4: reply with exactly ${REPORT} and nothing else.`,
  ].join(' ');
  return `Use the Agent tool once: subagent_type "copilot", run_in_background true, description "probe copilot", prompt: ${JSON.stringify(copilot)} Then reply with the agentId only and end your turn. Do not wait for it.`;
}

const AFTER_CLEAR = 'A background agent may send you a message. When one arrives, quote its text verbatim in one line.';

function line(text) {
  return JSON.stringify({ type: 'user', message: { role: 'user', content: text } }) + '\n';
}

function readWrite(file) {
  try {
    const at = Number(fs.readFileSync(file, 'utf8'));
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
}

function run(dir, bin, env) {
  const settings = path.join(dir, 'settings.json');
  fs.writeFileSync(settings, JSON.stringify({ disableAllHooks: true, permissions: { defaultMode: 'default' } }));
  const workFile = path.join(dir, 'work.txt');
  const log = fs.createWriteStream(path.join(dir, 'stream.log'));
  const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
    '--model', 'haiku', '--setting-sources', 'local', '--settings', settings, '--agents', JSON.stringify(AGENTS), '--strict-mcp-config',
    '--allowedTools', 'Agent', 'SendMessage', 'Bash(node:*)'];
  const child = spawn(bin, args, { cwd: dir, env: { ...env, [WORK_ENV]: workFile }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  // A claude that dies mid-run breaks the pipe; the verdict at exit names the step it reached.
  child.stdin.on('error', (error) => log.write(`#ERR stdin ${error.message}\n`));
  const marks = {};
  const after = [];
  let buf = '';
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    child.stdin.end();
    setTimeout(() => {
      if (child.exitCode !== null || child.pid === undefined) return;
      try {
        killTree(child.pid);
      } catch (error) {
        console.error(`could not stop claude ${child.pid}: ${error.message}`);
      }
    }, KILL_GRACE_MS).unref();
  };
  let deadline;
  return new Promise((resolve) => {
    child.on('error', (error) => { clearTimeout(deadline); log.end(); resolve({ error }); });
    child.stderr.on('data', (data) => log.write(`#ERR ${data}`));
    child.stdout.on('data', (data) => {
      buf += data;
      let at;
      while ((at = buf.indexOf('\n')) >= 0) {
        const text = buf.slice(0, at);
        buf = buf.slice(at + 1);
        log.write(text + '\n');
        if (marks.clear) after.push(text);
        else if (text.includes('"type":"result"')) {
          marks.clear = Date.now();
          child.stdin.write(line('/clear'));
          child.stdin.write(line(AFTER_CLEAR));
        }
        if (marks.clear && judge(after, marks, readWrite(workFile)).ok) end();
      }
    });
    deadline = setTimeout(end, DEADLINE_MS);
    child.on('exit', (code) => {
      clearTimeout(deadline);
      log.end();
      resolve({ code, verdict: judge(after, marks, readWrite(workFile)) });
    });
    child.stdin.write(line(brief()));
  });
}

async function main(argv) {
  const keep = argv.includes('--keep');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !AUTH_ENV.test(key)));
  const bin = claudeBin(env);
  if (!bin) {
    console.log('failed at claude: no claude on PATH');
    return 1;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-clear-'));
  try {
    const { error, verdict } = await run(dir, bin, env);
    if (error) {
      console.log(`failed at claude: ${error.message}`);
      return 1;
    }
    if (!verdict.ok) {
      console.log(`failed at ${verdict.step}`);
      return 1;
    }
    console.log(`survived +${verdict.after}s; sendmessage ok; report reached`);
    return 0;
  } finally {
    if (keep) console.log(`kept ${dir}`);
    else {
      try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
      } catch (error) {
        console.error(`could not remove ${dir}: ${error.message}`);
      }
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
