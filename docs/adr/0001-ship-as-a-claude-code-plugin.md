---
status: accepted
date: 2026-09-13
tags: [install]
supersedes: []
superseded_by: []
paths: []
---
# Ship as a Claude Code plugin from a private marketplace

The pilot lived as loose files in one person's `~/environment`, copied into `~/.claude` by a script. We ship it as a Claude Code plugin whose repository is its own marketplace, because a plugin carries agents, skills, hooks and an MCP server as one unit, gives them the `pilot:` namespace, and removes every absolute path through `${CLAUDE_PLUGIN_ROOT}`. A dotfiles repo with a bootstrap script would have to reimplement discovery, namespacing and updates by hand and would overwrite a friend's own agents.

**Consequences**: the statusline and the `rules/` files cannot be registered by a plugin, so an install step outside the plugin remains (ADR 0002).
