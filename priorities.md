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

2026-10-15 search follow-up: item-set deduplication now retains the best
encountered early-mana purchase history. Displayed purchase timelines now preserve
at least that staged mana score while choosing marginal combat value per gold.
No scoring coefficients were changed. Mana targets and stage levels remain
heuristic; exhaustive order optimization and gameplay calibration remain open.

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

2026-10-15 progress: retain all 55 catalog PASSIVE descriptions in HeroKit.passive,
separate from castable abilities so they cannot spend skill points or gain
invented cooldown casts. Catalog audit exposes this source-only coverage.
Dual physical/magical scaling is supported for on-hit, on-ability-hit and
ability-scoped bonus damage; explicit dual ratios replace legacy scalar ratios.
Existing fixtures remain unchanged. 2026-10-15 follow-up: scoped attack-speed grants to the correct subject and
stated duration; removed unrelated timers, icon-tag false positives and the
four-second guess. Ranked buff durations now reach the simulator.
2026-10-15 finite-window follow-up: self attack-speed buffs now use actual
active intervals, effective recast cooldowns and per-interval caps; five exact
regression scenarios cover endpoints, overlap, haste and the old 3s discontinuity.
Source audit: the 11 flagged ability slots originally hid 16 omitted ratios.
Restore the three supported magical-power ratios on Riktor E, Sevarog Q and
Steel Q; retain full source, selected payload and 13 unresolved ratio entries.
The affected slots remain: health on
Adele (2), Rampage (1), Riktor (1), Sevarog (2), Steel (1); armor on Terra (3);
and Kira's untagged base/stack payload (1). Verify self versus target and total
versus bonus stat basis before adding coefficients; Terra also has charge,
multiple strikes and empowered states that must not be flattened silently.
2026-10-15 installed-client follow-up: Terra's six armor coefficients match
bonus-named curve rows. Dedicated damage-effect name tables reference Armor and
MagicResist, but capture source/calculation mode remain undecoded; DoubleSweep
names only the physical coefficient row. Evidence and file hashes are recorded
in engine/fixtures/scaling-basis-audit.json. Keep all six ratios unmodeled until
export decoding or controlled absolute-baseline measurements establish basis.
Still open: curate each passive trigger, general windowed effects and heal-from-damage behavior from verified mechanics, then
rebuild derived outputs when actual model coefficients change.


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
patches stale and is now verified 1.16 (`npm run patchcheck`; its harness gate
was retired 2026-09-21 when omeda froze — report only now),
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

## 15. [SHIPPED 2026-08-29] Meta board on current-patch ranked lane stats

The lane boards' only source was the omeda feed window — days behind live and
503 for two days — so every board through the 1.16 era was pre-1.16. `npm run
lanestats` now pulls the full (hero, role) ranked matrix for the CURRENT patch
from pred.gg generalStatistic (14 aliased calls, version-pinned); the board and
index roleWr prefer it over the feed, label the patch the SOURCE measured
("103,305 matches, patch 1.16, ranked"), keep newly-meta rows the old
augment-cell gate silently censored (flagged augmentPending instead), and the
games floor scales with the window (1-in-500 matches). Feed remains fallback.
Gold curves / matchup evidence / item play rates are still feed-only — those
stay on the item-2 pipeline when the feed returns.

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


### 2026-10-15 UI + Eternal source follow-up

The active v6 app, catalog and simulator now share corrected Eternal values;
46 descriptions and nine modeled entries were reconciled with client evidence.
The offline UI parity bracket covers 55 kits, 270 items, 189 augments, and all
16/96 Eternal major/minor descriptions. Remaining source conflicts are listed
in data/aggregates/eternal-source-audit.json. Resolve those and verify minor slot
membership before claiming a complete Eternal audit. Re-author invalidated
Eternal advice only through the author/independent-judge workflow.


## Spectral trigger follow-up (2026-10-15)

The unrestricted spell-hit bug is corrected with partial source-pinned root/stun
coverage. Next verify actual immobilization events for displacement, suppression,
fear/mesmerize and conditional/repeated CC; add charge and health-state timelines.
Do not promote current recommendations from THEORY based on reduced Spectral
prevalence. Re-run spectral-audit and all dependent artifacts after extending
coverage. Source/render parity is not in-game damage validation.


## Kira/passive fidelity follow-up (2026-10-15)

Separate action replay now diagnoses popular-core mechanics; production optimizer
is unchanged. Verify trigger ordering, Ruination ticks/refresh and Ashbringer
semantics in game. Add Knell, Purge tick cadence, Dash, Tainted, Terminus and
resource/animation state, then integrate before regenerating ranked builds.
Use passive-coverage-audit.json to work through all hero and item effects; no
entry is a complete gameplay certificate.


### Installed-client follow-up after Blueprint incorporation (2026-10-15)

- Recover Knell scalar default bindings and native attribute-magnitude contract;
  do not use earlier curve-only level-13 shred as verified runtime output.
- Recover native damage event scale before moving repeated Ashbringer cooldown
  reduction from the diagnostic replay into production scheduling.
- Replace Solaris aggregate cast/basic bounds with validated event timing; audit
  other spellblade items separately. Verify crit/heal and Mercy consumption.
- Recover Purge first/final tick boundaries, Vengeance ordering, Ruination effect
  period and Deathstalker's internal asset path. Rebuild app artifacts after any
  production numeric change; preserve explicit omissions.


### Priority item review continuation (2026-10-15)

Deathstalker's internal family is Tier3/FellBlade; its Blueprint has now been
recovered. Production has partial hit-stack behavior, not full native gating.
Oathkeeper/Augmentation cast-consume behavior and Augmentation base-power scaling
are incorporated; Tainted Rounds' partial packet type is corrected.

Next: replace Vanquisher's unconditional execute bonus with health/shield-aware
post-damage execution, including nonlethal and already-dead cases. Resolve
Combustion cooldown reduction, Sky Splitter floors/caps and native on-hit event
scale before promoting those findings. Continue the remaining item families in
top-item-client-review.json, including raw-only defaults; extraction is not
completion. All-item/passive coverage remains uncertified and builds stay THEORY.


### Fresh 1.17.2 evidence integrated (2026-10-16)

The historical-only evidence limitation is superseded for current match-stream
cores. Preserve the new transaction ingestion and anyOrder flags while continuing
mechanics work. Next validate purchase transaction ordering, sale/undo semantics,
completion bias and match-level split isolation; current descriptive overlap is
not held-out winning-build validation. Vanquisher and remaining native item
interaction gaps remain next in the mechanics queue.


### Vanquisher eligibility corrected (2026-10-16)

Unconditional execute burst credit is removed. Production checks aggregate
post-burst health plus shield and credits surviving health only; diagnostic Kira
uses the inclusive threshold. Next: intermediate-hit execution and native shield
behavior, then Combustion's filtered cooldown reductions/shared delayed gate.
Do not count this as full event-level execution or complete item certification.


### Projectile item client review (2026-10-16)

Onixian/Scattershot evidence and app omissions are updated; neither is numerically
modeled. Recover target filter/radius, native collision and damage-effect defaults
next; then revisit the skipped Kira core. Continue Combustion/Sky Splitter native
contracts and other actionable families without inventing these constants.
Validation: 256 tests, TypeScript, 55 artifact schemas and rendered UI pass.
No ranking, match snapshot, merge or deployment change.


### Combustion and Sky Splitter disclosure parity (2026-10-16)

Previously recovered mechanics were absent from active item limitations.
Combustion now discloses the hero/event filters and shared delayed gate instead
of an unrestricted "per hit" reduction description. Sky Splitter now discloses
full-profile burst HP and fixed 80% sustained HP, plus unresolved native event
scaling after the floor. These are model assumptions, not measured game rules.
No damage formula changes: regenerate catalog/passive audits and verify dialogs,
retain numerical ranked outputs. Recover scalar/default/native contracts before
changing scheduling or packet scaling; do not repeat the completed extraction.

Validation: all executable effect entries match the prior tree. 256 tests,
TypeScript, all 55 artifact schemas and the rendered item checks pass.


### Tainted Scepter Malice state review (2026-10-16)

Prioritized from 1,090 hero-wide reported player-core appearances in the saved
1.17.2 sample (not unique matches or evidence of causal superiority). Recovered
Malice initializes full, consumes stacks after eligible hero damage and refills
via callbacks/takedowns. Eligibility includes AbilityDamage OR PhysicalDamage OR
TrueDamage, excluding Item/ProcDamage. Offsets/hashes remain in the item ledger.

`malice-replay.ts` implements diagnostic state transitions with explicit resolved
scalars and recharge events; it supplies no native defaults or timer phase.
Tests cover consumption, nonhero/filter rejection, cap, refill and invalid inputs.
It is not connected to the optimizer. The app now explicitly discloses that its
existing ramp does not reproduce this cycle. Next integrate a validated event
schedule and scalars, then rebuild numerical artifacts; do not silently treat
the diagnostic as production coverage or infer damage timing from decoding.

Validation: 260 tests in 36 files, TypeScript, all 55 artifact schemas and
rendered item limitations pass. Affected audits regenerated; no merge/deploy.


### Shared Momentum review (2026-10-16)

Lightning Hawk appears in 925 saved hero-wide player-core observations (not
unique matches or causal item value). Recovered its shared Energized dependency;
hashes, offsets and limits are in momentum-client-review.json. Movement grants
truncate sampled 3D displacement / 50, with a 0.25s callback delay and no local
fraction carry. Diagnostic momentum.ts covers this calculation only. Hit grants
use unresolved StacksOnHit and native EventDataFloat; AoE has a separate gate.
Do not infer total proc cadence from the movement helper. App omission updated;
production numerical outputs remain unchanged. Next recover scalar/native
contracts, then integrate movement/hit/consume event ordering before ranking.

Validation: 264 tests in 37 files, TypeScript, 55 artifact schemas and rendered
item checks pass. Affected audits regenerated. No merge/deployment.


### Broad mechanics pass (2026-10-16)

Use full-mechanics-inventory.json as the decoded coverage queue and
broad-mechanics-review.json for six newly reviewed shared/hero calculations.
Do not repeat extraction of priority families. Recover property/default schemas
and native capture/event contracts, then review the remaining hero/item/Eternal
functions and integrate only evidence-supported behavior. Full paths matter:
Amalgamation and Barkskin have duplicate asset basenames. Decoded assets can be
inactive content; extraction, manual review and production coverage are separate.

Final scope: 5,630/5,630 selected assets decoded, zero selected parse errors or
missing assets. All 11,304 recovered function streams pass byte/VM-size roundtrip;
10,083 exports remain raw. Areas: heroes 2,950 assets/7,710 functions; items
1,486/1,687; Eternals 336/491; shared character 82/321; world/framework 776/1,095.
These include inactive content and overlap earlier batches; do not add counts.
Validation: 264 engine tests, synthetic audit regression, TypeScript, all 55
artifact schemas and rendered UI pass. No production formulas/rankings changed.


## 2026-10-16 foundational class-layout recovery

The new static probe recovered 1,237 class layouts with 7,025 declared fields
across the existing broad extraction. Each accepted class had one candidate
whose interpreted body reserialized byte-for-byte. Prefixes (17,318 bytes total)
and trailers (37,217 bytes total) remain explicitly opaque. The separate audit
checks those boundaries against original raw exports and publishes only counts
in `engine/fixtures/recovered-schema-summary.json`. The original inventory's
10,083 raw exports describes the baseline decoder and remains historical.

This addresses a shared blocker rather than adding an isolated item replay.
Energized's nine declared fields include StacksOnHit, but its default value is
still unresolved. Do not promote field declarations, bool descriptor values,
or byte-roundtrip success to verified CDO values or native gameplay semantics.
Next: resolve native parent/struct schemas and CDO bindings, then integrate
verified values and event ordering into production with behavioral regressions.
The probe and adapter instructions are in `engine/tools/schema-recovery/`;
all decoded game bodies remain private. No app math or rankings changed.

Validation: recovery tool builds with zero warnings; both synthetic audit
regressions pass. Full engine harness, TypeScript, 55 artifact schemas and
rendered catalog parity are checked before committing.


## 2026-10-16 native struct recovery and default bindings

Static inspection of the installed executable recovered ordered native reflection
metadata for ActiveGameplayEffectHandle, ScalableFloat, CurveTableRowHandle and
DataRegistryType. This removes the previously missing struct schemas for these
properties. The reusable native probe validates unique descriptors, names, kinds
and flags; output stays private and is tied to an executable hash.

Energized StacksOnHit now parses and reserializes its complete 23-byte property:
coefficient 1, ct_ItemStats row RapidRapier.StacksOnHit. The recovered Blueprint
calls GetValueAtLevel with input 0 at bytecode offset 916. The native event
multiplier, inherited overrides and exact native curve evaluation remain open.
Do not apply a flat 12-stack rule merely from the curve's input-1 key.
StormBreaker independently roundtrips six scalable properties and two handles.

This is partial default recovery, not whole-CDO or gameplay certification.
UberGraphFrame write schema, inherited schema index 12 (Energized), and GameplayTag
(StormBreaker) remain next dependencies. Cooked ScalableFloat ElementSize 56 differs
from native size 40; use parsed spans, never memory size to skip serialized data.
See engine/fixtures/native-default-review.json and engine/tools/defaults-recovery/.
No simulator rankings changed. Next prioritize native parent layouts and remaining
struct dependencies, then supported integration. Reuse the recovered bindings.

Validation: three native-probe regression cases and both earlier audit tests
pass; default-recovery tool builds without warnings. Full engine harness,
TypeScript, 55 artifact schemas and rendered UI parity gate this commit.


## 2026-10-16 broad default recovery follow-up

Applied the native layouts to all 1,237 recovered-class assets, spanning heroes,
items, Eternals and shared/world systems. 1,220 files produced partial default
records; 17 failed with InvalidOperationException and remain explicitly unprocessed.
Recovered GameplayTag and empty PointerToUberGraphFrame using unique native
reflection descriptors. Shared recovery increased exact property spans from
3,103 to 4,655 (4,574 nonempty), while unverified spans fell from 1,260 to 40.
The extra checks include newly verified UberGraphFrame spans, not just new values.

Exact spans by area: heroes 2,613; items 1,231; Eternals 374; other 437.
78 records reach the property-stream end, but ZERO fully consume the CDO with
all properties exact; do not report full-default or gameplay verification.
953 records stop on unresolved inherited property indices; another 189 need
schemas, led by PredActorFilter (66) and PredFilterAndEffectsContainer (47).
These shared dependencies are the next priority. The reports preserve the
4-layout baseline and 6-layout result separately. No production math changed.

Tools: engine/tools/batch-defaults and engine/scripts/audit_default_batch.py.
Private bodies and logs stay outside the repo. Native empty-struct and aggregate
privacy/accounting regressions were added. Full engine harness, TypeScript,
recovery builds, artifact schemas and rendered UI parity gate this commit.


## 2026-10-16 inherited Blueprint schema library

The broad reader previously loaded only each asset's own class schema. It now
indexes baseline decoded classes plus recovered replacements by full path, making
5,609 unique class schemas available to inherited-property lookup. Two duplicate
short names (Amalgamation/Barkskin) are excluded from shared lookup; each asset
still uses its own local class. Do not choose an arbitrary duplicate parent.

Across the same 1,237 attempted assets, 1,220 partial CDOs now contain 5,076 exact
property spans (4,988 nonempty), up 421 from the six-native-layout pass. Items
account for 1,614, heroes 2,649, Eternals 374 and other systems 439. 95 streams
reach their property end, but no whole CDO is certified. Inherited-index stops
fall from 953 to 926; 199 records now stop on other missing schemas.

The 17 per-file errors are now traced to missing native enum mappings for
EGameplayTargetingConfirmation, EDrawDebugTrace, EPredMuzzleSocket,
ECharacterHoverMovement and ECollisionEnabled. Preserve these errors instead
of inventing enum labels or ordinal values. Native PredGameplayAbility ancestry,
PredActorFilter and PredFilterAndEffectsContainer remain priority dependencies.
Private static probes located actor-filter/team/type/occlusion field metadata,
but nested tag-query and filter-array layouts still need completion before use.

Report: engine/fixtures/default-inheritance-review.json. Shared-schema error
metadata is sanitized to counts; game bodies and private paths remain private.
Validation includes aggregate privacy regression, native-probe regressions,
reader build, full harness, TypeScript, artifact schemas and rendered UI parity.
No production formulas or rankings changed.


## 2026-10-16 native enum recovery

Recovered five native enum tables (24 explicit values) from the installed
executable. The probe validates unique descriptors, ownership, flags and numeric
entries; it rejects duplicate/sparse profiles rather than assuming enum ordinals.
The batch reader accepts the private mapping file and retains the actual numbers.

All 1,237 recovered-class files now produce partial default records: the previous
17 schema/file errors are eliminated. Shared class schemas increase to 5,626.
Exact property spans increase 5,076 -> 5,579 (5,400 nonempty), including 60 enum
properties; zero previously matching spans lose their match. New records expose
five further unverified spans (45 total); this is still partial recovery. 95
streams end, but zero complete CDOs are certified. No production math changed.

Fixtures: default-enum-review.json and native-enum-review.json. Generated enum
mappings and all decoded properties stay private. Native ability registration
and 43 candidate property entries were located privately for the next inherited
schema investigation; array/enum helper records must not be counted as ordinary
class properties. Next: validate that layout and resolve nested filter schemas.

Validation: three new enum regressions plus seven prior Python checks, recovery
build, 264 engine tests, TypeScript, 55 artifact schemas and rendered UI parity.


## 2026-10-16 partial native ability-parent layout

Traced native PredGameplayAbility registration through its constructor to class
parameters and 43 property-registration entries. Folding 11 array/map/enum helper
entries yields 32 own fields; helper entries must not shift subsequent serialized
indices. Five additional native enum tables bring the private map to 10 tables /
43 explicit values. The partial parent profile deliberately leaves its native
superclass unresolved. The parser uses the observed installed-build descriptor
layout, not a universal ABI claim.

On the same 1,237-file corpus, exact property spans rise 5,579 -> 6,092 (5,854
nonempty), with no prior matching spans lost and 45 still unverified. 142 property
streams reach end, but zero whole CDOs are certified. Inherited-index stops fall
to 430; the newly reachable AbilityInfo struct now blocks 439 records. Recover
AbilityInfo next, then remaining native ancestry and actor-filter dependencies.
No production formulas or rankings changed.

Added native class/helper-tree probe, optional partial-parent reader input and
negative helper regressions. Extended enum recovery accepts explicitly requested
additional names with the same descriptor checks. Metadata reports are sanitized;
all generated field trees, enum maps and decoded bodies remain private.
Validation: 264 engine tests, 12 Python regressions, recovery build, TypeScript,
55 artifact schemas and rendered UI parity pass.

## 2026-10-16 shared native ability and filter dependencies

Recovered GameplayAbility's 32 registration entries as 30 own fields and linked
it to the previously recovered PredGameplayAbility parent. Added reusable native
struct dependency recovery; reproduced 10 layouts, including AbilityInfo,
GameplayAttribute, actor filters and tag-query storage, against the installed PE.
These are serialized layouts, not validation of native targeting/query behavior.

Same 1,237-class corpus: exact spans 6,092 -> 11,384 (10,981 nonempty), with zero
previous exact spans lost. 1,050 property streams now reach end (previously 142).
46 spans remain unverified; zero complete CDOs are certified. Four trailing bytes
in completed sample streams stay opaque. The leading remaining blocker is
PredFilterAndEffectsContainer (50 records), followed by AbilityTriggerData (28).
All private bodies and generated field maps remain outside the repository.

Sky Splitter, Combustion and Knell now expose readable scalable curve bindings;
these still need object/curve resolution and native event semantics before
changing production formulas. This chunk changes recovery tooling, not rankings.
The active objective remains supported production integration and controlled
simulator evaluation, not completion of a decoding milestone.

Validation: 264 engine tests, 16 Python regressions, TypeScript, 55 artifact
schemas, rendered UI parity and the broad reader pass. Four new negative/positive
regressions cover field counts/flags, repeat roots and missing constructors.


## 2026-10-16 native curve-helper dispatch

Traced the registered GetValueAtLevel wrapper into its native implementation.
Before curve evaluation, an available PredCurveTableOverrideSubsystem can return
a replacement scalable-float binding. The fallback uses the packaged binding.
The resolved curve is evaluated via virtual dispatch and multiplied by the scalar.
This explains why a recovered curve binding alone cannot establish runtime values;
override configuration/selection and virtual endpoint handling are now priorities.
Knell's previously unresolved serialized bindings are recovered, but native
overrides, effect stack/expiry defaults and steal semantics remain open.

Added a reusable bounded control-flow tracer that follows conditional/direct jumps
instead of stopping at the first return or exception-directory fragment. It records
calls and unresolved indirect branches without executing code. All instruction
bodies remain private; the committed review contains findings and source hash only.
The next step is override-source recovery and curve virtual dispatch, then supported
mechanics integration and controlled simulator comparisons. No rankings changed.

Validation: four new synthetic control-flow regressions, 264 engine tests,
20 Python regressions, TypeScript, 55 artifact schemas and rendered UI parity.


## 2026-10-16 mode override configuration recovery

Recovered the subsystem ActiveConfig field and the native configuration/map-value
layouts. Decoded the two already-extracted mode configs: Daybreak has 22 table
substitutions and 14 effect overrides; Overclocked has one table substitution.
All three populated properties roundtrip exactly. None of these CurveTables maps
substitutes item/Eternal tables, but standard-mode ActiveConfig selection remains
unverified and the effect overrides require review. Four trailing bytes stay opaque.

The reader now offers explicit --all-raw selection for reviewed non-default data
assets; its default selection remains Default__ only. Native kind 13 uses soft
class/reference serialization here, independently checked by resolved references
and exact bytes. A package-index interpretation failed and was rejected. Detailed
maps and native layouts remain private. See native-override-config-review.json.

Validation: two real configuration fixtures, default-selection compatibility,
reader build, 264 engine tests, 20 Python regressions, TypeScript, 55 artifact
schemas and rendered UI parity. No production ranking changes. Next: configuration
activation and virtual curve evaluation, then integrate supported mechanics.


## 2026-10-16 raw-export offset isolation

Fixed a real recovery-reader failure: earlier asset.Write calls can relocate saved
SerialOffset values relative to the original file. Knell Stacks was displaced by
two bytes and falsely stopped at inherited property index 108. Read the retained
RawExport.Data in its own bounded stream and report that payload's actual size.
Do not use relocated metadata as the source position or payload boundary.

A reusable private integration regression corrupts saved offsets/sizes, then
requires identical decoded records. It fails on the old reader and passes on the
new reader (two sample records / 24 nonempty exact properties). The existing
1,237-class corpus is unchanged: 11,384 exact spans, no previously exact span lost,
46 unverified and 1,050 property streams ended. The newly attempted effect family
was outside that corpus; a private native GameplayEffect profile and dependencies
now expose 29 exact properties across Knell's four effect defaults. Stacks confirms
AggregateBySource and limit four; durations bind ct_Eternals Knell_Major_Duration.
Missing native policy defaults and components remain unresolved. Do not infer them
from omitted serialized values. Native curve endpoint tracing is recorded privately
for subsequent integration; no production behavior changed in this reader fix.

Validation: reader build, failing-old/passing-new relocation regression, broad
corpus comparison, 264 engine tests, 20 Python regressions, TypeScript, 55 artifact
schemas and rendered UI parity. Private assets and field maps stay private.


## 2026-10-16 native stack policies and modifier enum aliases

Traced GameplayEffect constructor stores at reflected policy-field offsets:
duration refresh and period reset are explicitly zero, corresponding to refresh
and reset on successful application. Knell's exact modifier properties use
MultiplyCompound for target Armor/MagicResist and AddBase for stolen defenses.
The registered EGameplayModOp contains seven numeric values plus three legacy
aliases. Added opt-in --allow-aliases recovery, preserving aliases in metadata and
keeping strict behavior by default. Duplicate labels and sparse maps still fail.

Expiry has no explicit store in the traced constructor. Epic documents UObject
zero initialization, but that contract is supporting evidence, not a substitute
for auditing post-initialization/fork-specific behavior. Native aggregation and
steal calculations remain open. No production rankings changed. Private traces
and field/default maps remain private; see knell-native-effect-review.json.

Validation: five enum tests (including two alias regressions), 22 Python checks,
264 engine tests, TypeScript, 55 artifact schemas and rendered UI parity.


## 2026-10-16 active integration checkpoint

Knell now supports explicit 0–4 stack snapshots in production damage math, with
no automatic uptime credit. The controlled Kira comparison is generated by
engine/src/ingest/knell-state-comparison.ts. Timing, stolen defenses and complete
interaction ordering remain open; this is not simulator readiness or build-win
validation. The broad GE recovery covers 3,956 files; all 152 remaining inherited
index stops trace to BaseGameplayEffect (150 directly, two via Blueprint parents).
Its native registration has zero own reflected properties and identifies
GameplayEffect as superclass. A private flattened-layout follow-up is running;
validate its results before claiming the gap closed. No behavioral equivalence
follows from matching inherited fields.

Follow-up: all 152 blocked records now reach property end with zero span mismatches after resolving BaseGameplayEffect inheritance. Previous exact spans are preserved. This closes the observed inherited-index parsing gap, not whole-CDO or native behavior coverage. See the sanitized follow-up counts in broad-effect-default-review.json.

Validation: 269 engine tests in 38 files, 22 Python regressions, TypeScript, complete 55-hero artifact rebuild, 55 artifact schemas and rendered UI parity pass. The controlled report contains 45 snapshots and skips one unsupported core. No live match refresh, merge or deployment.


## 2026-10-16 shared damage-event scaling and projectile defaults

Followed the native damage execution class through construction and its overridden
virtual slot. The captured TempOnHitPerc value starts from a local fallback of 1,
then flows into the reflected EventDataFloat member of the event-data object.
GameplayEventData's reflected OptionalObject2 offset confirms the payload link;
the object is retained in Event.OnDamageDealt. This resolves the producer-side
scaling contract used by recovered Sky Splitter and other passive consumers. It
does not prove every event's effective multiplier is 1, every event producer uses
this path, or that all downstream scaling/critical/healing interactions are known.

Scattershot execution defaults expose AttackDamage-based damage, the on-hit
percentage override, and a lane-minion-only multiplier. Onixian exposes attack
scaling and its custom distance magnitude; a post-additive row name has a null
curve table and cannot supply an extra flat term. Added a reusable exact-span
execution inspector that selects only the active magnitude union arm and preserves
tag conditions. Generated details and native traces remain private.

Refreshed app-facing omission notes and the catalog/passive/Kira reports. Removed
Onixian's existing ranged-carry coaching line because it granted melee-only
mitigation; replacement still requires author/judge review. Corrected the model
document generator's stale unconditional-execute and unrestricted spell-trigger
claims. No new damage credit or ranking change; target selection, collisions,
critical/lifesteal resolution and full native composition remain open.

Validation: 269 engine tests, 25 Python checks, TypeScript, regenerated catalog/passive/Kira reports and item-model documentation, 55 artifact schemas and rendered UI parity pass. New UI assertions verify refreshed projectile limitations and absence of the erroneous Onixian tip. Next: trace native critical/healing/aggregation rules and projectile target outcomes, then integrate supported damage behavior.


## 2026-10-16 projectile ancestry and target exclusion

Scattershot passes ExcludeAroundActor=true to its native sphere query. The
registered parameter name and conditional ignored-actor append establish that
the triggering enemy is excluded from candidate selection. The Blueprint makes
two nearest-target passes, removes selected candidates, and retains its prior
selection if none replaces it. With no eligible secondary candidate, it spawns
no projectile. This supports zero Scattershot projectile contribution in a truly
isolated one-enemy scene; populated-scene outcomes remain unresolved.

Recovered three projectile Blueprint class layouts (12 declared fields), native
PredProjectile (76 own fields), Actor (80 own fields), their dependencies and
TimerHandle. Native registration confirms Actor ancestry. All three selected
projectile property streams end with 59 exact spans. Scattershot explicitly sets
lock-on-only collision, destroy-when-lock-on-dies and destroy-on-hit. The native
overlap handler enforces the lock-on bit, with a conditional custom projectile
hit-interface exception. Do not generalize this into immunity from all incidental
collisions. Whole CDOs, component behavior and populated-scene hits remain open.

The schema tool now accepts optional literal filename prefixes, retaining its
old defaults. Native dictionary profiles can specify a reviewed superType; added
primitive mappings cover reflected bitfield bools, UInt64 timers, weak references
and delegates. A mapping alone does not validate native behavior or an unvisited
serialized field. The private projectile integration gate checks exact spans,
inherited root components, timer type and collision flags; changing a flag fails.

Reused the shared filter/effect-container dependencies on the 187 previously
partial class/default records. Fifty additional streams end, with 701 more exact
spans, zero old exact spans lost and one fewer unverified span. The 1,237-file
corpus now has 12,085 exact spans, 45 unverified and 1,100 ended streams; this
inventory overlaps others and remains partial. Next shared gaps include
AbilityTriggerData, PredMontagesArray and Transform. All generated field maps,
raw/default bodies and native instruction traces remain private.

Validation: 269 engine tests across 38 files, 25 Python recovery tests, TypeScript, rendered UI parity and all 55 saved artifact schemas pass. The private projectile gate passes 59 exact spans and rejects a changed collision flag. Numeric production rankings are unchanged in this recovery checkpoint.
