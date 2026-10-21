---
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/components/**/*.ts"
  - "**/components/**/*.js"
  - "**/app/**/*.tsx"
  - "**/pages/**/*.tsx"
---

<!-- provenance
upstream: ECC 2.2.0 - rules/react/patterns.md
copyright: Copyright (c) 2026 Affaan Mustafa
licence: MIT - see THIRD-PARTY-NOTICES.md
adapted: dead common/ link and unshipped skill pointers removed; deduped against typescript/react/web; generic advice removed
ledger: vendor/toolbox.md
-->

# React Patterns

## State Location Decision Tree

1. Used by one component → `useState` inside it
2. Used by parent + a few children → lift to nearest common ancestor, pass via props
3. Used across distant branches → React Context **for low-frequency reads only** (theme, auth, locale)
4. High-frequency updates shared across the tree, or state that must persist across routes, sync across tabs, or be debugged in devtools → external store (Zustand, Jotai, Redux Toolkit)

Context misused for frequently changing values causes every consumer to re-render on every update.

## Server / Client Component Boundary (RSC, Next.js App Router)

- Server Components are the default — they run on the server, do not ship to the client, and can `await` directly
- Client Components opt in with `"use client"` on line 1, before any imports, only when the file uses state, effects, refs, browser APIs, or event handlers
- Data flows down: a Server Component can render a Client Component and pass serializable props
- A Client Component cannot import a Server Component, but it can receive one via `children` or named slots

- Never import `"server-only"` packages (DB clients, secrets) from a Client Component file — wrap them in a Server Component or Server Action
- Mark sensitive modules with `import "server-only"` so the bundler errors if a client file imports them
- Never import a Client Component file from inside a `"use server"` action file
- Never re-export server-only code through a client module — the bundler will silently include it

## Suspense + Error Boundaries

Every Suspense boundary needs an Error Boundary above it. The pair handles both states.

- Place Suspense boundaries close to where data is needed, not at the route root
- Multiple narrower boundaries reveal loaded content progressively
- Error Boundary must be a Class Component (React 19 has no functional equivalent yet) OR use a library wrapper such as `react-error-boundary`

## Forms

### Uncontrolled (React 19 + form actions)

Prefer uncontrolled inputs with form actions when the form has a clear submit step. The browser owns the value; React reads it via `FormData` on submit.

### Controlled

Use controlled inputs when the value drives other UI, requires real-time validation, or formatting.

### Form Libraries

For complex forms (multi-step, dynamic field arrays, cross-field validation), use a library:

- React Hook Form — minimal re-renders, uncontrolled-first
- TanStack Form — typed, framework-agnostic
- Final Form — when subscription-based re-renders matter

## Data Fetching Library

| Strategy | When |
|---|---|
| RSC fetch (`await` in Server Component) | Per-request data in Next.js App Router, no client-side cache needed |
| TanStack Query | Client-side cache, mutations, optimistic updates, polling |
| SWR | Lightweight cache + revalidation, simpler than TanStack Query |
| `fetch` in `useEffect` | Avoid — race conditions, no cache, no retry. Only acceptable for one-off fire-and-forget |

## Lists and Keys

- `key` must be stable across renders — never `index` for any list that can reorder, insert, or delete
- `key` must be unique among siblings, not globally
- A reordered list with index keys causes state in child components to attach to the wrong row

## Composition over Inheritance

- Pass `children` for slot-style composition
- Pass render-prop functions for parameterized rendering
- Pass component types for plug-in points: `renderItem={UserRow}`
- Never extend a component class to specialize behavior

## Portals

Use `createPortal` for modals, tooltips, toast containers — anything that must escape the parent's `overflow: hidden` or `z-index` stacking context. Render to a stable DOM node mounted in `index.html`.

## Refs and Forwarding (React 19+)

React 19 lets function components accept `ref` as a regular prop — `forwardRef` is no longer required.

Older codebases on React 18 still need `forwardRef`.

## Next.js and React Native

Next.js App Router specifics (Server Actions, Route Handlers, Middleware, Parallel/Intercepted Routes, streaming Metadata) and React Native (`Platform.OS`, `.ios.tsx` / `.android.tsx`, `StyleSheet`, React Navigation, Expo Router): follow their official docs; the React core rules here still apply.
