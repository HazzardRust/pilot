---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
---

<!-- provenance
upstream: ECC 2.2.0 - rules/typescript/hooks.md
copyright: Copyright (c) 2026 Affaan Mustafa
licence: MIT - see THIRD-PARTY-NOTICES.md
adapted: dead common/ link removed; deduped against typescript/react/web; generic advice removed
ledger: vendor/toolbox.md
-->

# TypeScript/JavaScript Hooks

## PostToolUse Hooks

Configure in `~/.claude/settings.json`:

- **Prettier**: Auto-format JS/TS files after edit
- **TypeScript check**: Run `tsc --noEmit --incremental --tsBuildInfoFile <cache path>` after editing `.ts`/`.tsx` files, wrapped in `timeout 60` so a hung run is reaped instead of piling up across edits
- **console.log warning**: Warn about `console.log` in edited files

## Stop Hooks

- **console.log audit**: Check all modified files for `console.log` before session ends
