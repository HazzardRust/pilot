---
paths:
  - "**/*.go"
  - "**/go.mod"
  - "**/go.sum"
---

<!-- provenance
upstream: ECC 2.2.0 - rules/golang/testing.md
copyright: Copyright (c) 2026 Affaan Mustafa
licence: MIT - see THIRD-PARTY-NOTICES.md
adapted: dead common/ link and unshipped skill pointers removed
ledger: vendor/toolbox.md
-->

# Go Testing

## Framework

Use the standard `go test` with **table-driven tests**.

## Race Detection

Always run with the `-race` flag:

```bash
go test -race ./...
```

## Coverage

```bash
go test -cover ./...
```
