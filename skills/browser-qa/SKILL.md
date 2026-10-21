---
name: browser-qa
description: Use this skill to automate visual testing and UI interaction verification using browser automation after deploying features.
---

<!-- provenance
upstream: ECC 2.2.0 - skills/browser-qa/SKILL.md
copyright: Copyright (c) 2026 Affaan Mustafa
licence: MIT - see THIRD-PARTY-NOTICES.md
adapted: the three candidate browser MCPs replaced by `chrome-devtools-mcp@1.9.0` under `mcp__plugin_pilot_chrome-devtools__*` (L7); `/canary-watch` dropped; Web Vitals, dark mode and the breakpoint sweep only when the spec names them, the QA Report format kept with `design-review`'s table as its findings section (independence L11)
ledger: vendor/toolbox.md
-->

# Browser QA — Automated Visual Testing & Interaction

## When to Use

After deploying to staging/preview, before shipping, or reviewing a PR that touches
the frontend — anywhere layouts, forms, interactions or accessibility need a live
check rather than a guess.

## How It Works

Uses this package's one declared dependency, `chrome-devtools-mcp@1.9.0`, pinned in
`.mcp.json` (L7), to interact with live pages like a real user.

### Safety first — blast radius (run read-only by default)

Browser QA drives real auth and real user journeys, so treat the blast radius explicitly.
Default to **read-only**: never run a **mutating** journey (checkout, payment, delete,
mass-update) against a production URL — require an explicit opt-in **and** a staging/preview
URL. Use seeded **test credentials**, never real production logins, and **redact**
credentials/tokens/PII before saving any screenshot.

### Phase 1: Smoke Test
```
1. Navigate to target URL
2. Check for console errors (filter noise: analytics, third-party)
3. Verify no 4xx/5xx in network requests
4. Screenshot above-the-fold at one desktop width (1440px)
```

### Phase 2: Interaction Test
```
1. Click every nav link — verify no dead links
2. Submit forms with valid data — verify success state
3. Submit forms with invalid data — verify error state
4. Test auth flow: login → protected page → logout (test creds only, never prod)
5. Test critical user journeys (checkout, onboarding, search)
   — read-only by default; only exercise mutating journeys against staging
     with explicit opt-in (see "Safety first" above)
```

### Phase 3: Visual Regression
```
1. Screenshot key pages at the desktop width
2. Compare against committed baseline screenshots
   — no baseline ⇒ report INCONCLUSIVE, never a silent PASS
3. Flag layout shifts > 5px, missing elements, overflow
```

Core Web Vitals, a dark-mode check and other breakpoints are skipped unless the spec names
them (L11).

### Phase 4: Accessibility
```
1. Run axe-core or equivalent on each page
2. Flag WCAG 2.2 AA violations (contrast, labels, focus order)
3. Verify keyboard navigation works end-to-end
4. Check screen reader landmarks
```

> Note: axe-core covers roughly 30–40% of WCAG — necessary, not sufficient. Keyboard
> nav, focus order and a screen-reader pass still need a manual check.

## Output Format

```markdown
## QA Report — [URL] — [timestamp]

### Smoke Test
- Console errors: 0 critical, network: all 200/304

### Interactions
- [✗] Contact form: missing error state for invalid email

### Visual
| Triage | Screen | Problem | Screenshot |
| --- | --- | --- | --- |
| High | Contact form | Overflows at the desktop width | path |

### Accessibility
- 2 AA violations: missing alt text, low contrast on footer links

### Verdict: SHIP WITH FIXES (2 issues, 0 blockers)
```

design-review's table — a row per finding with its triage and screenshot — is this
report's findings section. Core Web Vitals, dark mode and a breakpoint sweep are
rows here only when the spec names them (Phase 1, Phase 3).

## Integration

The tools arrive under the plugin-scoped prefix `mcp__plugin_pilot_chrome-devtools__*`:
`navigate_page`, `take_snapshot`, `take_screenshot`, `click`, `fill`,
`list_console_messages`, `list_network_requests`.

The server is fetched by `npx` at first use, so the first call is slow. "Browser
already running" is transient — retry. No second browser MCP is declared: the
machine you ship to will not have one, however well installed it is here.
