---
paths:
  - "**/*.css"
  - "**/*.scss"
  - "**/*.sass"
  - "**/*.less"
  - "**/*.html"
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.vue"
  - "**/*.svelte"
---

<!-- provenance
upstream: ECC 2.2.0 - rules/web/coding-style.md
copyright: Copyright (c) 2026 Affaan Mustafa
licence: MIT - see THIRD-PARTY-NOTICES.md
adapted: dead common/ link removed; deduped against typescript/react/web; generic advice removed
ledger: vendor/toolbox.md
-->

# Web Coding Style

## File Organization

Organize by feature or surface area, not by file type.

## CSS Custom Properties

Define design tokens as variables. Do not hardcode palette, typography, or spacing repeatedly:

```css
:root {
  --color-surface: oklch(98% 0 0);
  --color-text: oklch(18% 0 0);
  --color-accent: oklch(68% 0.21 250);

  --text-base: clamp(1rem, 0.92rem + 0.4vw, 1.125rem);
  --text-hero: clamp(3rem, 1rem + 7vw, 8rem);

  --space-section: clamp(4rem, 3rem + 5vw, 10rem);

  --duration-fast: 150ms;
  --duration-normal: 300ms;
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
}
```

## Animation-Only Properties

Animate only compositor-friendly properties: `transform`, `opacity`, `clip-path`, `filter` (sparingly). Never animate layout-bound ones: `width`, `height`, `top`, `left`, `margin`, `padding`, `border`, `font-size`.

## Semantic HTML First

Do not reach for generic wrapper `div` stacks when a semantic element exists.

## CSS and Motion Naming

- CSS classes: kebab-case or utility classes
- Animation timelines: camelCase with intent (`heroRevealTl`)
