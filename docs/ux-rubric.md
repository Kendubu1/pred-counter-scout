# Predecessor Scout — pinned Senior-UX rubric (v0)

This is the **fixed target** the author and the independent judge both read. It does
not move under the generator. It is the "definition of done" for the v0 UX-review
loop (see `docs/agent-loops.md` → "UX v0 loop").

Goal, in the maintainer's words: a UI that **retains attention** and keeps users
engaged but is **not overwhelming/overstimulating**; **very clear**; **no
redundancy**; **minimal initial info with the rest available on demand**
(progressive disclosure); and lets a user **quickly action the best option**. The
homepage funnel leads with *who to pick / who counters the enemy*; the build is the
natural next step from that pick.

Each criterion is `[AUDIT]` (a deterministic check in `engine/src/ingest/ui-audit.ts`,
run with `UI_DIR=ui/v0`) or `[JUDGE]` (scored by `pred-scout-ux-judge` from the
rendered screenshots; drives `agreementRate`). When the judge repeatedly catches a
mechanically-checkable class, promote it to an `[AUDIT]` invariant — the bracket gets
stronger every loop (the repo's standing practice).

| # | Criterion | Type | How it is measured |
|---|-----------|------|--------------------|
| **R1** | **One dominant primary action above the fold**, pick/counter-first | AUDIT + JUDGE | AUDIT (`above-fold-primary`): on the landing page `#landMode`/`#search`/`#rolebar` precede `#metaboard` and `#heroGrid`, and those browse zones sit behind a `.browse-head` divider. JUDGE: at 390px it reads as one obvious thing to do, not several competing blocks. |
| **R2** | **Progressive disclosure** of secondary info | JUDGE (+ AUDIT reuse) | Secondary explainers (sim-math, minors, crest, scope, legends) live inside `<details>`/`.sim-collapse`; the landing does not paint the lane panel + meta board + full grid all expanded. JUDGE confirms nothing important is buried and nothing trivial is shouted. |
| **R3** | **No redundant legends/explanations** | AUDIT (hard) | `single-legend`: the win%-band + verdict-glossary legend appears **≤1× per page** (signatures `whether to pick it`, `52%+`); the THEORY definition (`not yet measured in-game`) appears **≤1×** — every badge routes through one canonical constant. |
| **R4** | **Attention without overstimulation** | AUDIT (hard) + JUDGE | `reduced-motion`: a page with transitions/animations must disable them under `@media (prefers-reduced-motion:reduce)`. JUDGE: the eye lands on one thing; accent colors/motion are not strobing. |
| **R5** | **Clarity / plain language** | JUDGE (+ `type-scale` AUDIT) | JUDGE flags jargon in primary copy ("out-simmed", "kill-window", "eHP", "checkpoints") and overlong sentences. The existing `type-scale` invariant keeps body/callout copy from being the largest text (inverted hierarchy reads as a wall of text). |
| **R6** | **Quickly action the best** | JUDGE (+ AUDIT reuse) | The best pick/counter is visually dominant; the build is one clear step beyond. Reuses the existing touch-target (≥40px) + no-overflow brackets so the primary CTA is tappable on phone. |
| **R7** | **Cross-page consistency** (constraint) | AUDIT (existing) | Reuse the v6 invariants — shared `:root` tokens, one container width, one breakpoint, base-reset parity, viewport meta, inline `node --check` — now run against v0. |

## The brackets (objective; a round only counts when these are green)

- `npm run ui:audit:v0` — exit 0 = all hard invariants pass (the 11 v6 families + the
  three v0-only ones: `single-legend`, `reduced-motion`, `above-fold-primary`).
- `npm run ui:render:v0` — exit 0 = no horizontal overflow on any phone surface
  (360/390px); writes screenshots to `docs/reviews/v0/shots/`.

There are no numbers to ground-check in UX copy, so these two ARE the objective
bracket. The judge's flag count never passes a surface that fails them.

## Convergence

`agreementRate = 1 − (judge flags / review units)`, units = surfaces × 6 criteria.
`LOOP_HISTORY=data/aggregates/ux-v0-history.json npm run review:loop:gate` (alias
`npm run ux:loop:gate`) STOPs at agreement ≥ 0.99, a clean round (0 flags), a no-op
round, a plateau (< 0.2pt gain), or 5 rounds — whichever comes first.

## Independence

The author (this session / `pred-scout-coach`) and the judge (`pred-scout-ux-judge`)
are **separate agents**. The judge reads the rendered surfaces cold and only
critiques; the author applies fixes. Never let the author grade its own work.
