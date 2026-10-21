# Identifying the governing regime

> Read this before generating or updating a policy note. It is the part of the
> workflow that cannot be inferred from the code, and the part most likely to be
> got wrong confidently.

This skill ships **no jurisdiction's rules**. That is deliberate. A skill that
shipped a favourite regime's answers would be wrong everywhere else while
looking authoritative, and the failure would be silent. What it ships instead
are the *questions* that identify which regime applies, and the checklist of
assumptions that must be tested rather than carried across.

## There is no default regime

The same code is lawful in one regime and an offence in another. A ninety-day
deletion job is good privacy hygiene under one statute and a criminal offence
under another that requires records to be kept for seven years. Neither is the
"safe" reading, because there is no direction that is safe in both.

This has a direct consequence for the workflow: **when the regime is unknown,
stop and ask.** Do not pick the strictest-sounding option. "Strictest" is not
well-defined once obligations point in opposite directions, and a review
conducted against the wrong regime is worse than no review, because it
manufactures false confidence.

## The eight questions

Answer all eight before writing a single obligation. Each has changed the answer
in real projects.

### 1. Who are the data subjects?

Children, patients, employees, consumers, citizens, students. Special categories
attract separate regimes that sit **on top of** the general one rather than
replacing it. Children's data in particular tends to attract a distinct code with
its own regulator and its own timetable.

### 2. Where are the subjects, where does the data rest, and where is it processed?

Three separate answers, and they are routinely different. The obligation usually
attaches to the subject's location, the transfer rule to the data's movement, and
the sector rule to the operator's location. A single-country product with one
overseas dependency has a cross-border question.

### 3. In what capacity does the operator act?

Agency, contracted service provider, controller, processor, sub-processor,
business associate. **This determines which obligations bind you and who
enforces them**, and it is a question about contracts, not about code. Getting it
wrong invalidates the entire review.

Note the trap: some regimes bind a service provider *as if it were the principal*
once a contract says so, which means obligations you believed applied only to
your customer apply directly to you, enforceable by their regulator, at any
company size.

### 4. What sector?

Education, health, finance, defence, public sector, critical infrastructure.
Sector usually picks the **regulator**, and the regulator's guidance is often
more operationally binding than the statute. Sector rules also commonly override
the general privacy regime where they conflict.

**Sector has no lawful default.** If a project serves more than one sector, the
regime is per-customer, not per-product, and the code has to be able to represent
that — a single global constant cannot express two regulators' rules at once.

### 5. What determinations are automated?

Any score, grade, ranking, price, eligibility or risk assessment produced about a
person without a human deciding. Automated decision-making rules are the fastest-
moving area in most jurisdictions, frequently carry **future commencement dates**,
and typically impose transparency and review obligations rather than prohibitions.

A commencement date in the future is not a reason to skip the obligation. It is a
deadline, and it belongs in the note's open-items table with that date attached.

### 6. Is there a regime that *forces* retention?

Public records, corporations, tax, employment, child-safety and clinical-records
law frequently mandate **minimum** retention, and early disposal is sometimes an
offence attaching to a natural person rather than to the company.

This is the question most often missed, because privacy thinking runs entirely in
the deletion direction. Ask it explicitly every time. Where both apply, the
lawful window is bounded on both sides, and the code must express a floor and a
ceiling rather than a single TTL.

### 7. What binds you by contract beyond statute?

Customer agreements, procurement terms, funding conditions, platform policies,
professional codes, insurance conditions. These are enforceable, frequently
stricter than the statute, and invisible to any research tool. **Ask the user
on the deck** — this is the one input the skill cannot go and find.

### 8. What is the enforcement shape?

Who investigates, what notice you get, what the penalty is, and crucially
**whether liability attaches to an individual**. A finding whose consequence lands
on a named person outranks one that lands on the company, and the tiering in
`findings-format.md` depends on knowing which it is.

## The imported-reflex checklist

A model trained largely on the best-documented regimes will carry their answers
into regimes that do not share them. Every item below is a reflex that is correct
somewhere and false elsewhere. **Test each explicitly against the actual
governing instrument. Do not assume the familiar answer.**

| Reflex | Why it may be false here |
|---|---|
| "Individuals can demand erasure" | A records statute may make early disposal an offence. The duty may run the other way |
| "There is a 72-hour breach notification clock" | Many schemes allow ~30 days to *assess*, then notification "as soon as practicable". Some run agency-to-regulator only, leaving the vendor's duty purely contractual |
| "Small organisations are exempt below a turnover threshold" | Contractual binding, sector rules, or public-sector status can apply the regime at any size |
| "Cross-border transfer follows the general adequacy principle" | Some jurisdictions deliberately declined to adopt that principle and kept a standalone provision with different tests and no de minimis exemption |
| "Consent legitimises the processing" | In public-sector, employment and children's contexts consent is often unavailable, invalid, or irrelevant to the lawful basis |
| "De-identified data is out of scope" | Re-identification thresholds differ, and some regimes regulate the *act* of de-identification itself |
| "The national privacy regulator is the enforcer" | A sector or state regulator may take precedence, with different powers and timetables |
| "A DPA or BAA covers the relationship" | The required instrument may be differently named, differently scoped, or statutorily prescribed |
| "Anonymised analytics are unregulated" | Device and behavioural identifiers are personal information in many regimes |
| "Processing for product improvement is a compatible secondary use" | Frequently it is not, and model training on customer data is the sharpest current instance |
| "Federal law preempts the state or provincial layer" | Often it sets a floor that the sub-national layer exceeds |
| "The rule commences when the statute passes" | Commencement is frequently staged, by provision and by entity class |

When the note is written, record which of these were **tested and found not to
apply**, not only the ones that did. The negative result is what stops the next
review re-importing the same reflex, and it is the cheapest durable output of the
whole exercise.

## Recording the regime

The note must name, at minimum:

- **jurisdiction(s)** — the specific one, not the region
- **sector(s)** — and whether it varies per customer
- **capacity** — the operator's role, with the contractual basis for that claim
- **subject categories** — including any special category
- **the instruments** — with citation and retrieval date
- **the regulator(s)** — with the enforcement shape
- **what was tested and excluded** — the reflex checklist results

Where a project serves multiple regimes, model that explicitly. A per-customer
regime cannot be represented by a global constant, and discovering that late is
an architectural finding rather than a fix.

## A worked shape

One pattern worth carrying, drawn from a production system that got this right:
express the non-negotiable limits as **structural invariants in code, each beside
its citation**, in a module whose only purpose is to hold them.

The reasoning is about diffs. If a legal limit lives beside the logic that
applies it, one edit relaxes both, and the change that weakened a legal control
looks like ordinary maintenance in review. Isolated in a dedicated module, the
same change is a diff against a file where every entry carries a statutory
citation — which is very hard to do by accident, and obvious in review when done
deliberately.

Two refinements that matter in practice:

- **The direction of "stricter" differs per limit.** A retention floor gets
  stricter as the number rises; an allowlist gets stricter as the set shrinks. A
  single generic helper taking direction as a parameter is a live hazard, because
  one transposed argument silently inverts a legal control. Make direction a
  property of the limit's type, declared once beside its citation.
- **A configuration layer may narrow a limit and must never widen one.** Without
  that asymmetry, "make policy configurable" and "make policy bypassable" are the
  same change.
