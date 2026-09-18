# Gates — what makes the sequence measurable

Every check in this framework is a predicate over the finished spec. A predicate over
a finished document is **order-invariant and author-invariant**: one agent that wrote
everything and then ran all six validator profiles passes exactly what a six-agent run
passes, and emits a byte-identical game. Six signatures on one final document cannot
tell those two apart.

Three mechanisms can.

## A. Record state, not signatures

`framework/ledger/gate.mjs open` snapshots the spec as an agent receives it.
`close` diffs the agent's work against that snapshot and records every changed field
path, with its **owner**. The ledger then prints one number: *fields that moved after
their owner's gate closed*. Near zero means the sequence is decorative. Large means the
loop is doing work. Either way it is measured, not asserted.

The signoff record deliberately does **not** constrain `errors` to zero. An audit trail
whose error field can only record success can never evidence that anyone caught
anything.

## B. Classify every check by arity

Arity = how many distinct field-owning agents a check reads.

- **arity 1 — lint.** Runs inside the owning agent's own gate. Must not be cited as
  evidence that the pipeline is load-bearing. 27 of 61 checks are here, including S5,
  which catches the pilot's flagship 75/100 defect using only agent 4's own fields.
- **arity ≥ 2 — cross-author.** Only these can catch what one author could not see.
  31 of 61. This is the framework's real claim, and it is smaller and truer than
  "six agents collaborate".

```bash
node framework/validate/validate.mjs --arity-histogram
```

## C. Information hiding

| Agent | Denied | Why |
|---|---|---|
| 1 | `flow`, `scoring`, `scaffolding`, `assurance`, `telemetry`, `extensions` | objectives commit before items exist, so P2/P3/P6 constrain agent 4 instead of describing it |
| 2 | `flow.steps`, `scoring`, `scaffolding`, `assurance`, `telemetry` | knowledge is authored for the topic, not fitted to the questions |
| 3 | `flow.steps`, `scoring`, `assurance`, `telemetry`; `knowledge.params` **as a manifest only** | C2a fires on real drift instead of being satisfied by copy-paste |
| 4 | `assurance.assertions` | the items are not written to pass a known test |
| 5 | `flow`, `interaction`, `scaffolding`, `telemetry` | the audit program is written before the sample is drawn |
| 6 | nothing | the only agent who can compare intent against artifact |

## Running a gate

```bash
node framework/ledger/gate.mjs open  spec.json --agent 3   # snapshot the view
# ... agent 3 works ...
node framework/ledger/gate.mjs close spec.json --agent 3   # validate, diff, record
node framework/ledger/gate.mjs report spec.json            # the yield ledger
```

`close` exits non-zero on an unaccepted ERROR, so a gate can hold a commit or a CI run.

## The ablation this is built to support

Same brief, four arms. **(A)** six agents, declared order, hiding on. **(B)** one agent
holding the whole schema and all six profiles. **(C)** six agents, scrambled order.
**(D)** six agents, full mutual visibility. Outcomes: first-pass ERROR count by check
family, cross-agent finding count, fields moved after signoff, blinded expert ratings,
and later student item statistics.

**If B ≈ A, publish that.** The honest claim then becomes "a role decomposition for
authoring tractability under a shared constraint set" — which is what the dependency
graph actually supports, and is still a real contribution.
