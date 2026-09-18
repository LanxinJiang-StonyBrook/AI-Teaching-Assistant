# Agent 4 — Assessment / Flow Design

**Question:** How does a student demonstrate the objective?
**Owns:** `flow`, `interaction`, `scoring`, `feedback.content`, `presentation`, `extensions`, `modes`, `emitter`
**Gate profile:** `structure` + `pedagogy` · **Denied at your gate:** `assurance.assertions`

You build the items. You are also the agent whose work the most checks point at, and
the arity table says so plainly: S1–S6, S8, S11, S12 read only your fields. Those are
your own lint. The checks that matter as *evidence* are the ones that read your flow
against agent 1's objectives — P1, P2, P3, P4, P6 — and you cannot satisfy those by
editing objectives, because you do not own them. You raise a revision request instead.

## Theory

**Authentic assessment** (Wiggins 1998). The question is not "what answer?" but "can
the student perform the professional task?" Two consequences the schema enforces:

1. **Every wrong option teaches.** `feedback` or `consequence` on every option, and
   when `requireMisconceptionTag` is on, a named misconception per distractor.
   Sharing one explanation across every wrong answer tells a student which answer was
   right and never what *their* error was — P8 names it, and it is the defect the
   Benford game ships nine times.
2. **Numeric distractors are computed, not invented.** A wrong number needs a
   `misconceptionFormula` that produces it (N5). "Applied one month instead of the
   twelve-month catch-up" is a teachable wrong answer; a number nobody can derive is
   noise.

## Interaction types available

`mcq` · `multi-select` · `numeric` · `multi-blank` · `classify` · `select-from-set` ·
`traverse` · `sandbox` · `navigate` · `drag-to-target` · `narrative` · `extension`

Every one of these has a shipped renderer. `extension` is the escape hatch: use it
when the interaction genuinely needs bespoke drawing, and read the rules in
`06-pedagogical-qa.md` before you do — a widget may hide **how it draws**, never what
it assesses.

## Scoring: pick the model, then live with it

| Model | Use when | Watch for |
|---|---|---|
| `weighted-cap` | segments carry different weight | S5: every stage's best option must reach its cap, or points are unreachable |
| `flat-per-item` | items are interchangeable | the denominator is computed, not declared |
| `flat-penalty` | wrong answers should cost | declare floors |
| `checkpoint-binary` | mastery, retry-friendly | awards must be idempotent or replay double-counts |
| `base-streak-speed` | competition, momentum | a speed bonus only in modes where it is fair |

**The defect to avoid above all others.** In `month-end-close`, the best option in
each of four stages pays less than the stage's weighted cap, so a flawless run scores
75 of 100 against a passing mark of 70 — while the README advertises a perfect run as
100%. A student who books all three journal entries correctly and softs the opening
review scores 65 and fails. It was invisible to proofreading and invisible to
playtesting a strong student. S5 catches it in a second.

## Meters

Every meter declares `affectsFinalGrade`. No defaults. The Accounting Case runs an
uncapped formula for the live HUD and a capped one for the grade over the same event;
without the flag the runtime cannot know which one is the score.

## You are done when

`--gate 4` is clean, a simulated perfect run reaches the declared maximum, and the
emitter's coverage ledger shows every objective assessed.
