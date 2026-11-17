/**
 * The permission-rule helpers shared by the installers that merge into a user's
 * settings.json: the WebFetch allowlist, the default-branch ask rules and the pilot's
 * own allow rules. Moved here verbatim from install-settings.mjs, which re-exports
 * `denyCovers` and `webFetchRule` so every importer keeps working.
 */

/**
 * A host name and nothing else: no scheme, no path, no wildcard. A malformed rule in a
 * friend's permissions is not an error they ever see — it simply never matches, and the
 * fetch it was meant to constrain carries on unconstrained.
 */
const HOST_NAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

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

export const domainOf = (rule) => {
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
export function coveringRule(rules, host) {
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
export function readablePermissions(settingsPath, settings) {
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

// A deny rule's command pattern as a test of another rule's text: `*` matches anything,
// including the other rule's own `*`, and the legacy `prefix:*` form is a prefix match.
// Erring towards "covered" is the safe direction: the deny wins whatever we add.
const BASH_RULE = /^Bash(?:\((.*)\))?$/;

export function denyCovers(deny, rule) {
  const match = BASH_RULE.exec(String(deny).trim());
  if (!match) return false;
  if (match[1] === undefined) return true; // a bare `Bash` denies every command
  const pattern = match[1].endsWith(':*') ? `${match[1].slice(0, -2)}*` : match[1];
  const glob = pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${glob.join('.*')}$`).test(BASH_RULE.exec(rule)[1]);
}

/**
 * L22: every session on the machine asks before a push or a merge to the default branch,
 * in the forms people write. Ask rules only - an allow would grant the push, and a deny
 * would block the user's own pushes to main in every project. Bash rules match the text
 * as written, so `git -C . push`, `HEAD:refs/heads/main` or a push with an upstream set
 * slip past; the guard in code and branch protection are the real controls (L23).
 */
export const DEFAULT_BRANCH_ASK = [
  'Bash(git push origin main)', 'Bash(git push origin main *)', 'Bash(git push origin *:main)',
  'Bash(git push origin master)', 'Bash(git push origin master *)', 'Bash(git push origin *:master)',
  'Bash(gh pr merge)', 'Bash(gh pr merge *)',
];

export function defaultBranchAskStep(settingsPath) {
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
 * The deck server's tools, and nothing wider. A deck call that waits on a terminal
 * prompt stalls a background lane nobody is watching, and under auto mode the
 * classifier may refuse it outright; an allow rule is the one thing that settles both.
 */
export const DECK_SERVER = 'mcp__plugin_pilot_deck';

/**
 * ADR 0110, amending L22: the pilot's own merge commands are allowed, because the auto-mode
 * classifier reads only the command text and cannot see the gate the user signed. Written
 * `<cmd> *` with the space, which matches the bare command and not `pilot landfoo` (L2).
 * The push stays guarded in code: `land` and `integrate` refuse the default branch by name
 * whatever this rule says (L23). A rule the user's deny or ask covers is named and left out,
 * since either beats an allow and the rule would read as a grant that never takes effect (L3).
 */
export const PILOT_MERGE_ALLOW = [
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

export function pilotMergeStep(settingsPath) {
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
 * The allow rules only pilot writes (L10): the deck's tools and the `pilot` command's. Two
 * prefixes and nothing wider, so a rule the user wrote for anything else is never theirs to lose.
 */
const OWN_ALLOW_PREFIXES = [`${DECK_SERVER}__`, 'Bash(pilot '];
export const isOwnAllow = (rule) => typeof rule === 'string' && OWN_ALLOW_PREFIXES.some((prefix) => rule.startsWith(prefix));

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
export function deckToolsStep(settingsPath) {
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
