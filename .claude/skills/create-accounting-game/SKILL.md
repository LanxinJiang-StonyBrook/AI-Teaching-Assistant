---
name: create-accounting-game
description: Build a new accounting educational game through the six-agent MAAEGDE pipeline — learning design, gamification, scenario, assessment, accounting assurance, pedagogical QA — producing a validated GameSpec and one self-contained HTML game. Use when the user wants to create a new teaching game, add a chapter to an existing course game, or run any part of the MAAEGDE pipeline. Triggers on create game, new game, build a game, 做一个游戏, 出一个新游戏, MAAEGDE, GameSpec.
---

# /create-game — six agents, one accounting educational game

## What this produces

1. `framework/corpus/<id>.spec.json` — a validated GameSpec, the hand-off contract.
2. `public/<id>/index.html` — one self-contained HTML game, no build, no network.
3. `framework/ledger/gates/<id>-gate*.json` + `provenance` — the evidence of what
   each agent actually caught.

## Before you start — the honest framing

Read `framework/agents/GATES.md`. The short version: every validator check is a
predicate over the finished spec, so most of them cannot distinguish six agents from
one. What can distinguish them is **state**: which fields moved after their owner
signed off, and which findings read across two agents' field sets. Run the gates
properly or the demonstration proves nothing.

## Step 0 — scope it with the user

Ask, in one round, only what you cannot infer:

- **Course and chapter**, and whether the game is *first contact* or *review*. This
  sets `meta.audience` and `objectives[].assumesPriorInstruction`, and it is the one
  answer that changes everything downstream.
- **Source material** — slides, a textbook chapter, a dataset. Pin it. "Chapter 3
  slides" with no archived copy is a real gap two existing games have.
- **Roughly how long** a student should spend.

Do not ask what genre it should be. That is agent 2's call, made from the objectives.

## Step 1 — seed the spec

Create `framework/corpus/<id>.spec.json` with `gamespec`, an empty `meta`, and
`provenance: {"gates": []}`. Nothing else. Each agent adds its own section.

## Step 2 — run the six agents in order

For each N from 1 to 6:

```bash
node framework/ledger/gate.mjs open <spec> --agent N
```

Then launch the subagent `game-agent-N-<slug>` with: the path to the spec, the path
to its gate snapshot, the user's brief, and the instruction to read
`framework/agents/0N-<slug>.md` first. **Do not run them in parallel.** The sequence
is the artifact under test.

When the subagent returns:

```bash
node framework/validate/validate.mjs <spec> --gate N
node framework/ledger/gate.mjs close <spec> --agent N
```

`close` exits non-zero on an unaccepted ERROR. Do not paper over it — hand the finding
back to the agent that owns the field, as a `revisionRequests` entry, and re-run that
agent's gate. **A revision that crosses back to an earlier agent is the loop working;
record it rather than quietly fixing the field yourself.**

Checks P2, P3, P4 and P6 cannot pass before agent 4 exists. That is expected: they are
agent 1's contract with agent 4, not agent 1's homework.

## Step 3 — build and playtest

```bash
node framework/validate/validate.mjs <spec>          # all 61 checks, must clear
node framework/emit/build.mjs <spec> --out public/<id>
```

Read the coverage ledger the build prints. Then playtest it headlessly — the runtime
ships the instrument:

```js
window.probe_autoplay({ perfect: true })   // must reach the derived ceiling
window.probe_autoplay({ perfect: false })  // must terminate, not loop
```

Serve `.claude/launch.json`'s `gamespec-preview` config and drive it in the browser
pane. A perfect run that scores less than the ceiling means the scoring partition is
broken — that is exactly the defect that makes a flawless Month-End Close run score 75
of 100 while its README advertises 100%.

## Step 4 — register the game

A new game is not shipped until it is findable:

- `public/repository.html` — add an `<article class="game-tile" data-categories="…">`
  using the existing taxonomy: `intro intermediate advanced auditing analytics
  security controls fraud managerial`.
- `README.md` — both tables (live links, and games-in-this-repo).
- `scripts/build-pages.mjs` — add the folder to `dropFromExport` so the Next.js
  static export does not duplicate it.

## Step 5 — the yield ledger

```bash
node framework/ledger/gate.mjs report <spec>
```

Report the numbers as they come out. If no field moved after its owner signed off, say
so: on that build the sequence was not load-bearing, and one agent with the whole
schema would have produced the same artifact. That is a publishable finding.

## Partial runs

The user may want one stage, not all six. `--agent N` on both gate commands works
standalone, and the agent briefs stand alone. Say plainly which stages ran.

## What to refuse

- **A signed attestation.** `assurance.attestation.signed` stays false until a human
  with the credential has read the graded answers against the standards edition. Only
  a person can confirm a cited standard says what an answer claims.
- **Fabricated authority.** If an answer rests on the accrual basis and has no citable
  Codification topic, the kind is `gaap-principle` with a note. Inventing an ASC number
  is the failure the assurance agent exists to prevent.
- **Lowering a threshold to pass a check.** Raising `maxChanceScore` because the items
  turned out binary, or cutting `minGradedItems` because only one item got written, is
  satisfying the check by declaration. Fix the items or record the finding.
