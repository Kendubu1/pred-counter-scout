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
| **Mobile UI review** | `ui-audit.ts` (consistency facts + findings) | the CSS fix author | independent mobile-UI judge over rendered screenshots | `ui-audit` hard invariants + `ui-render` no-overflow | `review:loop:gate` over `ui-review-history.json` |
| **UX v0 (Senior-UX)** | `ux:critique:prepare` (rubric + per-surface shots) | the page author (session / `pred-scout-coach`) | `pred-scout-ux-judge`, independent, over `docs/reviews/v0/shots` | `ui-audit:v0` hard invariants (incl. `single-legend` / `reduced-motion` / `above-fold-primary`) + `ui-render:v0` no-overflow | `ux:loop:gate` over `ux-v0-history.json` |
| **v6 review report** | the review plan | first-pass author agent | fresh clean-room subagent (hadn't seen conclusions) | citation spot-check | one-shot reconcile, not iterated |

The v6 review (a one-off doc, not a regenerated artifact) used the **same
discipline** — author then independent clean-room judge, reconciling disagreements
rather than papering over them — without the iteration loop. The pattern scales
down to a single pass and up to a convergent loop.

## Case study: the mobile UI review loop

The same pattern applied to a non-copy artifact — the v6 UI's mobile consistency —
shows how to bracket a domain where the "honesty check" isn't about numbers.

- **Plan / grounding** — `engine/src/ingest/ui-audit.ts` (`npm run ui:audit`) parses
  the three v6 pages and emits objective consistency facts + findings: shared design
  tokens, one container width (`--maxw`), one breakpoint scheme, base-reset parity, a
  readable mobile body font, and touch-target sizing (rubric grounded in WCAG 2.5.8 /
  Apple HIG 44pt / Material 48dp — see the rubric block in that file).
- **Deterministic bracket** — two checks gate any authored fix, the way `copy-verify`
  gates a rewrite: `ui:audit` **hard invariants** must pass (token drift, container
  width, viewport, inline-script `node --check`) and `ui:render` (Playwright, serves
  the repo and loads four surfaces at 360/390/1024px) must report **no horizontal
  overflow** on phone. A fix that breaks either isn't a fix.
- **Author** — applies the CSS/markup changes (shared `--maxw` token, unified mobile
  body font, one shared 44px tap-target list, reset parity).
- **Judge** — an **independent** mobile-UI subagent reads the rendered screenshots
  (`docs/reviews/v6/shots/`) and flags what the static audit *cannot see*: a control
  comfortably tappable on one page but cramped on another, sub-11px labels, lost
  hierarchy, density that tipped into overcrowding. Its flag count is the convergence
  signal (`agreementRate = 1 − judgeFlags / REVIEW_UNITS`).
- **Gate** — `LOOP_HISTORY=data/aggregates/ui-review-history.json npm run review:loop:gate`.

The key lesson, again, is the division of labour: the bracket proves the page is
*objectively* consistent and doesn't overflow; the independent judge proves it's
*actually* clean to a human on a phone. When the judge catches a class of problem the
audit missed (here: the same control type getting different tap treatment across
pages), you **harden the audit** to encode it (the `touch-consistency` and `pill-font`
checks were added from judge feedback) — so the bracket gets stronger every loop and
that regression can't return silently.

### What the first loop missed (and how it was closed)

After the loop converged, the maintainer found the Sim Build tip (`.coach`) rendering
oversized — it was `1.04rem`, the *largest* body text on the hero page, an inverted
hierarchy that reads as "so much text." Two blind spots let it through, each now fixed:

1. **The audit checked structure, not type scale.** It verified tokens, widths,
   breakpoints, touch targets, overflow — but never that body/callout copy stays
   *below* the heading scale. Added the `type-scale` check: any non-heading text
   selector over `1rem` (outside a short allowlist of numbers/one-line callouts) is
   flagged. That check fires on the old `1.04rem` value, so this class of defect
   can't return silently.
2. **The judge reviewed downscaled full-page screenshots of one hero (Countess).** A
   single oversized paragraph is invisible in a 6000px-tall shot scaled to fit, and
   the tip wasn't on the surface rendered. `ui-render` now also renders the
   maintainer's actual example (Sparrow) and captures **real-scale** above-the-fold
   *and element-level* shots (e.g. `*-simtip.png` of the `.coach` block), so the
   judge sees typographic detail at 1:1.

The general lesson: a judge is only as good as what it can see, and a bracket only
catches what it measures. When something slips through, fix the artifact, then widen
*both* — encode the missed invariant in the bracket and give the judge a sharper
view — so the same gap can't recur.

## Case study: the v0 Senior-UX loop

The same machinery, pointed at the `ui/v0` staging homepage with a pinned Senior-UX
rubric (`docs/ux-rubric.md`). `ui-audit.ts`/`ui-render.ts` take `UI_DIR` so the frozen
v6 keeps its exact contract (still 100%) while v0 is audited separately and gains three
new HARD invariants (`single-legend`, `reduced-motion`, `above-fold-primary`). The audit
caught the homepage's three duplicated win%/verdict legends + a duplicated THEORY
definition on the first run; they were collapsed into one shared `#uxLegend` and one
`THEORY_DEF` constant. Trajectory: **round 1 66.7% → round 2 94.4%**.

Two lessons specific to a vision judge:

- **Ground-check the judge.** `pred-scout-ux-judge` reads *screenshots*, so its quotes
  can be misreads. Round 1 it flagged a verdict "not in the rain" that exists nowhere in
  the repo (a misread of the on-screen "Situational:"). The author rejected it after a
  `grep` — a flag is only actioned if its quote is real. This is the image-loop analog of
  `copy-verify` dropping an ungrounded number.
- **Know the scope boundary.** The judge also flagged genuinely dense augment-verdict copy
  ("takedown-conditional pool sustain"), but that is *data-driven* copy from
  `data/artifacts/*.json` — owned by the copy loop, not editable in the page. The HTML UX
  loop fixes layout/structure/static copy; data-derived copy is handed to the copy loop.
  The residual 94.4% is that one out-of-scope flag, logged rather than force-fixed.

Gate note: in a loop where the author applies fixes *between* judge rounds, round 1 records
`applied=0` (the fixes come after), which trips the gate's premature "no-op STOP". Pass
`FIXES_APPLIED` on the round the fixes land so the trajectory is honest.

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
