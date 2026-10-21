---
name: verification-loop
description: "A comprehensive verification system for Claude Code sessions. Use when verifying a Claude Code session's work before claiming it is complete."
license: MIT
---

<!-- provenance
upstream: ECC 2.2.0 - skills/verification-loop/SKILL.md
copyright: Copyright (c) 2026 Affaan Mustafa
licence: MIT - see THIRD-PARTY-NOTICES.md
adapted: the `/verify` command and the ECC-hooks section dropped (neither ships, L9); the phase-gate order named so the checklist matches the loop it backs; `When to Use` and `Output Format` dropped as restatements of the description and of the implementer's gate table, and `Continuous Mode` for contradicting that gate's one run on the final state (independence L8); the phases run the project's own commands, with Cargo, Make, Terraform and CMake rows beside npm and tsc
ledger: vendor/toolbox.md
-->

# Verification Loop Skill

Run the project's own commands; the rows below show npm and tsc, with Cargo, Make, Terraform and CMake beside them.

A comprehensive verification system for Claude Code sessions.

## Verification Phases

### Phase 1: Build Verification
```bash
# Check if project builds
npm run build 2>&1 | tail -20
# OR
pnpm build 2>&1 | tail -20
# Cargo: cargo build; Make: make; CMake: cmake --build build
```

If build fails, STOP and fix before continuing.

### Phase 2: Type Check
```bash
set -o pipefail
# TypeScript projects
npx --no-install tsc --noEmit 2>&1 | head -30

# Python projects
pyright . 2>&1 | head -30

# Cargo: cargo check; Terraform: terraform validate
```

Report all type errors. Fix critical ones before continuing.

### Phase 3: Lint Check
```bash
# JavaScript/TypeScript
npm run lint 2>&1 | head -30

# Python
ruff check . 2>&1 | head -30

# Cargo: cargo clippy; Terraform: terraform fmt -check
```

### Phase 4: Test Suite
```bash
# Run tests with coverage
npm run test -- --coverage 2>&1 | tail -50

# Check coverage threshold
# Target: 80% minimum
# Cargo: cargo test; Make: make test; CMake: ctest --test-dir build
```

Report:
- Total tests: X
- Passed: X
- Failed: X
- Coverage: X%

### Phase 5: Security Scan
```bash
# Check for secrets
grep -rn "sk-" --include="*.ts" --include="*.js" . 2>/dev/null | head -10
grep -rn "api_key" --include="*.ts" --include="*.js" . 2>/dev/null | head -10

# Check for console.log
grep -rn "console.log" --include="*.ts" --include="*.tsx" src/ 2>/dev/null | head -10
```

### Phase 6: Diff Review
```bash
# Show what changed
git diff --stat
git diff HEAD~1 --name-only
```

Review each changed file for:
- Unintended changes
- Missing error handling
- Potential edge cases

## The gate it backs

This is the checklist behind the slice loop's phase gate, which runs once on the
final state and in this order: type check, lint, the full test suite, build, and -
where the slice has a user-visible surface - the flow exercised live in a browser.
The phases above are that gate's detail, not a second, competing list.
