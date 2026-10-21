# Security reviewer: works as intended and is called automatically

Ticket `itm_b26f9ce833c9` · branch `design/security-reviewer` from `pilot` at `e1b0df50` · merge: none (itm_d9f78278f7e5)

## 1. Problem

The user: "ensure security reviewer works as intended - https://github.com/affaan-m/agentshield is the repo we
need to clone it from. we need to make sure it is automatically getting called. i think the fundamentalist
should have something saying 'consider calling pilot:security-review'". Their standing rule: nothing is cloned
or installed before what it ships has been inspected (§3.1, sent to `main` first; question itm_39e7be53d92e).

## 2. Spec

| # | Behaviour a user could watch | Evidence | Status |
|---|---|---|---|
| 1 | Every slice file carries a **Reviewers line**, and the architect writes `pilot:security-reviewer` on it when the slice hits the **security trigger** | pins on `skills/vertical-slicing/SKILL.md` and `agents/pilot-architect.md`; this artefact's slice files carry the line | locked (L6) |
| 2 | The implementer spawns every reviewer its slice file names, plus `pilot:security-reviewer` when its diff turns out to hit the trigger, and its report carries that reviewer's rows and verdict | wording pin on `agents/pilot-implementer.md`'s review paragraph | proposed |
| 3 | A slice whose Reviewers line names security is not integrated while its report lacks a **security verdict**; the pilot (or co-pilot) spawns the reviewer on the slice PR first | wording pin on `agents/pilot.md` step 5 | locked (L8) |
| 4 | The fundamentalist's report ends with a row "consider calling `pilot:security-reviewer` on <files>" when the feature diff hits the trigger in files no slice's security review covered; the pilot or co-pilot spawns it at step 7 | pins on `agents/pilot-fundamentalist.md` and `agents/pilot.md` step 7 | **assumed** (A2) |
| 5 | The security reviewer downloads and installs nothing unpinned on the user's machine: the `npx eslint` line is gone; `npm audit` runs only where a lockfile exists | a test asserting no unpinned `npx` in `agents/security-reviewer.md`; the `VENDOR.md` and `vendor/toolbox.md` rows and the header's `adapted:` updated | locked (L3) |
| 6 | On a slice that touches **agent configuration**, the security reviewer applies its **config checklist** (hook commands, permission allow-lists, MCP servers and their args, secrets in settings or CLAUDE.md, skills that run commands) and its report carries one row per item it checked | a wording pin on the checklist in `agents/security-reviewer.md`; one real review of a config-touching slice in this run whose report carries the checklist rows | locked (L7) |
| 7 | The reviewer runs end to end on a qualifying slice and its report is read | every slice of this feature touches `agents/` or `skills/`, so each slice PR carries a real security report; QA reads them | proposed |

## 3. Findings

### 3.1 agentshield, inspected read-only (gh api, 2026-10-08; nothing cloned, installed or run)

Inspected and not adopted (L7, itm_042d847b0d40); kept as the research behind the config checklist.

npm `ecc-agentshield` 1.6.0 (latest release v1.6.0), MIT, last push 2026-09-10. A scanner of agent
**configuration** (CLAUDE.md, settings.json hooks and permissions, agents/*.md, skills, MCP), not a code
reviewer; our `agents/security-reviewer.md` comes from ECC 2.2.0 (`VENDOR.md:76`), not from it. ECC already
pairs the two: `rules/react-native/security.md:51` "Use `/security-scan` (AgentShield) on the agent configuration itself."

| Area | Finding | Evidence (upstream path) |
|---|---|---|
| Install scripts | none: no pre/postinstall; only `build`, `prepublishOnly` | `package.json` |
| Dependencies | `@anthropic-ai/sdk`, chalk, commander, glob, smol-toml, yaml, zod, all caret ranges | `package.json` |
| Embedded credentials | none found; keys from env (`ANTHROPIC_API_KEY`, `ORCAROUTER_API_KEY`); `examples/vulnerable/` holds deliberate fake secrets | `src/llm/client.ts` |
| Network, plain `scan` | none: static and local | `src/index.ts:282-315` |
| Network, opt-in | `--opus`, `--injection`, `--deep` send the config to Anthropic, or with `--provider orcarouter` to the third-party `api.orcarouter.ai`; `--supply-chain-online` queries registry.npmjs.org; `watch --webhook` POSTs | `src/llm/client.ts`, `src/supply-chain/verify.ts:224`, `src/watch/alerts.ts:102` |
| Executes code | `--sandbox` (and `--deep`) spawns the hook commands it finds in the scanned config | `src/sandbox/executor.ts:217` |
| Writes to the machine | `runtime install` adds a PreToolUse `node -e` hook to settings.json plus `.agentshield/runtime-policy.json` and logs every tool call; `scan --fix` rewrites configs; `init` writes files | `src/runtime/install.ts:10,141` |
| Default scan path | **with no `--path` it scans `~/.claude`**, the user's own configuration | `src/index.ts:284` |
| Opening a clone in Claude Code | carries `.claude/` (skill, identity.json, ecc-tools.json), `.codex/config.toml`, `CLAUDE.md`; no `.claude/settings.json`, so no hooks load | tree |
| Built code | `dist/*.js` committed, not verified against `src/` | tree |
| Upsell | "ECC Tools Pro" footer, off unless `ECC_CTA` or `AGENTSHIELD_CTA` is set | `src/reporter/cta.ts` |

**Safe envelope**: `scan --path <dir>` only. Never `--opus --injection --sandbox --deep --fix
--supply-chain-online --provider`, never the `runtime`, `watch` or `init` commands.

### 3.2 This repository

- `agents/security-reviewer.md` (139 lines, Sonnet, Read/Grep/Glob/Bash): OWASP checklist, report table and
  verdict (`## Report format`, pinned by `scripts/test/report-format.test.mjs`). Its `## Analysis Commands`
  (l.38-43) run `npm audit --audit-level=high` and `npx eslint . --plugin security`; this repo ships no eslint,
  so the second line is a download-and-run.
- It has run for real: pilot-package S8 found a CRITICAL (`docs/design/pilot-package/architecture.md:283`);
  deck-usability returned APPROVE; the 2026-09-13 report-format finding came from a live run.
- The only trigger is `agents/pilot-implementer.md:74-78`, a judgement clause ("plus `pilot:security-reviewer`
  if it touches auth, user input, secrets or an API boundary"), pinned by no test.
- Briefs once named it per slice (`docs/design/{crew-waits,yellow-agent,thread-kinds,overview-one-ticket}/brief.md`:
  "S1 also gets `pilot:security-reviewer`"); the latest two (`audit-fixes`, `merge-first`) name no reviewer, and
  the slice anatomy (`skills/vertical-slicing/SKILL.md`) has no reviewer field. Nothing enforces the call.
- `agents/pilot-co-pilot.md:6` and `agents/pilot.md:5` list `pilot:security-reviewer`, so both can spawn it.
- `agents/pilot-fundamentalist.md`: no `Agent` tool; "You do not spawn agents" (l.253); reports to its spawner.
- Step 5 (`agents/pilot.md`, "### 5. Integrate the slice") integrates once "its own fresh reviewer has cleared
  it"; step 7 triages the fundamentalist's report.

## 4. Ubiquitous language

- **Security trigger**: a slice or diff touching auth, user input, secrets, an API boundary (a route, a hook
  input, a CLI argument), a process start, or agent configuration.
- **Agent configuration**: `agents/`, `hooks/`, `skills/`, `settings*.json`, `.mcp.json`, `CLAUDE.md` in the
  repository under review.
- **Reviewers line**: the slice file's line naming the reviewers its implementer must spawn.
- **Security verdict**: the `Verdict:` line of `pilot:security-reviewer`'s report, copied into the implementer's.
- **Config checklist**: the agent-configuration section of `agents/security-reviewer.md`, applied when a slice hits agent configuration.

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
|---|---|---|---|
| L1 | Keep `pilot:security-reviewer` as the code reviewer; agentshield is not adopted (L7) | agentshield does not review code (§3.1) | replacing the reviewer with agentshield; cloning it into the repo |
| L2 | Pins are wording pins in `scripts/test/` on the definitions, the repo's existing pattern | `pilot-agents.test.mjs`, `report-format.test.mjs` pin crew prose this way | a hook that inspects diffs (a new module with one caller) |
| L3 | Drop the `npx eslint` line; `npm audit` only where a lockfile exists | the user's standing no-install rule; eslint is absent here | pinning eslint-plugin-security (an install nobody asked for) |
| L4 | Agent configuration is part of the trigger | this package is mostly agent configuration; three recent runs named security for hook inputs | code paths only |
| L5 | QA environment: this feature's own run (the user's word, itm_a899088714dd). Its slices touch `agents/` and `skills/`, so each slice PR carries a real security report, and S3's carries the config checklist rows | spec 7 needs a real run; this is the cheapest real one | a scratch repo with a planted auth bug (a fixture nobody keeps) |
| L6 | The trigger is set at plan time on the slice's Reviewers line; the implementer adds security when its diff hits the trigger (the user's word, itm_4fde7e09f95b) | Gate 1 shows who reviews each slice; the implementer still adds security when its diff qualifies | the implementer's judgement alone (today, unenforced) |
| L7 | No third-party scanner; a config checklist in `agents/security-reviewer.md` (the user's word, itm_042d847b0d40) | covers what agentshield scans for (§3.1) with nothing downloaded or run; the reviewer already reads the diff | agentshield's pinned `npx` scan (taken on itm_39e7be53d92e and itm_6d90592c6187, then reversed) |
| L8 | Step 5 does not integrate a slice named for security without a security verdict; the integrator spawns it (the user's word, itm_9a275d9c1dec) | a missed review is caught before merge, at one reviewer's cost | a warning row only |
| L9 | Grilling depth: forks (the user's word, itm_042d847b0d40) | | |

## 6. Assumed decisions (sent to `main`)

| # | Default taken | Tradeoff | Alternative |
|---|---|---|---|
| A2 | The fundamentalist writes a "consider calling" row; the pilot or co-pilot spawns the reviewer | keeps the fundamentalist read-only with no children; one hop | give it `Agent(pilot:security-reviewer)` and a budget of one |

## 7. Out of scope

- Rewriting the reviewer's OWASP content or its report format (pinned and working).
- Any third-party scanner, agentshield included (§3.1, L7).
- The mislabelled `feature` in `docs/design/audit-fixes/run.json:3` ("Security reviewer runs and is called").
- Other reviewers' triggers (database, language).

## 8. Slices

| Slice | Title | Spec | Files owned | After | File |
|---|---|---|---|---|---|
| S1 | Walking skeleton: a slice names its security reviewer and the implementer calls it | 1, 2, 7 | `skills/vertical-slicing/SKILL.md`, `agents/pilot-architect.md`, `agents/pilot-implementer.md`, `scripts/test/slice-interface.test.mjs`, `scripts/test/security-trigger.test.mjs` (new) | – | [S1](slices/S1.md) |
| S2 | The security reviewer installs nothing | 5 | `agents/security-reviewer.md`, `VENDOR.md`, `vendor/toolbox.md`, `scripts/test/security-reviewer.test.mjs` (new) | – | [S2](slices/S2.md) |
| S3 | The reviewer checks agent configuration | 6 | `agents/security-reviewer.md`, `VENDOR.md`, `vendor/toolbox.md`, `scripts/test/security-reviewer.test.mjs` | S2 | [S3](slices/S3.md) |
| S4 | Integration and the fundamentalist call it when a slice did not | 3, 4 | `agents/pilot.md`, `agents/pilot-fundamentalist.md`, `scripts/test/security-trigger.test.mjs` | S1 | [S4](slices/S4.md) |

S1 and S2 run in parallel (disjoint files). Reviewers, every slice: `pilot:typescript-reviewer` (the pins) and
`pilot:security-reviewer`, because every slice touches agent configuration; this feature is its own first real
run (spec 7, L5). S1 makes a reviewers column part of this table (item 8 of `pilot-architect.md`), so after
it lands this paragraph is a column. S1 also moves the anatomy pin from ten fields to eleven
(`scripts/test/slice-interface.test.mjs:46`). About 2 h for 4 slices.

## 9. Acceptance evidence

1. Open any slice file of this feature: its Reviewers line names `pilot:security-reviewer` (spec 1).
2. Open each slice PR: the body's review table carries the security reviewer's rows and its `Verdict:` line (spec 2, 7).
3. `grep -n "npx" agents/security-reviewer.md` prints nothing (spec 5).
4. A config-touching slice's PR in this run (S3's own): the security report carries one row per checklist item (spec 6).
5. Read `agents/pilot.md` steps 5 and 7 and `agents/pilot-fundamentalist.md`'s report section: the refusal and the "consider calling" row (spec 3, 4).
6. `npm test` green with the new pins (all lines).

## 10. Status

| Slice | State | Branch | PR | Worktree | Blocker | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 1, 2, 7 |
| S2 | planned | | | | – | 5 |
| S3 | planned | | | | S2 | 6 |
| S4 | planned | | | | S1 | 3, 4 |
| feature | planned | feat/security-reviewer | | | S1-S4 | 1-7 |
