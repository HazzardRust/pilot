---
paths:
  - "**/*.kt"
  - "**/*.kts"
  - "**/build.gradle.kts"
---

<!-- provenance
upstream: ECC 2.2.0 - rules/kotlin/hooks.md
copyright: Copyright (c) 2026 Affaan Mustafa
licence: MIT - see THIRD-PARTY-NOTICES.md
adapted: dead common/ link removed
ledger: vendor/toolbox.md
-->

# Kotlin Hooks

## PostToolUse Hooks

Configure in `~/.claude/settings.json`:

- **ktfmt/ktlint**: Auto-format `.kt` and `.kts` files after edit
- **detekt**: Run static analysis after editing Kotlin files
- **./gradlew build**: Verify compilation after changes
