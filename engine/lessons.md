
## 2026-06-13: augment-as-playstyle — steer the build by lane, expose what the sim can't model
- The realisation from the Zinx test: an augment is a DECLARED PLAYSTYLE, and
  the lane selects which augment the field runs. The (hero × lane) → augment →
  winrate gradient is a signal the sim is blind to. Zinx's Terminal Treatment
  (on-hit) goes 49.2% in support → 53.5% in mid (n=48k); the sim, unable to
  model that augment, recommended the same ability-burst build in every lane.
- Use the augment as a CLASSIFIER, not as math. src/playstyle.ts classifies an
  augment into on-hit / ability-burst / sustain / tank / poke from the SAME
  curated text a human reads (effect kinds first, then a keyword scan of the
  fixture sourceText) — nothing invented; low-confidence reads steer nothing.
  Each playstyle maps to an objective corner; generateBuilds now accepts an
  objectiveBias + headlineOverride (optional, defaults unchanged) so a declared
  playstyle pulls the Pareto front toward its corner. Zinx-mid + Terminal
  Treatment flips from ability-burst to an on-hit/auto-DPS core (autoDPS
  100 → 1384) even though the augment's magnitude is never simulated.
- The point is to EXPOSE the gap, not hide it. `npm run answer` now prints a
  provenance block: which augment, the playstyle it implies, the lane field
  evidence (wr, n), and crucially whether the sim MODELS the augment or is only
  steering by playstyle + evidence ("magnitude not simulated"). The role keys
  protect against cross-contamination — an on-hit bias on a support search only
  touches objectives the support vector already scores, so the enchanter core
  is never hijacked.
- Pick the lane augment by SHRUNK winrate (empirical-Bayes toward 50%, K=400,
  200-game floor), tie-broken by play count — consistent with the maintainer's
  "surface the highest-winrate, not just most-played" rule.
- Also shipped `npm run explain`: leave-one-out attribution that justifies a
  fixed (field) build item-by-item from the modeled passives, and flags the
  items it can't justify (Cursed Ring) — the engine that proves "we can justify
  the top winning builds with reasoning."
