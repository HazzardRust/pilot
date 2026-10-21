---
status: accepted
date: 2026-10-08
tags: [hooks, install]
supersedes: [0025]
superseded_by: []
paths: [hooks/hooks.json, scripts/install-leftovers.mjs, docs/INSTALL.md]
---
# The gateguard is removed, and an install deletes its state

ADR 0025 vendored ECC's fact-forcing gate, the gateguard, as this plugin's own `PreToolUse` hook on `Edit|Write|MultiEdit`, blocking the first edit of each file until the agent had investigated it, and amended ADR 0007 to allow it. The user asked for it to go: "i want to get rid of the pre-bash hook." / "yes the gateguard" (`itm_6f0d1770fbae`). So we removed it whole: its registration in `hooks/hooks.json`, `hooks/gateguard.js`, the vendored `hooks/gateguard-fact-force.js`, its tests, and `lib/shell-substitution.js`, which nothing else used (audit-fixes L7). ADR 0025 no longer holds, and ADR 0007 is back to its unamended rule: no ECC hook ships.

- **Its state goes with it.** The gate kept per-session `state-*.json` files in `~/.gateguard/`. `scripts/install-leftovers.mjs` deletes only those plain files directly under that directory, then the directory if that left it empty, and names each (user, `itm_e9b1ca028653`; audit-fixes L13). Anything else there is kept and named, a link is never followed, and nothing is deleted recursively: the directory name is not ours alone, and ECC's own copy of the gate writes there too.
- **The install runs it** as a step of its own (`docs/INSTALL.md`), so a machine that had an older version is cleaned by the next install, and a second run says there is nothing to remove.

Rejected:
- Keeping the gate behind an off switch: the user asked for it gone, and a hook nobody runs is still a file to keep vendored.
- Leaving `lib/shell-substitution.js` as dead vendor code.
- Leaving `~/.gateguard/` in place: harmless bytes, but "any state it keeps is deleted" would be false and the removal left to the user's hands.
- A recursive delete of `~/.gateguard/`: it would take a file another tool put there.

**Consequences**:
- An agent's first edit of a file is no longer blocked; the investigation the gate forced is now only what the crew's own instructions ask for.
- A machine where ECC itself installs the gate keeps that copy; only this plugin's registration is gone. If ECC is active, the leftovers step may delete state files ECC's live copy is using, which that copy recreates on its next call.
