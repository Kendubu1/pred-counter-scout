# Installed-client catalog audit — 2026-10-15

The catalog lists 55 heroes and 270 items. Every listed hero has a matching
shipped kit curve table, and every listed item has a matching named asset.
This establishes asset presence, not current shop/roster availability.

## Corrected

The catalog importer accumulated repeated absolute attack-range values for
Murdock, GRIM.exe, and Legion as level-up gains. Murdock and Legion reached
27,000 range at level 18; GRIM.exe reached 24,300. Their shipped range curves
are constant at 1,500, 1,500, and 1,350 respectively. The importer now handles
range separately and rejects unfamiliar nonzero growth shapes for review.
Existing zero-after-initial-grant range curves remain constant.

The three catalog entries were corrected locally. The upstream fetch timestamp
was retained; the content hash and local-correction metadata were updated.
No upstream API refresh or live-site deployment was performed.

## Evidence and checks

- Decrypted archive index matched its stored SHA-1 checksum.
- 57 standard hero kit tables decoded completely, including package end markers.
- All 55 catalog heroes match by internal name. Golem and Frostbane are extra
  table names, not evidence of missing playable heroes; neither was added.
- 11,844 comparable hero level/stat values were checked with 0.005 tolerance
  for floating-point storage. All match after the three range corrections.
- 681 item stat values were compared using explicit field aliases and unit
  conversions. 681 agree after correcting the 12 complementary tenacity values below.
- 220 price rows were compared. 217 agree; three exceptions remain unresolved.

`engine/fixtures/catalog-asset-audit.json` preserves source file hashes,
the decrypted-index hash, hero checkpoints at levels 1/2/6/11/18, matching
item values, and unresolved cases. `test/catalog-asset-audit.test.ts` checks
these against the committed catalog without network access. The fixture is
dated evidence for this build: a future patch needs a new extraction and
review, not an automatic rewrite of expectations to match the catalog.

Hero growth curves were interpolated and accumulated as level-up grants,
except attack range (absolute values or the initial grant followed by zeros).
Attack speed is converted from percentage points to the engine's units.
Item fields use their level-one values. Aliases include PhysicalPower /
AttackDamage, MagicalPower / AbilityPower, CDR / CooldownReduction, and
the shipped `AbiltiyPower` spelling. Percentage fractions are multiplied by
100; movement-speed multipliers are converted with `(value - 1) * 100`.
Agreement with a curve is not proof of a passive's gameplay-effect binding.

## Unresolved — do not silently correct

**Tenacity — resolved representation:** Absolution, Equinox, Heroic Guard,
Legacy, Raiment of Renewal, Salvation, Tainted Charm, Tenacious Drape,
Tenacious Gem, Unbroken Will, Vanguardian, and World Breaker carried retained
CC-duration percentages rather than reduction. The user confirmed Absolution
shows **25** in the in-game shop on 2026-10-15, matching its named game curve
rather than the provider's 75. The importer now converts `100 - value` and the
12 catalog entries use their named reduction curves. The other 11 were not
individually shop-tested. The evidence fixture retains original values and the
confirmation separately from the unresolved price and special-item cases.
A future upstream representation change requires reviewing this conversion.

**Prices:** Divine Potion is 250 in the catalog versus 1 in its named price
curve; Hunt is 0 versus 50; Refillable Potion is 0 versus 100. These may use
special acquisition rules or overrides. No price was changed from this alone.

**Special items:** Dox, Solstone Drone, Sonar Drone, Stealth Ward, Tainted
Totem, The Perforator, and Wild Hunt have named assets but no exact prefix
match in the shared item-stat table. Orb of Enlightenment's power/health/mana
require resolving its evolution/grant effects. These values were not verified
by this pass. Missing table rows do not mean missing items.

**Combat fidelity:** the simulator now retains independent physical/magical
power channels and per-rank ratios, reads the stated damage type independently,
and honors Murdock's explicit ultimate armor bypass. Muriel's current shield-only
E no longer inherits damage from its obsolete slot. These are source-backed
corrections, not measurements of complete gameplay. Multi-hit timing, passive
activation/stacking, server overrides, and 11 dropped scaling entries remain
incomplete. This audit does not upgrade simulator output to Proven. Murdock Buckshot uses
the stated close-range maximum; distance falloff, its ability-applied armor
shred, and Shots Fired passive cadence are not implemented by this change.

## Catalog and simulator reconciliation

All 189 hero augments now quote the committed pred.gg catalog exactly. 71 source
strings changed (including markup/whitespace); 16 modeled augments had numerical
changes. Skylar's new missing-health explosion and Countess's isolated healing
bonus are explicitly unmodeled. Murdock Martial Law is now 15%, not 12%.

All 216 items with effect descriptions now have registry entries. Existing
modeled entries retain their curation limitations; 83 previously absent items
are explicitly unmodeled. Complete tagged source text preserves scaling icons,
conditions, cooldowns, and evolved-form references. Corrected values include
Sky Splitter, Oathkeeper, Solaris cooldown, Dynamo, Earthshaker, Resolution,
Cursed Scroll, Manta Scythe, Tyranny, and both Orb forms. Viper, Soulbinder and
Vainglory no longer receive unsupported unconditional bonuses for conditional
mechanics. Oathkeeper/Solaris use the stated 1.5s trigger cooldown, not their 4s
empowerment duration; the model still assumes a basic attack follows the cast.

`npm run audit:catalog` writes `data/aggregates/catalog-model-audit.json`, with
all 55 heroes, 270 items, 189 hero augments, stale fallbacks, dropped scaling,
and per-effect limitations. It is an offline inventory, not a full accuracy
certificate. The catalog source fetch date remains unchanged.

## Follow-up order

1. Resolve special-item references and the three price exceptions.
2. Cross-check every hero's ability ranks, damage types and scaling channels
   against the associated gameplay effects, not row names alone.
3. Pin controlled Murdock hits and timed sequences, including level, target
   defenses, item passives, passive state, crit state, and buffs.
4. Extend those measured regression cases across heroes and item interactions.

## Derived output reconciliation

Rebuilt all 55 hero artifacts, the 1,485-pair matchup matrix, and the field
agreement audit using the corrected model. Removed 71 optimizer explanations
whose item sets no longer matched and 63 coaching lines that failed current
numeric/item/timing/matchup checks. Their replacements are pending reviewed
authoring; the updated builds remain available and passing guidance is retained.
No new coaching prose was generated by this pass.


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
