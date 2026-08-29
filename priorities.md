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

## 10b. Augment-as-playstyle steer — ENGINE SHIPPED 2026-06-13; PAGE SHIPPED 2026-08-29

An augment is a declared playstyle; the lane selects it. src/playstyle.ts
classifies each augment (on-hit/ability-burst/sustain/tank/poke) from the
curated text, laneTopAugment picks the lane's winning augment (shrunk wr),
and generateBuilds takes an objectiveBias + headlineOverride so the build
steers to that playstyle's corner EVEN WHEN the augment's mechanic is
unmodeled. `npm run answer` prints provenance exposing whether the sim
models the augment or is steering by playstyle + field evidence. Proof:
Zinx-mid + Terminal Treatment (on-hit, unmodeled) flips ability-burst →
on-hit auto-DPS core; Disc of Demise (modeled) → burst. DONE 2026-08-29: the artifacts already carried
`laneSteer` (per role view) and `laneFlex` (per lane) with the honest
provenance string — 67 of 83 role views have a steer, 25 of them modeled — but
the hero page never rendered either (the CSS shipped, the renderer never did).
ui/v6/index.html now renders the active lane's steer beside the kit-math build:
the augment the field takes there, its playstyle in plain words, an "in our
math" / "playstyle steer only" pill, the field win rate, and the exact items
the steer would add and drop. Switching flex role re-renders it for that lane;
the 5 heroes with no augment evidence (gadget, neon, serath, wraith, wukong)
degrade to nothing. Still worth doing item-10 #1 (parse the PASSIVE slot) so
on-hit augments like Terminal Treatment get true magnitude, not just a
playstyle steer.

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

1. **PERMISSION-GATED (was cred-gated; creds arrived 2026-08-29): augment and
   build field evidence still on patch 1.15.** The maintainer's pred.gg app
   authenticates (scope `profile offline_access`, roles []) and that tier CAN
   read generalStatistic, recommendedSkills, player profiles/matches and the
   leaderboard — all refreshed 2026-08-29 — but `simpleBuild` (augment/Eternal/
   crest win evidence) and `coreBuild` (build statistics) return **Forbidden**.
   Those two fields went behind an auth wall ~2026-08-07 and evidently need a
   higher app tier / stats permission on the pred.gg application, not just any
   token. FIX: in the pred.gg developer portal, enable the stats/build
   permissions for the app (or ask pred.gg for the tier), then re-run
   `RANKED_ONLY=1 npm run augments` (item 12's ranked-only switch plus its
   split report is ALREADY WIRED — one aliased pull produces both) and
   `npm run buildstats`, then `npm run artifacts` + the copy passes, and
   relabel the hero page "by field winrate" -> "by ranked winrate".

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
   itself when the pull lands. 2026-08-29: skill order and ability tips landed;
   the two remaining gaps are exactly the Forbidden endpoints in (1).

## 14. [SHIPPED 2026-08-29] Squad postgame coach automation

When anyone in the 5-stack finishes a game, the coach pipeline runs unasked.
`npm run squad:watch` (engine/src/ingest/squad-watch.ts) is the detector: one
aliased pred.gg call for all five members, committed high-water mark in
data/postgame/watch-state.json, 5-stack dedupe by match uuid, exit code 3 =
new matches. An hourly Routine ("Squad postgame coach",
trig_01TiC3a86t8U37gebvZdQnuM) fires a fresh session that follows
docs/coach-automation.md: postgame facts -> enrichment -> session-compute
coaching narrative -> critic loop -> coach + squad refresh -> harness ->
data-only commit to main. DEPENDENCY: the execution environment must carry
PREDGG_CLIENT_ID/SECRET as secrets; until then every fire exits loudly at the
credentials gate (watcher exit 2), by design.

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
report copy through the same verifier). **DONE 2026-08-29** — both halves
shipped through plan -> author -> verify -> independent judge -> gate:

- **Hero-page coach lines.** New pass `npm run review:herocoach`
  (src/hero-coach-copy.ts builds the facts block, ingest/hero-coach-review.ts
  runs it) replaces the templated `coachLine` with an action-first line plus one
  blunt watch-out, per hero AND per lane. 166 lines over all 83 role views, 0
  rejected by copy-verify. Judge converged 87.3% -> 98.8% -> 100% (21 + 2 + 0
  flags; gate STOP). Output data/aggregates/hero-coach-lines.json; the hero page
  prefers it and keeps the engine's templated line as the timing footnote, so a
  dropped line degrades to what shipped before. test/hero-coach.test.ts rebuilds
  every facts block and re-runs the verifier, so stale copy fails `npm test`.
- **Squad/coach report copy.** The author pass existed but had never been
  judged (the last critique round predated the 2026-08-07 re-author) and the
  critic only ever read the LEAD's report. Now all six (lead + five members) go
  through it: 74.1% -> 88.9% -> 96.3% -> 98.8% -> 100% over five rounds, 34
  grounded rewrites applied. It found real defects, not style: an invented
  baseline ("+5.8 wins per 100 vs the average Murdock player" — no such
  baseline exists in the data), a false superlative, two backwards kit reads,
  a wrong hero class, and two "queue a different role" headlines.
- Loop plumbing: `copy-critique.ts` is scopeable per surface (CRITIQUE_ONLY +
  its own CRITIQUE_REPORT/CRITIQUE_HISTORY) so a new surface converges without
  re-judging settled copy; `herocoach:*` and `coachreport:*` scripts run each
  loop and its gate. See docs/agent-loops.md.

CARRIED FORWARD (found in the 2026-08-29 review, after merging the 1.16 refresh):
judge rewrites are applied to the aggregate only, so re-running an ingest
reverts them. Fixed for the hero coach lines via a committed sidecar
(data/aggregates/hero-coach-fixes.json, re-applied and re-verified on every
ingest); build-reasoning.json and the coach reports still have the hazard.
Also: a copy pass should be re-checked for CURRENCY after every field refresh,
not just for grounding at authoring time — the 1.16 refresh left 16 lanes
naming items their build had dropped and 3 warning about opponents they now
beat, all with perfectly valid numbers. test/hero-coach.test.ts now gates both.

STILL OPEN (not this item's scope): data/aggregates/item-reviews.json holds 0
lines — a responses-less `copy:ingest` wiped 182 committed item explanations on
2026-08-07 and the hero page's item "why" lines have been blank since. The new
writeAggregate() guard makes that failure mode impossible going forward, but
the 182 lines still need re-authoring (one agent pass).
