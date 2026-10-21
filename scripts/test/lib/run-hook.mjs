/**
 * A hook run the way the harness runs it: a child process, the payload on stdin,
 * whatever it prints read back from stdout as JSON. The deck it asks is a stub on
 * an ephemeral port of this call's own, answering `/api/runs?live=1` with `runs`
 * and `deck_read` with `items`, and anything else with a 404 the hooks treat as
 * no deck. Its home is a directory under `fake-home.mjs`'s, so a hook that writes
 * a claim or reads a snapshot never reaches the real `~/.claude` or the user's
 * deck on 4321.
 *
 *     const out = await runHook('hooks/post-tool.js', (home) => ({ input, runs, items, files }));
 *
 * `setup` is given the hook's home, since a payload's `cwd` and an item's `repo`
 * usually live under it; `files` maps a path under that home to the text to
 * write there first. The answer is the parsed stdout, or null when the hook
 * printed nothing.
 */

import { FAKE_HOME } from './fake-home.mjs';

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** The stub deck; resolves to the listening server. */
async function stubDeck(runs, items) {
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const answer = (code, value) => {
        response.writeHead(code, { 'content-type': 'application/json' });
        response.end(JSON.stringify(value));
      };
      if (request.url === '/api/runs?live=1') return answer(200, { runs: runs.map((repo) => ({ repo, pid: 1 })) });
      let call = {};
      try { call = JSON.parse(body || '{}'); } catch { /* not a tool call */ }
      if (request.url === '/api/tool' && call.name === 'deck_read') {
        return answer(200, { content: [{ type: 'text', text: JSON.stringify({ total: items.length, items }) }] });
      }
      return answer(404, { error: 'not on this stub' });
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

export async function runHook(script, setup) {
  const home = fs.mkdtempSync(path.join(FAKE_HOME, 'hook-'));
  const { input, runs = [], items = [], files = {} } = setup(home);
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(home, rel)), { recursive: true });
    fs.writeFileSync(path.join(home, rel), text, 'utf8');
  }
  const server = await stubDeck(runs, items);
  try {
    const out = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(ROOT, script)], {
        env: { ...process.env, HOME: home, USERPROFILE: home, PILOT_DECK_PORT: String(server.address().port) },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let text = '';
      let err = '';
      child.stdout.on('data', (chunk) => { text += chunk; });
      child.stderr.on('data', (chunk) => { err += chunk; });
      child.on('error', reject);
      child.on('close', (code) => (code === 0 ? resolve(text) : reject(new Error(`${script} exited ${code}: ${err}`))));
      child.stdin.end(JSON.stringify(input));
    });
    return out.trim() === '' ? null : JSON.parse(out);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(home, { recursive: true, force: true });
  }
}
