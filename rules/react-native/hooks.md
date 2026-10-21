---
paths:
  - "**/*.{native,ios,android}.{ts,tsx}"
  - "**/metro.config.*"
  - "**/react-native.config.*"
  - "**/app.json"
---

<!-- provenance
upstream: ECC 2.2.0 - rules/react-native/hooks.md
copyright: Copyright (c) 2026 Affaan Mustafa
licence: MIT - see THIRD-PARTY-NOTICES.md
adapted: dead common/ link removed
ledger: vendor/toolbox.md
-->

# React Native / Expo Hooks

These are recommended PostToolUse automations to keep RN/Expo code healthy. Wire them in your hook runtime (or run manually); adapt commands to your package manager.

## Suggested PostToolUse checks (on edit of *.ts/*.tsx)

- **Type check:** `tsc --noEmit` — catch type errors early.
- **Lint:** `npx expo lint` (uses `eslint-config-expo`; flat config `eslint.config.js` is the default from SDK 53+).
- **Format:** `prettier --write` on changed files.

## Pre-release / periodic

- `npx expo-doctor` — validates Expo/native dependency health and config.
- `npx expo install --check` — keeps native deps aligned with the installed Expo SDK.
- `npm audit` — dependency vulnerability scan.

## Notes

- Do not run heavy native builds inside fast edit hooks; keep edit-time hooks to typecheck/lint/format.
- Reserve `eas build` / E2E for explicit commands or CI, not per-edit automation.
- Keep these consistent with ECC hook runtime controls (`ECC_HOOK_PROFILE`, `ECC_DISABLED_HOOKS`).
