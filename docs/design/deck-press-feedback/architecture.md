# deck-press-feedback: the deck says what a press needs and what a card belongs to

Ticket `itm_6b7801fce544`, with `itm_faee47e34990` (notices on close, Add, weekly alerts, tab highlight) and
`itm_fa23429a3888` (generalise the web-only paths) merged into it on the user's "Merge these" (`itm_254de392de9a`).
Base `feat/user-thread-listener` (92a730f). One run, 12 slices.

## 1. Problem

On 2026-10-04 the user pressed Sign off on a Gate 2 (`itm_6522d0c1b2af`). The deck refused it, because two questions
on its ticket were open, and the browser showed a page holding only the refusal text: "we obviously need better
feedback than to just send the user to a blank page". On the overview they cannot tell which ticket a card belongs to
or which questions they have to answer. The merged jobs: a thread an agent closes while the user is away closes
silently, and the notifications tab gives no sign that it holds anything. The Tickets tab's button says "Make tickets".
The weekly usage alert has no switch. Walkthroughs, `pilot integrate`, the reviewers and QA's checklists assume web
development.

## 2. Spec

Each line has the evidence that shows it done. *assumed* marks a line the user has not confirmed.

| # | Behaviour | Evidence |
|---|---|---|
| 1 | A press the deck refuses on a thread (an option, Sign off, a typed reply, Close, Reopen, Dismiss) lands the browser on that thread's page, with the reason above the reply box and no page holding only the refusal. | Route test: POST `/reply` with `Sec-Fetch-Mode: navigate` on a gate2 with an open question → 303 to `/thread/<id>?refused=…#reply`. The thread page draws the reason in `role="alert"`. On a scratch deck, Sign off lands there. |
| 2 | A refused press made from a card on the overview also lands on the thread, not back on the overview. | The same test with `back=/` still redirects to `/thread/<id>`. |
| 3 | Where a refused press lands is only ever the pressed item's own thread. A crafted `?refused=` cannot draw text from another site. | An unknown id → 400, as today. The Location is built from the stored item's id and never from a form field. A GET with `Sec-Fetch-Site: cross-site` draws no reason. The reason is escaped and capped. |
| 4 | A gate2 whose ticket has open questions lists them, each a link with its title, on its thread page and its card. With none open there is no list. | Render test with two open questions and with none. |
| 5 | Every card names its ticket by title, as a link. A card with no ticket names none. A thread's Ticket row shows the title, not the bare id. | Overview render test: two tickets and one unticketed thread. |
| 6 | No refusal rule or reason changes. Anything that is not a browser navigation (an agent, curl, the page's own fetch) still gets today's 400 text. | `red-grilling`, `gate-resolve` and `skeleton.test.mjs`'s 400 pins pass unchanged. |
| 7 | An agent's `deck_resolve` on a thread whose kind is not silent leaves a notice for the user. `SILENT_KINDS` sits beside the kinds (A3, confirmed by the user: handoff, crew-handoff, report). | Store test: resolving a question, a user thread and a handoff leaves two notices. |
| 8 | Only the user clears a notice: by opening its thread or pressing its ×. A resolve, a new session or a daemon restart never clears one. | Restart test: both notices survive. Opening one thread clears its notice; the × clears the other. |
| 9 | The Notifications tab lists notices newest first, above today's open-thread rows. Each shows kind, title and the resolution's first line, and links to its thread. The tab's count is in the HTML at first paint. | Two pending → the served HTML's summary carries count 2. Clearing one → 1. |
| 10 | A thread the user closed themselves (Close, Dismiss), or an agent's close after the user's Sign off, leaves no notice. | Store tests for each. |
| 11 | Closing reports stay their own tab and mechanism (ADR 0076). | `record-report` and `standing` tests unchanged. |
| 12 | The Notifications tab is highlighted while it holds something the user has not seen, on any tab and without a reload. Opening the tab clears it; the next one brings it back. The highlight is not colour alone. | Scratch deck: a notice raised on another tab changes the tab's look and count. Greyscale screenshot. |
| 13 | The Tickets tab's button reads **Add**, and so does the thread it opens. `pilot.md`, the `ticket-making` skill and the tests follow. | `git grep "Make tickets"` finds nothing outside `docs/design`. |
| 14 | In an Add thread the pilot also adds spec lines to a queued ticket (as a comment on it) or removes a ticket on the user's word (closing it with their words). | Prose pins on `pilot.md` and `ticket-making`. |
| 15 | The right strip has a **Weekly alerts** toggle. Its state is per user and stored by the deck, and the usage hook reads it. | Off: a 96% weekly reading gives no alert. On: it does. |
| 16 | The weekly track alerts at 95% only. The session track keeps 90% and 95%. | Hook test: weekly 92 → nothing, weekly 95 → alert, session 90 → alert. |
| 17 | A walkthrough's `url` is any locator (URL, file path, ssh host, notebook), `login` is how to reach the thing, and `screens` is one step per action. Nothing in `deck/` or `agents/` makes a walkthrough a web page. | Schema text; grep. A walkthrough posted with a file path renders it as text. |
| 18 | A walkthrough or report can carry a working directory, shown at the top as "working directory:" only when given. QA and the wizard set it whenever a step is a command. | A post with `dir` renders the row; one without has no empty row. Prose pins. |
| 19 | A run reaches Gate 2 without a walkthrough when there is nothing for the user to step through. `pilot.md` and `pilot-qa.md` say when QA posts one. | A gate2 without `walkthrough` is accepted (already true, `items.mjs:367`). Prose pins. |
| 20 | `pilot integrate` in a repository without `package.json` and without `--test` refuses before merging, naming `--test` (*assumed* A5). | Integrate test with a non-npm fixture: refused, nothing merged. |
| 21 | Go, Rust and C++ reviewers are vendored from ECC 2.2.0, are on the pilot's Agent list, and are named by the implementer by language (*assumed* A6). | `check-provenance` clean. The `pilot-agents` spawnable test passes. |
| 22 | QA loads `browser-qa` and `design-review` on demand, when the feature has a GUI or web surface. `verification-loop` names the project's own commands, with Cargo, Make, Terraform and CMake rows. `docs/INSTALL.md` calls the chrome-devtools and Supabase MCP servers optional. | `qa-preview.test.mjs` pins the on-demand load. Grep. |

## 3. Findings

| What | Evidence |
|---|---|
| `/reply` stores through `addReply`. A `DeckRefusal` thrown there reaches the top-level catch and is answered `400 text/plain`. That is the bare page. | `deck/server.mjs:1159-1193`, `:1600-1604`; `deck/store.mjs:773`, Sign off refusal `:923-928` |
| An option press goes over `fetch` with `redirect: 'manual'`. On a non-ok answer it re-posts the form for real (`resend`), so the browser navigates to the 400. A typed reply posts the form directly. | `deck/ui/js/reply.mjs:97-104`, `:247-276` |
| Prior art for carrying a reason through a 303: `?refused=` on `/add-deck` and `?sessionRefused=`, drawn as `<p class="refused" role="alert">`. | `server.mjs:1272`, `:507-511`; `deck/ui/render.mjs:1148`, `:1284` |
| `backPath` vets the only browser-supplied Location today. | `server.mjs:241-246` |
| `skeleton.test.mjs` pins a 400 plus the reason text on `/reply` for credential, oversize and unknown-id refusals. | `deck/test/skeleton.test.mjs:272-375` |
| `openQuestionsOf(items, ticketId)` already exists. Ticket rows use it. | `deck/items.mjs:733`; `render.mjs:1408` |
| A card has no ticket line. The gate's Ticket row is `threadLink(id)`, which shows the id. | `render.mjs:780-797`, `:222`, `:238` |
| Notifications today: open queued threads, seen state in browser `localStorage`, badge computed by script, × posts nothing. The server tracks no page views. | `deck/ui/js/notifications.mjs:52`, `:239-252`, `:317-338`; `render.mjs:1547-1606` |
| An agent resolve stamps `resolvedBy`. `closeItem` and `dismissItem` stamp none. Sign off is a user reply followed by the agent's resolve. | `store.mjs:884-920`, `:1012-1049` |
| The closing-reports badge is server-rendered (`renderTabSummary`, `data-count`). | `render.mjs:1468`, `:1504-1510` |
| `TICKET_MAKING_TITLE` drives the button and the thread title. There are 28 hits in 7 files. | `render.mjs:1487-1498`; tests listed in S6 |
| Weekly alert: `band()` hard-codes 90/95 for both tracks and reads no switch. Hooks are CommonJS. The statusline hook already duplicates `storeDir()` to read `deck.json`. | `hooks/context-usage-alert.js:38-48`; `hooks/context-usage-statusline.js:43-58` |
| `deck/usage-switch.mjs` is a per-user switch file under `storeDir()`, written by tmp file and rename. The base feature edits its comment only. | `deck/usage-switch.mjs:14-38` |
| A walkthrough's `url` has no validation. "http/https" is description text only, and `renderUrl` falls back to escaped text. `dir` exists, for tickets only. | `deck/items.mjs:265`, `:287`; `deck/tools.mjs:165-178`; `deck/ui/markdown.mjs:72-76` |
| `integrate` defaults to `npm test`, and `npm ci` runs only when the lockfile moved or `node_modules` is missing. | `scripts/integrate.mjs:45`, `:73-77`, `:188-196` |
| ECC 2.2.0 ships `go-reviewer`, `rust-reviewer` and `cpp-reviewer` (plus their build resolvers) and no IaC reviewer, locally. | `~/.claude/plugins/cache/ecc/ecc/2.2.0/agents/` |
| QA loads `browser-qa` and `design-review` only for a GUI (S12), and `qa-preview.test.mjs` pins it. Budget pins: pilot ≤ 10270.75 tokens, QA ≤ 5752, and the `deck_post` schema counts toward both. | `agents/pilot-qa.md:6`; `scripts/test/qa-preview.test.mjs:62-118`; `scripts/test/measure-prompt.test.mjs:108-124` |
| Shared with the base feature: `agents/pilot.md` and `scripts/test/measure-prompt.test.mjs` (its S1). No deck file is shared: `server.mjs`, `render.mjs`, `store.mjs`, `items.mjs` and `tools.mjs` are not in its slices. | `docs/design/user-thread-listener/architecture.md` §8 |

## 4. Ubiquitous language

- **Press**: a user's form post on a thread: an option, Sign off, a typed reply, Close, Reopen, Dismiss.
- **Refusal**: a `DeckRefusal` thrown by the store. Its message is the **reason**.
- **Landing**: where the browser goes after a refused press: the thread's page with the reason drawn on it.
- **Notice**: a mark on a closed thread saying the user has not yet seen that an agent closed it. It is stored on the item.
- **Silent kind**: a kind whose agent close leaves no notice (`SILENT_KINDS`).
- **Walkthrough**: any step-by-step ticket only the user can do. It is not necessarily a browser procedure.

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
|---|---|---|---|
| L1 | A refused press answers 303 to `/thread/<encoded id>?refused=<encoded reason>#reply` when the request is a navigation (`Sec-Fetch-Mode: navigate`). Otherwise it answers today's 400. One helper, `landRefusedPress`, does this for `/reply`, `/close`, `/reopen` and `/dismiss-item`. | The deck already carries reasons this way (`refused`, `sessionRefused`). `reply.mjs` needs no change: its `resend` is the navigation. Agents, curl and every existing 400 pin are untouched (spec 6). An old browser without the header gets today's page, never a silent drop. | Re-rendering the thread page as the 400 body: the URL reads `/reply` and a reload re-posts. A flash in daemon memory: shared state with its own clearing rule. A header that `reply.mjs` sets: a client change for no gain. |
| L2 | The landing ignores `back` and builds the Location from the stored item's id. An unknown id keeps the 400. | Spec 2 and 3. With no browser value in the Location, there is no redirect to vet. | Honouring `back`: the reason would land on an overview that has no reply box. |
| L3 | Considered risk: `?refused=` is caller-supplied on a GET, so a crafted link could draw text as a refusal on a real thread. Bounds: the line is drawn only when `Sec-Fetch-Site` is `same-origin` (the 303 from our own POST is; a link from elsewhere or a typed URL is not). It is escaped, capped at 300 characters, and always prefixed "The deck refused that press:", so it never reads as the deck's own instruction. The deck is loopback-only and single-user. | Closes the spoofing path for every browser that sends Fetch Metadata. What is left is a same-origin link the deck itself would have to draw. | A reason code looked up server-side: about 60 refusal messages carry dynamic ids (the open questions' ids), so a code table duplicates the store's wording and drifts. |
| L4 | A gate2's open questions are listed by `renderGateDetail` and the card through one `renderAsked(item, items)`, reading `openQuestionsOf`. | The rule already exists, so there is one source. Rendering only, with no store change. | A field stored on the gate: it goes stale when a question closes. |
| L5 | A card's ticket line is a link with the ticket's title, looked up in the `items` the page already holds. A missing or merged ticket draws nothing. | The overview already passes `items`; no new read. | Storing the title on each item: it would copy and drift. |
| L6 | A notice is the item field `notice: true`. `resolveItem` sets it in the same write when the author is an agent, the kind is not silent, and the last user choice was not Sign off. GET `/thread/<id>` and POST `/clear-notice` (own-page Origin) delete it. Old data carries no field, so it gets no notices and needs no migration. | Spec 8 needs a restart-proof, server-rendered state. Today's `localStorage` is neither. The thread GET is the user being there; the live refresh refetches it, so a thread closed while open clears at once. | A separate notices list in `deck.json`: a second record to keep in step. Clearing by a script POST: a page running no script would never clear. |
| L7 | Closing reports stay separate (spec 11), recorded in ADR 0076. | Reports are standing items hidden per browser, which is a different lifecycle. Folding them in would change behaviour the user has not asked to change. | Making them the first case of notices. |
| L8 | The tab's count is server-rendered in `<summary data-count>`, the way the reports tab does it. The script's `recount` adds the unseen open threads and toggles `data-highlight` from a `localStorage` stamp of when the tab was last opened. The highlight is a dot plus a count, not colour alone. | Reuses `renderTabSummary` and the swap path. A highlight is a per-browser view state, which is what `localStorage` is for. | A server-side "tab opened" record: one user, one browser; not worth a write. |
| L9 | Weekly alerts are a new `deck/alert-switch.mjs` with `<storeDir>/alerts.json` `{weekly: boolean}`, on when absent. `POST /alerts` (own page) sets it, and the toggle sits in the right strip. The hook reads the file through the statusline's path rule. | The `usage-switch.mjs` shape, already proven. Per user, as the spec says. No file is shared with the base feature's S5. | A field in `deck.json`: the hook would parse the whole store. The hook asking the deck over HTTP: that fails when the deck is down. |
| L10 | The working directory reuses `dir`, extended to walkthrough and report, and renders as "working directory:" in `<code>`. | One schema property instead of two, which matters against the budget pins. It is the same type (an absolute path). | A new `workdir` field. |
| L11 | No slice raises a prompt-budget pin. A slice that adds prompt text pays for it with a trim in the same diff and names the trim in its PR. | The pilot pin's headroom is about 23 tokens. | Raising the pin. |
| L12 | The deck UI slices run in series because they share `render.mjs`. `pilot integrate` (S10) runs beside everything. | Disjoint ownership is the only safe parallelism. | Splitting `render.mjs` ownership by function. |
| L13 | Grilling depth is *forks*: only decisions whose paths produce a materially different deck reach the user as items; Gate 1 is one item on the whole artefact, with the assumed decisions listed in it. Answered by the user, 2026-10-04 (itm_00d2b6ba96a5). | No schema migration, auth, money, public API or irreversible data here. | *Every*: a walk of each locked decision before the gate. |
| L14 | QA runs against a scratch deck on its own port and store, seeded with two tickets, a gate2 with open questions and one unticketed thread, opened in Chrome; never the live deck on 4321. Answered by the user, 2026-10-05 (itm_15d2564e3ff8). | The live deck is running this run; a broken reply route there would break the user's own presses. | The live deck on 4321. |

## 6. Assumed decisions awaiting the user

| # | Default taken | Tradeoff |
|---|---|---|
| A1 | A refused typed reply does not carry its words back into the box. | The words would ride in the URL and the history. In practice the only refusal a typed reply meets is the credential check, so they would carry a credential. Cost: retyping. |
| A2 | Close, Reopen and Dismiss land the same way as `/reply` (spec 1). | The ticket named three presses. These three show the same bare page. About 20 more lines. |
| A3 | `SILENT_KINDS` = handoff, crew-handoff, report. A chat never closes. **Confirmed by the user, 2026-10-05 (itm_5665263689a8).** | A report already has its own tab, so it would notify twice. crew-handoff is a handoff. |
| A4 | An agent's close after the user's Sign off leaves no notice (spec 10). | The user did the closing. Cost: they get no confirmation that the gate passed. |
| A5 | `integrate` refuses without `--test` outside npm, rather than detecting Cargo, go.mod, pyproject or a Makefile. | One clear rule and no guessing. Cost: every non-npm run passes `--test`. |
| A6 | Vendor the Go, Rust and C++ reviewers only. No build resolvers, and no IaC reviewer, since upstream has none. | About 60 tokens on the pilot's Agent list, paid by a trim. The resolvers would double that. `silent-failure-hunter` stays the neutral fallback. |
| A7 | The 22-line spec ships as one run of 12 slices. | Under the 20-slice bound. Splitting would give three PRs for one surface, against the user's bias for larger tickets. |

## 7. Out of scope

Push, email or OS notifications. A Remove button on the Tickets tab. Detecting test runners. An IaC reviewer. Any
change to a refusal rule or its wording. `deck/usage-switch.mjs` and the session (5h) alert track.

## 8. Slices

| Slice | Title | Spec | Files owned | After | File |
|---|---|---|---|---|---|
| S1 | A refused press lands on its thread with the reason (walking skeleton) | 1, 2, 3, 6 | `deck/server.mjs` (presses, thread GET), `deck/ui/render.mjs` (`renderThreadPage`, `renderRefusal`), `deck/test/press-refused.test.mjs` (new), `docs/adr/0075-…` (new) | – | [S1](slices/S1.md) |
| S2 | A gate2 lists the questions it waits on | 4 | `deck/ui/render.mjs` (`renderAsked`, gate detail, card), `deck/test/gate-render.test.mjs` | S1 | [S2](slices/S2.md) |
| S3 | Every card names its ticket | 5 | `deck/ui/render.mjs` (`renderCard`, `GATE_ROWS.ticket`), `deck/test/card.test.mjs` | S2 | [S3](slices/S3.md) |
| S4 | An agent-closed thread leaves a notice the user clears | 7, 8, 10, 11 | `deck/items.mjs`, `deck/store.mjs`, `deck/server.mjs`, `deck/ui/render.mjs` (notice rows), `deck/ui/js/notifications.mjs` (×), `deck/test/notices.test.mjs` (new), `docs/adr/0076-…` (new) | S3 | [S4](slices/S4.md) |
| S5 | The tab counts at first paint and is highlighted while unseen | 9, 12 | `deck/ui/render.mjs` (summary), `deck/ui/js/notifications.mjs`, `deck/ui/deck.css`, `deck/test/notifications.test.mjs` | S4 | [S5](slices/S5.md) |
| S6 | The Tickets button and thread read Add | 13, 14 | `deck/ui/render.mjs` (`TICKET_MAKING_TITLE`), `deck/ui/deck.css` (comment), `agents/pilot.md`, `skills/ticket-making/SKILL.md`, `deck/test/make-tickets.test.mjs`, `deck/test/standing.test.mjs`, `scripts/test/ticket-making.test.mjs` | S5, base S1 | [S6](slices/S6.md) |
| S7 | Weekly alerts toggle, and weekly alerts at 95% only | 15, 16 | `deck/alert-switch.mjs` (new), `deck/server.mjs` (`/alerts`), `deck/ui/render.mjs` (right strip), `hooks/context-usage-alert.js`, `hooks/test/context-usage.test.js`, `deck/test/alert-switch.test.mjs` (new), `docs/adr/0077-…` (new) | S6 | [S7](slices/S7.md) |
| S8 | Walkthrough fields are general and carry a working directory | 17, 18 (deck) | `deck/items.mjs`, `deck/tools.mjs`, `deck/ui/render.mjs` (`renderWalkthroughDetail`), `deck/test/walkthrough-fields.test.mjs` (new) | S7 | [S8](slices/S8.md) |
| S9 | Walkthroughs are optional and say where commands run | 18 (prose), 19 | `agents/pilot.md`, `agents/pilot-qa.md`, `skills/wizard/SKILL.md`, `scripts/test/pilot-rules.test.mjs` | S8 | [S9](slices/S9.md) |
| S10 | `pilot integrate` asks for `--test` outside npm | 20 | `scripts/integrate.mjs`, `scripts/test/integrate.test.mjs` | – | [S10](slices/S10.md) |
| S11 | Go, Rust and C++ reviewers are on the crew | 21 | `agents/go-reviewer.md`, `agents/rust-reviewer.md`, `agents/cpp-reviewer.md` (new), `vendor/toolbox.md`, `agents/pilot.md` (`:5`), `agents/pilot-implementer.md` (`:72-83`) | S9 | [S11](slices/S11.md) |
| S12 | QA loads the browser checklists only for a GUI | 22 | `agents/pilot-qa.md` (frontmatter, preview section), `scripts/test/qa-preview.test.mjs`, `skills/verification-loop/SKILL.md`, `docs/INSTALL.md` | S9 | [S12](slices/S12.md) |

Every spec line is delivered by one slice. S10 shares no file and runs beside any slice. S11 and S12 share no file
and run in parallel after S9. S6, S9 and S11 edit `agents/pilot.md`, which the base feature's S1 owns, so S6 comes
after that slice is integrated.

## 9. Acceptance evidence

The user watches these on a scratch deck (`PILOT_DECK_DIR=<tmp>`), in this order:

1. They press Sign off on a gate2 whose ticket has two open questions. The gate already lists both as links (4), the
   press lands on the gate's thread with the reason over the reply box (1), and the same press from the overview
   card lands there too (2).
2. Each card on the overview names its ticket, and the unticketed one names none (5).
3. With the browser closed, an agent resolves a question and a handoff. On reopening, the Notifications tab is
   highlighted with a count of 1 (7, 9, 12). Opening the thread clears it (8). A restart keeps an uncleared one (8).
4. The Tickets button reads Add (13). Weekly alerts off: a 96% weekly reading in the hook test stays silent (15, 16).
5. A walkthrough posted with a file path and a `dir` shows "working directory:" (17, 18).
6. `pilot integrate --no-push` in a Cargo fixture without `--test` refuses (20). The `npm test` gate is green,
   including `check-provenance` (21) and the QA pins (22).

## 10. Status

| Slice | State | Branch | PR | Worktree | Blocker | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 1, 2, 3, 6 |
| S2 | planned | | | | S1 | 4 |
| S3 | planned | | | | S2 | 5 |
| S4 | planned | | | | S3 | 7, 8, 10, 11 |
| S5 | planned | | | | S4 | 9, 12 |
| S6 | planned | | | | S5, base S1 | 13, 14 |
| S7 | planned | | | | S6 | 15, 16 |
| S8 | planned | | | | S7 | 17, 18 |
| S9 | planned | | | | S8 | 18, 19 |
| S10 | planned | | | | – | 20 |
| S11 | planned | | | | S9 | 21 |
| S12 | planned | | | | S9 | 22 |
| deck-press-feedback | planned | feat/deck-press-feedback | | | S1–S12 | 1–22 |
