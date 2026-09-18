# framework/ — the six-agent pipeline, made executable

Nine games in this repo were built first and mapped to the MAAEGDE six-agent framework
afterwards. That mapping (`AI edu/AI Accounting Games - Framework Matching.xlsx`) is
real and useful, but a post-hoc mapping cannot demonstrate the framework's *generative*
claim. This directory closes that gap: a machine-readable spec the six agents hand
between them, a validator that gates each hand-off, and an emitter that turns a spec
into a playable game.

## What it claims — and what it does not

> A spec, a validator and an emitter reliably produce **a real but narrower class** of
> accounting educational games. The six-role decomposition is an **authoring-tractability
> and accountability device**, and its yield is *measured*, not asserted.

That is deliberately smaller than "AI designs games". Read `agents/GATES.md` for why:
every check here is a predicate over the finished spec, and a predicate over a finished
document cannot tell six authors from one. Three mechanisms make the sequence
measurable — gate snapshots with field-level deltas, check arity, and information
hiding — and all three can return a null result. The tooling prints that result
plainly when it happens.

## Layout

```
spec/       gamespec.schema.json   the hand-off contract (x-agent = one owner per field)
            SPEC.md                field-by-field, plus what the schema refuses to fake
agents/     01..06-*.md            the six agent briefs; binding, not background
            GATES.md               why each agent is denied what it is denied
patterns/   genres.md              six genre patterns, each with its corpus exemplar
            mechanics.md           scoring, meters, feedback, scaffolding, distractors
corpus/     *.spec.json            five existing games, reverse-engineered
            *.baseline.json        each one's real defects, accepted with a reason
            COVERAGE.md            what the reverse pass proves, and what it does not
validate/   validate.mjs           61 checks in 7 families; exit 1 on ERROR
            arity.mjs              which checks are lint and which are cross-author
emit/       build.mjs              spec -> one self-contained HTML file
            runtime/               the hand-written runtime, inlined at build time
            widgets/               the widget registry
ledger/     gate.mjs               open / close / report — the sequence made measurable
```

## Try it

```bash
node framework/validate/validate.mjs framework/corpus/accounting-case.spec.json
node framework/validate/validate.mjs --arity-histogram
node framework/emit/build.mjs framework/corpus/decision-tree.spec.json --out /tmp/dt
node framework/ledger/gate.mjs report framework/corpus/accounting-case.spec.json
```

To build a new game, use the `/create-game` skill, which runs the six agents in order
with their gates.

## What the reverse pass actually found

Five games expressed as GameSpec documents. All five clear; each carries a baseline
naming the original's defects. The five findings that matter:

1. **A false quantitative claim in the game about judging models.** Cost Estimation
   prints three quarterly actuals and states every quarter landed within ±2%; one is
   2.04% out. No read-through catches this.
2. **Every assessment in Cash Receipts is a coin flip.** All 24 items are binary and
   persona scoping means a player sees six — one per control activity.
3. **The pilot's 75/100 defect, rediscovered and reclassified.** Reproduced from a spec
   that never saw the pilot's code — *and* shown to be arity-1, i.e. the mechanics
   author's own lint, not an independent audit. The pilot's framing overstated it.
4. **Illustrative figures presented as if derived.** 40 observations shown beneath a
   10-row table with nothing saying they are illustrative.
5. **Learning objectives exist in none of the five games as data.** Present as intent
   everywhere, as data nowhere. Every objective in every fixture had to be
   reconstructed, and each fixture records that in `provenance.gates[1].note`. This is
   the clearest evidence the pipeline was never run: had agent 1 executed, its output
   would exist.

Full detail in `corpus/COVERAGE.md`.

## Verified end to end

Every fixture builds and was playtested headlessly in a browser, perfect and worst-case:

| Game | Perfect run | Correct | Note |
|---|---|---|---|
| ACC 214 Cost Estimation | 3386 / 3386 | 19/19 | |
| Accounting Case | **75 / 100** | 4/4 | the defect, end to end |
| Benford Audit Lab | 200 / 200 | 9/9 | |
| Cash Receipts | 102 / 102 | 6/6 | persona-scoped |
| Decision Tree | 13 / 13 | 13/13 | |

The Accounting Case row is the point. Every answer correct, still 75%, and the
generated game says so on its own debrief rather than repeating the README's claim that
a perfect run scores 100%.

## Honest scope

- **Four of nine games are not covered.** `acc214-course-review` (a timed conveyor
  arcade with pointer drag and a decaying combo meter) and `fraud-symptoms-roleplay`
  (a Three.js boardroom) are out of scope for v1.0 and say so in `meta.outOfScope`.
  Together they are the two largest games in the repo by bytes.
  `digital-signature-game` is already fully declarative and needs only the
  `drag-to-target` interaction; `audit-detective-game` is in scope and unwritten.
- **Visual fidelity is not preserved.** `presentation.target` is pinned to `dom`.
  Three of the five originals are canvas-first. The fixtures are test fixtures, not
  regeneration targets.
- **Widget reuse is 1.0.** Every extension in the corpus appears in exactly one game,
  so every one is labelled `bespoke-pending-generalisation`. The registry is a claim
  that is not yet earned, and X6 enforces the honest label.
- **No game has yet been built through the pipeline forward.** The corpus is a reverse
  pass. `agent56-pilot/README.md` wrote the prescription before this directory existed:
  *"build one new game through all six agents for the actual demonstration."* That is
  the next step, and the yield ledger is what will report whether it mattered.
