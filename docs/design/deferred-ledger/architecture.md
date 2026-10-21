# Deferred ledger — architecture artefact

Feature: **deferred ledger** · slug `deferred-ledger` · integration branch `feat/deferred-ledger` ·
base `main` at `65e3c8d` (run-record, PR #74, merged) · architect branch `design/deferred-ledger`.

## 1. Problem

Three runs have closed with a "next run" ledger, and the same items keep being pushed forward. This run clears it: PR
#73's hurried, unrevised note on the `pilot` command (INSTALL never puts it on PATH, and there is no bash function); a
**global chat**, "a general thread where I can send the main pilot a message and we can just talk … the top tab in the
left-side tab group" (`docs/design/deck-usability/architecture.md` §7); and `deck/ui/deck.js`, 1,481 lines in one IIFE
that no coverage tool sees. Four other ledger items were already settled (§3). The user added five at the spec review
(lines 11–15): a Socratic "Teach me", a favicon, a confirm on Close, a rearranged header with arrows through the open
threads, and a release, because run-record's sticky reply box (ed0fe0d) is on `main` but in none of the six cached
versions, so the user has never seen it.

## 2. Spec

Each line is one behaviour a user can watch, with the evidence that shows it. The user
accepted lines 1–10 as drafted and added 11–15, and the spec is closed at 15 (grilling depth: forks). Lines
carrying *assumed* are this architect's defaults, not yet put to the user.

| # | Behaviour | Evidence |
| --- | --- | --- |
| 1 | **Superseded by main's launcher (#99–#101).** `docs/INSTALL.md` has a step that offers the `pilot` command. On a yes, Claude adds one function to each shell profile that exists on the machine (PowerShell `$PROFILE`, `~/.bashrc`, `~/.zshrc`), between marker lines, and a second run of the step changes nothing. | The step and its row in "What this changes" and "Running this again" exist, and `scripts/test/install.test.mjs` pins them. |
| 2 | **Superseded by main's launcher (#99–#101).** The function runs the newest installed plugin version's `bin/pilot.mjs` by numeric version order, passing its arguments through. With no plugin installed, it prints one line naming the directory it looked in and fails. | A test runs the two functions exactly as INSTALL.md prints them, in `powershell.exe` 5.1 and in Git Bash, against a fake cache holding `0.9.0` and `0.10.0`, and sees `0.10.0` answer; against an empty cache it sees the one line. `pilot help` from a fresh shell on this machine prints the usage. |
| 3 | **Superseded by main's launcher (#99–#101).** README's "NOT YET PROPERLY DOCUMENTED" subsection does not exist. Use names `pilot run` and `pilot deck` in one sentence and points at the INSTALL step. PR #73 is closed, not merged. | The README diff; #73 closed with a comment linking S1's PR. |
| 4 | On a deck's own tab (and its thread pages), a **Chat** bookmark sits in the left rail directly under Notifications, drawn open (**amended by the user at Gate 2, 2026-09-25**: it read "the top of the left rail"). It shows the repository's chat thread and a reply box. What the user sends appears in the panel with no reload. | Browser: type in Chat and press Send; the message renders in the panel, with `reloads: 1`. |
| 5 | A chat message reaches the pilot of that repository and no other: a parked `deck_wait` returns it, and a working pilot gets it at its next tool call. The pilot's `deck_reply` on the chat renders in the panel live. | A session parked on `deck_wait` returns the message; the pilot's reply appears in the open panel without a reload; a second deck's pilot receives nothing. |
| 6 | The chat is never waiting. It is absent from the queue, the tab's count, Notifications, Everything, the status line's count and the hand-off's open-thread ids, and it does not keep an ended run's tab alive. | Tests on each of the six; browser: the queue count does not move when a chat message is sent. |
| 7 | The chat cannot be ended: no Close, Dismiss or Reopen control is drawn for it, and `deck_resolve` or a dismiss POST on it is refused with a sentence saying to answer with `deck_reply`. | Tests red then green on the refusals; the chat's thread page shows no end control. |
| 8 | A chat message the pilot has not answered holds the pilot's turn end, like any user-last thread in its repository (the existing stop gate; the user, L21). | A test through `hooks/stop-gate.js` with a user-last chat item. |
| 9 | The page's script is ES modules under `deck/ui/js/`, served by the daemon from a fixed list, and every page behaves exactly as before: panels, resize, folds, notifications, live updates, reply in place, navigation, the usage readout. | Every existing browser behaviour test passes against the modules; a request for any other path under the route is a 404. |
| 10 | `npm run coverage` reports line coverage for every module under `deck/ui/js/`. No test runs deck script text in `node:vm`, and the test count does not fall. | The coverage table lists each module; `grep -r "node:vm" deck/test` is empty; `npm test` count ≥ the count at base. |
| 11 | "Teach me" teaches one step at a time (the user, amended). The rewritten `pilot-teacher` opens with **one small diagnostic question**, usually yes/no, to gauge where the user is, and never the whole lesson. Each reply works from the last answer: one step, then one question. When the pieces are in place, it asks the user to explain the decision back in their own words, and re-explains only what they missed until the explain-back holds. Then it says they have it. If the user asks for the answer or stalls twice, the next reply is a short worked step, not another question. Pressing an option at any point is the decision. | On a scratch question: Teach me → one yes/no question and nothing else. Answer → one step and one question. The explain-back missing one part → that part only, and ask again. A right one → "you have it". "just tell me" → a worked step. `pilot-agents.test.mjs` pins each rule and the cited sources. |
| 12 | Every deck page (home, thread, `/items`) shows the deck's icon in the browser tab. | The tab icon, seen in a real browser; `GET /ui/favicon.svg` is 200 `image/svg+xml`; each page's `<head>` has the `<link rel="icon">`. |
| 13 | The run ends with the plugin at 0.6.0 in every place it states its version, and this machine running it: the cache has `0.6.0`, and the deck at 4321 serves the sticky reply rule and the chat. | `toolbox.test.mjs`'s version test is green at 0.6.0; `ls ~/.claude/plugins/cache/pilot/pilot` shows `0.6.0`; the page at 4321 contains `body[data-item] [data-live="reply"]` and a Chat bookmark. |
| 15 | The top of every page is rearranged. "Pilot deck" moves into the blank top-left, centred over the rail and panel column (*assumed A8*: on every page, not only a thread). On a thread, the back arrow takes the title's old place at the start of the header. The kind line loses its "on", and in the header's centre reads `‹ D3 ›`: the deck's code alone (never its name) as the link to its tab, between two arrows that walk **every deck's** open threads in the overview's queue order, so the code names the current thread's deck and changes as the walk crosses from one run to another (the user, L20). | Browser: the title's centre x equals the column's centre x (measured); the header centre reads `‹ D3 ›` with no "on"; › opens the next open thread in the overview's order and ‹ the one before, and the code changes when the next one is another deck's; at the queue's end the arrow is drawn inert; a new thread posted while the page is open reaches the arrows without a reload. Render tests on each. |
| 14 | Close on a question sits in the same row as Reply, not in a form beneath it, and it asks before it sends. The first press shows the confirm in that row, with Close in the same place and No beside it, and the thread is unchanged. The same press again closes it. No puts it back, and focus rests on No. With no script, Close posts in one press, as it does today. | Browser: press Close, and the thread is still open with No focused; press No, and Close is back; press Close twice, and the thread closes and a parked `deck_wait` returns `Closed.`. A module test on the handler and a render test on the two halves. |

## 3. Findings

| What | Where | Bearing |
| --- | --- | --- |
| The per-run token (draft line 4) was **dropped by the user** on 2026-09-23 | run-record L14, `itm_8b3b3bee2d67` | Out of scope (§7). The browser threats are already closed by `isOwnHost`, the Origin check and the content-type check (`deck/server.mjs`). |
| "The same directory" and "a closed thread" (draft line 5): **already one spelling per side** | `deck/items.mjs:322-342` (`isOpen`, `sameRepo`, `repoKey`); `hooks/lib/deck.js:198-211` (`repoKey`, `samePath`, `isClosed`); `hooks/test/join.test.js` | Done by run-record S7 (#83). `deck/status.mjs:108` `joinKey` goes through `repoKey`, so there is no fifth spelling. No slice. |
| Close from the deck (draft line 3): **done for questions** | run-record L11, L12, L23; `closeItem` `deck/store.mjs:636` | A signoff or walkthrough never gets Close (L11). The chat gets no end control at all (spec 7). |
| Shared test harness (draft line 7): **already one definition** | `deck/testUtils.mjs` exports `tempDeck`, `deckOnAPort`, `postsTheChoice`, `aSandbox` | `run.test.mjs:132,363` are `/api/tool` stubs; `skeleton.test.mjs:263` and `daemon.test.mjs:859` own their server on purpose (bind address, held port). The real copy left is the `UI`/`uiFile`/`vm` loader in ten test files, which S4–S6 replace. |
| The reply path does not care about kind | `addReply` seq `deck/store.mjs:494`; `repliesSince` `:670`; `deck_wait` repo filter `deck/server.mjs:593`; `hooks/inbox-alert.js:148` | Once a chat item exists, a message reaches a parked or working pilot with no tool change. |
| Places where "open" is read as "waiting" | `queueOf` `deck/status.mjs:509` (feeds queue, `tabsOf` `deck/tabs.mjs:93`, strip counts, Notifications `deck/ui/render.mjs:1040`); `registerRun`'s kept-record rule `deck/store.mjs:806`; `isWaiting` `hooks/context-usage-statusline.js:60`; `openThreads` `hooks/session-handoff.js:177` | Each needs to skip chat. Everything (`render.mjs:1384`) lists only closed items, so it is already safe. |
| End controls by kind | `resolveItem` `deck/store.mjs:527` (no kind check); `dismissItem` `:616` (unknown kinds only); `renderReplySlot` `deck/ui/render.mjs:346` | `chat` must be a known kind, or Dismiss is drawn and accepted. |
| The rail | `deck/ui/strips.html:42-59` (Notifications, Tree, Status, Agents); `renderStrips` `deck/ui/render.mjs:1082` | A fifth bookmark, first in order, with `data-live="chat"`. |
| How `deck.js` reaches the browser | `readUiFile`/`renderTemplate` `deck/ui/render.mjs:52-81`; `PAGE_FILES` `:69`; `<script><!--JS--></script>` in `home.html:35`, `index.html:17`, `thread.html:41` | Inlined into every page (deck-usability D2). No static route and no CSP header exist. |
| `deck.js` regions | bookmarks 49-81; notifications 82-388; panel size 389-484; layout pass 485-678; relative time 679-790; live updates 791-998; dismiss confirm 999-1031; reply in place 1032-1269; navigation 1270-1317; Esc 1318-1355; usage 1356-1480 | The cut lines for S4–S6. |
| Tests and coverage | `node:vm` in ten `deck/test/*.test.mjs`; `aSandbox` `deck/testUtils.mjs:105`; `package.json` has only `"test": "node --test"`, Node 26.1 here; `daemon.test.mjs:498` asserts no `/closed/` on the inlined page | Imported modules are what `--experimental-test-coverage` sees. Once the script is not inlined, `:498` covers markup and CSS only. |
| The teacher | `agents/pilot-teacher.md` ("One reply", "Never ask a question back"); `skills/teaching-a-decision/SKILL.md` (one reply, at most a screen); `skills/pilot/SKILL.md:293-302` (spawn on `Teach me`, a follow-up resumes the same teacher); ADR 0020 | All three say one lesson with no question back. `scripts/test/pilot-agents.test.mjs:699-741` pins `never ask … question back` and the resume rule. `vendor/methodology.md:80` describes the skill as one reply. The teacher has no `deck_wait`/`deck_read`, so every attempt reaches it through the pilot, which is what "resume the same teacher" already does. |
| Tutoring method (researched 2026-09-23, one Sonnet pass) | Opened directly: Hechinger Report 2026 on Khanmigo (students abandoned a tutor that only asked questions). From search snippets and secondary pages, not opened: Ausubel 1968 (ask what the learner knows first); VanLehn 2011 (step-level tutoring d≈0.76, near human 0.79; finer adds little); Wood, Bruner & Ross 1976 (scaffold, fade on evidence); Chi et al. 1994 (self-explanation); AHRQ teach-back (restate, re-explain only the miss, re-check); Roediger & Karpicke 2006 (retrieval); Bloom 1968 (mastery as a criterion); Graesser et al. 2014 (AutoTutor closes one gap per turn, and human tutors mix in short explanations) | S7 borrows six rules from these. Only the Hechinger piece is verified, so S7 opens every source it cites or labels it secondary. No peer-reviewed outcome study of LLM Socratic tutors was found. |
| Favicon | none in `deck/ui`, `render.mjs` or `server.mjs` | New. |
| Close and the confirm idiom | `renderCloseForm` `deck/ui/render.mjs:328` (one click); Dismiss's two halves and delegated handler `deck/ui/deck.js:999-1031`; the sign-off's same-press confirm `:1092` | Close can take Dismiss's markup-driven halves. The handler widens to one more form selector, in the region S6 moves to `dismiss.mjs`. |
| The header | `thread.html:10-23` (`.back` fixed at `deck.css:85`, `h1` at `:238`, `.kind`); `home.html:11`, `index.html:11` (the same `h1`); `KIND` built at `render.mjs:1460-1462` with `tabLabel` (`:877`, `D‹n› ‹name›`); the live swap is generic over `[data-live]` names (`deck.js:934`) | A `data-live="nav"` region updates with no script change. The header itself is not a live region today. |
| Where a release comes from | `~/.claude/plugins/known_marketplaces.json`: `pilot` is `github: HazzardRust/pilot` | `claude plugin update` installs `main`. The release therefore takes effect only **after the user merges the feature PR** at Gate 2. |
| Version | `scripts/test/toolbox.test.mjs:231` pins five statements: `package.json`, `.claude-plugin/plugin.json`, both `package-lock.json` versions, `deck/client.mjs:356` | The 0.5.0 bump (54aca99) touched exactly these. |
| PR #73 | branch `docs/pilot-run-command`, c4d6d9a, README only | Conflicts with run-record S4's README; its text is absorbed by S1, not rebased. |

## 4. Ubiquitous language

- **Chat**: the one item of kind `chat` per repository (`repoKey`). It is created by the daemon, never ended, and never waiting. It is not a question: nothing in it gates anything.
- **Waiting** (**queued**): open *and* not a chat. `isQueued(item)` on the daemon side and `isWaiting` on the hooks side are the only spellings. **Open** still means only "not resolved".
- **Module** (browser): a file under `deck/ui/js/` that exports `install(env)`, where `env` holds the page globals it uses. Nothing runs at import.
- **Entry**: `deck/ui/js/deck.mjs`, the one module a page loads. It calls each module's `install(window)` in the order the IIFE ran its regions.
- **The `pilot` command**: **Superseded by main's launcher (#99–#101).** the shell function INSTALL.md writes. It is not an npm-linked binary.
- **Teaching** (on a thread): from a `Teach me` press until the teacher says the user has it, or the user presses an option. While a teaching is live, a typed reply on that thread is an **attempt**, and goes to the teacher, not to the decision.

## 5. Locked decisions

| L | Decision | Rationale | Rejected |
| --- | --- | --- | --- |
| L1 | #73 is closed, and its content is redone in S1 on a slice branch from `feat/deferred-ledger`. | It is 44 commits behind, and its only file was rewritten by run-record S4. | Rebasing a note marked unrevised. |
| L2 | **Superseded by main's launcher (#99–#101).** The command is a shell function in the user's profile, written by Claude during install only on a yes, between `# >>> pilot >>>` and `# <<< pilot <<<`. It resolves the version on every call. The same text is printed in INSTALL.md and extracted from it by the test. | A profile is the user's file (INSTALL's first rule). Resolving per call survives plugin updates. One source means the tested text is the documented text. | `npm link` (pins one version's path); a shim script on PATH (a second installed file to keep current); shipping the function as a file in the plugin (its path moves with the version it is trying to find). |
| L3 | Version order is numeric per `major.minor.patch`: PowerShell `[version]`, and in bash `sort -t. -k1,1n -k2,2n -k3,3n`. Only directories matching `^\d+\.\d+\.\d+$` count. | `0.10.0` must beat `0.9.0`. `sort -V` is missing from some BSD sorts. | String sort; newest mtime (a reinstall of an old version would win). |
| L4 | The chat is kind `chat`. `isKnownKind` answers true for it, so `dismissItem` refuses it and no Dismiss is drawn, but it is **not** in `KINDS`. `KINDS` is what `deck_post` advertises (`deck/tools.mjs:34,135`), and `postItem` refuses `kind: chat` with `the deck makes a repository's chat itself`. | The kind is how every other rule already branches. Keeping it out of `KINDS` keeps it off the tool's surface and makes "one per repository" hold against every writer. | An `isChat` flag on a question (every kind check would have to learn it too); adding it to `KINDS` (the pilot could post a second chat). |
| L5 | The daemon creates a repository's chat inside `registerRun`'s one write, when that `repoKey` has none. A repository gets its chat at its next registration. | The panel's form always has an item id, so it reuses `POST /reply` and the reply-in-place code unchanged: no route, no `deck.js` edit. This is lazy like the deck numbers (deck-workspace A5). | Creating it on the first message (needs a new route, and a form with no item); creating it on a GET (a write on a read). |
| L6 | `isQueued = isOpen && kind !== chat` in `deck/items.mjs` is used by `queueOf` and by `registerRun`'s kept-record rule. The hooks side's `isWaiting` and `openThreads` skip `kind === 'chat'` through one `isChat` in `hooks/lib/deck.js`. | One spelling per side of L35, the rule run-record L13 kept. A chat is always open, so reading "open" as "waiting" would keep every tab alive forever and count one waiting item per repository. | Changing `isOpen` itself (the chat *is* open: `deck_read {open:true}` must return it). |
| L7 | `resolveItem` and `dismissItem` refuse a chat with `a chat is never closed; answer it with deck_reply`. `renderReplySlot` draws no end control for it, and `reopenItem` is unreachable. | "Never resolved" is enforced in the store for every writer, not by convention. | Relying on the pilot never calling `deck_resolve`. |
| L8 | `deck_read` returns the chat with its whole history, like any item. | No new tool shape. | A window of the last N messages (a second rule about what a read returns). If a long chat costs too much context, a window can be added later without a design change. |
| L9 | The Chat bookmark is second in `strips.html`, under Notifications (the user's order at Gate 2; it was first), and drawn `open`. It renders only when a tab is selected (a deck's tab or a thread page on it). | The user's words: the top tab. Open is what keeps a pilot's answer on screen without a notification (L22). | Drawn shut (a pilot reply would be invisible, since chat is not in Notifications). |
| L10 | **Locked by the user, as A4** (spec 9–10, S4, and S8's favicon route); ADR 0030 records it and overturns deck-usability D2. The page's script is native ES modules. The daemon serves `GET /ui/<name>.mjs` from a fixed allowlist, derived from the files in `deck/ui/js/` at startup, as `text/javascript; charset=utf-8` with `cache-control: no-cache`, behind `isOwnHost` like every route. Each page carries `<script type="module" src="/ui/deck.mjs">` where the inline script was. | Node imports the same bytes the browser runs, so coverage measures the real code. No bundler. A module script is deferred, which runs where the end-of-body inline script ran. | Concatenating the modules back into the inline slot (keeps D2, but the browser runs text the tests never import: a home-made bundler); a bundler (a build step and a dev dependency for a 1,500-line script). |
| L11 | Each module exports `install(env)` and reads globals only from `env`. The entry passes `window`, and tests pass `aSandbox(...)`, which becomes the `env` factory. | Dependencies are accepted, not reached for (codebase-design). The sandbox a test builds today is already this object. | Modules reading `document` at import (untestable without a vm, the thing being removed). |
| L12 | The split moves code and changes no behaviour. Module scope is strict, so a sloppy-mode reliance found during the move is fixed in place and named in the slice's PR. | The split is the ledger item. A behaviour change would hide inside a 3,000-line move. | Tidying while moving. |
| L14 | The teacher is the existing `pilot-teacher`, rewritten; it is not a new agent and not the explorer. Six rules, each with its source: (1) the first reply is one diagnostic question, usually yes/no (Ausubel); (2) one step per reply, and never a sub-step drip (VanLehn); (3) ask rather than tell, and never answer its own question in the same reply (Roediger & Karpicke); (4) when the steps are in, an explain-back of the decision, and re-explain only the missed part (teach-back; Chi); (5) "you have it" is a criterion, not a turn count: the explain-back states what is decided, the main alternative and why the default (Bloom); (6) on "just tell me" or two stalls, a short worked step (Graesser; the Khanmigo abandonment). The loop rides on the resume the pilot already does. The teacher's report ends `teaching: live` or `teaching: done`. It never resolves, holds or reads. ADR 0032 amends 0020. | The user's words: a small question to gauge them, then work from there, still Socratic. Rule 6 is the one caution the evidence adds. The only new machinery is a report line. | A new tutor agent, or the explorer teaching (the teacher is already a separate agent, and the explorer stays the reader); pure questions with no fallback (the Khanmigo result); a cap on turns. |
| L15 | The pilot's rule: while a teaching is live, a typed reply on that thread resumes the teacher. An option press is the decision, whenever it comes. After `done`, a typed reply is the decision again. | This is the one ambiguity the loop adds. An option press is never an attempt. | Asking the user which they meant (a question about a question). |
| L16 | The favicon is `deck/ui/favicon.svg`, served by the same allowlisted `/ui/` route as the modules (L10) as `image/svg+xml`, with `<link rel="icon" href="/ui/favicon.svg">` in each template. | It is consistent with A4: the page's assets become files the daemon serves from one list, and the icon is an SVG file anyone can open and edit, not a URL-encoded string in three templates. Browsers cache it. | An inline `data:` URI (three copies of an encoded string, and it contradicts L10). |
| L17 | Close's row and confirm are built **after the split**, as S9. The reply form's last line becomes one flex row, `.send` (the `.choices` idiom: `display: flex; gap: 0.5rem`). It holds Reply, then a `.confirm` group: `.ask`, a `type="button"` Close; and the hidden `.sure`, a submit Close in the same place plus No. The group's buttons carry `form="close-<id>"`, which ties them to a separate, otherwise empty `<form id="close-<id>" class="close" action="/close">` after the reply form. `dismiss.mjs`'s handler widens from `form.dismiss` to `form.dismiss, .confirm`. | Two forms keep the rule `renderDismissForm` states, that the deck must never read a second action as whatever the reply box held. `form=` puts both forms' buttons in one row with no layout trick. The `required` textarea cannot block a Close, and reply in place never sees Close's submit, because it belongs to the other form. Before the split it is the same ~25 lines, but its test would run in the `vm` loader S4–S6 remove, inside the move L12 keeps pure. | One form with `formaction="/close"` (posts the typed text to `/close`, and reply in place intercepts the submit unless it learns `event.submitter`); two sibling forms in a flex wrapper (the Reply button sits inside its form, so the wrapper cannot align them without `display: contents`); before the split (a vm test to port). |
| L19 | The title is `position: fixed` in the top-left box, whose width is `calc(var(--rail) + var(--panel))`, with `text-align: center`, on all three templates. The back arrow loses `position: fixed` and becomes the header's first flex item, where the `h1` was, so it still travels with the sticky header. The header's centre is `<nav class="threads" data-live="nav">` holding ‹, the code and ›. | One rule per element, and no script. The nav is live through the existing generic swap, so a new or closed thread moves the arrows without a reload. | Fixed arrows (they would be out of the header's flow twice); the nav outside a live region (stale arrows until reload). |
| L20 | **The user chose every deck** (A9 overturned). The arrows walk `queueOf(items)`, the overview's queue in the overview's order, which is never a chat (L6). The code in the centre is the *current thread's* deck, `tabCode(tabFor(tabs, item.repo))` = `D‹n›`, so it changes as the walk crosses runs. `tabLabel` becomes `tabCode` plus the name, so `D‹n›` keeps one spelling. An unnumbered deck (deck-workspace A5) shows its name, and a thread with no tab shows the arrows with no code. At either end the arrow is an inert `<span aria-disabled="true">`, with no wrap. On a thread not in the queue (closed), ‹ is inert and › is the queue's first. | One walk through everything waiting, in the order the overview lists it. The code is fixed-width where names are not, which is the user's reason. No wrap, so reaching the end is visible. | This deck's threads only (the architect's default, overturned by the user); a wrap-around (the user cannot tell they have seen them all); hiding the arrow at an end (the code would shift sideways). |
| L21 | A chat message the pilot has not answered holds its turn end (the existing stop gate, `hooks/stop-gate.js:45-47`). Locked by the user, as A1. | Zero code, and the user is never left unanswered. | Exempting chat from the gate. |
| L22 | A pilot's chat reply does not light Notifications, and the Chat bookmark is drawn open (L9). Locked by the user, as A2. | Chat stays out of `deck.js`'s seen marks, so S2 does not wait on the split. | Chat in Notifications. |
| L18 | The release is the last slice on the feature branch: 0.5.0 → 0.6.0 in the five statements `toolbox.test.mjs` pins, following 54aca99. It is installed on this machine after the user merges the feature PR: `claude plugin marketplace update pilot`, `claude plugin update pilot@pilot`, then the 4321 daemon restarts so that the new code serves. | The marketplace is GitHub `main`, so there is nothing to update to before the merge. The merge is the user's (README "Your part"). | Bumping on `main` after the merge (a second PR for one line); updating from a local marketplace (changes the user's install source). |
| L13 | `npm run coverage` = `node --test --experimental-test-coverage --test-coverage-include='deck/**'`. No coverage threshold is enforced in this run. | It makes the modules visible, which is what the ledger asked. A threshold is a policy the user has not asked for. | c8 (a dev dependency the built-in covers). |

## 6. Assumed decisions awaiting the user

| A | Default taken | Tradeoff |
| --- | --- | --- |
| A3 | The overview (no tab selected) shows no chat. | One Chat section per repository, as the overview's Tree does, is busier and puts several reply boxes on one page. |
| A7 | Restarting the 4321 daemon for the release (L18) is posted to the deck as a question first, because it ends every session's parked `deck_wait` on this machine. | Doing it without asking could drop another run's wait mid-gate. Asking costs one click. |
| A8 | The title moves to the top-left on every page, not only on a thread. | Otherwise it jumps between pages as the user navigates. The alternative is the thread page only, as the user described it. |
| A5 | The split is cut in full this run, as three serial slices: about 3,000 diff lines, mostly moved, about +200 net. | The pilot put this number on the fork item. The fallback is S4 plus one of S5 or S6, leaving the rest in `deck.js`. |

## 7. Out of scope

- **The per-run token.** Dropped by the user on 2026-09-23 (run-record L14). Not asked again.
- Close on signoff or walkthrough threads (run-record L11); a confirm on anything but Close (Reopen, Send and options stay one press).
- A pilot-started chat; chat on the overview (A3), in Notifications (L22), or in `pilot run`'s pickup; a window on its history (L8).
- A behaviour change in the split (L12), a coverage threshold (L13), a bundler, a CSP header; `npm link`, a PATH shim, or a change to `bin/pilot.mjs`.
- A deck-side teaching state, a cap on attempts, or a teacher that reads or waits on the deck (L14); keyboard shortcuts for the arrows, or arrows off the thread page.
- Publishing anywhere but this repository's `main`. No tag and no release notes beyond the bump commit.

## 8. Slices

**S2 is the walking skeleton** of the deck work (a user message through rail, store and tools into a pilot, and back);
S1 is docs and runs from day one. Every edge below is a shared file: S2→S4 `render.mjs`, S4→S5→S6 the shrinking
`deck.js`, S3→S7 `skills/pilot/SKILL.md`, S4→S8 the route and templates, S6→S9 `dismiss.mjs`, {S8, S9}→S11 the
templates, `render.mjs` and `deck.css`. S3 shares no file with S2, and S8 none with S5, S6 or S9. S11 needs no module
from the split, only those files' owners to be done. S12 (`deck/run.mjs`) shares no file with any other slice; it was
added 2026-09-24 at the user's instruction, after the hand-off between two pilot sessions stalled (see its section).

```
S1 ─────────────────────────────────────────┐
S2 ──► S4 ──► S5 ──► S6 ──► S9 ──► S11 ────┤
  │     └──► S8 ───────────────────┘        ├──► S10 (release)
  └──► S3 ──► S7 ───────────────────────────┤
S12 ────────────────────────────────────────┘
       (S3 needs no file of S2; it may start beside it)
```

### S1 — The `pilot` command is installed by INSTALL.md

| Field | |
| --- | --- |
| Source · after | Spec 1–3; L1–L3 · **after** none |
| Files owned | `docs/INSTALL.md`, `README.md`, `scripts/test/install.test.mjs`, `scripts/test/pilot-command.test.mjs` (new) |
| Expected behaviour | **Superseded by main's launcher (#99–#101).** INSTALL.md gains a step, before "Verify", that offers the command. Its text and both functions are printed there. "The two questions" becomes three, and "What this changes" and "Running this again" gain a row each. The step writes each function only into profiles that exist, between the markers, replacing a marked block that is already there and never touching a byte outside it. README's Use section keeps `claude --agent pilot:pilot` and adds the one sentence on `pilot run` and `pilot deck`, pointing at the step. |
| Verification | `npm test`; by hand, in a fresh PowerShell 5.1 window and a fresh Git Bash, with each function pasted in: `pilot help`. |
| Evidence | `pilot-command.test.mjs` extracts the two fenced blocks from INSTALL.md by their heading. It runs them in `powershell.exe -NoProfile` and in `bash` with `USERPROFILE`/`HOME` pointed at a temp cache holding `0.9.0`, `0.10.0` and a `notes` directory, each `bin/pilot.mjs` a stub that prints its version and its argv. It sees `0.10.0 help`; an empty cache gives exit ≠ 0 and the one line. It is red before (no blocks). Both `pilot help` outputs are pasted into the PR. |
| Prohibited | No skipping a shell because it is "not on PATH" on this machine: both exist here. A skip is allowed only on a platform without the shell, and it must say so. No second copy of the function text anywhere but INSTALL.md. No write to a profile that does not exist. No `npm link`. No edit to `bin/pilot.mjs`. |
| Completion | Both functions, as printed, pass the test in both shells, README has no unrevised subsection, and `npm test` is green. |

### S2 — The user talks to the pilot in Chat (walking skeleton)

| Field | |
| --- | --- |
| Source · after | Spec 4–7; L4–L9; ADR 0031 (new: the chat is an item, created at registration, never waiting) · **after** none |
| Files owned | `deck/items.mjs` (`KIND_CHAT`, `isQueued`, `isKnownKind`), `deck/store.mjs` (`registerRun` creates it and keeps records by `isQueued`; `postItem`, `resolveItem` and `dismissItem` refuse), `deck/status.mjs` (`queueOf` by `isQueued`), `deck/ui/render.mjs` (`renderChat`, first in `renderStrips`; no end control for chat), `deck/ui/strips.html`, `deck/ui/deck.css`, `deck/test/chat.test.mjs` (new), `docs/adr/0031-*.md` |
| Expected behaviour | A run registers, and its repository has exactly one chat, a second registration adds none. The deck's tab shows Chat open in the rail under Notifications, with the thread's messages (bylines as elsewhere) and a reply box. Sending posts through `/reply`. The message renders in place, a parked `deck_wait` with that `repo` returns it, and the pilot's `deck_reply` appears in the panel live. The queue, tab count and Notifications do not change. |
| Verification | `npm test`; a scratch deck on 4322+ with two registered repositories; a real browser over CDP. |
| Evidence | Tests red then green in `chat.test.mjs`: one chat per `repoKey` across two registrations and a case-folded path; `queueOf`, the tab's `open` and `renderNotifications` omit it; an ended run whose only open item is its chat is pruned; `deck_resolve` and `POST /dismiss-item` on it are refused with the L7 sentence; `deck_post` with `kind: chat` is refused and the tool's description does not name `chat`; the thread page has no Close, Dismiss or Reopen; a `deck_wait` for repo A returns A's chat message and one for B does not. Browser: send in Chat, the message shows with `reloads: 1`, then a `deck_reply` from a scratch client appears with no reload; the queue count is read before and after. |
| Prohibited | No change to `isOpen`. No new route, and no edit to `deck/ui/deck.js` (reply in place must work as it is). No new MCP tool or schema field. No chat created on a GET or on a first message. No second spelling of "waiting" beside `isQueued`. No comment containing "closed" in `deck.css` (`daemon.test.mjs:498`). |
| Completion | A message typed in Chat reaches a parked pilot and its reply renders live in a real browser, the queue never counts the chat, and `npm test` is green. |

### S3 — Nothing outside the deck counts the chat

| Field | |
| --- | --- |
| Source · after | Spec 6 (status line, hand-off), spec 8; L6, L21 · **after** none by files; its evidence reads a chat item, which a fixture supplies until S2 lands |
| Files owned | `hooks/lib/deck.js` (`isChat`), `hooks/context-usage-statusline.js`, `hooks/session-handoff.js`, `hooks/test/context-usage.test.js`, `hooks/test/session-handoff.test.js`, `hooks/test/inbox.test.js` (where the stop gate is tested today), `skills/pilot/SKILL.md` (two sentences: the chat is where the user talks to you; answer with `deck_reply`, never resolve it), `scripts/test/pilot-rules.test.mjs` |
| Expected behaviour | A deck with one chat whose last message is the user's reads `deck 0` on the status line, and a hand-off record's open thread ids omit the chat. A user-last chat in the pilot's repository still holds its turn end (L21), and the gate's reason text is unchanged. |
| Verification | `npm test`. |
| Evidence | Tests red then green: `deckOpenCount` over a chat-only deck is 0, the hand-off's ids exclude the chat's id, and the stop gate holds on a user-last chat and not on a pilot-last one. The SKILL sentences are pinned in `pilot-rules.test.mjs`. |
| Prohibited | No `kind === 'chat'` literal outside `isChat` on the hooks side. No change to the stop gate's logic (L21 is its existing behaviour). No `require` of daemon modules from a hook (L35). |
| Completion | The status line and the hand-off ignore the chat, the gate's behaviour on it is pinned, and `npm test` is green. |

### S4 — The page loads its script as modules (split skeleton)

| Field | |
| --- | --- |
| Source · after | Spec 9–10; L10 (the user, A4)–L13; ADR 0030 (new: the page's script is ES modules served by the daemon; supersedes deck-usability D2) · **after** S2 (both edit `deck/ui/render.mjs`) |
| Files owned | `deck/server.mjs` (`GET /ui/<name>.mjs`), `deck/ui/render.mjs` (drop the `JS` slot from `PAGE_FILES`), `deck/ui/home.html`, `deck/ui/index.html`, `deck/ui/thread.html`, `deck/ui/deck.js` (loses the usage region; becomes `deck/ui/js/legacy.mjs`, whose `install(env)` wraps the rest unchanged), `deck/ui/js/deck.mjs` (entry), `deck/ui/js/usage.mjs`, `deck/testUtils.mjs` (`aSandbox` as the `env` factory, plus one `loadLegacy(env)` replacing the ten `vm` loaders), `deck/test/usage.test.mjs`, `deck/test/ui-route.test.mjs` (new), `package.json` (`coverage` script), `docs/adr/0030-*.md` |
| Expected behaviour | Every page loads `/ui/deck.mjs`. The usage readout is `usage.mjs` and is imported by its test. Everything else runs from `legacy.mjs` exactly as before. `npm run coverage` lists `usage.mjs` and `legacy.mjs`. |
| Verification | `npm test`; `npm run coverage`; a scratch deck in a real browser: the usage bands fill, a panel resizes, a reply goes in place, 0 console errors. |
| Evidence | Route tests red then green: `/ui/deck.mjs` is 200 with `text/javascript`; `/ui/../store.mjs`, `/ui/%2e%2e/server.mjs`, `/ui/nope.mjs` and a non-`.mjs` name are 404; a foreign `Host` is 421. The coverage table shows `usage.mjs`. The browser has one module request per module and no inline script. |
| Prohibited | No bundler, no concatenation of modules into an inline slot, no path joined from the request without the allowlist. No behaviour change in the moved code (L12). No test that still reads `deck.js` text into `node:vm` for the moved region. |
| Completion | All three pages run from modules in a real browser with 0 console errors, the route refuses everything off its list, and `npm test` and `npm run coverage` are green. |

### S5 — The rail's modules: bookmarks, notifications, panel size, layout pass

| Field | |
| --- | --- |
| Source · after | Spec 9–10; L11–L12 · **after** S4 |
| Files owned | `deck/ui/js/legacy.mjs` (loses lines 44-678 of the old file), `deck/ui/js/{bookmarks,notifications,size,layout}.mjs` (new), `deck/ui/js/deck.mjs`, `deck/test/{notifications,resize,stale,dismiss}.test.mjs` |
| Expected behaviour | The four regions are modules installed in their old order. Their tests import them. The rail behaves as before: bookmarks persist per navigation, the notification count and × hold across a reload, the width snap and the stacked layout are unchanged. |
| Verification | `npm test`; `npm run coverage`; browser: open two panels, drag one, reload, dismiss a notification, reload. |
| Evidence | The four modules appear in coverage. The listed tests import modules, and the suite count is unchanged or higher. Browser measurements before and after on the same scratch deck: panel tops equal, snapped width equal, notification count equal. |
| Prohibited | No change to a stored key's name or shape (`localStorage` or `sessionStorage`). No `requestAnimationFrame` moved into the `ResizeObserver` callback (deck-workspace Gate 2 measured why). No test deleted rather than ported. |
| Completion | The four regions run as modules with the same measured geometry in a real browser, and `npm test` is green. |

### S6 — The page's modules: time, live updates, replies, navigation; `deck.js` is gone

| Field | |
| --- | --- |
| Source · after | Spec 9–10; L11–L12 · **after** S5 |
| Files owned | `deck/ui/js/legacy.mjs` (deleted), `deck/ui/js/{time,live,dismiss,reply,navigate,escape}.mjs` (new), `deck/ui/js/deck.mjs`, `deck/testUtils.mjs` (`loadLegacy` removed), `deck/test/{live,reply,tabs,days,everything}.test.mjs` |
| Expected behaviour | Every region is a module. `deck/ui/deck.js` and `legacy.mjs` no longer exist. Live updates keep folds and skip a focused region, reply in place and its fallback work, and navigation and Esc behave as before. |
| Verification | `npm test`; `npm run coverage`; browser: a live status change with a fold held, an option press, a typed reply, a tab switch, back, Esc, the Everything toggle. |
| Evidence | `grep -rn "node:vm\|deck\.js" deck/test deck/ui` finds no loader. Every module is in the coverage table. The suite count is ≥ base. The browser run above has `reloads: 1` and 0 console errors. |
| Prohibited | No behaviour change (L12). No global left on `window` that the IIFE did not set. No test weakened to pass under module strictness. |
| Completion | No `deck.js` and no `vm` loader remain, every page works in a real browser, and `npm test` and `npm run coverage` are green. |

### S7 — "Teach me" teaches by asking

| Field | |
| --- | --- |
| Source · after | Spec 11; L14, L15; §3 tutoring row; ADR 0032 (new, amends 0020) · **after** S3 (both edit `skills/pilot/SKILL.md`) |
| Files owned | `agents/pilot-teacher.md`, `skills/teaching-a-decision/SKILL.md` (frontmatter description and body: an ask, then one reply per attempt, then done; the provenance header's `adapted:` line keeps its pinned prefix), `skills/pilot/SKILL.md` (the teaching paragraph at 293-302), `vendor/methodology.md` (row 80's description), `scripts/test/pilot-agents.test.mjs`, `docs/adr/0032-*.md` |
| Expected behaviour | `agents/pilot-teacher.md` and the skill carry L14's six rules, each citing its source by author, year and URL, with a secondary source labelled as one. The old "one reply, at most a screen" and "never ask a question back" are gone. Each reply is one step or one question and never both a lesson and a question. The pilot's paragraph: a typed reply during a live teaching resumes the same teacher, an option press is always the decision, and `teaching: done` hands typed replies back to the decision. |
| Verification | `npm test`; one live teaching on a scratch deck (4322+) with a real pilot session: Teach me, a half-right attempt, a right one. |
| Evidence | `pilot-agents.test.mjs` red then green: the `never ask … question back` pin is replaced by pins for the diagnostic opening, one step per reply, the explain-back loop, the mastery criterion, the worked-step fallback and the `teaching:` report line, and by a pin that each rule names a source; the pilot's rule on attempts and option presses is pinned too. The live thread's teacher messages, pasted into the PR. |
| Prohibited | No `deck_wait`, `deck_read` or `deck_resolve` added to the teacher's tools. No change to deck code or to `TEACH_ME`. No lesson in the first reply. No source cited that the implementer has not opened unless it is labelled secondary. No new agent. No deleting pins rather than rewriting them. |
| Completion | A live Teach me opens with one diagnostic question and ends with done, the pins are green, and `npm test` is green. |

### S8 — The deck has a favicon

| Field | |
| --- | --- |
| Source · after | Spec 12; L16 · **after** S4 (it owns the route and the three templates) |
| Files owned | `deck/ui/favicon.svg` (new, under 1 KB, no script and no external reference), `deck/server.mjs` (the allowlist gains `favicon.svg` → `image/svg+xml`), `deck/ui/home.html`, `deck/ui/index.html`, `deck/ui/thread.html`, `deck/test/favicon.test.mjs` (new) |
| Expected behaviour | Each page's `<head>` links `/ui/favicon.svg`, the route serves it, and the browser tab shows it. |
| Verification | `npm test`; a scratch deck in a real browser on home, a thread and `/items`. |
| Evidence | Tests red then green: `GET /ui/favicon.svg` is 200 `image/svg+xml`, the SVG has no `<script` and no `href="http`, and all three rendered pages carry the link. A screenshot of the tab. |
| Prohibited | No wildcard added to the allowlist (the file is named). No raster image or build step. No `data:` URI (L10). |
| Completion | The icon shows on all three pages in a real browser, and `npm test` is green. |

### S9 — Close asks before it sends

| Field | |
| --- | --- |
| Source · after | Spec 14; L17 · **after** S6 (it creates `deck/ui/js/dismiss.mjs`) |
| Files owned | `deck/ui/render.mjs` (`renderReplyForm`'s last line, `renderCloseForm`, `renderReplySlot`), `deck/ui/js/dismiss.mjs`, `deck/ui/deck.css` (`.send`), `deck/test/close.test.mjs` |
| Expected behaviour | On an open question, Close sits to the right of Reply in one row. The first press shows the confirm in that row, with Close in place and No beside it and focus on No. The same press again posts `/close`, and No backs out. A live update arriving mid-confirm does not redraw it away, because the focused region is skipped. Signoff and walkthrough remain without Close (run-record L11). With no script, one press posts. |
| Verification | `npm test`; a scratch deck in a real browser with a session parked on `deck_wait`. |
| Evidence | Tests red then green in `close.test.mjs`: Reply and both halves are in one `.send` row, with `.sure` hidden and every Close button's `form` naming the close form's id; a signoff's row has Reply alone; `dismiss.mjs`'s handler, imported with a stub `env`, hides `.ask`, shows `.sure` and focuses `.no` on the first press, and restores on No; the `/close` POST path is unchanged. Browser: Reply and Close have the same `top` (measured); press Close, and the thread is still open; No; Close twice with text in the box, and `Closed.` is returned to the parked wait with the text not posted. |
| Prohibited | No `confirm()` dialog. No second toggle handler. No `formaction` on the reply form. No absolute positioning to fake the row. No change to Dismiss's or the sign-off's behaviour. No confirm on Reopen or on an option press. |
| Completion | Close takes two presses in a real browser and one with script off, the pins are green, and `npm test` is green. |

### S11 — The header: the title top-left, the way back in its place, `‹ D3 ›` between the arrows

| Field | |
| --- | --- |
| Source · after | Spec 15; L19, L20; A8 · **after** S8 (templates), S9 (`render.mjs`, `deck.css`) |
| Files owned | `deck/ui/home.html`, `deck/ui/index.html`, `deck/ui/thread.html`, `deck/ui/render.mjs` (`tabCode`, `tabLabel`, `renderThreadNav`, `KIND`), `deck/ui/deck.css` (`h1`, `.back`, `header`, `.threads`), `deck/test/tabs.test.mjs`, `deck/test/thread-nav.test.mjs` (new) |
| Expected behaviour | As spec 15. The kind line reads `question · 1 hr ago` at the left; the centre reads `‹ D3 ›`, with D3 linking to the deck's tab (`hrefFor`); the usage readout stays at the right. |
| Verification | `npm test`; a scratch deck with three open threads on one deck and one on another; a real browser at 1280 and 900 px wide. |
| Evidence | Tests red then green: `tabLabel` equals `tabCode + ' ' + name`; the nav's hrefs on the first, middle and last thread of the overview's queue (ends inert); a closed thread's nav; with D1's and D2's threads interleaved, the walk follows the overview's order and the code reads D2 on D2's thread; a chat is never a step; no " on " in the kind line; an unnumbered deck shows its name. Browser: the title's centre x equals the column's centre x, the arrow sits where the title was, and › walks the overview's queue in order, the code changing from D1 to D2 where the walk crosses (the D-code change the user chose). A thread posted from a scratch client appears as the next step with `reloads: 1`. |
| Prohibited | No second spelling of `D‹n›` outside `tabCode`. No script for the nav (the generic swap carries it). No wrap-around. No change to Esc or to the arrow's `href`. No comment containing "closed" in `deck.css` or the templates (`daemon.test.mjs:498`). |
| Completion | The header reads as spec 15 in a real browser at both widths, the arrows walk the deck's queue live, and `npm test` is green. |

### S12 — `pilot run` starts the fresh session's first turn

Added 2026-09-24 by the pilot at the user's instruction ("something went wrong, make sure to fix it"). What went wrong:
at 15:17:35Z on 2026-09-23 the pilot ended its turn having posted the hand-off; `pilot run` typed `/clear` 0.16 s
later; the fresh session's transcript shows the SessionStart lane's body attached at 15:17:36Z — and nothing until the
user typed at 15:40:24Z. A session after `/clear` holds the injected context but starts no turn until something is
typed, and the wrapper types only `/clear\r` (`deck/run.mjs:269`, its one `type(` call). Deck-workspace line 30's
evidence ("touch nothing … the fresh session names the same feature") has therefore never held.

| Field | |
| --- | --- |
| Source · after | The user, 2026-09-24; deck-workspace line 30 as amended ("nothing from the user"); run-record spec 3 · after nothing (disjoint files); before S10 so 0.6.0 ships it |
| Files owned | `deck/run.mjs`, `deck/test/run.test.mjs`, `README.md` (line 57's sentence), the header comment of `deck/run.mjs` |
| Expected behaviour | After the wrapper types `/clear`, it types one first prompt and its return — `Pick up the hand-off on the deck.` — so the pilot's first turn begins with nobody at the keyboard. The prompt reaches the session after the SessionStart lane's context is attached, proved live. Once per hand-off, under the same claim and cooldown as the `/clear`. Plain `claude --agent pilot:pilot` is unchanged. |
| Verification | `npm test`. Live: a scratch directory registered on a scratch deck, `node bin/pilot.mjs run`, a hand-seeded `handoff` whose body asks for the single word PINEAPPLE; the fresh session answers it with nobody typing. |
| Evidence | Tests red then green in `run.test.mjs`: `/clear\r` then the prompt; a held claim types neither; the cooldown covers both; the plain path untouched. The live run's timestamps quoted in the PR body. |
| Prohibited | No change to which item triggers the `/clear`. No screen-reading to time the prompt unless the live proof shows a sequential write is not enough, and then the smallest measured wait. No new dependency. No edit to `hooks/session-handoff.js` or the guard. |
| Completion | A hand-off under `pilot run` resumes with nobody typing, proved live once, and `npm test` is green. |

The running wrapper on this machine is 0.5.0's, so this run's own next hand-off still needs one typed prompt; the fix
takes effect with S10.

### S10 — Release 0.6.0 and run it here

| Field | |
| --- | --- |
| Source · after | Spec 13; L18; A7 · **after** S1–S9, S11 (it is the last commit on the feature branch) |
| Files owned | `package.json`, `package-lock.json`, `.claude-plugin/plugin.json`, `deck/client.mjs` (line 356 only) |
| Expected behaviour | All five statements read 0.6.0, in one commit `chore: bump plugin version to 0.6.0`. **After the user merges the feature PR**, the pilot runs `claude plugin marketplace update pilot` and `claude plugin update pilot@pilot`. It asks on the deck (A7), then stops the daemon on 4321, and the next session's call respawns it from 0.6.0. The preview on 4327 (`pilot-preview-main`) is not touched. |
| Verification | `npm test` (the version test); after the merge, `ls ~/.claude/plugins/cache/pilot/pilot` and `curl -s http://127.0.0.1:4321/thread/<any id>`. |
| Evidence | The version test red at a partial bump and green at the full one. After the merge: the `0.6.0` directory is listed; the 4321 page contains `body[data-item] [data-live="reply"]`, a Chat bookmark and `/ui/favicon.svg`. |
| Prohibited | No merge of the feature PR by anyone but the user. No `plugin update` before the merge (it would reinstall 0.5.0's `main`). No stopping 4321 without the user's yes. No touching 4327. |
| Completion | The cache holds 0.6.0 and the deck on 4321 serves the sticky rule, the Chat bookmark and the icon. |

## 9. Acceptance evidence, in the order the user meets it

1. Follow INSTALL.md's new step and say yes. Open a fresh PowerShell and a fresh Git Bash and type `pilot help` in each: both print the usage.
2. README's Use section names `pilot run` and points at that step. PR #73 is closed.
3. Start a pilot and open its deck's tab: Chat is in the left rail directly under Notifications, open.
4. Type in Chat: the message appears in place, and the queue count and the status line's `deck N` do not move.
5. The pilot, parked or working, answers: its reply appears in the Chat panel without a reload.
6. The chat's thread page has no Close, Dismiss or Reopen.
7. End the run. The tab goes the way an ended run's tab always has, and the chat does not hold it.
8. Every deck behaviour met in 3–7 (panels, resize, folds, notifications, replies, tab switch, Esc) runs from `/ui/*.mjs`. `npm run coverage` lists each module.
9. The browser tab shows the deck's icon on the home page, a thread and `/items`.
10. On a question, press Teach me: one small yes/no question. Each answer gets one step and one question. Explain the decision back with a part missing, and you get that part only; explain it right, and it says you have it.
11. On a question, Close is beside Reply. Press it: it asks in that row, with No beside it. Press No, then Close twice: the thread closes, and the pilot hears `Closed.`.
12. On a thread, the title sits top-left over the rail, the back arrow sits where it was, and `‹ D3 ›` is centred. › steps through every open thread in the overview's order, the code changing as it crosses decks, and stops at the last.
13. After you merge: the cache holds 0.6.0, and the deck at 4321 has the sticky reply box, the Chat bookmark and the icon.

## 10. Status

Spec closed at 15 (2026-09-23). **Gate 1 approved 2026-09-23 (itm_2999c7837247)** at 23684ec; depth *forks*; assumed and recorded: A3, A5, A7, A8. Locked by the user: A1 (L21), A2 (L22), A4 (L10), the arrows walk every deck (L20). Feature PR **#86** (draft) from `feat/deferred-ledger`. Pilot hand-off 2026-09-23 15:17Z after S5 integrated, before S6 started; the fresh session sat idle until the user typed (S12), and resumed the run 2026-09-24.

| Slice | State | Branch | PR | Worktree | After | Delivers |
| --- | --- | --- | --- | --- | --- | --- |
| S1 pilot command | superseded by main's launcher (#99–#101); was integrated at ad7b05f | `slice/1-pilot-command` | #87 merged; #73 closed | removed | — | 1, 2, 3 |
| S2 chat skeleton | integrated at f26c35d (fixture fix 9183c70 in `hooks/test/inbox.test.js`, applied by the pilot on the user's word, itm_063dc1b3b53c) | `slice/2-chat` | #89 merged | removed | — | 4, 5, 6, 7 |
| S3 chat outside the deck | integrated at af65447 | `slice/3-chat-hooks` | #88 merged | removed | — | 6, 8 |
| S4 modules skeleton | integrated at 4576dbc; ADR 0030; route = `UI_ASSETS` map, `has`/`get` only | `slice/4-modules` | #91 merged | removed | S2 | 9, 10 |
| S5 rail modules | integrated at 8200e16 (pre-rebase tip 12b4e1e, browser-measured identical before/after); `legacy.install(env, notices, sizes)`; reply helpers left in `legacy.mjs` for S6; `loadLegacy`/`withItsScript` in `testUtils.mjs` for S6 to remove | `slice/5-rail-modules` | #93 closed by hand (head moved after merge) | removed | S4 | 9, 10 |
| S6 page modules | integrated at a215c81 (slice tip 71051c4; +92 net; `dom.mjs` added for `forEach`; `withItsScript` kept, no vm; `loadLegacy` → `loadPage`; reviewer clean; browser 8/8, reloads 1, 0 console errors) | `slice/6-page-modules` | #94 closed by hand (merge not recorded) | removed | S5 | 9, 10 |
| S7 Socratic teacher | integrated at d6ca44b; ADR 0032; dry-run stood in for the live teaching — verify the first real Teach me after release | `slice/7-teacher` | #90 merged | removed | S3 | 11 |
| S8 favicon | integrated at 18ed5bf; `UI_MODULES` → `UI_ASSETS` with per-entry content type | `slice/8-favicon` | #92 merged | removed | S4 | 12 |
| S9 Close confirm | integrated at 2814bcf (slice tip 15914e2; +255/−36; reviewer found `.ask` as `type="button"` left the no-script path inert, so **`.ask` is `type="submit"` — a correction to L17's wording**, the two-form design unchanged; `dismiss.mjs` widens by a `REGIONS` list of two `closest` calls; browser: Reply and Close `top` 397.9 both, `Closed.` returned to a parked wait with the box's text not posted, script-off one press closes) | `slice/9-close-confirm` | #95 merged | removed | S6 | 14 |
| S11 header and thread arrows | integrated at 12529ef (slice tip 2b51c44; +342/−62 incl. 206 test lines; nav centred by `position: absolute; left: 50%` because the usage readout is full-width; `justify-content: space-between` dropped from `header`; title before `<header>` in all three templates; `live.test.mjs` gained the `nav` region; measured at 1280 and 900: title centre = column centre 171.2, nav centre = header centre, walk D1→D2→D1→D1 in the overview's order, ends inert, a posted thread became the next step with 0 reloads; reviewer: one LOW, escaping, fixed) | `slice/11-header-arrows` | #97 merged | removed | S8, S9 | 15 |
| S12 wrapper first turn | integrated at 19ec867 (slice tip 5aefe3f; +64/−11; `FIRST_PROMPT` typed after `/clear` under the same claim; proved live idle and mid-turn: the CLI queues the two writes as separate submissions and sends the prompt 8–15 ms after the hand-off context attaches; no wait added; a prompt write that fails after the `/clear` keeps the claim) | `slice/12-first-turn` | #96 merged | removed | — | — |
| S10 release 0.6.0 | bumped on the branch; plugin update after merge; bump on the branch, `claude plugin marketplace update pilot` + `claude plugin update pilot@pilot` after the user merges #86, ask (A7) before restarting 4321 | `slice/10-release` | — | — | S1–S9, S11, S12 | 13 |
| deferred ledger (feature) | **Gate 2 passed 2026-09-25 (itm_da18458fae44), user merges**; every code slice integrated (S1–S9, S11, S12); `feat/deferred-ledger` at 12529ef, 1,325 tests (flakes below); principles review and QA read-only pass done 2026-09-24 (below); **fix round integrated at 4d623f7** (PR #98, tip 7989635, 16 files +170/−235; 1,323 tests, the full run's one failure was the clock flake, green on re-run); QA is the branch's writer from 4d623f7; **walkthrough posted itm_da18458fae44** (18 steps in §9 order; preview: scratch daemon on 4331 with a stand-in chat responder; re-probe at 16377a3: 1,323 green, F1 gap 16 px at 1280/1000/900, Close confirm and chat form as designed, 0 console errors); Gate 2 sign-off after the procedure comes back clean; QA corrects PR #86's body (S12 in the diagram, rows 14/15 order, a "Non-additive migrations: none" section) at the ready step | `feat/deferred-ledger` | #86 draft | `C:/Users/Hazzard/Projects/pilot-feat-deferred-ledger` | — | 1–15 |

**Principles review (Opus, 12529ef):** diff coverage 99% (7 missed lines, all moved catches); 129 mutants on `dismiss.mjs`, `items.mjs:341-343`, `render.mjs` — 103 killed, 5 timed out, 21 survived, of which 6 equivalent and 1 killed by the full suite; no new function over the complexity limits; 3 clones, all in tests. **QA read-only pass (Opus, scratch daemon on 4331):** 14 of 15 spec lines green in a real browser; line 11 waits for the first real Teach me after release; line 13 is after the merge.

| Finding | Verdict | Why |
| --- | --- | --- |
| S-1 `withItsScript` regex-matches module source (`toggle` satisfied by `layout.mjs:112`) | kept, −45 | false green; behaviour already tested through install |
| S-2 `loadPage` repeats `deck.mjs`'s wiring line for line | kept, −18 | a module added to one and not the other is silent drift; one `install(env)` in `page.mjs` |
| S-3 `REGIONS`/`closestIn` exist for a test stub's string equality | kept, −12 | production bent for a double; selector lists and stubs to match |
| S-4 teacher's six rules duplicated from the `teaching-a-decision` skill | **dropped for now — the user's at Gate 2** | §8 S7 asked for both copies; reversing a Gate-1 decision while the user is away is not the pilot's |
| P-1 `appearsInYours` true for a chat | kept, 0 | one spelling of "waiting" (L6) |
| M-1..M-4 surviving mutants: chat `back` input, `.confirm` wrapper, non-question row, `' .no'` suffix | kept, +10 | each pins a contract across a seam the tests did not |
| N1 arrow ternary, N2 stale text ×4, N5 one `top` property | kept, 0 | readability; N2 includes INSTALL.md:36 contradicting L2 |
| F1 (QA) nav overlaps the kind line at 900 px by 7.6 px | kept, CSS | nav into the flow, centred; measured at 1280 and 900 |
| N3 `callApi` clones, N4 nav labels, N6 tests on moved catches | dropped | legacy scope; labels only; L12 moved them unchanged |

Ledger for the fundamentalist and the fix round: `deck/test/usage.test.mjs:674` ("a reset time already behind us…") reads the real clock and once returned "in 1 hr" for "in 2 hrs", green on the next run; S7's implementer saw one uncaptured failure too; S9's implementer saw one `run.test.mjs` watcher test flake once on the base, green on re-run. The stale `deck.js` comments were corrected by S6. S12's live proofs left six claim files for scratch item ids in `~/.claude/pilot-inbox/claims`, harmless. `deck/server.mjs:729-731` still says the kind line names the deck (S11 left it: file not owned). `deck/test/run.test.mjs:254` assumes port 4399 is free, so no scratch daemon may hold it during a test run. S12's `FIRST_PROMPT` has been proved with a test body only, never after a real stash-bearing hand-off — this run's own next hand-off, under the 0.5.0 wrapper, still needs one typed line. The chrome-devtools MCP was unreachable from every agent session this run; each drove headless Chrome over CDP with its own script.
