# Mechanics patterns — with the line numbers they came from

Every pattern here is in the corpus. Cited so you can read the original before reusing it.

## Scoring

| Model | Corpus source | The arithmetic |
|---|---|---|
| `weighted-cap` | `src/lib/utils/scoring.ts:9-10` | `earned = max(0, min(round(maxScore × weight), award))` |
| `flat-per-item` | `public/benford-law-game/index.html` | +25 per quiz item, +20 per case, denominator computed |
| `flat-penalty` | `public/cash-receipts-control-game/index.html` | +18 step, +12 briefing, −8 wrong; risk 0–100 starting at 22 |
| `checkpoint-binary` | `public/decision-tree-game/index.html:1360` | 13 idempotent flags, `round(n/13 × 100)` |
| `base-streak-speed` | `public/acc214-cost-estimation/index.html:251` | `base × (1 + min(streak,5) × 0.1)`, cap ×1.5, ×0.5 on retry, +4/s speed bonus under 25s in competition only |

**The trap.** `weighted-cap` silently truncates: `min(cap, award)`. If the best option
pays less than the cap, those points are unreachable and nothing says so at runtime.
Four stages of Month-End Close do exactly this, so a flawless run scores 75 of 100
against a passing mark of 70 while the README advertises 100%. Check S5 catches it in
a second; a read-through never will.

## Meters that are not the score

- **Trust** — Cost Estimation: starts 100, floor 20, −5 per hint, −12 per wrong answer,
  cashes out 1:1 into score at case end **in solo mode only**.
- **Risk** — Cash Receipts: starts 22, clamp 0–100, −6 correct, +14 wrong, three colour
  tiers. Never touches the grade.
- **Streak** — a multiplier input, not a score. Resets to 0 on any wrong answer.

Every meter must declare `affectsFinalGrade`. The Accounting Case runs an uncapped
formula for the live HUD (`src/lib/state/gameStore.ts:73`) and a capped one for the
grade (`src/lib/utils/scoring.ts:10`) over the same event; without the flag the runtime
cannot tell which number is the score. The emitter found this the hard way — its first
build credited a meter called `score` in a game that grades on `star`.

## Feedback

| Timing | Corpus source | When it fits |
|---|---|---|
| immediate, locked | Accounting Case, Benford | one-shot judgement items |
| immediate, retry until correct | Decision Tree, Cost Estimation | procedural skill, mastery |
| deferred on correct + **interstitial on wrong** | Cash Receipts | when the wrong answer has a story consequence worth dramatising |

**Per-option beats per-step, always.** One `explain` string shown after any answer tells
a student which answer was right and never what *their* error was. Benford does this
nine times; P8 names it.

**Consequence preview.** Cost Estimation flashes forward on a wrong forecast: *"By Q2,
Facilities is $1,900 over budget and corporate wants a memo with your name on it."*
Cheap to author, and it converts a wrong number into a professional consequence.

## Scaffolding

- **Hints keyed by persona** — `src/data/cases/month-end-close/stages.ts:54`: junior gets
  four, audit associate three, controller none, **by design**. A genuine adaptive
  mechanic, and the only one in the repo.
- **Hints with a declared price** — Cost Estimation charges 5 trust and halves the award.
  It announces the cost in competition mode and **not in solo**
  (`public/acc214-cost-estimation/index.html:819`), so solo players are never told hints
  cost anything. Declare `announceCost` either way.
- **Persistent reference panel** — the six-control legend, the water bill, the Excel
  regression output. Keep it on screen at every step that references it, not behind a menu.
- **Phase gating** — `unlock-plus-one` with free backtrack. Forces sequence without
  punishing revision.

## Distractors

A wrong numeric option needs a `misconceptionFormula` that produces it:

- *applied one month instead of the twelve-month catch-up* → `p.prepaidRemainingCoverage`
- *recognised the whole contract instead of one month* → `p.contractCount * p.contractAnnualValue`
- *variable rate wrongly doubled with volume* → `d.dover_rate_doubled`

Same number, different account (`Cr. Accounts Payable` versus `Cr. Accrued Liabilities`)
is a classification error, not an arithmetic one, and takes a `misconceptionTag` instead.
Check N5 only demands a formula when the distractor's number actually differs from the
correct answer's — otherwise it would fire on every well-designed classification item.

## Accessibility, as shipped by the runtime

A live region updated on every state change; correctness signalled by a glyph as well as
colour; real `<button>` elements with focus rings; a text alternative on every exhibit
and every extension; `prefers-reduced-motion` respected. Three of the five corpus
originals are canvas-first, which means none of this comes free — it is one of the
concrete reasons v1.0 pins `presentation.target: dom`.
