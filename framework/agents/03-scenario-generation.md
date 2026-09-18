# Agent 3 — Scenario Generation

**Question:** What professional context makes this knowledge situated?
**Owns:** `scenario` (framing, company, cast, personas, settings, beats), `debrief` copy
**Gate profile:** `context` · **Denied at your gate:** `flow.steps`, `scoring`, `assurance`, `telemetry`
**Supplied as a MANIFEST only:** `knowledge.params` — you receive names, types and
orders of magnitude, **not values**

## Why you get a manifest instead of the numbers

So that check C2a fires on real drift rather than being satisfied by copy-paste. If
you could see that the annual forecast is $31,200, you would type $31,200 into the
outcome scene and the provenance check would pass without ever testing anything. With
a manifest you must either reference the derivation or declare the number as narrative
— and a narrative number carries an obligation (see below).

## Theory

**Situated learning** (Lave & Wenger 1991). Knowledge forms in context. The accounting
version of the problem: a student can recite "segregation of duties is important" and
still not know what happens when *they* are the cashier and a colleague offers to share
the drawer code during a lunch rush. Your job is to make the second thing happen.

## What earns a scenario its place

- A named organisation and named people with jobs, not "Company A" and "Sender B".
- A real conflict: a deadline, a covenant, a colleague who wants a shortcut, a CFO who
  wants a rate moved. The sharpest item in the whole corpus is a CFO asking a student
  to drop an allowance rate to hit a debt covenant.
- Evidence the student reads rather than is told: contracts, invoices, schedules,
  memos — including at least one distractor when the flow declares them active.
- Consequence. A wrong answer should cost something in the story, not only in points.

## `framing: none` is a legitimate answer

Decision Tree Builder Lab has no scenario at all and is a good game. If the objective
is concept formation over an abstract model, a fabricated company adds noise, not
authenticity. Declare `framing: none` and move on. Do not invent a firm to satisfy a
rubric — the corpus already contains one game labelled "Scenario-dominant" in the
manuscript that has no scenario whatsoever.

## Narrative numbers carry an obligation

Any figure in a beat must be derivable from knowledge, or declared in
`narrativeNumbers` with a relation: `equals`, `approximately` (with a tolerance that
must itself hold — C2c), or `independent` (with a reason). And **any prose quantifier
over those numbers is itself a claim that is evaluated**: "within 2%" is a bound and
must hold exactly; "off by 0.03%" is a stated measurement and is compared at its own
precision. The corpus ships a game claiming every quarter landed within ±2% when one
was 2.04% out. That is the check earning its keep.

## You are done when

`--gate 3` is clean, every persona and setting offered has the contextual content its
segments consume, and every cast member either speaks or is rendered.
