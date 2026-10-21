# Vertical execution: the slice loop and its gates

How an agreed design becomes merged code. Under the pilot
(`${CLAUDE_PLUGIN_ROOT}/agents/pilot.md`) the architect cuts the design into slices,
`pilot-implementer` runs the loop below once per slice,
`pilot-fundamentalist` reviews the whole feature once, on Opus, after the last
slice is integrated, and
`pilot-qa` carries the finished feature through Gate 2. Outside a piloted feature,
the same loop applies to any change that spans more than one slice. A pipeline
command from some other plugin is superseded by this and is not used.

## 1. Grill before designing

A prompt is a wish, not a specification. Left alone, a model silently defaults every
decision the user did not think to state, and those defaults surface only once they
are load-bearing under written code. Grilling moves that discovery to the cheapest
moment: every open branch gets a recommended default and a named tradeoff, until no
unresolved decision would change the plan. The first frontier is the spec, what the
feature has to do as numbered behaviours each with its evidence; no architecture
question is asked until that is agreed.

The technique is the `grilling` skill, with one standing change: independent
questions go to the deck together, one at a time only where one answer would change
another question, and never a numbered round of the whole frontier. Outside the
pilot, run `grilling` before you plan anything above trivial. Record the structural
decisions it locks as ADRs under `docs/adr/`, without being asked.

## 2. A loop over slices, not a phase over tickets

Implementing every ticket and only then reviewing delays every real signal until the
end, when acting on it is most expensive. So the work is one loop, run once per
slice:

```
for each slice in the DAG (blockers first):
    red  ->  green  ->  refactor  ->  PHASE GATE  ->  fresh-context review
```

The next slice does not begin until the current one has passed its gate. How to cut
the slices is the `vertical-slicing` skill; the red-green-refactor inner loop is
`tdd-workflow`.

## 3. The phase gate

A slice is finished when all of these are true:

- the new behaviour has a test that **failed before the change and passes after**
- the project's own checks are green: its type check or compiler, lint, full test
  suite and build, whatever the stack calls them (`npx tsc --noEmit`, `cargo
  clippy`, `terraform validate`)
- the slice's own named verification command has been run **and its output read**
- for anything with a surface someone uses, it has been run for real in the
  environment it is meant for — a browser, a device, a cluster, a simulator, a
  notebook, a CLI or binary — and what it makes (a GUI, a picture, a plot, audio,
  video, a game) has been looked at, not inferred

Gates are never batched: one combined gate over three slices loses *which* slice
broke something while it is still cheap to unpick.

## 4. The reviewer must not be the author

Review runs in a **fresh context**, a subagent or a new session, reading the slice's
diff without having written it. It has two axes: **standards** (diff quality,
repository conventions, the checks the repo enforces) and **spec** (does this deliver
what the agreement said). One reviewer per slice, matched to its language (the
`pilot-implementer` and `pilot-qa` definitions list them), plus a second only when
the slice touches auth, user input, or SQL.

Under the pilot, `pilot-fundamentalist` gives the feature one **principles review**,
subtraction first,
run once, on Opus, when the last slice is integrated, never on a slice's own draft PR.
The cost is real: a design problem one slice introduces is
found only once later slices stand on it. It is paid because only the finished
feature shows a helper a later slice made redundant or a seam two slices each built
half of, and because what catches a problem as it lands
is the language reviewer above. The pilot decides which findings are worth their diff, and a fresh
implementer fixes the kept ones before the feature PR's Gate 2 sign-off.

## Context is a budget

A model degrades as its context fills, from around 100k tokens. When a slice cannot
reach green before the context is two-thirds gone, **re-cut the slice**; do not push
on into the degraded zone or compact and continue.

## The two human gates

**Gate 1** is before implementation: the user signs off the design agreement and the
slice DAG together, because approving a ticket list without the reasoning behind it
is approving the wrong artefact.
**Gate 2** is before the feature PR lands on `pilot`: the user has worked through the QA agent's
step-by-step procedure on the whole feature, running where it is meant to run, and
pressed Sign off, and only then does the feature land — every ticket has
one. Main gets pilot by the one main PR, `pilot` → main, which only the user merges. The procedure walks them through whatever
the feature is: a GUI first, then pictures, video, audio, plots, games, rendered
documents, a CLI, a config applied to a cluster, a binary, a notebook. Slice PRs
merge into the integration branch by the pilot's hand and are never marked ready.
An agent never passes either gate.

Trivial work collapses to implement, review, commit, with grilling skipped; say so
in a clause rather than skipping silently. A fresh-context review is not a licence
to spawn an agent for every one-line slice.
