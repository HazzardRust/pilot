---
paths:
  - "**/*.css"
  - "**/*.scss"
  - "**/*.sass"
  - "**/*.less"
  - "**/*.html"
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.vue"
  - "**/*.svelte"
---

<!-- provenance
upstream: ECC 2.2.0 - rules/web/hooks.md
copyright: Copyright (c) 2026 Affaan Mustafa
licence: MIT - see THIRD-PARTY-NOTICES.md
adapted: dead common/ link removed; deduped against typescript/react/web; generic advice removed
ledger: vendor/toolbox.md
-->

# Web Hooks

## Recommended Hooks

Prefer project-local tooling; do not wire hooks to remote one-off package execution. Each is a `hooks` entry in settings, shaped `{ "matcher": "Write|Edit", "command": "...", "description": "..." }` under its event, and they run in this order: format, lint, type check, build verification.

| Event | Command | Purpose |
|---|---|---|
| PostToolUse | `pnpm prettier --write "$FILE_PATH"` | Format edited frontend files (`yarn prettier` or `npm exec prettier --` are fine when they use repo-owned dependencies) |
| PostToolUse | `pnpm eslint --fix "$FILE_PATH"` | Lint edited frontend files |
| PostToolUse | the `tsc` check in [typescript/hooks.md](../typescript/hooks.md) | Type-check after frontend edits |
| PostToolUse | `pnpm stylelint --fix "$FILE_PATH"` | Lint edited stylesheets |
| PreToolUse (matcher `Write`) | a `node -e` script that reads the tool input from stdin and exits 2 when `tool_input.content` exceeds 800 lines | Block oversized writes from the tool input, not from a file that may not exist yet |
| Stop | `pnpm build` | Verify the production build at session end |

On Windows without GNU coreutils, swap `timeout 60` for a PowerShell wrapper or sweep stale `tsc` processes from a Stop or SessionEnd hook. `--tsBuildInfoFile` is required because `--noEmit` otherwise suppresses the buildinfo write that `--incremental` reuses.
