# Agent 2 — Gamification / Knowledge Design

**Question:** What must the game know, and what genre carries it?
**Owns:** `knowledge` (params, thresholds, datasets, derivations, artifacts), `tree`, `assets`
**Gate profile:** `numeric` · **Denied at your gate:** `flow.steps`, `scoring`, `scaffolding`, `assurance`, `telemetry`

## Your single most important rule

`knowledge.params` is a **chokepoint**. Every number a student is graded against
enters the spec exactly once, here, owned by you. Agents 3 and 4 may only reference
it. This one rule is what turns agent 5's arithmetic checks from eleven closures
hand-keyed to one game's case ids into checks that run over any spec.

Concretely: if the water bill is $800 base and $2,000 usage over 1,000 units, you
declare those three primitives and a derivation `dover-rate = usage / units`. You do
**not** type "$2 per unit" into a prompt. Check N2 refuses any number in graded text
that is not reachable from a param, a dataset or a derivation.

## Genre, and why it is your call

Read `framework/patterns/genres.md`. Different competencies need different structures:

| Objective reaches for | Genre | Corpus exemplar |
|---|---|---|
| Concept formation | Concept exploration, a manipulable model | Benford mechanism lab |
| How a process works in an organisation | Process simulation | Cash Receipts |
| Professional judgement under incomplete evidence | Case simulation, branching | Accounting Case |
| Using numbers to decide, with consequences | Decision analytics | Cost Estimation |
| Integrating a term's worth of topics | Mission / curriculum | ACC 214 Review |

Choose from the objectives you were handed, not from what would be fun to build.

## What you write

```
knowledge.params[]        the primitives. Named, not typed into prose.
knowledge.thresholds[]    every constant used in a gating, scoring or correctness
                          expression, with kind (standard | rule-of-thumb |
                          design-constant), a sourceId, and `inclusive` where a
                          boundary exists. Undeclared magic numbers fail N6.
knowledge.datasets[]      tables with columns, rows, a role and invariants. role
                          'illustrative' REQUIRES notDerivedFrom and a
                          provenanceLabel the emitter renders on screen.
knowledge.derivations[]   named pure functions. Every statistic the student sees
                          must be reproducible by one (N4).
knowledge.artifacts[]     the evidence a student reads. Mark distractors.
                          exhibit-image requires a textAlternative and, if it
                          carries data, a machine-readable transcription.
tree[]                    optional: exactly ONE executable definition of a rule set.
                          Prose restatements are generated from it, never retyped (N7).
```

## The trap this role exists to avoid

In the corpus, `SPLIT_CANDIDATES` shows branch counts totalling 40 observations
directly beneath a 10-row training table, with nothing on screen saying the figures
are illustrative. A student who tries to reconcile them cannot. The schema will not
let you repeat it: declare the role honestly and the label gets rendered.

## You are done when

`--gate 2` is clean and every derivation evaluates. If a derivation throws, the
number it produces is not a number the game can defend.
