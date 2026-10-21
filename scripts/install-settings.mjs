#!/usr/bin/env node
/**
 * Merges the pilot's status line, and optionally a WebFetch allowlist, into a
 * user's ~/.claude/settings.json.
 *
 * Why a script and not a line in a README: `statusLine` is settings-only. A
 * plugin's own settings.json supports `agent` and `subagentStatusLine` and
 * nothing else, so the status line cannot ship with the plugin the way the
 * alert hook does in hooks/hooks.json — it has to be merged into the file the
 * harness reads. And `${CLAUDE_PLUGIN_ROOT}` does not expand inside a user's
 * settings.json either, so the absolute path has to be resolved at install
 * time. This script resolves it from its own location, which is the only
 * answer that holds: with a directory-source marketplace the plugin root is
 * the source directory rather than the plugin cache, so a script that guessed
 * the cache path would write a path to a file that is not there.
 *
 * Three rules about someone else's configuration:
 *
 *   - a status line that is already set is never overwritten. It is reported,
 *     along with the exact setting that would have been written, and the file
 *     is left byte-for-byte alone;
 *   - a file that cannot be parsed is never written. A merge is a JSON round
 *     trip, and round-tripping a file we did not understand would destroy it;
 *   - a file that is about to change is copied to a timestamped sibling first,
 *     because the round trip reformats a file a friend may have hand-edited.
 *
 * The second merge is the answer to slice 8's live security review: `docs-lookup`
 * fetches untrusted pages with `WebFetch` against no allowlist, and a plugin's own
 * settings.json cannot carry `permissions`, so the only place an allowlist can go
 * is the same file the status line goes in. It is offered and never assumed: with
 * no `--allow-web-fetch` the permissions block is not read, not written, and not
 * mentioned. The hosts are the friend's own documentation sites, named by them.
 *
 * The command line also always allows the pilot's own `sync`, `integrate` and `land`
 * (ADR 0110), which the auto-mode classifier otherwise refuses as a merge without review;
 * the library writes them only when passed `pilotMerge: true`.
 *
 * Usage:
 *   node install-settings.mjs [--settings <path>] [--plugin-root <path>]
 *                             [--allow-web-fetch <host>[,<host>...]]
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import atomicWrite from '../hooks/lib/atomic-write.js';
import { pathKey } from '../hooks/lib/platform.js';
import { PLUGIN_ID, readReach, rulesPlan } from './reach.mjs';

const { atomicWriteFileSync } = atomicWrite;

export const STATUSLINE_SCRIPT = ['hooks', 'context-usage-statusline.js'];
const REFRESH_INTERVAL_SECONDS = 30;

/**
 * A host name and nothing else: no scheme, no path, no wildcard. A malformed rule in a
 * friend's permissions is not an error they ever see — it simply never matches, and the
 * fetch it was meant to constrain carries on unconstrained.
 */
const HOST_NAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

/** The package this script belongs to, from where this script sits. */
export function resolvePluginRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

/** The settings file the harness reads when nothing overrides it. */
export function defaultSettingsPath(home = os.homedir()) {
  return path.join(home, '.claude', 'settings.json');
}

/** Quoted, because a plugin root can sit under a directory with a space in it. */
export function statusLineCommand(pluginRoot) {
  return 'node "' + path.join(pluginRoot, ...STATUSLINE_SCRIPT) + '"';
}

export function statusLineSetting(pluginRoot) {
  return {
    type: 'command',
    command: statusLineCommand(pluginRoot),
    refreshInterval: REFRESH_INTERVAL_SECONDS,
  };
}

// Windows PowerShell's `Set-Content -Encoding utf8` writes a byte-order mark in
// front of the file, so a friend who has ever edited settings.json from a script
// has one. JSON.parse throws on it, which made this script call a perfectly
// valid settings file unreadable and refuse to install. It is stripped to parse
// and handed back so the write path can put it where it was: the promise here is
// that the statusLine block changes and nothing else does, and a file's encoding
// is one of the things that counts as "nothing else".
const BOM = '\uFEFF';

// An absent file and an empty one both mean "no settings yet"; only a file with
// something unparseable in it is a refusal, and `existed` is what decides
// whether there is anything worth backing up.
function readSettings(settingsPath) {
  let raw;
  try {
    raw = fs.readFileSync(settingsPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { settings: {}, existed: false, bom: '' };
    throw err;
  }
  const bom = raw.startsWith(BOM) ? BOM : '';
  const body = raw.slice(bom.length);
  if (body.trim() === '') return { settings: {}, existed: true, bom };
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new SyntaxError('the top level is not an object');
    }
    return { settings: parsed, existed: true, bom };
  } catch (err) {
    throw new Error(
      `${settingsPath} is not readable JSON (${err.message}). It has been left ` +
        'untouched; fix it or move it aside, then run this again.',
    );
  }
}

const BACKUP_TRIES = 100;

// Timestamped rather than a single .bak, and never copied over an existing one,
// so a second run in the same millisecond cannot overwrite the copy taken by the
// first. Written before the target is touched, which is the only ordering that
// makes it a backup at all.
function backupSettings(settingsPath) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (let n = 0; n < BACKUP_TRIES; n += 1) {
    const backupPath = `${settingsPath}.pilot-backup-${stamp}${n ? `-${n}` : ''}`;
    try {
      fs.copyFileSync(settingsPath, backupPath, fs.constants.COPYFILE_EXCL);
      return backupPath;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  }
  throw new Error(`${settingsPath} has ${BACKUP_TRIES} backups taken this instant; it has been left untouched. Run this again.`);
}

/** Back up, then write. Both merges go through here so neither can forget the copy. */
function writeSettings(settingsPath, settings, { bom, existed }) {
  const backupPath = existed ? backupSettings(settingsPath) : null;
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  atomicWriteFileSync(settingsPath, `${bom}${JSON.stringify(settings, null, 2)}\n`);
  return backupPath;
}

/**
 * The subagent status line is the same kind of merge, for a reason worth writing down.
 * A13 shipped it in the plugin's own `settings.json`, which the plugins reference says
 * supports exactly `agent` and `subagentStatusLine` — and the live check on 2026-09-15
 * showed a subagent row rendering Claude Code's own default instead, so the setting the
 * plugin carried did not take effect. The user's settings.json is the file that does,
 * and it is already the file the status line has to be merged into.
 *
 * The command is the context guard with the flag that makes it render rather than judge.
 * There is no `refreshInterval`: the plugin's own settings.json does not carry one, and a
 * subagent's row is re-rendered by the harness rather than polled.
 */
const SUBAGENT_STATUSLINE_SCRIPT = ['hooks', 'context-size-guard.js'];

/** Quoted for the same reason `statusLineCommand` quotes: a plugin root can have spaces. */
export function subagentStatusLineCommand(pluginRoot) {
  return (
    'node "' + path.join(pluginRoot, ...SUBAGENT_STATUSLINE_SCRIPT) + '" --subagent-status-line'
  );
}

export function subagentStatusLineSetting(pluginRoot) {
  return { type: 'command', command: subagentStatusLineCommand(pluginRoot) };
}

/**
 * The two command settings this package merges. They are the same problem with a
 * different key and a different noun, so they are described rather than duplicated:
 * what it is called, what this package would set it to, and what to say afterwards.
 */
const COMMAND_SETTINGS = {
  statusLine: {
    key: 'statusLine',
    noun: 'status line',
    setting: statusLineSetting,
    scriptParts: STATUSLINE_SCRIPT,
    suffix: '',
    afterwards: [
      'Start a new Claude Code session to see it under the input box.',
      'The usage alert needs no merge: the plugin registers it itself.',
    ],
  },
  subagentStatusLine: {
    key: 'subagentStatusLine',
    noun: 'subagent status line',
    setting: subagentStatusLineSetting,
    scriptParts: SUBAGENT_STATUSLINE_SCRIPT,
    suffix: ' --subagent-status-line',
    afterwards: ["Start a new Claude Code session to see it on a subagent's row."],
  },
};

/**
 * Decide what should happen to one command setting. Reads nothing and writes nothing:
 * every step is a decision, and the one write happens after all of them are made.
 */
function commandSettingStep(settingsPath, config, pluginRoot) {
  const wanted = config.setting(pluginRoot);

  return (settings) => {
    const current = settings[config.key];

    if (current && current.command === wanted.command) {
      return {
        key: config.key,
        state: 'already-installed',
        notes: [`The pilot ${config.noun} is already set in ${settingsPath}. Nothing to do.`],
      };
    }

    if (current) {
      const theirs =
        typeof current.command === 'string' ? current.command : JSON.stringify(current);
      return {
        key: config.key,
        state: 'left-alone',
        notes: [
          `A ${config.noun} is already set in ${settingsPath}, and it is not this package's:`,
          `    ${theirs}`,
          `It has been left exactly as it was. To use the pilot ${config.noun} instead,`,
          `replace that "${config.key}" block with:`,
          `    ${JSON.stringify(wanted)}`,
        ],
      };
    }

    return {
      key: config.key,
      state: 'installed',
      notes: [`Set the pilot ${config.noun} in ${settingsPath}.`, ...config.afterwards],
      change: (draft) => ({ ...draft, [config.key]: wanted }),
    };
  };
}

/**
 * Whether `command` is this package's own — recognised by the last two path
 * segments, `hooks/<script>`, and nothing else. Never by a version string: a
 * path written by an older plugin root has a different cache directory ahead
 * of those two segments, and D18 exists because an exact-string match cannot
 * tell "our command, older version" from "somebody else's". Matching on the
 * tail is what lets an older root still be recognised as ours; matching on
 * anything more would only fix the one version it happened to be written for.
 */
export function ownCommandPath(command, scriptParts, suffix) {
  if (typeof command !== 'string') return false;
  if (!command.startsWith('node "') || !command.endsWith(`"${suffix}`)) return false;
  const quoted = command.slice('node "'.length, command.length - suffix.length - 1);
  const segments = quoted.split(/[\\/]+/).filter(Boolean);
  const tail = segments.slice(-scriptParts.length);
  return tail.length === scriptParts.length && tail.every((part, i) => part === scriptParts[i]);
}

/**
 * Decide what `--repair` should do to one command setting. Unlike
 * `commandSettingStep`, this recognises this package's own command at any
 * plugin root (via `ownCommandPath`) rather than only the exact string this
 * root would write, and it never reports anything when there is nothing to
 * do: a `SessionStart` hook that talks on every session is a hook nobody
 * reads, so absent, already current, and foreign are all silent no-ops.
 */
function repairCommandStep(settingsPath, config, pluginRoot) {
  const wanted = config.setting(pluginRoot);
  const silent = { key: config.key, state: 'unchanged', notes: [] };

  return (settings) => {
    const current = settings[config.key];
    if (!current || current.command === wanted.command) return silent;
    if (!ownCommandPath(current.command, config.scriptParts, config.suffix)) return silent;

    return {
      key: config.key,
      state: 'repaired',
      notes: [`Repaired the pilot ${config.noun} in ${settingsPath} to the current plugin root.`],
      change: (draft) => ({ ...draft, [config.key]: wanted }),
    };
  };
}

/**
 * L4's move down: take out this package's own command at any plugin root, and leave one
 * that is not ours, or none, without a word. The state stays null when nothing was ours.
 */
function removeOwnCommandStep(settingsPath, config) {
  return (settings) => {
    if (!ownCommandPath(settings[config.key]?.command, config.scriptParts, config.suffix)) {
      return { key: config.key, state: null, notes: [] };
    }
    return {
      key: config.key,
      state: 'removed',
      notes: [`Removed the pilot ${config.noun} from ${settingsPath}; \`pilot run\` carries it.`],
      change: (draft) => {
        const { [config.key]: _ours, ...rest } = draft;
        return rest;
      },
    };
  };
}

/** The permission rule Claude Code reads for "this agent may fetch this host". */
export function webFetchRule(host) {
  if (typeof host !== 'string' || !HOST_NAME.test(host.trim())) {
    throw new Error(
      `"${host}" is not a host name. Name the documentation host on its own — ` +
        'docs.python.org, not https://docs.python.org/3/ — and no wildcards.',
    );
  }
  return `WebFetch(domain:${host.trim().toLowerCase()})`;
}

const domainOf = (rule) => {
  const match = /^WebFetch\(domain:(.+)\)$/i.exec(String(rule).trim());
  return match ? match[1].trim().toLowerCase() : null;
};

/**
 * A rule the friend already wrote that covers this host, or null. Claude Code matches
 * these case-insensitively and understands a leading `*.`, so an exact string comparison
 * would miss `WebFetch(domain:*.example.com)` against `api.example.com` and report a
 * grant their own deny rule goes on refusing. Erring towards "already covered" is the
 * safe direction: the worst case is a rule we do not add and do say why.
 */
function coveringRule(rules, host) {
  return (
    rules.find((rule) => {
      // A bare `WebFetch` is the whole tool rather than one host: in a deny list it
      // refuses every host, in an allow list it grants every host. Reading it as
      // neither is how a friend who has denied WebFetch outright gets an allow rule
      // written beside it - the exact "reads as a grant, behaves as a refusal" this
      // function exists to prevent.
      if (String(rule).trim().toLowerCase() === 'webfetch') return true;
      const domain = domainOf(rule);
      if (domain === null) return false;
      if (domain === host) return true;
      return domain.startsWith('*.') && host.endsWith(domain.slice(1));
    }) ?? null
  );
}

/**
 * The friend's permissions block, or a refusal. Three shapes get a file destroyed by a
 * merge that means well: `typeof [] === 'object'`, so a `permissions` that is a list was
 * spread into an object and came back out with numeric keys; an `allow` that is not a
 * list was read as empty and then written back as ours alone; and a `deny` that is a
 * string is a refusal this script cannot see, so it would add the allow rule the friend
 * had denied. Malformed is still theirs, and the rule for a file we do not understand is
 * the one `readSettings` already follows: say so, and write nothing.
 *
 * Only reached when a host was named. With no `--allow-web-fetch` this block is not read
 * at all, and refusing over something this run was never going to touch would be worse
 * than leaving it.
 */
function readablePermissions(settingsPath, settings) {
  const permissions = settings.permissions ?? {};
  const refuse = (what, value) => {
    const shape = Array.isArray(value) ? 'a list' : `a ${typeof value}`;
    throw new Error(
      `${settingsPath} has a "${what}" that is ${shape}, which is not what Claude Code ` +
        'reads there. It has been left untouched; fix it or move it aside, then run this again.',
    );
  };

  if (typeof permissions !== 'object' || Array.isArray(permissions)) {
    refuse('permissions', permissions);
  }
  for (const key of ['allow', 'ask', 'deny']) {
    if (permissions[key] !== undefined && !Array.isArray(permissions[key])) {
      refuse(`permissions.${key}`, permissions[key]);
    }
  }
  return permissions;
}

/**
 * Add a `WebFetch(domain:…)` rule for each host the friend named. Nothing is removed,
 * no deny rule is touched, and a host they have already denied is reported rather than
 * granted around: a deny wins anyway, and adding the allow would leave a rule in the
 * file that reads as a grant and behaves as a refusal.
 */
function webFetchStep(settingsPath, hosts) {
  // Validated here, where nothing is open yet, so a typo cannot half-merge a file.
  const wanted = [...new Set(hosts.map(webFetchRule))];

  return (settings) => {
    const permissions = readablePermissions(settingsPath, settings);
    const allow = permissions.allow ?? [];
    const deny = permissions.deny ?? [];

    const denied = [];
    const alreadyAllowed = [];
    const added = [];
    for (const rule of wanted) {
      const host = domainOf(rule);
      const refusal = coveringRule(deny, host);
      if (refusal) denied.push({ rule, by: refusal });
      else if (coveringRule(allow, host)) alreadyAllowed.push(rule);
      else added.push(rule);
    }

    const notes = [];
    if (added.length) {
      notes.push(
        `Added ${added.length} WebFetch rule(s) to ${settingsPath}:`,
        ...added.map((rule) => `    ${rule}`),
      );
    }
    if (alreadyAllowed.length) {
      notes.push(`Already allowed, left as they were: ${alreadyAllowed.join(', ')}.`);
    }
    if (denied.length) {
      notes.push(
        'These are covered by your deny list, so they were not added — a deny wins and the',
        'rule would have read as a grant while behaving as a refusal:',
        ...denied.map(({ rule, by }) => `    ${rule}${by === rule ? '' : `  (denied by ${by})`}`),
      );
    }

    return {
      key: 'webFetch',
      state: added.length ? 'added' : 'nothing-to-add',
      added,
      alreadyAllowed,
      denied: denied.map(({ rule }) => rule),
      notes,
      ...(added.length
        ? {
            change: (draft) => ({
              ...draft,
              permissions: { ...draft.permissions, allow: [...(draft.permissions?.allow ?? []), ...added] },
            }),
          }
        : {}),
    };
  };
}

/**
 * L1: `enabledPlugins["pilot@pilot"]` set to what the reach says, and no other key read or
 * written. An `enabledPlugins` that is not an object is the user's and malformed, so the
 * install refuses rather than spreading it into one (the `readablePermissions` rule).
 */
function enablePluginStep(settingsPath, value) {
  return (settings) => {
    const current = settings.enabledPlugins;
    if (current !== undefined && (!current || typeof current !== 'object' || Array.isArray(current))) {
      const shape = Array.isArray(current) ? 'a list' : `a ${current === null ? 'null' : typeof current}`;
      throw new Error(
        `${settingsPath} has an "enabledPlugins" that is ${shape}, which is not what Claude Code ` +
          'reads there. It has been left untouched; fix it or move it aside, then run this again.',
      );
    }
    if (current?.[PLUGIN_ID] === value) {
      return { key: 'enabledPlugins', state: 'already-set', notes: [] };
    }
    return {
      key: 'enabledPlugins',
      state: 'set',
      notes: [`Set enabledPlugins["${PLUGIN_ID}"] to ${value} in ${settingsPath}.`],
      change: (draft) => ({ ...draft, enabledPlugins: { ...draft.enabledPlugins, [PLUGIN_ID]: value } }),
    };
  };
}

/**
 * The deck server's tools, and nothing wider. A deck call that waits on a terminal
 * prompt stalls a background lane nobody is watching, and under auto mode the
 * classifier may refuse it outright; an allow rule is the one thing that settles both.
 */
const DECK_SERVER = 'mcp__plugin_pilot_deck';
const DECK_TOOLS_RULE = `${DECK_SERVER}__*`;

// A deny that refuses any deck tool - the server, the wildcard, one tool, or a glob
// that reaches one. A glob is probed with a deck tool name ending in its own literal
// tail, so `*__deck_read` counts as well as `mcp__*`. Erring towards "covered" is the
// safe direction: a deny wins whatever we add, and an allow beside it would read as a
// grant and behave as a refusal.
function deckDenyCovers(rule) {
  const text = String(rule).trim().toLowerCase();
  if (text === DECK_SERVER || text.startsWith(`${DECK_SERVER}__`)) return true;
  if (!text.includes('*')) return false;
  const parts = text.split('*');
  const tail = parts.at(-1);
  const glob = new RegExp(`^${parts.map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
  return [`${DECK_SERVER}__x`, `${DECK_SERVER}${tail}`, `${DECK_SERVER}__${tail}`].some((probe) =>
    glob.test(probe),
  );
}

/** Allow `mcp__plugin_pilot_deck__*`, unless their deny list refuses a deck tool. */
function deckToolsStep(settingsPath) {
  return (settings) => {
    const permissions = readablePermissions(settingsPath, settings);
    const allow = (permissions.allow ?? []).map(String);
    const denyRule = (permissions.deny ?? []).find(deckDenyCovers);
    const allowed = allow.some((rule) => [DECK_SERVER, DECK_TOOLS_RULE].includes(rule.trim()));

    if (denyRule !== undefined) {
      return {
        key: 'deckTools',
        state: 'denied',
        notes: [
          `Your deny list refuses the deck tools (${denyRule}), so ${DECK_TOOLS_RULE} was not`,
          'added to allow: a deny wins, and the rule would have read as a grant. Each deck',
          'call will be refused until you remove that deny.',
        ],
      };
    }
    if (allowed) {
      const notes = ['The deck tools are already allowed, left as they were.'];
      return { key: 'deckTools', state: 'already-allowed', notes };
    }
    return {
      key: 'deckTools',
      state: 'added',
      notes: [`Added ${DECK_TOOLS_RULE} to permissions.allow in ${settingsPath}.`],
      change: (draft) => ({
        ...draft,
        permissions: {
          ...draft.permissions,
          allow: [...(draft.permissions?.allow ?? []), DECK_TOOLS_RULE],
        },
      }),
    };
  };
}

/**
 * L22: every session on the machine asks before a push or a merge to the default branch,
 * in the forms people write. Ask rules only - an allow would grant the push, and a deny
 * would block the user's own pushes to main in every project. Bash rules match the text
 * as written, so `git -C . push`, `HEAD:refs/heads/main` or a push with an upstream set
 * slip past; the guard in code and branch protection are the real controls (L23).
 */
const DEFAULT_BRANCH_ASK = [
  'Bash(git push origin main)', 'Bash(git push origin main *)', 'Bash(git push origin *:main)',
  'Bash(git push origin master)', 'Bash(git push origin master *)', 'Bash(git push origin *:master)',
  'Bash(gh pr merge)', 'Bash(gh pr merge *)',
];

// A deny rule's command pattern as a test of another rule's text: `*` matches anything,
// including the other rule's own `*`, and the legacy `prefix:*` form is a prefix match.
// Erring towards "covered" is the safe direction: the deny wins whatever we add.
const BASH_RULE = /^Bash(?:\((.*)\))?$/;

function denyCovers(deny, rule) {
  const match = BASH_RULE.exec(String(deny).trim());
  if (!match) return false;
  if (match[1] === undefined) return true; // a bare `Bash` denies every command
  const pattern = match[1].endsWith(':*') ? `${match[1].slice(0, -2)}*` : match[1];
  const glob = pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${glob.join('.*')}$`).test(BASH_RULE.exec(rule)[1]);
}

function defaultBranchAskStep(settingsPath) {
  return (settings) => {
    const permissions = readablePermissions(settingsPath, settings);
    const ask = permissions.ask ?? [];
    const deny = permissions.deny ?? [];

    const denied = DEFAULT_BRANCH_ASK.filter((rule) => deny.some((d) => denyCovers(d, rule)));
    const alreadyPresent = DEFAULT_BRANCH_ASK.filter((r) => !denied.includes(r) && ask.includes(r));
    const added = DEFAULT_BRANCH_ASK.filter((r) => !denied.includes(r) && !ask.includes(r));

    const notes = [];
    if (added.length) {
      notes.push(
        `Added ${added.length} ask rule(s) to ${settingsPath}, so a session asks before a push or merge to the default branch:`,
        ...added.map((rule) => `    ${rule}`),
      );
    }
    if (alreadyPresent.length) {
      notes.push(`Ask rules already present, left as they were: ${alreadyPresent.join(', ')}.`);
    }
    if (denied.length) {
      notes.push(
        'Covered by your deny list, so left alone rather than added to ask:',
        ...denied.map((rule) => `    ${rule}`),
      );
    }

    return {
      key: 'ask',
      state: added.length ? 'added' : 'nothing-to-add',
      added,
      alreadyPresent,
      denied,
      notes,
      ...(added.length
        ? {
            change: (draft) => ({
              ...draft,
              permissions: { ...draft.permissions, ask: [...ask, ...added] },
            }),
          }
        : {}),
    };
  };
}

/**
 * ADR 0110, amending L22: the pilot's own merge commands are allowed, because the auto-mode
 * classifier reads only the command text and cannot see the gate the user signed. Written
 * `<cmd> *` with the space, which matches the bare command and not `pilot landfoo` (L2).
 * The push stays guarded in code: `land` and `integrate` refuse the default branch by name
 * whatever this rule says (L23). A rule the user's deny or ask covers is named and left out,
 * since either beats an allow and the rule would read as a grant that never takes effect (L3).
 */
const PILOT_MERGE_ALLOW = [
  'Bash(pilot sync *)',
  'Bash(pilot integrate *)',
  'Bash(pilot land *)',
  'Bash(pilot landing *)',
  // process-gc (L14): list, reap and stop scratch decks. Never `pilot *`.
  'Bash(pilot ps)',
  'Bash(pilot gc)',
  'Bash(pilot deck --stop *)',
  // yellow-lane (L7): a QA nested under a co-pilot starts a scratch deck, and the classifier
  // reads only the command text. The scratch deck is isolated from the live one on 4321.
  'Bash(pilot deck --scratch *)',
];

function pilotMergeStep(settingsPath) {
  return (settings) => {
    const permissions = readablePermissions(settingsPath, settings);
    const allow = permissions.allow ?? [];
    const theirs = [...(permissions.deny ?? []), ...(permissions.ask ?? [])];

    const covered = PILOT_MERGE_ALLOW.filter((rule) => theirs.some((t) => denyCovers(t, rule)));
    const alreadyPresent = PILOT_MERGE_ALLOW.filter((r) => !covered.includes(r) && allow.includes(r));
    const added = PILOT_MERGE_ALLOW.filter((r) => !covered.includes(r) && !allow.includes(r));

    const notes = [];
    if (added.length) {
      notes.push(
        `Added ${added.length} allow rule(s) to ${settingsPath}, so the pilot's own commands are not refused in auto mode:`,
        ...added.map((rule) => `    ${rule}`),
      );
    }
    if (alreadyPresent.length) {
      notes.push(`Merge allow rules already present, left as they were: ${alreadyPresent.join(', ')}.`);
    }
    if (covered.length) {
      notes.push(
        'Covered by your deny or ask list, so not added to allow (yours wins either way):',
        ...covered.map((rule) => `    ${rule}`),
      );
    }

    return {
      key: 'pilotMerge',
      state: added.length ? 'added' : 'nothing-to-add',
      added,
      alreadyPresent,
      covered,
      notes,
      ...(added.length
        ? {
            change: (draft) => ({
              ...draft,
              permissions: { ...draft.permissions, allow: [...(draft.permissions?.allow ?? []), ...added] },
            }),
          }
        : {}),
    };
  };
}

/**
 * Read once, decide everything, write once. Two writes in one run would take two
 * backups, and the second would be a copy of the half-merged file while the report
 * still called it "the previous file" — pointing the friend at a backup that is not
 * the file they had. One write makes that impossible.
 */
function applyMerges(settingsPath, steps) {
  const { settings, existed, bom } = readSettings(settingsPath);
  const results = steps.map((step) => step(settings));
  const changes = results.filter((result) => result.change);

  const backupPath = changes.length
    ? writeSettings(
        settingsPath,
        changes.reduce((draft, result) => result.change(draft), settings),
        { bom, existed },
      )
    : null;

  return { settingsPath, changed: changes.length > 0, backupPath, results };
}

/**
 * The allow rules only pilot writes (L10): the deck's tools and the `pilot` command's. Two
 * prefixes and nothing wider, so a rule the user wrote for anything else is never theirs to lose.
 */
const OWN_ALLOW_PREFIXES = [`${DECK_SERVER}__`, 'Bash(pilot '];
const isOwnAllow = (rule) => typeof rule === 'string' && OWN_ALLOW_PREFIXES.some((prefix) => rule.startsWith(prefix));

/**
 * `pilot uninstall`'s half of the merges above: take out the status lines whose command is
 * this package's at any plugin root (`ownCommandPath`) and the allow rules `isOwnAllow`
 * names; name, and leave, the default-branch ask rules and the WebFetch hosts, which guard
 * the user's sessions whatever installed them (A4). Backed up first, as every write here is;
 * with `dryRun` it only reports. Returns `{ removed, left }`: setting keys and rule texts.
 */
export function removeOwnSettings(options = {}) {
  const settingsPath = options.settingsPath || defaultSettingsPath(options.home);
  const { settings, existed, bom } = readSettings(settingsPath);
  const permissions = readablePermissions(settingsPath, settings);
  const allow = permissions.allow ?? [];

  const lines = Object.values(COMMAND_SETTINGS)
    .filter((config) => ownCommandPath(settings[config.key]?.command, config.scriptParts, config.suffix))
    .map((config) => config.key);
  const rules = allow.filter(isOwnAllow);
  const left = [
    ...(permissions.ask ?? []).filter((rule) => DEFAULT_BRANCH_ASK.includes(rule)),
    ...allow.filter((rule) => domainOf(rule) !== null),
  ];

  if ((lines.length || rules.length) && !options.dryRun) {
    const draft = { ...settings };
    for (const key of lines) delete draft[key];
    if (rules.length) draft.permissions = { ...permissions, allow: allow.filter((rule) => !isOwnAllow(rule)) };
    writeSettings(settingsPath, draft, { bom, existed });
  }
  return { removed: [...lines, ...rules], left };
}

const notesOf = ({ results, backupPath }) => [
  ...results.flatMap((result) => result.notes),
  ...(backupPath ? [`The previous file is at ${backupPath}.`] : []),
];

/**
 * The status-line and subagent-status-line states out of a merge result: the one
 * shape `installSettings` and `repairSettings` both return. Kept as one function so
 * a repair can never again reimplement it by hand and quietly drop a key — that is
 * how the backup-path note went missing from `repairSettings`'s report in the first
 * place (see `notesOf`, which the backup path belongs to, not this).
 */
const commandStates = (merge) => {
  const stateOf = (key) => merge.results.find((result) => result.key === key)?.state ?? null;
  return { statusLine: stateOf('statusLine'), subagentStatusLine: stateOf('subagentStatusLine') };
};

/**
 * Merge the status line into `settingsPath`, and nothing else. Returns what it did,
 * and what the caller should be told about it; throws only when the existing file
 * cannot be read or the new one cannot be written.
 *
 * **`installSettings` below is the composed entry point** — it is what the command
 * line runs and what `docs/INSTALL.md` tells Claude to run, because one install has
 * to take one backup. This single is kept for the callers that merge the status line
 * on its own. Do not reach for it to build a bigger merge out of: two merges in a row
 * take two backups, and the second is a copy of the file the first had already
 * changed, while the report goes on calling it "the previous file". Add a step to
 * `installSettings` instead.
 */
export function installStatusLine(options = {}) {
  const settingsPath = options.settingsPath || defaultSettingsPath();
  const pluginRoot = options.pluginRoot || resolvePluginRoot();
  const step = commandSettingStep(settingsPath, COMMAND_SETTINGS.statusLine, pluginRoot);
  const merge = applyMerges(settingsPath, [step]);

  return {
    settingsPath,
    pluginRoot,
    changed: merge.changed,
    backupPath: merge.backupPath,
    statusLine: merge.results[0].state,
    notes: notesOf(merge),
  };
}

/**
 * Everything the install merges, in one read and one write: the allowlist the friend
 * asked for, the status line, and the subagent status line. This is what the command
 * line runs, and what `docs/INSTALL.md` tells Claude to run. `enablePlugin` (a boolean)
 * also writes `enabledPlugins["pilot@pilot"]`; `statusLine: false` writes
 * neither status line and removes this package's own, leaving a user's.
 */
export function installSettings(options = {}) {
  const settingsPath = options.settingsPath || defaultSettingsPath();
  const pluginRoot = options.pluginRoot || resolvePluginRoot();
  const hosts = options.domains || [];

  // Built before anything is read, so a host that is not a host throws before the
  // status line is written either.
  const steps = [
    ...(hosts.length ? [webFetchStep(settingsPath, hosts)] : []),
    ...(options.deckTools === true ? [deckToolsStep(settingsPath)] : []),
    defaultBranchAskStep(settingsPath),
    ...(options.pilotMerge === true ? [pilotMergeStep(settingsPath)] : []),
    ...(typeof options.enablePlugin === 'boolean' ? [enablePluginStep(settingsPath, options.enablePlugin)] : []),
    // L4: below `everything` the user's statusLine is not the pilot's; `pilot run` carries it.
    ...[COMMAND_SETTINGS.statusLine, COMMAND_SETTINGS.subagentStatusLine].map((config) =>
      options.statusLine === false
        ? removeOwnCommandStep(settingsPath, config)
        : commandSettingStep(settingsPath, config, pluginRoot),
    ),
  ];

  const merge = applyMerges(settingsPath, steps);

  return {
    settingsPath,
    pluginRoot,
    changed: merge.changed,
    backupPath: merge.backupPath,
    ...commandStates(merge),
    webFetch: merge.results.find((result) => result.key === 'webFetch') ?? null,
    ask: merge.results.find((result) => result.key === 'ask'),
    deckTools: merge.results.find((result) => result.key === 'deckTools') ?? null,
    pilotMerge: merge.results.find((result) => result.key === 'pilotMerge') ?? null,
    notes: notesOf(merge),
  };
}

/** `<home>/.claude/plugins/cache`, where a normally-installed plugin's root sits. */
function pluginCacheRoot() {
  return path.join(os.homedir(), '.claude', 'plugins', 'cache');
}

// The one-spelling idea `hooks/lib/deck.js` `repoKey` uses, applied to "is this
// path inside that one": resolve, fold the case only where Windows ignores it.
// `--repair` runs unattended at every session start, so a root outside the
// cache — a slice's own worktree, say — must never be trusted (S11).
export function isInPluginCache(dir) {
  const root = pathKey(pluginCacheRoot());
  const candidate = pathKey(dir);
  return candidate === root || candidate.startsWith(root + path.sep);
}

/**
 * `--repair`: recognise this package's own status-line and subagent-status-line
 * commands at any plugin root and repoint them at this one. Wired as a second
 * `SessionStart` entry (D18/D20) so a version bump repairs itself at the next
 * session instead of leaving a dead command silently pointed at a cache
 * directory that is gone. Prints one line per command it actually repaired and
 * nothing otherwise — see `repairCommandStep` for why silence is the default.
 *
 * Refuses when `pluginRoot` is outside `pluginCacheRoot()` (S11): this path
 * runs unattended, so it must never repoint a friend's status lines at a
 * worktree that can vanish out from under them.
 */
export function repairSettings(options = {}) {
  const settingsPath = options.settingsPath || defaultSettingsPath(options.home);
  const pluginRoot = options.pluginRoot || resolvePluginRoot();

  if (!isInPluginCache(pluginRoot)) {
    return {
      settingsPath,
      pluginRoot,
      changed: false,
      backupPath: null,
      statusLine: 'unchanged',
      subagentStatusLine: 'unchanged',
      notes: [],
      refused:
        `--repair: ${pluginRoot} is not inside the plugin cache (${pluginCacheRoot()}); ` +
        'nothing was changed.',
    };
  }

  // L3, A5: below `everything` this hook runs inside `pilot run` too, and repointing the
  // user's status lines there would undo `pilot reach`; both are repaired only at `everything`.
  const steps = [
    ...(rulesPlan(readReach({ home: options.home }).level).user
      ? [
          repairCommandStep(settingsPath, COMMAND_SETTINGS.statusLine, pluginRoot),
          repairCommandStep(settingsPath, COMMAND_SETTINGS.subagentStatusLine, pluginRoot),
        ]
      : []),
  ];

  // Read-only, and read again inside `applyMerges` below: this call exists only to
  // let the catch see just the read/parse failure `readSettings` raises. Wrapping
  // the whole `applyMerges` instead would also catch a write failure - disk full, a
  // locked file, a permissions error during the backup - and report an attempted,
  // failed repair with the same silent shape as "nothing to repair", which is the
  // one case this hook must not go quiet about.
  try {
    readSettings(settingsPath);
  } catch {
    // A settings file this automatic repair cannot even read — hand-edited, BOM'd,
    // moved aside mid-edit — is not something a SessionStart hook should complain
    // about on every session forever. `installSettings`/`installStatusLine`, the
    // user-invoked path, still throw on the same file; only this automatic path
    // goes quiet, the same silent shape as "nothing here is ours to repair".
    return {
      settingsPath,
      pluginRoot,
      changed: false,
      backupPath: null,
      statusLine: 'unchanged',
      subagentStatusLine: 'unchanged',
      notes: [],
    };
  }

  const merge = applyMerges(settingsPath, steps);

  return {
    settingsPath,
    pluginRoot,
    changed: merge.changed,
    backupPath: merge.backupPath,
    ...commandStates(merge),
    notes: notesOf(merge),
  };
}

const USAGE = [
  'Usage: node install-settings.mjs [--settings <path>] [--plugin-root <path>]',
  '                                 [--allow-web-fetch <host>[,<host>...]] [--repair]',
  '                                 [--no-deck-tools]',
  '',
  '  --settings         the settings.json to merge into (default: ~/.claude/settings.json)',
  '  --plugin-root      the package to point at (default: where this script lives)',
  '  --allow-web-fetch  documentation hosts the docs agent may fetch; repeatable, and',
  '                     no WebFetch rule is written without it',
  '  --no-deck-tools    writes nothing to permissions for the deck; without it the CLI allows',
  '                     mcp__plugin_pilot_deck__*',
  '  --repair           repoint this package\'s own commands at the current plugin root;',
  '                     leaves anything it does not recognise as its own alone, and',
  '                     ignores the permission flags: repair only ever touches the two',
  '                     command settings',
  '',
  '  Always: ask rules before a push or merge to main or master, and allow rules for the',
  "  pilot's own Bash(pilot sync *), Bash(pilot integrate *), Bash(pilot land *), Bash(pilot landing *),",
  '  Bash(pilot ps), Bash(pilot gc), Bash(pilot deck --stop *) and Bash(pilot deck --scratch *).',
].join('\n');

const OPTION_OF = { '--settings': 'settingsPath', '--plugin-root': 'pluginRoot' };

export function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') return { help: true };
    if (flag === '--repair') {
      options.repair = true;
      continue;
    }
    if (flag === '--no-deck-tools') {
      options.deckTools = false;
      continue;
    }
    if (flag !== '--allow-web-fetch' && !OPTION_OF[flag]) {
      throw new Error(`Unknown argument ${flag}.\n${USAGE}`);
    }
    const value = argv[i + 1];
    if (value === undefined) {
      throw new Error(
        flag === '--allow-web-fetch'
          ? `${flag} needs at least one host after it.\n${USAGE}`
          : `${flag} needs a path after it.\n${USAGE}`,
      );
    }
    if (flag === '--allow-web-fetch') {
      // Repeatable and comma-separated, because both are how a person types a list.
      const hosts = value.split(',').map((host) => host.trim()).filter(Boolean);
      options.domains = [...(options.domains || []), ...hosts];
    } else {
      options[OPTION_OF[flag]] = value;
    }
    i++;
  }
  return options;
}

function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    console.log(USAGE);
    return;
  }

  let report;
  try {
    // Yes is the command line's default for the deck; docs/INSTALL.md asks first and passes
    // the no. The merge allow rules have no flag and no question (ADR 0110).
    report = options.repair
      ? repairSettings(options)
      : installSettings({ ...options, deckTools: options.deckTools ?? true, pilotMerge: true });
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }
  if (report.refused) {
    console.error(report.refused);
    return;
  }
  for (const note of report.notes) console.log(note);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2));
}
