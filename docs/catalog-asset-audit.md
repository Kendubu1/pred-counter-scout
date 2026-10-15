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
  conversions. 669 agree; the 12 tenacity cases below remain unresolved.
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

**Tenacity:** Absolution, Equinox, Heroic Guard, Legacy, Raiment of Renewal,
Salvation, Tainted Charm, Tenacious Drape, Tenacious Gem, Unbroken Will,
Vanguardian, and World Breaker have catalog values complementary to their
named curves (e.g. 75 versus 25). The provider's own Absolution page also says
75, so this is not just a local importer typo. Determine whether each value
represents retained crowd-control duration or reduction, confirm its gameplay
effect, and measure it before changing simulator semantics. Source:
https://pred.gg/items/absolution (checked 2026-10-15).

**Prices:** Divine Potion is 250 in the catalog versus 1 in its named price
curve; Hunt is 0 versus 50; Refillable Potion is 0 versus 100. These may use
special acquisition rules or overrides. No price was changed from this alone.

**Special items:** Dox, Solstone Drone, Sonar Drone, Stealth Ward, Tainted
Totem, The Perforator, and Wild Hunt have named assets but no exact prefix
match in the shared item-stat table. Orb of Enlightenment's power/health/mana
require resolving its evolution/grant effects. These values were not verified
by this pass. Missing table rows do not mean missing items.

**Combat fidelity:** names, descriptions, availability, ability damage/scaling,
passive activation/stacking, recipe totals, server overrides, and hit timing
are not comprehensively verified here. In particular, the existing core
ability formula uses one power channel, while extracted Murdock curves include
both AD and AP coefficients; gameplay bindings must decide how those combine.
This audit does not upgrade simulator output to Proven.

## Follow-up order

1. Resolve the tenacity representation and special-item references.
2. Cross-check every hero's ability ranks, damage types and scaling channels
   against the associated gameplay effects, not row names alone.
3. Pin controlled Murdock hits and timed sequences, including level, target
   defenses, item passives, passive state, crit state, and buffs.
4. Extend those measured regression cases across heroes and item interactions.
