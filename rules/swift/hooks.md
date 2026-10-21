---
paths:
  - "**/*.swift"
  - "**/Package.swift"
---

<!-- provenance
upstream: ECC 2.2.0 - rules/swift/hooks.md
copyright: Copyright (c) 2026 Affaan Mustafa
licence: MIT - see THIRD-PARTY-NOTICES.md
adapted: dead common/ link removed
ledger: vendor/toolbox.md
-->

# Swift Hooks

## PostToolUse Hooks

Configure in `~/.claude/settings.json`:

- **SwiftFormat**: Auto-format `.swift` files after edit
- **SwiftLint**: Run lint checks after editing `.swift` files
- **swift build**: Type-check modified packages after edit

## Warning

Flag `print()` statements — use `os.Logger` or structured logging instead for production code.
