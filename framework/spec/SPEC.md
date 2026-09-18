# GameSpec v1.0 — the hand-off contract

A GameSpec is the document the six agents pass between them, and the document the
emitter turns into a game. It is the framework: without it the agents are a prompt
chain, and the checks have nothing to run over.

Three design decisions are worth understanding before the field list.

**Every field has exactly one owning agent**, declared in the schema as `x-agent` and
read from there by the validator — never duplicated, so a field cannot silently
acquire a second owner. `feedback` is split into `feedback.content` (agent 4) and
`feedback.policy` (agent 6) precisely so that "one owner per field" is literally true
rather than approximately true.

**Some fields are derived and must never be authored.** `objectives[].assessedBy`,
`scoring.derivedCeilings` and `debrief[].objectiveRollup` are computed by the
validator, which rejects a spec that writes them (S13). That is what keeps the
objective-to-item map from drifting away from the flow.

**`knowledge.params` is a chokepoint.** Every number a student is graded against
enters the spec exactly once, in one place, owned by one agent. Agents 3 and 4 may
only reference it. This single rule is what makes the arithmetic checks portable: the
pilot's eleven closures, each hand-keyed to one game's case ids, become five
declarative assertions that run over any spec.

## Ownership

| Field | Owning agent | Required | What it is |
|---|---|---|---|
| `gamespec` | all | yes |  |
| `emitter` | 4 |  |  |
| `meta` | 1 | yes |  |
| `objectives` | 1 | yes | THE SPINE |
| `taxonomy` | 1 |  | Optional: a checklist the game teaches as a SET (the six internal-control activities; the three regression-validity criteria) |
| `modes` | 4 |  | Cross-cutting play modes (solo vs class-competition) |
| `knowledge` | 2 | yes | THE CHOKEPOINT |
| `scenario` | 3 |  | ENTIRELY OPTIONAL |
| `flow` | 4 | yes |  |
| `tree` | 2 |  | Optional logical rule set, reused by traverse steps AND by assurance assertions |
| `scoring` | 4 | yes |  |
| `feedback` | content -> 4, policy -> 6 | yes | Split into two objects so ownership is literally true |
| `scaffolding` | 6 |  |  |
| `assurance` | 5 | yes |  |
| `telemetry` | 6 |  |  |
| `presentation` | 4 | yes |  |
| `extensions` | 4 |  | THE ESCAPE HATCH |
| `assets` | 2 |  |  |
| `debrief` | 3 |  |  |
| `provenance` | all | yes | RECORDS STATE, NOT SIGNATURES |
## Derived fields — authoring these is an ERROR

- `objectives[].assessedBy` — which graded steps assess each objective
- `scoring.derivedCeilings` — the perfect-run score and meter values
- `debrief[].objectiveRollup` — what the student sees per objective at the end

## The interaction union

Twelve members, all with shipped renderers:

`mcq` · `multi-select` · `numeric` · `multi-blank` · `classify` · `select-from-set` ·
`traverse` · `sandbox` · `navigate` · `drag-to-target` · `narrative` · `extension`

`extension` is the escape hatch. Its rule: **a widget may hide how it draws; it may
never hide what it assesses.** Every extension declares a machine-checkable
`successCriterion` when it is an objective's sole assessor (P2b), a mandatory
`fallback` that is itself a valid step (X2), a `textAlternative`, and an honest
`fidelity` — a widget used by one game is `bespoke-pending-generalisation`, not
`registry-exact` (X6). The measured reuse factor across the current corpus is 1.0.

## Things the schema refuses to let you fake

- **A citation that does not exist.** `authority.kind` of `gaap-principle` or
  `professional-judgement` requires a `note`, because those have no citable
  Codification topic and forcing an ASC number onto them is fabricated precision.
- **An exemption without a declaration.** A dataset of `role: illustrative` requires
  `notDerivedFrom` and an on-screen `provenanceLabel`. A narrative number requires a
  declared relation, and an `approximately` relation must itself hold (C2c).
- **A claim about numbers that is not evaluated.** A prose quantifier over declared
  narrative numbers is checked: `within X` is a bound and must hold exactly, `off by X`
  is a stated measurement compared at its own precision (C2b).
- **A dead mechanic authored as if live.** Every optional mechanic declares `active` or
  `inert` in `flow.runtimeSemantics`. Authoring against an inert mechanic is a WARN, not
  an ERROR — deliberately, because the repo's cleanest game ships five
  `triggersEventId` values that no code reads, and an ERROR would make it unexpressible
  as a fixture.

## Reading the schema itself

`gamespec.schema.json` is the authority. It is JSON Schema draft 2020-12 with two
custom annotations, `x-agent` and `x-derived`, both consumed by
`framework/validate/lib.mjs`. Validate with:

```bash
node framework/validate/validate.mjs framework/corpus/accounting-case.spec.json
```
