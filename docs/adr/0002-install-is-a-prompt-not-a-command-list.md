---
status: accepted
date: 2026-09-13
tags: [install]
supersedes: []
superseded_by: []
paths: [docs/INSTALL.md]
---
# The install is a prompt pasted into Claude Code

A plugin cannot set the statusline or register rules files, so some install work happens outside `/plugin install`. Rather than a numbered command list and a hand-edited `settings.json`, the README's install section is a prompt the friend pastes into Claude Code, pointing at `docs/INSTALL.md`; Claude adds the marketplace, installs the plugin, merges the settings, copies the rules without overwriting, appends the `CLAUDE.md` excerpt only with consent, and verifies. The package is agent-first, so its install is too, and the settings merge is exactly the step a human gets wrong.
