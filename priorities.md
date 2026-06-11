# Priorities

Worked top to bottom under the autonomy policy in CLAUDE.md. Future
sessions: pick up at the first item not marked done.

## 1. [DONE 2026-06-11] Item effect schema: passives, Eternals, augments into the math

Done when: a typed, curated effect schema (`engine/fixtures/effects.json`)
encodes the mathematically tractable item passives, the 12 Eternal majors
plus unambiguous minors, and at least one hero's augments; the simulator
consumes them (on-hit procs, ability amps, cooldown modifiers); coverage is
reported, uncodable effects are listed as unmodeled rather than guessed;
harness green with new effect tests; design doc + lessons.md updated;
committed.

## 2. [DONE 2026-06-11] Match-feed aggregates: real gold curves and play rates

Done when: an ingest script aggregates a recent window of pvp+ranked
matches (timestamp-driven, polite rates) into a committed snapshot with
per-role gold-by-minute percentiles and per-hero item play rates (via the
game_id map); the placeholder gold values in calibration.json are replaced
by measured ones (levels stay provisional, they are not in the feed);
play rates are surfaced in the CLI for the off-meta gate; harness green
with aggregate sanity tests; design doc + lessons.md updated; committed.

## 3. CALIBRATION GATE (STOP) — checklist delivered 2026-06-11, awaiting measurements (engine/fixtures/CALIBRATION-CHECKLIST.md)

Stop here. Produce a practice-mode measurement checklist for the 6
unverified constants (mitigation, abilityHaste, critMultiplier,
attackSpeedFormula, abilityScalingUsesBonusPowerOnly, ultRankLevels) plus
the level-by-minute table. Deliver it to the maintainer and wait for
measured values. Do not estimate any of them (autonomy policy rule 2).

## Backlog after the gate (from docs/v5-engine-design.md, reprioritize then)

- Matchup checkpoint engine: kill windows at minute checkpoints using
  measured gold curves (design doc component E).
- Statistical evidence layer: hierarchical shrinkage over own aggregates,
  patch-partitioned (component D).
- Artifact generation pipeline + Zone 1 hero-page prototype (Concept A,
  section 8).
- LLM copy pass with ground-check verifier.
- Purchase-order optimization (gold-curve-aware item ordering).
