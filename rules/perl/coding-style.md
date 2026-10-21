---
paths:
  - "**/*.pl"
  - "**/*.pm"
  - "**/*.t"
  - "**/*.psgi"
  - "**/*.cgi"
---

<!-- provenance
upstream: ECC 2.2.0 - rules/perl/coding-style.md
copyright: Copyright (c) 2026 Affaan Mustafa
licence: MIT - see THIRD-PARTY-NOTICES.md
adapted: dead common/ link and unshipped skill pointers removed
ledger: vendor/toolbox.md
-->

# Perl Coding Style

## Standards

- Always `use v5.36` (enables `strict`, `warnings`, `say`, subroutine signatures)
- Use subroutine signatures — never unpack `@_` manually
- Prefer `say` over `print` with explicit newlines

## Immutability

- Use **Moo** with `is => 'ro'` and `Types::Standard` for all attributes
- Never use blessed hashrefs directly — always use Moo/Moose accessors
- **OO override note**: Moo `has` attributes with `builder` or `default` are acceptable for computed read-only values

## Formatting

Use **perltidy** with these settings:

```
-i=4    # 4-space indent
-l=100  # 100 char line length
-ce     # cuddled else
-bar    # opening brace always right
```

## Linting

Use **perlcritic** at severity 3 with themes: `core`, `pbp`, `security`.

```bash
perlcritic --severity 3 --theme 'core || pbp || security' lib/
```
