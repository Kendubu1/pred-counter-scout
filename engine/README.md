# pred-scout-engine

Kit-math build engine, the working implementation of `docs/v5-engine-design.md`.
Generates builds from ability ratios, cooldowns, base stats, and item stats.
No winrates anywhere in the objective. The v2 site and its data are untouched;
this runs alongside until it earns the cutover.

## Quick start

```bash
cd engine
npm install
npm test                      # Concept B harness gates (16 tests)
npm run answer -- gideon      # Pareto builds for a hero
npm run answer -- gideon --anti-heal --budget 12000
npm run probe                 # live check of omeda.city match-feed fields
npm run snapshot              # refresh data/omeda/ after a balance patch
```

## What exists (vertical slice, June 2026)

- `src/data.ts` loads all numbers (ability damage, cooldowns, costs, item
  stats) from the omeda snapshot, which tracks the live patch; owned data
  supplies curated profiles and last-resort fallbacks. Validation against
  the repo's own 1.14.4 digest showed the owned ability data carries
  pre-1.14 numbers (`npm run drift` for the report). Full 52-hero roster,
  including derived profiles for adele, legion, neon.
- `src/sim.ts` closed-form combat math: burst, rotation windows, auto DPS
  with attack speed and crit, mitigation vs reference profiles, mana
  feasibility from real base pools, effective HP. Every constant lives in
  `fixtures/calibration.json` with a `verified` flag; unverified constants
  are announced on every run and cap confidence at THEORY.
- `src/search.ts` beam search over the completed-item space, Pareto-filtered
  over six objectives. Scenario constraints (anti-heal requirement, gold
  budget, item families).
- `test/engine.test.ts` the Concept B gates: fixture checks, data joins,
  the Gideon worked-example regression, sanity invariants, golden scenarios.

## Known gaps (deliberate, tracked)

- Fixture constants are assumed, not measured: mitigation formula, crit
  multiplier, attack speed and haste formulas, ult rank levels. First
  practice-mode calibration session fills these.
- Item passives are not yet encoded (stats only). Effect schema is next.
- Checkpoint gold/level table is a placeholder pending match ingestion
  (`gold_earned_at_interval` confirmed available).
- Eternals and augments not yet scored (needs the effect schema).
- Purchase-order output is set order, not gold-curve-optimized yet.
- Heroes missing from owned data: adele, legion, neon.
