---
paths:
  - "**/*.py"
  - "**/*.pyi"
---

<!-- provenance
upstream: ECC 2.2.0 - rules/python/patterns.md
copyright: Copyright (c) 2026 Affaan Mustafa
licence: MIT - see THIRD-PARTY-NOTICES.md
adapted: dead common/ link and unshipped skill pointers removed
ledger: vendor/toolbox.md
-->

# Python Patterns

## Protocol (Duck Typing)

```python
from typing import Protocol

class Repository(Protocol):
    def find_by_id(self, id: str) -> dict | None: ...
    def save(self, entity: dict) -> dict: ...
```

## Dataclasses as DTOs

```python
from dataclasses import dataclass

@dataclass
class CreateUserRequest:
    name: str
    email: str
    age: int | None = None
```

## Context Managers & Generators

- Use context managers (`with` statement) for resource management
- Use generators for lazy evaluation and memory-efficient iteration
