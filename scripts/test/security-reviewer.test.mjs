/**
 * The security reviewer installs nothing: a reviewer spawned on any repo must not run a
 * command that downloads a package. `npx eslint . --plugin security` fetched eslint and
 * a plugin on repos that had neither, so it is cut, and `npm audit` runs only when the
 * diff touches a package manifest or lockfile.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const AGENT = read('agents/security-reviewer.md');

test('the security reviewer runs no npx', () => {
  // lint: no fetch-and-run command in the body; the header is excluded
  const body = AGENT.split('\n-->\n')[1];
  assert.ok(body, 'the header closes');
  assert.doesNotMatch(body, /\b(npx|bunx|pnpm dlx|yarn dlx|npm (exec|install|i)\b)/);
});

test('npm audit runs only when the diff touches a package manifest or lockfile', () => {
  // lint: no step runs npm audit on a lockfile alone
  assert.doesNotMatch(AGENT, /`npm audit` where a lockfile exists/, 'no step runs it on a lockfile alone');
});

// Spec 6 (S3): agent configuration gets its own checklist, one report row per item.
const configSection = () => {
  const parts = AGENT.split('\n## Agent configuration\n');
  assert.equal(parts.length, 2, 'one ## Agent configuration section');
  return parts[1].split('\n## ')[0];
};

test('the security reviewer carries the agent-configuration checklist', () => {
  // lint: the section and its five checklist items exist
  const s = configSection();
  for (const item of ['Hook commands', 'Permission allow-lists', 'MCP servers and args', 'Secrets', 'Skills that run commands']) {
    assert.ok(s.includes(`\n- **${item}**`), `names ${item}`);
  }
});

test('the checklist runs nothing', () => {
  // lint: no scanner or install command in the checklist
  assert.doesNotMatch(configSection(), /\bnpx\b|npm install|agentshield|semgrep|trufflehog|gitleaks|snyk/i);
});
