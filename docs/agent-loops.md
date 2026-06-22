# Agent loops: plan → build → judge (the repo's self-correcting pattern)

> "The winners won't have the smartest model, they'll have the best loop."

Every non-trivial generated artifact in this repo is produced by a **loop of
agents**, not a single prompt. One agent proposes, a second *independent* agent
judges, deterministic code brackets both so neither can lie about numbers, and a
**convergence gate** decides when to stop. This doc is the reusable recipe — the
abstract pattern, the concrete instances we already run, and how to wire a new one.

It exists so the next loop we add doesn't reinvent the orchestration, the honesty
bracket, or the stop condition.

## The pattern

```
                  ┌──────────────────────────────────────────────┐
                  │                                              │
   PLAN ──▶  BUILD (author) ──▶ [deterministic bracket] ──▶ JUDGE (critic) ──▶ GATE
  (grounded     pred-scout-coach     copy-verify.ts          independent agent    converged?
   task spec)   writes the copy      drops ungrounded        flags wrong/         ├─ no ─┘ (loop)
                                     numbers                 misleading/jargon    └─ yes ─▶ ship
```

Four roles, and the discipline is that they stay **separate**:

1. **Plan** — a *deterministic* step emits a grounded task: the exact source data
   the author is allowed to use (kit text, item stats/effects, the player's real
   numbers) plus the precise output shape. Planning is code, not a model, so the
   author can never be grounded in something we didn't hand it. See
   `engine/src/copy-session.ts` (`COPY_MODE=prepare` records prompts to
   `copy-tasks/<pass>.tasks.json`).

2. **Build / author** — the in-session `pred-scout-coach` agent
   (`.claude/agents/pred-scout-coach.md`) writes the copy from the task, using full
   game knowledge but only the numbers in the task's data block. It is the
   *optimist*: it writes the best advice it can.

3. **Deterministic bracket** — `engine/src/copy-verify.ts` ground-checks every line
   and drops any that cites a number absent from its source cell. **Honesty is
   enforced by code, not by trusting the model.** This is the "compiler" of the
   loop: it turns "the model said so" into "the source supports it." It runs after
   the author *and* after every applied judge rewrite.

4. **Judge / critic** — a **fresh, independent** agent that did NOT author the copy
   (a `general-purpose` subagent, deliberately not `pred-scout-coach`) reviews each
   line against the same source and flags only real problems: wrong item/ability,
   factually wrong vs source, overconfident/misleading, jargon, or broken English.
   It proposes a rewrite; the rewrite is itself put through the deterministic
   bracket before it's applied. The critic is the *skeptic*. Independence is the
   whole point — an author grading its own work agrees with itself.

5. **Gate** — `engine/src/ingest/loop-gate.ts` reads the round history and decides
   CONTINUE or STOP, deterministically, so the loop has a terminal state the
   orchestrator can trust (see "Convergence" below).

### Why independence matters

`copy-verify` catches fabricated *numbers* but not a *wrong claim made with real
numbers*. The classic catch: "Viper adds more armor and staying power" — every
number in the sentence was real, but Viper grants attack speed / power / pen /
armor-shred, **no armor or health**. Only an independent reader checking the claim
against the item text caught it (wrong across ~20 heroes). The author won't catch
its own framing; the verifier can't see semantics. The judge closes that gap.

## Convergence (the stop condition)

A loop without a terminal state runs forever or stops arbitrarily. Each judge round
appends `{ round, agreementRate, flaggedLines, applied }` to
`data/aggregates/copy-critique-history.json`. `npm run review:loop:gate` STOPs on
the first of:

| Condition    | Meaning                                            | Default      |
|--------------|----------------------------------------------------|--------------|
| target met   | `agreementRate >= TARGET`                           | `0.99`       |
| clean round  | judge flagged nothing                               | —            |
| no-op round  | judge flagged, but `applied == 0` (nothing new)     | —            |
| plateau      | gain over previous round `< EPSILON`                | `0.002`      |
| max rounds   | `round >= MAX_ROUNDS`                               | `5`          |

Otherwise: CONTINUE. Exit code `0` = STOP, `10` = CONTINUE (so a shell `until`
loop or the orchestrating agent can branch on it). Thresholds override via env:
`LOOP_TARGET`, `LOOP_EPSILON`, `LOOP_MAX_ROUNDS`, `LOOP_HISTORY` — the gate is
generic, so a different loop can point it at a different history file.

`agreementRate = 1 − flaggedLines / reviewedLines`. It rises as corrections
converge: our copy loop went 94.8% → 98.4% over two rounds; the gate stops it at
≥99% or when a round stops improving it.

## Running the copy loop

```bash
cd engine
# one round = these four steps:
npm run review:critique:prepare       # PLAN: emit critique tasks (zero-API)
#   → dispatch the INDEPENDENT critic subagent to fill
#     copy-tasks/critique.responses.json (general-purpose, NOT pred-scout-coach)
npm run review:critique               # JUDGE+APPLY: ground-check rewrites, apply,
#                                       record the round in copy-critique-history.json
npm run review:loop:gate              # GATE: CONTINUE (exit 10) or STOP (exit 0)
# repeat until STOP. Then commit on green (npm test).
```

The author step (regenerating the build/coach copy itself) is the matching
`copy:prepare` → `pred-scout-coach` → `copy:ingest` chain; the critique loop runs
*on top of* whatever the author last produced.

> The subagent dispatch (build, judge) is driven by the orchestrating session — it
> is not a pure shell script, because spawning a fresh independent agent is the
> session's job. Everything *around* the agent (plan, bracket, apply, gate) is
> deterministic and scripted. That split is intentional: the parts that must be
> trustworthy are code; only the creative parts are the model.

## Reusing the pattern for a new loop

To add a self-correcting loop for a new artifact:

1. **Plan deterministically.** Emit a grounded task per unit of work via
   `copy-session.ts` (`ask(pass, id, prompt)` + `flushTasks(pass)` under
   `COPY_MODE=prepare`). The prompt must carry its own source data and exact output
   shape — the author gets nothing else.
2. **Bracket with `copy-verify`.** Build the allowed-number set from the source
   (`buildAllowed`), and gate every authored line and every judge rewrite through
   `verifyLine`. If a generated artifact has no numbers to check, give the bracket
   *something* objective to enforce (an enum, a name that must exist in the source) —
   never ship a loop whose only check is "the model agreed with itself."
3. **Author with `pred-scout-coach`**, judge with a **separate** agent. Never let
   the same agent do both.
4. **Record + gate.** Append each round to a history file and reuse
   `loop-gate.ts` (point `LOOP_HISTORY` at it). Pick a target and a plateau epsilon;
   always set a max-rounds guard.
5. **Definition of done** (matches `CLAUDE.md` autonomy policy): harness green,
   design/loop doc updated, `lessons.md` updated, committed on green.

## The loops we run today

| Loop | Plan | Author (build) | Judge | Bracket | Gate / history |
|------|------|----------------|-------|---------|----------------|
| **Build copy** | `build-review.ts` prepare | `pred-scout-coach` | `copy-critique.ts` independent critic | `copy-verify` per clause | `review:loop:gate` over `copy-critique-history.json` |
| **Coach copy** | `coach-review.ts` prepare | `pred-scout-coach` | same critic, grounded on player stats | `copy-verify` | same history |
| **Augments / items / abilities** | `*-review.ts` prepare | `pred-scout-coach` | (number bracket only today; critic-extensible) | `copy-verify` | — |
| **v6 review report** | the review plan | first-pass author agent | fresh clean-room subagent (hadn't seen conclusions) | citation spot-check | one-shot reconcile, not iterated |

The v6 review (a one-off doc, not a regenerated artifact) used the **same
discipline** — author then independent clean-room judge, reconciling disagreements
rather than papering over them — without the iteration loop. The pattern scales
down to a single pass and up to a convergent loop.

## Provenance & honesty notes

- **No `ANTHROPIC_API_KEY`.** Every author/judge step runs on in-session Claude Code
  compute (per `CLAUDE.md`). The bracket (`copy-verify`) is unchanged from the old
  API path, so the honesty bar is identical.
- **Reversible.** Applied rewrites patch the artifact in place but the full audit —
  every flag, its issue, and the action taken — is written to
  `data/aggregates/copy-critique.json`, and everything is under git. The
  `agreementRate` there answers "how confident is the copy."
- **The judge can be wrong too.** A rewrite is applied only if it survives the
  deterministic bracket; an unmatched/paraphrased quote simply no-ops (counted as
  `unmatched`, never silently mutating the wrong line).
