---
status: accepted
date: 2026-10-11
tags: [install, path]
supersedes: []
superseded_by: []
paths: [docs/INSTALL.md, scripts/install-command.mjs, scripts/install-path.mjs, docs/design/install-pilot-path/architecture.md]
---
# The install puts the command on the PATH

We decided the install adds npm's global directory to the persistent PATH itself, the user `Path` in the registry on Windows and the shell's profile file on macOS and Linux, and tells the user to open a new terminal.

## Context

INSTALL.md step 4 told Claude never to edit the user's PATH: when npm's global directory was missing from it, the report named the directory and stopped. The `pilot` command was installed and no new terminal could find it. No ADR recorded that rule; it lived only in step 4 and the "What this changes" table.

## Decision

- When npm's global directory is not on the persistent PATH, the install appends it: `HKCU\Environment\Path` on Windows, one block in the profile of the user's `$SHELL` elsewhere. Presence is judged on Windows in the registry, never on the running process's PATH; on macOS and Linux, on the process PATH or the pilot block already in the profile.
- It asks no question first, writes nothing when the directory is already there, and reports where it wrote and that a new terminal is needed for pilot to be found.
- When the PATH cannot be written, the command stays installed, the install stays ok, and the report names the directory to add by hand.
- This amends INSTALL.md step 4 and its changes table; the pin that barred any mention of a shell profile now bars only a question about one.

## Rejected

- *Keep telling the user to edit their PATH*: it leaves `pilot run` unfound on the first new terminal, the one moment the install is meant to have fixed.
- *Ask first*: the install already asks three questions; a fourth about a line the report announces adds a stop for no choice a friend can make.
