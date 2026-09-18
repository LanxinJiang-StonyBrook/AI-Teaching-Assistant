# Genre patterns — distilled from the corpus

Agent 2 picks a genre from the objectives, not from what would be fun to build. Each
pattern below names what it is good for, what it costs, and the corpus game that
instantiates it with a file reference you can go and read.

---

## 1. Concept exploration — a model you can manipulate

**Good for:** concept formation. Bloom *understand*, occasionally *analyze*.
**Shape:** a sandbox with one verb, then a checkpoint that asks what the sandbox showed.
**Corpus:** Benford Mechanism Lab (`public/benford-law-game/index.html`) — "Generate 25
invoices" is the only verb; the reward is watching the observed bars converge on the
Benford curve, and it is deliberately unscored.
**GameSpec:** `sandbox` for the model, `mcq` for the checkpoints, a `dataset` of role
`reference` for the benchmark the model is compared against.
**Cost:** a sandbox with no checkpoint teaches nothing measurable. Always pair it.

## 2. Process simulation — how the work actually moves

**Good for:** systems thinking, control points, hand-offs. Bloom *apply*.
**Shape:** a role, a sequence of stations, one decision per station, a consequence for
each wrong call, and a debrief that replays the process end to end.
**Corpus:** Cash Receipts Control Lab (`public/cash-receipts-control-game/index.html`) —
four roles × six control activities, with a consequence screen and a forced retry.
**GameSpec:** `navigate` (unscored) between stations, `mcq` at each, `taxonomy` for the
control set, a `risk` meter with `affectsFinalGrade: false`.
**Cost:** the corpus version makes every decision binary. Six objectives each assessed
by one two-option item is a coin flip. Use three options, or two items per control.

## 3. Case simulation — judgement under incomplete evidence

**Good for:** professional judgement. Bloom *analyze* and *evaluate*.
**Shape:** a named firm, documents including at least one distractor, a stage per
decision, graduated partial credit, and events that fire on a bad call.
**Corpus:** Accounting Case Game (`src/data/cases/month-end-close/`) — the strongest
scenario engine in the repo, and the cleanest data model.
**GameSpec:** `mcq` with graduated `award` per option, `artifacts` with `isDistractor`,
`beats` of kind `interrupt`, `weighted-cap` scoring.
**Cost:** weighted-cap is the model most likely to leave points unreachable. Run S5.

## 4. Decision analytics — numbers with consequences

**Good for:** using accounting information to decide. Bloom *apply* and *evaluate*.
**Shape:** a client with a problem, data, a method applied step by step, a forecast, and
then a flash-forward showing what the decision cost or saved.
**Corpus:** ACC 214 Cost Estimation Challenge (`public/acc214-cost-estimation/index.html`)
— three engagements, a client-trust meter, and outcome scenes a year later.
**GameSpec:** `numeric` and `multi-blank` for the computation, `classify` and
`select-from-set` for method choice, `beats` of kind `outcome` for the consequence, a
`trust` meter with a payout rule.
**Cost:** the outcome scene is where a false quantitative claim hides. Declare every
narrative number and let C2b evaluate the prose.

## 5. Guided construction — build the method, then apply it

**Good for:** understanding an algorithm or a procedure from the inside. Bloom
*understand* → *analyze* → *apply*, in that order, gated.
**Shape:** phases that unlock one at a time, a diagram that grows as you answer, then a
set of unseen records to classify with the thing you built.
**Corpus:** Decision Tree Builder Lab (`public/decision-tree-game/index.html`).
**GameSpec:** `unlock-plus-one` progression, `checkpoint-binary` scoring, one `tree` as
the single executable definition of the rule set, `traverse` for the apply phase.
**Cost:** phase gating plus binary checkpoints is retry-friendly to the point of being
unmeasurable. Record attempts.

## 6. Mission / curriculum integration — a term in one sitting

**Good for:** transfer across topics, revision before an exam.
**Shape:** an organisation with departments, one department per chapter, XP, ranks.
**Corpus:** ACC 214 Full Course Review — **not yet expressed in GameSpec.** It is a
timed conveyor arcade with pointer drag and a decaying combo meter, and v1.0 does not
cover it. That is recorded rather than implied; see `meta.outOfScope`.
**Cost:** breadth against depth. Every topic gets a minute, so nothing reaches analyze.
