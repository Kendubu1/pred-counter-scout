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
