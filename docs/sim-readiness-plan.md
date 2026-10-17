# Simulator readiness plan

Baseline reviewed: 2026-10-16. This is the execution order for accuracy work;
historical entries in priorities.md remain evidence, not readiness certification.

## Active scope update: items first

Per the user, the first pilot now isolates Belica core combat and Combustion,
Wraith Leggings, Caustica and Noxia. Eternals and unknown augments are excluded
from both sides of this item-only comparison. Aion recovery remains a later
phase and must not block this pilot. This scope update supersedes Aion-dependent
requirements below for M0-M3; actual-match reproduction still needs the loadout.

## Item-first pilot checkpoint

| Item | Production state | Next blocker |
|---|---|---|
| Noxia | Initial marking, activation identity, expiry and cooldown processed chronologically under one-hit-per-cast assumptions | Validate conditional Void Drone zaps, Bomb follow-up delivery and hit timing; multi-tick/tag/source cases remain partial |
| Combustion | Pyro damage and fixed 15s cooldown modeled | Integrate filtered Pyromaniac reduction and shared delayed gate with verified event delivery and native scheduling |
| Wraith Leggings | Stats active; false unconditional amplifier removed | Integrate conditional separate damage at event-time target health |
| Caustica | 35% magical penetration active | Arcane Might needs target bonus armor and event-time health |

Exit for this checkpoint: all ranking-relevant effects for the frozen Belica
item comparison represented or bounded, then controlled game measurements.
Passing software tests does not close the measurement gate. Eternals follow this
item milestone; their recovery must not redirect the current work.

## Goal and first useful milestone

Goal: the live app compares builds using game-supported mechanics, shows correct
hero/item/Eternal/augment information, and explains both the result and its limits.
Match win rates are descriptive evidence, not proof that a build causes wins.

First useful milestone: a reproducible Belica mid comparison using the user's regular build and augment between the
sim-selected build and popular builds from the same recorded patch. This is a
bounded pilot, not a reduction of the eventual all-hero scope. A comparison is
not validated if an unresolved interaction can change its ranking.

## Milestone gates

| Gate | Current state | Required work | Exit evidence |
|---|---|---|---|
| M0: bounded inventory | In progress; audits exist but no frozen pilot dependency list | Freeze patch/client hash, candidate builds, item order, level/gold checkpoints, targets, actions, Eternal/minors and augments; list every dependent mechanic | Versioned manifest with no unidentified dependency; each mechanic has an evidence link, implementation location, validation state and blocker |
| M1: production mechanics | Partial; shared fixes and diagnostic replays exist | Resolve and integrate every ranking-relevant pilot dependency in the production path; check trigger eligibility, scaling, cooldown, stack limits, expiry, proc recursion and event order | Passing behavioral regressions plus production event breakdowns; no silent unsupported effect credit; diagnostic/production differences resolved or explicitly bounded |
| M2: game comparison | Not certified by current audits | Capture controlled game results for pilot mechanics and combinations; compare damage, hit/proc counts, stacks, shield/health changes and timing | Reproducible records with patch, setup and observations; deterministic results agree within documented display rounding; timing within recorded measurement resolution; stochastic results checked against predeclared sampling/error criteria |
| M3: useful build comparison | Existing outputs are provisional | Run identical level/gold/action/target scenarios for all pilot builds, including burst, sustained combat, armor/health variation and limited attack uptime; explain damage sources and tradeoffs | Reproducible comparison report; ranking sensitivity to remaining uncertainty disclosed; no single winner where plausible uncertainty reverses rank; popularity/win-rate evidence kept separate |
| M4: live pilot release | Not complete for follow-up changes; PR225 remains draft | Rebuild artifacts from the tested tree, reconcile UI explanations, verify rendered data, then release when authorized | Deployed revision and data fingerprints match tested artifacts; browser smoke checks reproduce the saved pilot results |
| M5: roster-wide readiness | Incomplete | Repeat dependency and validation gates across all surfaced heroes, items, Eternals/minors and augments; reuse shared mechanics evidence, add consumer-specific cases | Complete ledger for surfaced content; supported mechanics have production and measurement evidence; unsupported cases visibly provisional; no blanket all-game certification |

M0-M3 are the next delivery milestone: a measured pilot comparison. M4 makes that
pilot available live. M5 expands it across the roster. A milestone cannot be
closed solely because extraction, test counts or generated artifact counts grow.

## Immediate work order

1. Build M0 from committed build/match snapshots and current source audits. Use
   the installed-client hash separately from match patch labels; verify alignment.
   The three saved coach matches identify the Belica item inventory; actual purchase timestamps and augment remain unknown. The item-only pilot excludes Eternals and augments rather than claiming a match replay. Include that setup and popular Belica build dependencies, plus
   Deathstalker and Spectral Schematics as explicit overrecommendation checks.
2. Audit Belica's production ability/passive behavior against recovered evidence and close the
   highest-impact dependency first. Keep Kira as a later cross-check. Do not assume replay support means the live
   ranking path implements the same behavior.
3. Reuse recovered execute, resistance and shield evidence. Investigate on-hit
   event scaling, stacking and crit-state uncertainty where the frozen builds
   depend on them. An unresolved dependency remains a blocker or restricts the
   comparison; do not invent constants or quietly exclude a popular candidate.
4. Integrate supported rules, then obtain controlled measurements for M2. Static
   client analysis alone cannot close the game-validation gate. If measurements
   are unavailable, continue independent dependencies and report this gate blocked.
5. Produce M3 comparisons, then prepare M4. Do not merge or deploy under this plan
   without applicable release authorization.

Hexbound/Devotion/Mistmeadow reduction recovery remains actionable backlog, but
is on the pilot critical path only if its targets or builds depend on it.
Broad recovery continues when it unblocks multiple dependencies; exhaustive
native decoding is not a prerequisite for a bounded, honestly scoped pilot.

## Mechanic ledger contract

Each row represents a mechanic, not merely an item name. Shared systems have
their own rows, linked by their item/hero consumers. Required fields:

- Mechanic ID, owning content and dependent builds/scenarios.
- Source patch/client hash and private/public evidence references.
- Recovered rule and unresolved values/ordering/conditions.
- Production implementation and whether the live build contains it.
- Regression case IDs and controlled game-observation IDs.
- State: unknown / evidence recovered / implemented / game checked / live.
- Blocking next action and impact on the comparison.

"Game checked" applies only to the recorded scenarios. Do not carry it across
patches without checking relevant changes. Tests and evidence are separate fields.
If a shared primitive is corrected, rerun affected consumer scenarios.

## Verified baseline and open gaps

- Latest harness: 276 tests across 38 files; these are software checks, not 276
  independent game validations. Recovery tools have 52 Python tests.
- 55 hero artifacts and 1,485 matchup pairs were regenerated. Last shield fix
  changed no saved headline build or matrix verdict in those reference scenarios.
- Rendered parity covered 55 kits, 189 augments, 270 item dialogs and 16 Eternal
  majors/96 minors. This checks committed-source rendering, not gameplay truth.
- PR224 is the merged baseline. PR225 contains follow-up resistance and shield
  corrections and recovery evidence; no live-release claim is made for it.
- Kira has a separate diagnostic replay. Hero passive audit entries remain
  uncertified; do not treat the roster inventory as event-accurate coverage.
- Crit eligibility/state structure is partly recovered; lifecycle/reset and
  short-window production behavior remain open. Average crit is an approximation.
- Shield timing/expiry, full modifier order, event producer classification and
  item-specific reduction calculations still have unresolved cases.
- Whole-game native/server parity is not established. No overall accuracy
  percentage or completion date is supported by these records.

## Progress update format

Every meaningful update should report:

1. Current milestone and its remaining exit gates.
2. Mechanics advanced between ledger states, with evidence.
3. Actual production/build-output change, or explicitly none.
4. Remaining blockers and the next concrete task.
5. Release state: local, draft PR, merged, or verified live.

Report completion fractions only against the frozen scope after M0. Never use
decoded asset counts or passing tests as a percentage of game accuracy.

## Supporting records

- `../priorities.md` and `../lessons.md`: historical work and findings.
- `v5-engine-design.md`: production model and limitations.
- `../data/aggregates/passive-coverage-audit.json`: hero passive inventory.
- `../data/aggregates/catalog-model-audit.json`: catalog/model evidence limits.
- `../engine/fixtures/shared-damage-event-review.json`: shared recovery findings.
- PR225: https://github.com/Kendubu1/pred-counter-scout/pull/225


### Belica/Aion pilot recovery (2026-10-16)

Three latest coach matches identify Combustion/Wraith Leggings, plus Caustica
and Noxia in the longest match. Aion/Bottomless Vial/Runic Focus are user-reported;
coach Eternal suggestions and estimated purchase times are not observations.
Both minors lack production effect entries; the major is explicitly unmodeled.
Runic Focus reads captured Mana/MaxMana and evaluates bound curves at input zero.
The catalog says 0.2 while the extracted first curve key is approximately 0.15.
First-key inspection does not verify input-zero evaluation; the conversational
20%-at-full-mana example was catalog-derived, not verified gameplay.
Bottomless Vial's jungle-kill listener, River target filter, owner power-effect
application and potion event are recovered. Inherited stack limit, death
persistence, potion receiver, Runic capture refresh and aggregation remain open.
See engine/fixtures/belica-aion-review.json for source-hashed evidence and gaps.
Next resolve curve evaluation/version alignment and stack/capture lifecycle.
M0 remains open (augment and combat-state observations missing); these missing
production mechanics are concrete M1 blockers. No production or artifact change.


### Belica item-first milestone: Wraith Leggings correction (2026-10-16)

The user prioritized core combat and item interactions before Eternals. Pilot
scope is Belica with Combustion/Wraith Leggings, then Caustica/Noxia at equal
gold and level. Aion remains a later loadout-validation gate, not an item-only
pilot blocker. Augment effects must likewise be excluded explicitly until known.

Wraith Leggings previously granted unconditional 12% ability amplification.
Recovered GA_Item_WraithLeggings_AbilityDamage listens before mitigation,
accepts any AbilityDamage/PhysicalDamage/TrueDamage tag, rejects Item/Cleave,
requires a hero entity and Threshold > Health/MaxHealth, then constructs a
separate effect using EventMagnitude times the Damage value. It is not a
universal amplifier. Numeric defaults and final nested damage ordering still
need confirmation. Production aggregate rotations lack event-time health, so
the false unconditional credit is removed and Carnage explicitly unmodeled.
Item stats remain active. No guessed 40% uptime replaces the removed bonus.
This is a correction of false credit, not completion of low-health simulation.

A Belica regression verifies full-health damage matches the same item's stats
without phantom passive credit. Combustion cooldown reduction, Noxia's separate
ability/mark lifecycle and Caustica Arcane Might remain next pilot dependencies.


### Noxia initial mark prerequisite (2026-10-16)

The production aggregate model now reserves the first ability hit for marking an
initially unmarked target. A lone hit grants no Dark Matter damage; two damaging
abilities retain the existing one-proc combo estimate. This corrects first-hit
false credit without inventing an uptime fraction. Evidence and remaining gaps
are recorded in engine/fixtures/noxia-review.json.

The Blueprint checks Array_AddUnique's result >= 0, not array length >= 2.
Static native tracing now confirms that this installed helper returns -1 when
lookup finds an existing identity, and returns a new index only after insertion.
Therefore Noxia rejects previously recorded identities. The identity getter
resolves to a field in PredGameplayEffectContext, zeroed by its constructors.
Population and cast lifetime remain unresolved, so this is not proof that
different ability slots are needed.
Production still lacks identity tracking, mark expiry, repeated-hit filtering,
source ownership and mark renewal after cooldown. Remaining Noxia credit is an
optimistic aggregate estimate. M1 remains open; M2 needs game observations.


### Noxia chronological activation model (2026-10-16)

Production burst/rotation evaluation now processes Noxia in timestamp order.
The first eligible hit marks, a new activation identity can trigger while marked,
cooldown hits cannot mark or enter the identity set, and expired marks need setup
again. Identity history survives mark expiry and clears after a proc. Successful
mark reapplication refreshes its duration. The existing single-target rotation
still supplies one immediate hit per ability activation; this does not reconstruct
multi-tick abilities, missed hits, source ownership or actual animation timing.
Expiry-before-hit is the explicit equal-timestamp convention, not measured engine
ordering. Existing 3s/8s/6% catalog values are corroborated by level-1 packaged
curve keys but remain subject to runtime overrides and damage execution checks.

Native tracing closes the earlier producer/copy gap: context ability assignment
reads PredGameplayAbility's activation GUID and converts it to the identity name;
context duplication preserves it. Named GenerateNewAbilityActivationGuid and
three native dispatch paths refresh that GUID via CoCreateGuid. Basic-attack
Blueprints also explicitly reset it. Identity is therefore not a permanent
ability-slot label; consumer-specific lifecycle exceptions remain possible.
See engine/fixtures/noxia-review.json for private-evidence hashes and limits.

Regression cases cover repeated ticks, fresh identities, sparse casts, mark
expiry, cooldown suppression, identity persistence/reset and the chosen timestamp
boundary. A production rotation test prevents phantom procs when every mark
expires between casts. M1 advances; M2 remains unverified without game measurements.

### Combustion native cooldown follow-up

The named native duration-reduction helper now has a bounded static trace: it
shifts active-effect timestamps, clamping a reduction that would exhaust the
remaining time to leave an arithmetic 0.01-second remainder, then invokes expiry
scheduling and notifications. This is not proof of frame-exact expiry. Evidence
hashes and remaining callback/scalar/delivery gaps are recorded in
`engine/fixtures/combustion-native-cooldown-review.json`. Pyromaniac remains
explicitly omitted until those event semantics can be integrated safely.
