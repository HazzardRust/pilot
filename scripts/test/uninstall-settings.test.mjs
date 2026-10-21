/**
 * `pilot uninstall` (daemon-lifecycle spec 13, L10, A4): with `--yes` it also takes pilot's
 * status lines and the permission rules that name pilot out of settings.json, and the
 * unedited copies of the shipped rules out of the rules directory. A user's own setting, an
 * edited rule, the default-branch ask rules and the WebFetch hosts stay, and are named.
 * Every test works on a scratch `~/.claude`; none reads or writes the real one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const { removeOwnSettings, statusLineSetting, subagentStatusLineSetting } = await import('../install-settings.mjs');
const { removeShippedRules } = await import('../install-rules.mjs');
const { applyPlan, planUninstall, main } = await import('../uninstall.mjs');

const scratch = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-uninstall-settings-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};

/** Every file under `dir` with its bytes, so a run that changes one byte is caught. */
function snapshot(dir) {
  const out = {};
  for (const entry of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) {
    const full = path.join(entry.parentPath, entry.name);
    out[path.relative(dir, full)] = entry.isFile() ? fs.readFileSync(full, 'base64') : 'dir';
  }
  return out;
}

// An older plugin root: ours by the `hooks/<script>` tail, not by the exact string.
const OLD_ROOT = path.join(os.tmpdir(), 'plugins', 'cache', 'pilot', 'pilot', '0.1.0');

const ASK = ['Bash(git push origin main)', 'Bash(gh pr merge *)'];
const USER_ALLOW = 'Bash(npm test)';
const WEB = 'WebFetch(domain:docs.example.com)';

/** A settings.json as install leaves it, plus the user's own rules. */
function installedSettings(file, extra = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const settings = {
    model: 'opus',
    statusLine: statusLineSetting(OLD_ROOT),
    subagentStatusLine: subagentStatusLineSetting(ROOT),
    permissions: {
      allow: [USER_ALLOW, 'mcp__plugin_pilot_deck__*', 'Bash(pilot land *)', 'Bash(pilot deck --scratch *)', WEB],
      ask: [...ASK, 'Bash(rm *)'],
      deny: ['Bash(curl *)'],
    },
    ...extra,
  };
  fs.writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);
  return settings;
}

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

test("pilot's status lines go, a foreign one stays", (t) => {
  const file = path.join(scratch(t), 'settings.json');
  installedSettings(file);

  const result = removeOwnSettings({ settingsPath: file });

  const after = read(file);
  assert.equal(after.statusLine, undefined, 'our status line, at an older root, is gone');
  assert.equal(after.subagentStatusLine, undefined, 'our subagent status line is gone');
  assert.ok(result.removed.includes('statusLine') && result.removed.includes('subagentStatusLine'), result.removed.join(', '));
  assert.equal(after.model, 'opus', 'an unrelated key stays');

  const theirs = { type: 'command', command: 'node "/home/me/my-statusline.js"' };
  const other = path.join(scratch(t), 'settings.json');
  installedSettings(other, { statusLine: theirs });
  const second = removeOwnSettings({ settingsPath: other });
  assert.deepEqual(read(other).statusLine, theirs, "the user's own status line is untouched");
  assert.ok(!second.removed.includes('statusLine'), second.removed.join(', '));
});

test("pilot's permission rules go, the user's stay", (t) => {
  const file = path.join(scratch(t), 'settings.json');
  installedSettings(file);

  const { removed, left } = removeOwnSettings({ settingsPath: file });

  const { permissions } = read(file);
  assert.deepEqual(permissions.allow, [USER_ALLOW, WEB], 'only the deck and `Bash(pilot` rules left allow');
  assert.deepEqual(permissions.ask, [...ASK, 'Bash(rm *)'], 'the ask list is untouched');
  assert.deepEqual(permissions.deny, ['Bash(curl *)'], 'the deny list is untouched');
  assert.deepEqual(
    removed.filter((r) => r !== 'statusLine' && r !== 'subagentStatusLine'),
    ['mcp__plugin_pilot_deck__*', 'Bash(pilot land *)', 'Bash(pilot deck --scratch *)'],
  );
  for (const rule of [...ASK, WEB]) assert.ok(left.includes(rule), `${rule} is named as left: ${left.join(', ')}`);
  assert.ok(!left.includes(USER_ALLOW) && !left.includes('Bash(rm *)'), 'a rule pilot never wrote is not named as pilot-related');
});

test('settings.json is backed up first', (t) => {
  const dir = scratch(t);
  const file = path.join(dir, 'settings.json');
  installedSettings(file);
  const before = fs.readFileSync(file);

  removeOwnSettings({ settingsPath: file });

  const backups = fs.readdirSync(dir).filter((name) => name.startsWith('settings.json.pilot-backup-'));
  assert.equal(backups.length, 1, fs.readdirSync(dir).join(', '));
  assert.ok(fs.readFileSync(path.join(dir, backups[0])).equals(before), 'the backup holds the old bytes');

  // Nothing of ours left: no write, so no second backup.
  const again = removeOwnSettings({ settingsPath: file });
  assert.deepEqual(again.removed, []);
  assert.equal(fs.readdirSync(dir).filter((name) => name.startsWith('settings.json.pilot-backup-')).length, 1);
});

const SHIPPED = ['rules/golang/testing.md','rules/python/testing.md', 'rules/python/security.md'];

/** A scratch rules dir with three shipped copies, one of them edited, a file of the user's and the state file. */
function installedRules(claude) {
  const target = path.join(claude, 'rules');
  for (const rel of SHIPPED) {
    const to = path.join(target, ...rel.split('/').slice(1));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(ROOT, ...rel.split('/')), to);
  }
  fs.appendFileSync(path.join(target, 'python', 'security.md'), '\nmy own line\n');
  fs.mkdirSync(path.join(target, 'mine'), { recursive: true });
  fs.writeFileSync(path.join(target, 'mine', 'notes.md'), '# mine\n');
  const stateDir = path.join(claude, 'pilot-inbox');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'rules-edited.json'), '["python/security.md"]\n');
  return { target, stateDir };
}

test('unedited rules go, an edited one stays', (t) => {
  const { target, stateDir } = installedRules(scratch(t));
  const edited = fs.readFileSync(path.join(target, 'python', 'security.md'));

  const { removed, kept } = removeShippedRules({ target, stateDir });

  assert.equal(fs.existsSync(path.join(target, 'python', 'testing.md')), false);
  assert.equal(fs.existsSync(path.join(target, 'golang')), false, 'a directory it emptied is gone');
  assert.ok(fs.readFileSync(path.join(target, 'python', 'security.md')).equals(edited), 'the edited rule is byte-identical');
  assert.ok(fs.existsSync(path.join(target, 'mine', 'notes.md')), "the user's own file stays");
  assert.deepEqual(kept, ['python/security.md']);
  assert.ok(removed.includes('golang/testing.md') && removed.includes('python/testing.md'), removed.join(', '));
  assert.equal(fs.existsSync(path.join(stateDir, 'rules-edited.json')), false, 'the repair state file is gone');
});

test('the plan lists both without touching them', async (t) => {
  const home = scratch(t);
  const claude = path.join(home, '.claude');
  const settingsPath = path.join(claude, 'settings.json');
  installedSettings(settingsPath);
  installedRules(claude);
  const prefix = scratch(t);
  const deps = { home, prefix, platform: 'linux', deckPid: async () => null };
  const before = snapshot(home);

  const steps = await planUninstall(home, deps);
  const lines = [];
  const code = await main([], { ...deps, log: (line) => lines.push(line) });

  assert.equal(code, 0);
  assert.ok(steps.some((s) => s.action === 'remove' && s.path === settingsPath), JSON.stringify(steps));
  assert.ok(steps.some((s) => s.action === 'remove' && s.path === path.join(claude, 'rules')), JSON.stringify(steps));
  assert.ok(lines.some((line) => /^\s*remove\b.*settings\.json/.test(line)), lines.join('\n'));
  assert.ok(lines.some((line) => /^\s*leave\b.*python\/security\.md/.test(line)), lines.join('\n'));
  assert.ok(lines.some((line) => /^\s*leave\b.*Bash\(git push origin main\)/.test(line)), lines.join('\n'));
  assert.deepEqual(snapshot(home), before, 'the scratch home is byte-identical');

  // And `--yes` carries both out.
  const done = [];
  assert.equal(await main(['--yes'], { ...deps, log: (line) => done.push(line) }), 0, done.join('\n'));
  assert.equal(read(settingsPath).statusLine, undefined, done.join('\n'));
  assert.equal(fs.existsSync(path.join(claude, 'rules', 'python', 'testing.md')), false, done.join('\n'));
  assert.ok(fs.existsSync(path.join(claude, 'rules', 'python', 'security.md')));
});

/** A scratch home whose repair at `nothing` has filled the rules root, with one root copy edited. */
async function homeWithRulesRoot(t) {
  const { repairRules } = await import('../install-rules.mjs');
  const { rulesRoot } = await import('../reach.mjs');
  const home = scratch(t);
  fs.mkdirSync(path.join(home, '.claude', 'pilot'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude', 'pilot', 'reach.json'), '{"level":"nothing"}\n');
  repairRules({ home, stateDir: path.join(home, '.claude', 'pilot-inbox') });
  const root = rulesRoot({ home });
  const rules = path.join(root, '.claude', 'rules');
  fs.appendFileSync(path.join(rules, 'orchestration.md'), '\nmine\n');
  return { home, root, rules };
}

test('uninstall clears the rules root', async (t) => {
  const { home, root, rules } = await homeWithRulesRoot(t);
  const { filesUnder } = await import('../build-rules-ledger.mjs');
  assert.ok(filesUnder(rules).length > 100);

  const { removed, kept } = removeShippedRules({ target: rules, home, dryRun: true });
  assert.equal(removed.length, filesUnder(rules).length - 1);
  assert.deepEqual(kept, ['orchestration.md'], 'the edited root copy would stay');

  fs.rmSync(path.join(rules, 'orchestration.md'));
  const steps = await planUninstall(home, { home, prefix: scratch(t), platform: 'linux', deckPid: async () => null });
  applyPlan(steps.filter((step) => step.path === rules));
  assert.equal(fs.existsSync(root), false, 'an emptied rules-root goes too');
  assert.ok(fs.existsSync(path.join(home, '.claude', 'pilot', 'reach.json')), 'the reach file stays');
});

test('the uninstall plan names the rules root when it holds shipped copies', async (t) => {
  const { home, rules } = await homeWithRulesRoot(t);
  const steps = await planUninstall(home, { home, prefix: scratch(t), platform: 'linux', deckPid: async () => null });
  assert.ok(steps.some((s) => s.action === 'remove' && s.path === rules), JSON.stringify(steps));
  assert.ok(steps.some((s) => s.action === 'leave' && s.path === rules && /orchestration\.md/.test(s.why)), JSON.stringify(steps));
});
