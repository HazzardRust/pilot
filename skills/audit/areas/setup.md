---
area: setup
owner: auditor
spec: [5, 10]
---

# Setup cost and preview

How long an agent waits before it can run one test here, and whether the project's own preview comes up at all. A
report's rows use two Areas for what this one file measures — `setup` for the install and the env vars and
services it finds, `preview` for the dev server row — because both come from the same first minutes in the scratch
worktree, before anything else runs.

## Measure

All in the scratch worktree, each command under a timeout, timed in seconds:

1. **install**: run the command the lockfile implies (`npm ci`, `pnpm install --frozen-lockfile`, `uv sync`,
   `pip install -r requirements.txt`, ...), under 600 s — unless the loops area already ran it (area files are read
   in name order and `loops` sorts before `setup`, so its install is the one that runs). Either way this area still
   gets its own **install** row: when loops already ran it, this row reuses that same command, its exit code and
   its seconds, never installing a second time. A failed install is a row, and the steps below that need it go in
   `unmeasured` instead of being guessed.
2. **steps-to-green**: from a fresh scratch, count and time every command needed until one test file passes — the
   install above plus whatever else that first green test needs (a build step, a generated file, ...). The row names
   the count and the total seconds.
3. **env var**: every `process.env.X`, `os.environ["X"]`, or the language's equivalent the code reads, minus any
   name already listed in `.env.example` or a doc. Report each by name only: an env var's value is never read into a
   row, never printed, and never quoted in a finding.
4. **service**: read `docker-compose*.yml`, `supabase/config.toml` and the README for a database, queue or other
   service the project expects running, and name what was found and where. A service is detected only; never start
   one, even to confirm it is there.
5. **preview**: find the dev or start script (`scripts.start`, `scripts.dev`, a Procfile, ...) and run it in the
   scratch worktree only, under a timeout (default 120 s), then stop it by the PID that started it. The row names
   the URL it answered on — the first `http://` or `https://` line in its output, or the port it bound — or, past
   the timeout, that it timed out and the last output lines.
6. **seed**: look for the one-command seed or reset path (a `scripts.seed`, a management command, a migration
   runner's seed subcommand, ...) and cite it by file:line, or report its absence. The audit never seeds or migrates
   any database, in the scratch worktree or anywhere else: only that command's `--help` or a dry-run form is ever
   run.

## Rows

Each row's `command` is exactly what ran, and its `output` starts with `<seconds> s, exit <code>` (or `<seconds> s,
timed out`) followed by an excerpt of at most twenty lines, in S1's Row shape; the first example below spells out
every field a row carries, the rest add only `command`, `output` and `finding`:

- **env var**: `command: "grep -rn process.env.STRIPE_SECRET_KEY src/"`, `output: "0 s, exit 0, src/pay.mjs:12"`,
  `finding: "reads STRIPE_SECRET_KEY, unset in .env.example"` — the name only, never the value —
  `fix: "add STRIPE_SECRET_KEY to .env.example"`, `effort: "S"`, `saving: { minutes: 1, tokens: 200 }`.
- **install**: `command: "npm ci"`, `output: "42 s, exit 0"`, `finding: "install takes 42 s"`.
- **steps-to-green**: `command: "npm ci && npm test -- audit-setup.test.mjs"`, `output: "51 s, exit 0"`,
  `finding: "2 commands, 51 s, from a fresh scratch to the first passing test file"`.
- **service**: `command: "cat docker-compose.yml"`, `output: "0 s, exit 0, services: postgres, redis"`,
  `finding: "expects Postgres and Redis (docker-compose.yml)"` — detected, never started.
- **preview**: `command: "npm run dev"`, `output: "8 s, exit null, Local: http://localhost:3000"`,
  `finding: "dev server answers on http://localhost:3000"`, stopped by its PID once the URL was seen.
- **seed**: `command: "node scripts/seed.mjs --help"`, `output: "0 s, exit 0, Usage: seed.mjs [--reset]"`,
  `finding: "seed path is scripts/seed.mjs:1, never run"`.

Candidates for a finding: no install script found; steps-to-green takes many commands or minutes; an env var with no
`.env.example` entry; a service the code expects that nothing documents; the preview times out or never answers; no
seed path found.
