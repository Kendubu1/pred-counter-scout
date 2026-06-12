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

## 3. CALIBRATION GATE — checklist delivered 2026-06-11 (engine/fixtures/CALIBRATION-CHECKLIST.md); maintainer deferred measurements same day

Open until the maintainer measures. Per autonomy rule 2 the constants
stay unverified, every dependent output stays THEORY, and work continues
on items that do not require them. Re-check this gate each session.

## 4. [DONE 2026-06-11] Matchup checkpoint engine (includes purchase-order optimization)

Done when: builds get a gold-curve-aware purchase order with a measured
spike timeline (item completion minutes from the aggregate gold curves);
matchups are evaluated at the calibration checkpoints with both sides'
real base stats + build prefixes (kill-window ratios, per-phase verdicts
with drivers); levels-provisional and THEORY flags propagate to output;
CLI --vs <enemy>; harness green; design doc + lessons.md updated;
committed.

## 5. [DONE 2026-06-11] Statistical evidence layer v0

Done when: the aggregator records per-hero per-item win counts; shrunk
item-on-hero winrate deltas (empirical Bayes toward the hero-role mean)
are computable and surfaced as evidence (never a generator input); CLI
shows evidence next to play rates; harness green; docs updated; committed.

## 6. [DONE 2026-06-11] Artifact pipeline + Zone 1 hero-page prototype (Concept A, section 8)

Done when: a build step emits per-hero JSON artifacts (builds, eternals,
matchup checkpoints, off-meta proofs, confidence flags) and a static
prototype page renders The Answer zone from them.

## 7. [DONE 2026-06-12] Support output model

Done when: heal/shield amounts and ratios parse from ability text the way
damage does; the simulator gains heal/shield-output and utility objectives;
the dropped support stats (heal_shield_increase, gold_per_second, tenacity,
movement_speed) enter the item model; support-role generation optimizes the
support objective vector and the max-damage-only caveat comes off; golden
scenario: an enchanter support is never handed a crit/lethality core;
harness green; docs + lessons updated; committed.

Residual gaps, listed not guessed: heals delivered by hero passives are
outside the kit model (Phase is the big one), Narbash's toggle regen and
HealthText-scaled shields are skipped, output counts one beneficiary, and
CC/damage-reduction utility is unscored. All carried in the support
artifacts' confidence notes.

## 9. [DONE 2026-06-12] Hero augments — evidence + mechanics in the engine

Source: pred.gg perk system (slot HERO_SPECIFIC_1) + simpleBuild perk
statistics. Shipped: data/aggregates/predgg-augments.json (catalog with
mechanical descriptions + per-hero per-role augment AND Eternal win
evidence, real 5v5s only, npm run augments) and the hero page now leads
with the augment choice (role-aware via ?role=, journey-carried from the
lane room), with a sim-vs-field Eternal comparison line.

Engine half done 2026-06-12: all 156 rostered-hero augments curated into
engine/fixtures/augments.json (46 with typed ability-scoped effects, 110
unmodeled with stated reasons — coverage is a harness gate); the
simulator consumes per-ability amps/cooldowns/heals/shields; per-augment
build shifts ship in the artifacts (9 heroes diverge); Eternal rankings
run augment-aware where the field's top augment is modeled (16 heroes),
and the blanket 'augment-blind' caveat is retired. After a patch: rerun
npm run augments, then diff new catalog descriptions against the
fixture's sourceText (the fixture is hand-curated, not regenerated).

## Parked ideas (not yet scheduled)

- Comfort-vs-meta flex logic (parked by maintainer 2026-06-12): when a
  player's top hero is a low-meta pick, quantify when to keep it vs flex
  to a meta hero, and how to counter-pick around keeping it.

## 8. LLM copy pass — UNBLOCKED 2026-06-12 (maintainer supplied key); augment pass shipped

First pass shipped: npm run review (claude-haiku-4-5) writes one
grounded when/why line per augment per role from the catalog mechanics
+ field evidence ONLY; a verifier rejects any line whose numbers are
absent from the source cell (2 of 288 rejected). Output committed at
data/aggregates/augment-reviews.json; hero pages render the lines with
🧠 provenance. Key lives in env only — never committed; secrets grep
now covers the sk-ant- prefix. REMAINING: the original scope (hero-page
coach lines + squad/coach report copy through the same verifier), plus
Eternal when/why lines (maintainer asked 2026-06-12: the augment pass
covered augments only; Eternals have field evidence + sim deltas but no
grounded prose — same single-source prompt + numeric verifier shape).
