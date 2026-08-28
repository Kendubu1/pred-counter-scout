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

## 10. Augment coverage unlocks (agent-investigated 2026-06-13)

Sim-pick UX shipped same day (badge + agree/disagree/no-opinion verdict
lines + buildShift promoted). The engine unlocks, by expected coverage
gain over the 110 unmodeled augments: (1) parse the PASSIVE ability slot
in data.ts + add it to AbilityKey — reaches ~14 augments that target
hero passives already in the omeda snapshot; (2) a stated-uptime window
effect kind (uptime = duration / cooldown, both already in tooltips —
computed, not invented) — reaches the "while active" cluster (~6-8) and
is the same primitive Skylar's Assault MK-II needs (windowed on-hit
rider; its missile damage IS stated in Air Assault's own tooltip);
(3) heal_from_damage kind (~3-4). Economy/utility/team-side clusters
stay out of model scope, correctly. Also: ProcSpec wants dual-stat
scaling (AD and AP) for missile-type riders.

## 11. Item-effect coverage — ACTIVE PROCESS (kicked off 2026-06-13)

ROOT CAUSE of weird builds: the sim scored only 19 of 126 completed items
on their passive; the rest were flat-stats-only, so the optimizer
over-built the items it understood and could not justify a build against
the field.

ESTABLISHED METHOD (repeatable per batch):
1. Extract each item's FULL effect text INCLUDING the `condition` field
   (it holds thresholds/triggers the descriptions omit — Vanquisher's 5%
   execute, Malady's "below 40%", Lifebinder's "every 10% missing"); the
   earlier catalog read the wrong fields and wrongly flagged some uncodable.
2. Categorize into archetypes; most reuse existing kinds (on_hit,
   on_ability_hit for spellblades, damage_amp, armor_shred, shield_per_fight).
   New kinds added this session: ramp_to_stat (stacking stat), execute.
3. Encode from STATED numbers only; flag genuinely out-of-scope effects
   (ally shields, evolve/economy, unstated proc cadences, out-of-combat
   regen, positional auras) as unmodeled WITH a reason.
4. Ratchet: test/effects.test.ts asserts modeled item count only grows and
   every unmodeled entry states why. Regenerate artifacts+matrix, measure
   the optimizer-agrees-with-field rate.

PROGRESS: every completed-tier item now reviewed — 65 modeled · 61
honestly-unmodeled-with-reason · 0 untouched (the 2400g+ doc tier; 68
modeled across all 133 item entries). Counts climbed 19 → 27 → 36 → 68.
The reasoning breakdown is generated at `docs/item-effect-model.md`
(`npm run item-model`): for every item, base stats + each passive split
out (with its trigger condition) + the primitive it maps to + a plain
sentence on how it rolls into the sim. Last batch (2026-06-13) folded in
the rest of the tier from the omeda text (verified, not the stale agent
read): execute/finisher (Vanquisher kept, Malady honestly unmodeled —
sub-40% gated stacking proc), spellblades (Elafrost, Inquisition,
Oathkeeper-class), %max-HP procs (Mutilator, Infernum, Fist of Razuul),
percent-pen (Demolisher, The Perforator), anti-heal (Tainted Trident/
Bastion/Charm/Totem), ult-amps & ult-haste (Spear of Desolation, Overseer,
Tyranny, Warp Stream), conversions (World Breaker, Aegis of Agawar,
Mindrazor, Orion), ramp_to_stat (Dust Devil), per-level stat growth
(Orb of Enlightenment), proximity shred/amp auras (Citadel, Flux Matrix,
Manta Scythe isolated +10%), the Alternate-ability amp (Alternator), and
the camo-opener burst (Echelon Cloak). The 61 unmodeled are categorical
and stated: ally heals/shields, farming/evolve stacks, takedown-gated CD
refunds, enemy-shield-gated bonuses, target-mana-burn true damage,
defensive/incoming-mitigation, multi-target splash, and mobility-gated
cadences. Skylar's engine core now shares Plasma Blade + Vanquisher +
Imperator with the field staples (was diverging).

NEXT-STEP IDEA (maintainer 2026-06-13): a "why this meta build wins" panel —
leave-one-out attribution on the META build shown beside its real winrate,
so the sim explains the field's choice instead of running parallel to it;
also surface the highest-WINRATE build, not just most-played.
  ENGINE SHIPPED 2026-06-13: `npm run explain -- <hero> --items a,b,c [--role]`
  does the leave-one-out attribution and annotates each item with its modeled
  passive, flagging items it can't justify (e.g. Cursed Ring). Justifies
  Skylar's crit/execute core and Zinx's on-hit mid core item-by-item. STILL
  TODO: surface it on the hero page beside the field winrate.

## 10b. Augment-as-playstyle steer — ENGINE SHIPPED 2026-06-13

An augment is a declared playstyle; the lane selects it. src/playstyle.ts
classifies each augment (on-hit/ability-burst/sustain/tank/poke) from the
curated text, laneTopAugment picks the lane's winning augment (shrunk wr),
and generateBuilds takes an objectiveBias + headlineOverride so the build
steers to that playstyle's corner EVEN WHEN the augment's mechanic is
unmodeled. `npm run answer` prints provenance exposing whether the sim
models the augment or is steering by playstyle + field evidence. Proof:
Zinx-mid + Terminal Treatment (on-hit, unmodeled) flips ability-burst →
on-hit auto-DPS core; Disc of Demise (modeled) → burst. NEXT: wire the
steer + provenance into build-artifacts.ts so the hero page reflects it
per lane (regenerates artifacts); still worth doing item-10 #1 (parse the
PASSIVE slot) so on-hit augments like Terminal Treatment get true magnitude,
not just a playstyle steer.

## 12. Ranked-only augment/Eternal/crest evidence + ranked/standard split (backlogged 2026-06-26)

The hero-page field evidence (augment/Eternal/crest win% + game counts, e.g. "Lotus 55.7% ·
3,895 games") is pulled from pred.gg with gameModes [RANKED, STANDARD]
(engine/src/ingest/augments.ts:28,37), mixing ranked with normal-queue games. Maintainer wants
it MAINLY RANKED, plus a pull to understand the ranked/standard split first.

Needs PREDGG_CLIENT_ID/SECRET (cred-session — secrets are injected at session start; absent
2026-06-26). Steps: (1) augments.ts queries -> gameModes [RANKED]; before overwriting, print a
split report (standardN ~= old.n - ranked.n per pick, aggregate %, and how many Eternals/crests
fall under the page's 300-game floor when ranked-only). (2) npm run augments, then npm run
artifacts — predgg-augments.json also feeds artifacts.ts, playstyle.ts, augment-review.ts (the
copy pass). (3) relabel the hero page "by field winrate" -> "by ranked winrate"; from the split,
decide whether to lower the >=300 Eternal/crest threshold or fall back to ranked+standard for thin
picks. (Coach playerProfile.ts also blends modes — a separate decision.)

## 13. Community-gap review 2026-08-28 — findings and what is left

Done this session (see lessons.md for the mechanics): the catalog was two
patches stale and is now verified 1.16 (`npm run patchcheck`, standing gate),
Scarlett is onboarded with a declared field-data gap, 15 abilities stopped
silently serving pre-1.14 numbers, and the copy that had rotted against the new
catalog is re-grounded.

### Still open, in the order they cost us most

1. **CRED-GATED: the whole pred.gg field layer is on patch 1.15 (pulled
   2026-07-06).** Augment/Eternal win evidence, recommended skill orders and
   build statistics are seven weeks and two patches old, and 1.16 rebalanced
   augments directly (Scarlett's three new ones, plus nerfs to Tiny Titan and
   Focal Lens). The hero page LEADS with the augment choice, so this is the
   stalest thing a player actually reads. Needs PREDGG_CLIENT_ID/SECRET in a
   fresh session — the host is reachable, only the credentials are missing.
   Run: `npm run augments && npm run buildstats && npm run skills && npm run
   genstats`, then `npm run artifacts` and the copy passes. Do item 12
   (ranked-only evidence) in the same pass rather than pulling twice.

2. **The omeda match feed returned 503 all session**, so lane boards, matchup
   evidence, rank splits and the gold curves could not be re-measured. Two
   consequences are live on the site and labelled: the boards are a pre-1.16
   window, and spike minutes come from 1.15 gold curves that 1.16's economy
   rework invalidated. First job of the next session that finds the feed up:
   `npm run aggregate` -> `npm run artifacts` -> `npm run matrix`, then clear
   goldEconomyStaleAgainst in calibration.json.

3. **1.16 systemic changes the engine does not model at all.** Shrines (a new
   mini-objective granting permanent ability haste and tower true damage),
   teleporters live from minute zero, and never-expiring tower platings are
   map-and-economy mechanics with no representation in the kit-math model. We
   should not pretend to model them; the honest step is deciding whether the
   coach and lane copy should mention them as macro advice, which is where the
   community actually feels 1.16.

4. **Competitor read (predbuilds.com, pred.gg).** PredBuilds advertises 590.8K
   matches over 30 days with tier lists, ban votes, counters and builds. Our
   meta board is an 8,243-match, 36-hour window. Competing on win-rate boards
   is a losing trade and always will be: they have the sample and the refresh
   cadence. What neither of them does is the thing we already have — kit-math
   builds with per-item leave-one-out attribution (`npm run explain`), matchup
   checkpoints that say WHEN a lane is winnable rather than a single counter
   score, augment/Eternal sim-vs-field disagreement, and a stated confidence on
   every number. Recommendation: stop treating the meta board as a headline
   surface and lead with the explanation layer. Concretely, ship the panel that
   is already half-built — item 11's "why this meta build wins" is engine-done
   (`npm run explain`) and still not on the hero page.

5. **Scarlett needs a second pass once she has field data** — the declaration
   in data/aggregates/field-data-pending.json is the tracking record and clears
   itself when the pull lands.

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
now covers the sk-ant- prefix.

Eternal when/why lines (maintainer asked 2026-06-12): pipeline SHIPPED
same day — npm run review now also writes one grounded line per top
field Eternal per role (mechanics from the effect registry + field
evidence only, same numeric verifier; core factored into
src/copy-verify.ts with unit tests; hero page renders 🧠 on Eternal
rows when present). DONE in-session 2026-06-12 (maintainer: no API) — 284 Eternal lines written and machine-verified in-session, committed in augment-reviews.json; the keyed pipeline remains for unattended post-patch refreshes.

REMAINING: the original scope (hero-page coach lines + squad/coach
report copy through the same verifier).
