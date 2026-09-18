# Corpus coverage — what the reverse pass proves, and what it does not

Five of the repo's nine games are expressed as GameSpec documents here. **They are
test fixtures, not regeneration targets.** The framework does not promise to rebuild
the existing games; it promises that a schema able to express them is able to govern
new ones.

Run them all:

```bash
for f in framework/corpus/*.spec.json; do node framework/validate/validate.mjs "$f"; done
```

All five clear. Each carries a `.baseline.json` enumerating the original game's real
defects with a reason; anything **not** in a baseline is a regression.

---

## What each fixture contributes to the schema

| Fixture | Scoring model | Interactions exercised | What only this one forced |
|---|---|---|---|
| `decision-tree` | `checkpoint-binary` | mcq, traverse, narrative | `assurance.notApplicable` — the boundary case with no accounting content at all |
| `accounting-case` | `weighted-cap` | mcq | `authority.kind: gaap-principle` with a mandatory note; distractor artifacts |
| `cash-receipts` | `flat-penalty` | mcq, navigate | split feedback timing; a non-grading meter; a deliberately unscored layer |
| `benford` | `flat-per-item` | mcq, sandbox | the seeded generator; two chart widgets with narrative fallbacks |
| `acc214-cost-estimation` | `base-streak-speed` | mcq, numeric, multi-blank, classify, select-from-set, extension, narrative | `modes[]`; a meter with a payout rule; checked prose quantifiers |

Five scoring models, nine of the twelve interaction types. The three not exercised —
`multi-select`, `drag-to-target`, `traverse` beyond one fixture — are implemented in
the emitter and covered by its own tests.

---

## The yield: what the reverse pass found

Every finding below is a property of the **original artifact**, not of the fixture.

### 1. A false quantitative claim, in the game about judging models
`acc214-cost-estimation/index.html:769-772` shows three quarterly actuals against a
predicted $41,730 and states "Every quarter lands within ±2% of the model." Q3's
$40,880 is **2.04%** below $41,729.72. Caught by `C2b`, which evaluates a prose
quantifier over the numbers it ranges across. `within` is a bound and must hold
exactly; `off by` is a stated measurement and is compared at its own precision.

### 2. Every assessment in Cash Receipts is a coin flip
All 24 authored questions are binary, and `personaScope` means one player answers six
of them — so each of the six control activities is assessed by **one two-option item**.
Caught by `P6` once it was made persona-aware: a game whose four roles are four
separate runs does not get to multiply its guessing odds across roles nobody plays.

### 3. The pilot's 75/100 defect, rediscovered — and honestly reclassified
`S5` reproduces `agent56-pilot`'s finding that a flawless Month-End Close run scores
75 against a `passingScore` of 70 while the README advertises 100%. **But its arity is
1**: every field it reads belongs to agent 4. It is the mechanics author's own lint,
not an independent audit, and the pilot's framing of it as an Agent 5 catch overstates
the claim. See `framework/validate/arity.mjs`.

### 4. Illustrative figures presented as if derived
`decision-tree-game/index.html:1397-1416` shows branch counts totalling 40 observations
directly beneath a 10-row training table, with nothing on screen saying they are
illustrative. `N4` refuses `role: illustrative` unless the spec also declares
`notDerivedFrom` and a `provenanceLabel` the emitter renders.

### 5. Content authored against a dead runtime
`src/lib/types/case.ts:27` declares `triggersEventId`; five choices author it; and
`useGame.ts` dispatches only `on-stage-enter`, so those events never fire. `S10`
reports it as a WARN once the spec declares `interrupts: inert`. It is deliberately not
an ERROR — an ERROR would make the repo's cleanest game unexpressible.

### 6. Learning objectives exist in none of the five games as data
Present as intent in all five, as data in none. In Benford they are stated only in the
final debrief; in Cost Estimation only as narrator lines. Every objective in every
fixture had to be **reconstructed**, and each fixture's `provenance.gates[1].note`
records that. This is the single clearest evidence that the six-step pipeline was never
run: had Agent 1 executed, its output would exist.

---

## What this does not cover

- **Four of nine games.** `acc214-course-review` (a timed conveyor arcade with
  pointer drag and a decaying combo meter) and `fraud-symptoms-roleplay` (a Three.js
  boardroom) are **out of scope for v1.0** and say so in their absence. Together they
  are the two largest games in the repo by bytes. `audit-detective-game` and
  `digital-signature-game` are in scope and not yet written; digital-signature is
  already fully declarative and needs only the `drag-to-target` interaction.
- **Visual fidelity.** Every fixture targets `presentation.target: dom`. Three of the
  five originals are canvas-first. Regenerating them would change how they look.
- **Widget reuse.** Every extension in the corpus is
  `bespoke-pending-generalisation`, because the measured reuse factor across the corpus
  is **1.0** — each widget appears in exactly one game. `X6` refuses the label
  `registry-exact` until a second game uses it.
