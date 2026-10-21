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
// the ledger rows and the header's own `adapted:` line, which must say the same
const notes = () => [...['VENDOR.md', 'vendor/toolbox.md'].map((f) => read(f).split('\n').find((l) => l.startsWith('| `agents/security-reviewer.md`'))), /^adapted: .*$/m.exec(AGENT)?.[0]];

test('the security reviewer runs no npx', () => {
  // no pin survives the cut, so any fetch-and-run command is a failure; the header is excluded
  const body = AGENT.split('\n-->\n')[1];
  assert.ok(body, 'the header closes');
  assert.doesNotMatch(body, /\b(npx|bunx|pnpm dlx|yarn dlx|npm (exec|install|i)\b)/);
});

test('npm audit runs only when the diff touches a package manifest or lockfile', () => {
  const section = AGENT.split('## Analysis Commands')[1].split('\n## ')[0];
  const cond = section.search(/Run only when the diff touches a package manifest or lockfile/);
  assert.ok(cond >= 0, 'the diff condition is stated');
  assert.doesNotMatch(AGENT, /`npm audit` where a lockfile exists/, 'no step runs it on a lockfile alone');
  assert.ok(cond < section.indexOf('npm audit --audit-level=high'), 'the condition precedes the command');
  const scan = AGENT.split('### 1. Initial Scan')[1].split('\n### ')[0];
  assert.match(scan, /`npm audit` only when the diff touches a package manifest or lockfile/, 'the initial scan carries the condition');
});

test('the description triggers on a process start and agent configuration', () => {
  assert.match(/^description: .*$/m.exec(AGENT)[0], /a process start,? or agent configuration/);
  for (const n of notes()) assert.match(n, /description names a process start and agent configuration/);
});

test('the ledger rows record the cut', () => {
  for (const n of notes()) assert.match(n ?? '', /eslint.*dropped/i);
});

// Spec 6 (S3): agent configuration gets its own checklist, one report row per item.
const configSection = () => {
  const parts = AGENT.split('\n## Agent configuration\n');
  assert.equal(parts.length, 2, 'one ## Agent configuration section');
  return parts[1].split('\n## ')[0];
};

test('the security reviewer carries the agent-configuration checklist', () => {
  const s = configSection();
  for (const item of ['Hook commands', 'Permission allow-lists', 'MCP servers and args', 'Secrets', 'Skills that run commands']) {
    assert.ok(s.includes(`\n- **${item}**`), `names ${item}`);
  }
  for (const n of notes()) assert.match(n, /agent-configuration checklist added/);
});

test('the checklist applies on agent configuration', () => {
  const paths = '(`agents/`, `hooks/`, `skills/`, `settings*.json`, `.mcp.json`, `CLAUDE.md`)';
  assert.ok(configSection().replace(/\s+/g, ' ').includes(paths), 'the section names them');
  assert.match(configSection(), /^\nWhen the diff touches agent configuration/, 'the section opens on its condition');
});

test('every checked item is a row', () => {
  const s = configSection().replace(/\s+/g, ' ');
  assert.match(s, /one row per item, never per file,[^.]*`## Report format`[^.]*table/i);
  assert.match(s, /its `Finding` opening with the item's name \(`Hook commands: clean`\)/);
  assert.match(s, /a clean item's Severity is `–`, not LOW/);
});

test('the checklist runs nothing', () => {
  assert.match(configSection(), /run nothing and install nothing/);
  assert.doesNotMatch(configSection(), /\bnpx\b|npm install|agentshield|semgrep|trufflehog|gitleaks|snyk/i);
});
