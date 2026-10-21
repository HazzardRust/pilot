/**
 * The CI gate (main-never-red spec 2; L4, L5, L8; mac-linux spec 1, L7, L10): `.github/workflows/gate.yml`
 * runs the project's full gate on `ubuntu-latest` for every non-draft PR and every push to `main`, and on
 * macOS and Windows too for a PR labelled `all-os`, the weekly schedule, a dispatch, or any PR once the
 * repository is public, with a read-only token and no secret. These pins read its text and evaluate its
 * expressions against an event, so rewording or reordering its keys keeps them green; only the four run
 * steps are pinned in order.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORKFLOW = path.join(ROOT, '.github', 'workflows', 'gate.yml');

/** The workflow file's text, line endings normalised. */
export function workflowText() {
  return fs.readFileSync(WORKFLOW, 'utf8').replace(/\r\n/g, '\n');
}

/** The non-blank lines of `text`, YAML comments dropped. */
function lines(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/\s+#.*$/, ''))
    .filter((line) => line.trim() && !line.trim().startsWith('#'));
}

/** `text` without its comments and blank lines, so a comment can neither pass nor fail a pin. */
const code = (text) => lines(text).join('\n');

/** The first `key:` line at any depth: its inline value, then the lines nested under it. */
function block(text, key) {
  const all = lines(text);
  const at = all.findIndex((line) => new RegExp(`^\\s*(- )?['"]?${key}['"]?:`).test(line));
  assert.ok(at >= 0, `no "${key}:" key`);
  const indent = all[at].search(/\S/);
  const body = [all[at].replace(/^[^:]*:\s*/, '')];
  for (const line of all.slice(at + 1)) {
    if (line.search(/\S/) <= indent) break;
    body.push(line);
  }
  return body.join('\n');
}

/** Every value of `key:` anywhere in `text`, unquoted. */
function values(text, key) {
  return lines(text)
    .map((line) => line.match(new RegExp(`^\\s*(?:- )?${key}:\\s*(.*)$`)))
    .filter(Boolean)
    .map((match) => match[1].replace(/^(['"])(.*)\1$/, '$2').trim());
}

/** Whether a `branches:` value, flow or block form, names `main`. */
const namesMain = (branches) => /(^|[\s[,'"-])main($|[\s\],'"])/.test(branches);

/**
 * Evaluates one GitHub Actions expression (`${{ }}` optional) against `context`: paths with `.*.`,
 * string, boolean and null literals, `!`, `==`, `!=`, `&&`, `||` (returning an operand, as Actions
 * does), parentheses, `contains` and `fromJSON`. Enough for the job's `if`, `runs-on` and matrix.
 */
function evaluate(source, context) {
  const tokens = source.replace(/^\s*\$\{\{|\}\}\s*$/g, '')
    .match(/'(?:[^']|'')*'|&&|\|\||[=!]=|[!(),]|[\w.*-]+/g);
  let at = 0;
  const peek = () => tokens[at];
  const take = (expected) => {
    const token = tokens[at++];
    if (expected !== undefined) assert.equal(token, expected, `expression: ${source}`);
    return token;
  };
  const lookup = (path) => path.split('.').reduce((value, key) => {
    if (value == null) return null;
    if (key === '*') return Array.isArray(value) ? value : Object.values(value);
    return Array.isArray(value) ? value.map((item) => item?.[key]) : value[key] ?? null;
  }, context);
  const functions = {
    contains: (haystack, needle) => (Array.isArray(haystack) || typeof haystack === 'string') && haystack.includes(needle),
    fromJSON: (json) => JSON.parse(json),
  };
  function primary() {
    const token = take();
    if (token === '!') return !primary();
    if (token === '(') { const value = or(); take(')'); return value; }
    if (token.startsWith("'")) return token.slice(1, -1).replace(/''/g, "'");
    if (['true', 'false', 'null'].includes(token)) return JSON.parse(token);
    if (peek() === '(') {
      take('(');
      const args = [or()];
      while (peek() === ',') { take(','); args.push(or()); }
      take(')');
      assert.ok(functions[token], `unknown function ${token}`);
      return functions[token](...args);
    }
    return lookup(token);
  }
  function equality() {
    let value = primary();
    while (peek() === '==' || peek() === '!=') value = (take() === '==') === (value === primary());
    return value;
  }
  function and() { let value = equality(); while (peek() === '&&') { take(); const right = equality(); value = value && right; } return value; }
  function or() { let value = and(); while (peek() === '||') { take(); const right = and(); value = value || right; } return value; }
  const value = or();
  assert.equal(at, tokens.length, `unparsed tail in: ${source}`);
  return value;
}

/** The context of one event: `event` is a name, `pr` a pull request's `draft` and `labels`. */
function event(name, { draft = false, labels = [], isPrivate = true } = {}) {
  const pullRequest = name === 'pull_request' ? { draft, labels: labels.map((label) => ({ name: label })) } : undefined;
  return { github: { event_name: name, event: { pull_request: pullRequest, repository: { private: isPrivate } } } };
}

/** The OSes the workflow starts a gate job on for `context`, from every job's `if`, `runs-on` and matrix. */
function osesFor(context) {
  const jobs = block(workflowText(), 'jobs');
  const names = lines(jobs).filter((line) => /^ {2}[\w-]+:/.test(line)).map((line) => line.trim().slice(0, -1));
  return names.flatMap((name) => {
    const job = block(jobs, name);
    const condition = values(job, 'if')[0];
    if (condition !== undefined && !evaluate(condition, context)) return [];
    const runsOn = values(job, 'runs-on')[0];
    if (!/matrix\.os/.test(runsOn)) return [evaluate(`'${runsOn}'`, context)];
    const os = values(block(job, 'strategy'), 'os')[0];
    return os.startsWith('${{') ? evaluate(os, context) : JSON.parse(os.replace(/([\w-]+)/g, '"$1"'));
  }).sort();
}

const THREE = ['macos-latest', 'ubuntu-latest', 'windows-latest'];

test('the gate job runs on three OSes without failing fast', () => {
  const strategy = block(block(workflowText(), 'gate'), 'strategy');
  assert.equal(values(strategy, 'fail-fast')[0], 'false');
  for (const os of THREE) assert.match(values(strategy, 'os')[0], new RegExp(os), `the matrix lists ${os}`);
  assert.deepEqual(osesFor(event('workflow_dispatch')), THREE);
});

test('macos and windows run on every PR when public, else only on the label, the schedule or a dispatch', () => {
  assert.deepEqual(osesFor(event('pull_request', { isPrivate: false })), THREE, 'a public PR');
  assert.deepEqual(osesFor(event('pull_request', { labels: ['all-os'] })), THREE, 'a labelled PR');
  assert.deepEqual(osesFor(event('pull_request', { draft: true, labels: ['docs', 'all-os'] })), THREE, 'a labelled draft');
  assert.deepEqual(osesFor(event('schedule')), THREE, 'the schedule');
  assert.deepEqual(osesFor(event('workflow_dispatch')), THREE, 'a dispatch');
  assert.deepEqual(osesFor(event('pull_request', { labels: ['docs'] })), ['ubuntu-latest'], 'an unlabelled private PR');
  assert.deepEqual(osesFor(event('push')), ['ubuntu-latest'], 'a push to main');
  assert.deepEqual(osesFor(event('push', { isPrivate: false })), ['ubuntu-latest'], 'a public push to main');
  const on = block(workflowText(), 'on');
  assert.match(block(block(on, 'schedule'), 'cron'), /^'?\S+ \S+ \S+ \S+ \S+'?$/, 'a cron schedule');
  assert.match(on, /^\s*workflow_dispatch:/m, 'a dispatch trigger');
});

test('ubuntu keeps main-never-red\'s triggers', () => {
  const text = workflowText();
  const on = block(text, 'on');
  const pullRequest = block(on, 'pull_request');
  assert.ok(namesMain(block(pullRequest, 'branches')), 'pull_request names main');
  assert.match(block(pullRequest, 'branches'), /['"]feat\/\*\*['"]/, 'a slice PR into a feature branch (A3)');
  assert.ok(namesMain(block(block(on, 'push'), 'branches')), 'push names main');
  assert.doesNotMatch(block(block(on, 'push'), 'branches'), /feat/, 'push stays on main');
  const types = block(pullRequest, 'types');
  for (const type of ['opened', 'synchronize', 'reopened', 'ready_for_review', 'labeled']) {
    assert.match(types, new RegExp(`\\b${type}\\b`), `pull_request types include ${type}`);
  }
  assert.ok(osesFor(event('pull_request')).includes('ubuntu-latest'), 'a non-draft PR');
  assert.ok(osesFor(event('push')).includes('ubuntu-latest'), 'a push to main');
  assert.deepEqual(osesFor(event('pull_request', { draft: true, labels: ['docs'] })), [], 'a draft without the label');
  assert.deepEqual(osesFor(event('pull_request', { draft: true, isPrivate: false })), [], 'a public draft');
  for (const trigger of ['pull_request_target', 'issue_comment', 'workflow_run']) {
    assert.doesNotMatch(code(text), new RegExp(`\\b${trigger}\\b`), `no ${trigger}`);
  }
});

test('the gate workflow cancels a superseded run', () => {
  const text = workflowText();
  const concurrency = block(text, 'concurrency');
  assert.match(concurrency, /group:\s*['"]?[\w-]*\$\{\{\s*github\.ref\s*\}\}/, 'one group per ref');
  assert.match(concurrency, /cancel-in-progress:\s*\$\{\{\s*github\.event_name\s*==\s*'pull_request'\s*\}\}/);
});

test('the gate workflow runs the full gate', () => {
  const text = workflowText();
  assert.deepEqual(values(text, 'run'), [
    'npm ci',
    'npm test',
    'node scripts/check-references.mjs',
    'node scripts/check-provenance.mjs agents/ skills/ rules/',
  ]);
  assert.doesNotMatch(code(text), /continue-on-error/);
  assert.equal(values(text, 'if').length, 1, 'no step-level if skips a step');
});

test('no job gains a write permission or a secret', () => {
  const text = workflowText();
  const grants = lines(text).filter((line) => /^\s*permissions:/.test(line));
  assert.equal(grants.length, 1, 'one permissions block');
  const granted = block(text, 'permissions').split('\n').map((line) => line.trim()).filter(Boolean);
  assert.deepEqual(granted, ['contents: read']);
  assert.doesNotMatch(code(text), /\bsecrets\b/);
});

test('the gate workflow checks out whole history', () => {
  const depths = [...code(workflowText()).matchAll(/fetch-depth:\s*['"]?(\w+)/g)].map((match) => match[1]);
  assert.deepEqual(depths, ['0']);
});
