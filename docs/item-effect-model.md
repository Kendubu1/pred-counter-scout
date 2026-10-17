# Item-effect model — reasoning breakdown

Generated from `data/catalog/items.json` + `engine/fixtures/effects.json`
(`npm run item-model`). For every completed item: its base stats, each
passive split out (with the trigger condition), the effect primitive it maps
to, and how that rolls into the simulator. Flat stats are always counted;
this doc is about the **passives**. THEORY until in-game calibration.

**Coverage: 67 modeled · 58 honestly unmodeled (with reasons) · 0 not yet reviewed · 125 total.**

---

## ✅ Modeled (the sim credits the passive)

### Oblivion Crown  ·  3450g
**Base stats:** magical power 120

**Passive — Eradicate:** • Increase your Magical Power by 25% .

**→ Modeled as:**
- `stat_multiplier` — multiplies magical power by 1.25× before the sim runs.

---

### Imperator  ·  3400g
**Base stats:** physical power 65, critical chance 20

**Passive — Precision:** • Critical Strikes deal 30% more damage.

**→ Modeled as:**
- `crit_damage_amp` — crits deal 30% more — boosts the crit multiplier.

---

### The Perforator  ·  3200g
**Base stats:** physical power 45, physical penetration 8, ability haste 15

**Passive 1 — Chilling Spells:** *[On dealing Ability Damage:]* • Slows by 10% for 1s .
**Passive 2 — Puncture:** • Ignore 30% of Physical Armor .

**→ Modeled as:**
- `percent_pen` — 30% physical penetration (multiplicative, 1.14 rule).
- `unmodeled` — **not modeled** — Chilling Spells is a 10% slow (CC) on ability damage.

---

### World Breaker  ·  3200g
**Base stats:** magical power 45, max health 350, tenacity 25

**Passive 1 — Fiend:** *[On dealing Magical Damage to a Hero:]* • Increases your Magical Damage dealt by 2% for 4.5s . • Stacks up to 6 times.
**Passive 2 — Maya:** • Gain (+5% ) Magical Power .

**→ Modeled as:**
- `damage_amp` — +12% to your ability damage (when window only, credited at partial uptime) — applied as an amp on every qualifying hit.
- `stat_conversion` — converts 5% of health into magical power.

---

### Aegis Of Agawar  ·  3150g
**Base stats:** physical power 20, max health 400, critical chance 15

**Passive 1 — Bludgeon:** • Gain (+2.5% ) Physical Power .
**Passive 2 — Agawar's Protection:** • Gain 10% Total Physical Armor . • Gain 10% Total Magical Armor . While below 40% Health: • Gain 20% Total Physical Armor instead. • Gain 20% Total Magical Armor instead.

**→ Modeled as:**
- `stat_conversion` — converts 2.5% of health into physical power.
- `armor_multiplier` — armor ×1.10 — raises effective HP vs that damage type.
- `unmodeled` — **not modeled** — Agawar's Protection doubles to 20% armor while below 40% Health; a health-state-gated defensive tier.

---

### Cursed Scroll  ·  3150g
**Base stats:** attack speed 20, physical armor 40, magical armor 30, health regeneration 150

**Passive 1 — Curse of Pain:** *[On Basic Attack:]* • Deal 20 (+3.5% ) Damage to yourself and the Enemy Target. • This damage cannot hurt you below 35% Health .
**Passive 2 — Forbidden Art:** *[For every 100 Health you are missing:]* • Gain +1.5% Attack Speed. • Gain +20% Base Health Regen .
**Passive 3 — :** Restriction: Limited to 1 Cursed Item.
**Passive 4 — :** Damage Dealt: {DamageDealt} Damage Dealt to Heroes: {DamageDealtHeroes} Damage Dealt to Self: {DamageTaken}

**→ Modeled as:**
- `on_hit` — every basic attack adds 20 (+3.5% health) magical damage — rate-capped over the attack window.
- `unmodeled` — **not modeled** — Forbidden Art scales AS/regen with the holder missing health; no health-state uptime model.

---

### Mutilator  ·  3150g
**Base stats:** physical power 45, ability haste 15, omnivamp 12

**Passive 1 — Mutilate:** *[On Successsful Basic Attacks:]* • Deal 1% of their Max Health as Damage .
**Passive 2 — Devour:** *[Ability Hits on Heroes:]* • Apply Mutilate 3 times (once per ability).
**Passive 3 — :** Damage Dealt: {DamageDealt} Damage Dealt to Heroes: {DamageDealtToHeroes}

**→ Modeled as:**
- `on_hit` — every basic attack adds 1% of target max HP physical damage — rate-capped over the attack window.
- `on_ability_hit` — each eligible ability adds 3% of target max HP physical damage.

---

### Augmentation  ·  3100g
**Base stats:** physical power 35, attack speed 25, max health 225, ability haste 20

**Passive 1 — True Strike:** *[On Ability Cast:]* • Empower your next Basic Attack within 4s . • Deal (+90% Base Physical Power ) Damage On-Hit .
**Passive 2 — :** Damage Dealt: {DamageDealt} Damage Dealt to Heroes: {DamageDealtHeroes} Times Applied to Heroes: {TimesApplied}

**→ Modeled as:**
- `on_ability_hit` — bounded cast/basic pairs add (+90% base physical power) physical damage (≤ once / 1.5s per target).
- `unmodeled` — **not modeled** — Client Blueprint requires ability-commit empowerment followed by an eligible on-hit event. Production uses bounded cast/basic pairs only; spell-only rotations and basic-only DPS omit this proc. Four-second expiry, actual weaving and ability on-hit consumers remain unmodeled.

---

### Cursed Ring  ·  3100g
**Base stats:** physical power 35, magical power 35, attack speed 35

**Passive 1 — Curse of Swiftness:** • Increase your Total Attack Speed by 1.2x . • Your Basic Attacks deal 25% less damage.
**Passive 2 — Broken Chains:** • Increase the Attacks per Second Cap from 3 to 4.
**Passive 3 — :** Restriction: Limited to 1 Cursed Item.

**→ Modeled as:**
- `attack_speed_cap` — {"kind":"attack_speed_cap","cap":4}
- `unmodeled` — **not modeled** — Curse of Swiftness (+20% total AS with a basics-only -25% damage penalty) has no basics-only negative-amp primitive, so the AS upside stays uncredited; only Broken Chains (attacks/sec cap 3->4) is modeled.

---

### Demolisher  ·  3100g
**Base stats:** physical power 45, critical chance 20

**Passive 1 — Puncture:** • Ignore 25% of Physical Armor .
**Passive 2 — Trauma:** • Additionally, your Basic Attacks and Critical Strikes ignore 30% of Bonus Physical Armor .

**→ Modeled as:**
- `percent_pen` — 25% physical penetration (multiplicative, 1.14 rule).
- `unmodeled` — **not modeled** — Trauma ignores 30% of BONUS physical armor only; reference profiles do not split base vs bonus armor.

---

### Oathkeeper  ·  3100g
**Base stats:** magical power 80, max health 175, max mana 275, ability haste 15

**Passive 1 — Celestial Spellblade:** *[On Ability Cast:]* • Empower your next Basic Attack within 4s . • Deal 65 (+35% ) Damage On-Hit .
**Passive 2 — :** Damage Dealt: {DamageDealt} Damage Dealt to Heroes: {DamageDealtHeroes} Times Applied to Heroes: {TimesApplied}

**→ Modeled as:**
- `on_ability_hit` — bounded cast/basic pairs add 65 (+35% magical power) magical damage (≤ once / 1.5s per target).
- `unmodeled` — **not modeled** — Client Blueprint requires ability-commit empowerment followed by an eligible on-hit event. Production uses bounded cast/basic pairs only; spell-only rotations and basic-only DPS omit this proc. Four-second expiry, actual weaving and ability on-hit consumers remain unmodeled.

---

### Overseer  ·  3100g
**Base stats:** magical power 85, magical penetration 8, magical lifesteal 7

**Passive 1 — Exalted:** *[Enhance your Ultimate Ability:]* • Deals 15% more damage. • Heals you for 25% of the damage dealt to Heroes.
**Passive 2 — :** Damage Dealt: {DamageDealt} Damage Dealt to Heroes: {DamageDealtHeroes} Health Restored: {HealthRestored}

**→ Modeled as:**
- `damage_amp` — +15% to your ultimate damage — applied as an amp on every qualifying hit.

---

### Rapture  ·  3100g
**Base stats:** attack speed 30, max health 300, omnivamp 7

**Passive 1 — Nearsight:** *[While within 475u of an Enemy Unit:]* • Your Basic Attacks deal 20 (+2.5% ) (+15% ) Damage On-Hit to them.
**Passive 2 — :** Damage Dealt: {DamageDealt} Damage Dealt to Heroes: {DamageDealtHeroes}

**→ Modeled as:**
- `on_hit` — every basic attack adds 20 (+15% physical power) physical damage — rate-capped over the attack window.

---

### Resolution  ·  3100g
**Base stats:** physical power 40, attack speed 20, physical penetration 9, max mana 350

**Passive 1 — Darksteel:** *[On Successful Basic Attacks:]* • Deal (+2.5% ) Damage On-Hit .
**Passive 2 — Potent Font:** *[On Killing any Unit:]* • Gain 5 Max Mana . • Camp Leaders grant 15 . • Stacks up to 400 . • At 400 , gain (+2.5% ) Physical Power .
**Passive 3 — :** Power Gained: {Power} Damage Dealt: {DamageDealt} Damage Dealt to Heroes: {DamageDealtHeroes}

**→ Modeled as:**
- `on_hit` — every basic attack adds (+2.5% max mana) physical damage — rate-capped over the attack window.
- `unmodeled` — **not modeled** — Potent Font is a per-kill max-mana farming stack (caps at 400 then grants PP); economy.

---

### Sky Splitter  ·  3100g
**Base stats:** physical power 35, attack speed 30, lifesteal 7

**Passive 1 — Rend:** *[On Successful Basic Attacks:]* • Deal 5% of Target's Current Health as Damage On-Hit . • Reduced to 3.5% for Ranged Heroes. • Minimum of 12 Damage .
**Passive 2 — :** Damage Dealt: {DamageDealt} Damage Dealt to Heroes: {DamageDealtHeroes}

**→ Modeled as:**
- `on_hit` — every basic attack adds 5% of target current HP physical damage — rate-capped over the attack window.
- `unmodeled` — **not modeled** — Rend uses fixed target-health assumptions: full profile health in burst and 80% in sustained damage, not health updated after each hit. The recovered hero branch applies the damage floor before native event scaling and has no monster damage cap. Native event scaling, default bindings and hit ordering remain unresolved; catalog percentages and the 12-damage floor are partial modeling, not verified event-level behavior.

---

### Solaris  ·  3100g
**Base stats:** physical power 50, critical chance 20, max mana 350, ability haste 15

**Passive 1 — Solarblade:** *[On Ability Cast:]* • Empower your next Basic Attack within 4s . • Deal 45 (+35% ) Damage On-Hit . • Can Critically Strike . • Heals you for 50% of damage dealt.
**Passive 2 — :** Damage Dealt: {DamageDealt} Damage Dealt to Heroes: {DamageDealtHeroes} Health Restored: {HealthRestored}

**→ Modeled as:**
- `on_ability_hit` — bounded cast/basic pairs add 45 (+35% physical power) physical damage (≤ once / 1.5s per target).
- `unmodeled` — **not modeled** — Client Blueprint confirms ability-commit empowerment consumed by an eligible on-hit event. Production counts only bounded cast/basic pairs in mixed combat; ability-only rotations and basic-only DPS exclude the proc. Pair timing and four-second expiry are optimistic aggregate assumptions; Mercy on-hit consumption, critical damage and 50% healing remain omitted. See client-mechanics-review.json.

---

### Tainted Blade  ·  3100g
**Base stats:** physical power 40, max health 250, ability haste 10

**Passive 1 — Blighted Strikes:** *[On dealing Physical Damage :]* • Reduce the Target's Healing by 45% for 3s .
**Passive 2 — Hex:** *[On dealing Ability Damage to a Blighted Target:]* • Cause them to take 5% more damage for 3s .

**→ Modeled as:**
- `anti_heal` — cuts the target's healing by 45% — matters vs sustain.
- `damage_amp` — +5% to your damage (when window only, credited at partial uptime) — applied as an amp on every qualifying hit.

---

### Vanquisher  ·  3100g
**Base stats:** physical power 50, physical penetration 12, critical chance 20

**Passive 1 — Annihilate:** *[On taking a Hero below 5% Health :]* • Execute them.
**Passive 2 — :** Executions: {Executions} Execute Damage Dealt: {DamageDealt}

**→ Modeled as:**
- `execute` — credits surviving health only when aggregate post-burst health plus shield is at most 5% of maximum health and the target is alive; no unconditional burst bonus.
- `unmodeled` — **not modeled** — Client checks a living hero after damage: remaining health plus shield must be at most 5% of maximum health. Production checks only the end of the aggregate burst and credits remaining health, assuming ordinary shield absorption. Intermediate hit timing, shield bypass, native execute damage and sustained-window execution remain unmodeled; no unconditional 5% damage bonus is granted.

---

### Viper  ·  3100g
**Base stats:** physical power 35, attack speed 30, physical penetration 8

**Passive 1 — Corrode:** *[On damaging a Hero:]* • Reduce their Physical Armor by 4.5% for 3s . • Stacks up to 6 times. • At 6 stacks they become Eroded .
**Passive 2 — Diligence:** *[Against Eroded Heroes:]* • Deal 10% increased On-Hit and Ability damage.
**Passive 3 — :** Damage Dealt: {DamageDealt}

**→ Modeled as:**
- `armor_shred` — strips 27% of the target's physical armor (ramps over 6s) — so ALL your physical damage lands harder.
- `unmodeled` — **not modeled** — Diligence grants 10% increased On-Hit and Ability damage only against Eroded targets (6 stacks). The simulator lacks target stack state; do not amplify all basic damage unconditionally.

---

### Wraith Leggings  ·  3100g
**Base stats:** magical power 100, magical penetration 11, movement speed 4

**Passive 1 — Carnage:** *[Against Heroes below 40% Health :]* • Abilities deal 12% bonus Magical Damage .
**Passive 2 — :** Damage Dealt: {DamageDealt}

**→ Modeled as:**
- `damage_amp` — +12% to your ability damage — applied as an amp on every qualifying hit.

---

### Basilisk  ·  3050g
**Base stats:** physical power 40, max health 300, ability haste 20

**Passive 1 — Corrode:** *[On damaging a Hero:]* • Reduce their Physical Armor by 4.5% for 3s . • Stacks up to 6 times. • At 6 stacks they become Eroded .
**Passive 2 — Eminence:** *[Upon damaging an Eroded Hero:]* • Gain 8% Movement Speed for 2 s.

**→ Modeled as:**
- `armor_shred` — strips 27% of the target's physical armor (ramps over 6s) — so ALL your physical damage lands harder.

---

### Alternata  ·  3000g
**Base stats:** physical power 50, physical penetration 12, max mana 350, ability haste 10

**Passive 1 — Alternate Reality:** • Your Alternate Ability deals 15% more damage.
**Passive 2 — Nata Style:** *[Upon using your Alternate Ability:]* • Reduce your other current Basic Ability Cooldowns by 12% .

**→ Modeled as:**
- `ability_damage_amp` — {"kind":"ability_damage_amp","abilityKey":"ALTERNATE","pct":15}
- `unmodeled` — **not modeled** — Nata Style cooldown ripple (-12% of other current basic cooldowns per Alternate cast) depends on cast interleaving; not modeled

---

### Alternator  ·  3000g
**Base stats:** physical power 50, physical penetration 10, max mana 300, ability haste 10

**Passive 1 — Alternate Reality:** • Your Alternate Ability deals 15% more damage.
**Passive 2 — Adeptus:** *[Damage Heroes with your Alternate Ability :]* • Upon triggering Adeptus , gain a stack (once per ability). • Upon reaching 15 stacks, return to Base to Evolve this item into Alternata .

**→ Modeled as:**
- `ability_damage_amp` — {"kind":"ability_damage_amp","abilityKey":"ALTERNATE","pct":15}
- `unmodeled` — **not modeled** — Adeptus is an evolve stack (15 hits with the Alternate Ability evolves into Alternata).

---

### Azure Core  ·  3000g
**Base stats:** magical power 70, max mana 450, ability haste 10

**Passive 1 — Spirit Shield:** *[On going below 40% Health :]* • Gain a 100 (+12% ) Shield for 5s .
**Passive 2 — Font:** *[On Killing any Unit:]* • Gain 5 Max Mana . • Camp Leaders grant 15 . • Stacks up to 400 . • At 400 , gain (+3.5% ) Magical Power .
**Passive 3 — :** Power Gained: {Power}

**→ Modeled as:**
- `shield_per_fight` — ~100 shield per fight — counted as effective HP.

---

### Citadel  ·  3000g
**Base stats:** physical power 40, max health 300, physical armor 40

**Passive 1 — Fortification:** *[For each nearby Enemy Hero:]* • Gain 5 Physical Armor .
**Passive 2 — Intimidation:** *[Nearby Enemy Heroes:]* • Have their Physical Armor decreased by 20% .

**→ Modeled as:**
- `armor_shred` — strips 20% of the target's physical armor — so ALL your physical damage lands harder.
- `unmodeled` — **not modeled** — Fortification is a defensive armor aura (+5 per nearby enemy).

---

### Combustion  ·  3000g
**Base stats:** magical power 85, magical penetration 9, max mana 400

**Passive 1 — Pyro:** *[On dealing Ability Damage:]* • Deal 50 (+18% ) Damage to the Target and nearby Enemies.
**Passive 2 — Pyromaniac:** *[On damaging Heroes:]* • Reduce the Cooldown of Pyro by 0.5s .
**Passive 3 — :** Damage Dealt: {DamageDealt} Damage Dealt to Heroes: {DamageDealtHeroes}

**→ Modeled as:**
- `on_ability_hit` — each eligible ability adds 50 (+18% magical power) magical damage (≤ once / 15s per target).
- `unmodeled` — **not modeled** — Pyromaniac cooldown reduction is omitted. The recovered client requires a hero target, excludes Item, DoT and ProcDamage events, and uses a shared gate with a 0.05-second delayed reset. This is not unrestricted reduction on every damage packet. Scalar bindings, overlapping callbacks and native cooldown behavior remain unresolved; the simulator retains the catalog 15-second Pyro cooldown.

---

### Deathstalker  ·  3000g
**Base stats:** physical power 50, physical penetration 10, attack speed 20

**Passive 1 — Virulent Strikes:** *[On Basic Attacking Heroes:]* • Shred 3 Physical Armor for 3s On-Hit . • Stacks up to 4 times.
**Passive 2 — Onslaught:** • Gain (+100% ) Attack Speed .

**→ Modeled as:**
- `on_hit_armor_shred` — prior basic hits reduce armor by 3 per stack, up to 4 stacks with 3s shared expiry; uniform attack spacing is assumed.
- `stat_conversion` — converts 100% of physical penetration into attack speed.
- `unmodeled` — **not modeled** — Client triggers on hero on-hit events with a next-engine-tick gate. Production credits prior basic-hit stacks only, using uniform attack spacing and shared refresh. Ability/proc benefits, Mercy triggers, frame batching and cross-target state remain unmodeled. Three seconds is expiry, not a time-to-full ramp.

---

### Earthshaker  ·  3000g
**Base stats:** physical power 45, max health 300, ability haste 15

**Passive 1 — Battleborn:** *[On dealing damage to Heroes or Monsters:]* • Increase your Ability Damage dealt by 1.25% for 3s . • Stacks up to 10 times. • Melee Heroes gain Stacks twice as fast.
**Passive 2 — :** Damage Dealt: {DamageDealt} Damage Dealt to Heroes: {DamageDealtHeroes}

**→ Modeled as:**
- `damage_amp` — +12.5% to your ability damage (when window only, credited at partial uptime) — applied as an amp on every qualifying hit.

---

### Entropy  ·  3000g
**Base stats:** magical power 70, max mana 400, ability haste 15

**Passive 1 — Degradation:** *[On dealing Ability Damage:]* • Deal 3 (+3.5% ) additional Damage . • Each Ability can only trigger this effect once every 0.2s , per Target.
**Passive 2 — :** Damage Dealt: {DamageDealt} Damage Dealt to Heroes: {DamageDealtHeroes}

**→ Modeled as:**
- `on_ability_hit` — each eligible ability adds 3 (+3% magical power) magical damage (≤ once / 0.2s per target).

---

### Fist Of Razuul  ·  3000g
**Base stats:** max health 550, ability haste 20

**Passive 1 — Razuul's Might:** *[When dealing or receiving damage:]* • For the next 3s, generate a stack each second. • Upon reaching 4 stacks, Empower your next Basic Attack. • Deals (+2.5% ) bonus Damage , increased by 2x on Heroes & Monsters. • Heal for 50% of bonus damage dealt.
**Passive 2 — Minion Crusher:** • Deal 25% increased damage to Minions .
**Passive 3 — :** Damage Dealt: {DamageDealt} Damage Dealt to Heroes: {DamageDealtHeroes} Health Restored: {HealthRestored}

**→ Modeled as:**
- `on_hit` — every basic attack adds (+5% health) physical damage (≤ once / 4s) — rate-capped over the attack window.

---

### Infernum  ·  3000g
**Base stats:** physical power 45, physical penetration 9, max mana 250, ability haste 10

**Passive 1 — Cinder:** *[Damaging Abilities and Basic Attacks:]* • Apply stacks of Kindling to Enemy Units for 2.5s . • At 4 stacks, ignite them. • Deals 4 (+1.5% )% of their Max Health as Damage over 2s .
**Passive 2 — Furnace:** *[Based on Enemy Bonus Armor:]* • For each point, Cinder deals 0.8% more Damage .
**Passive 3 — :** Damage Dealt: {DamageDealt} Damage Dealt to Heroes: {DamageDealtHeroes}

**→ Modeled as:**
- `on_hit` — every basic attack adds 4% of target max HP physical damage (every 4th hit) — rate-capped over the attack window.
- `unmodeled` — **not modeled** — Cinder also adds +1.5%-of-physical-power to the %max-health (stat-scaled %health) and Furnace scales with enemy bonus armor; neither is cleanly expressible.

---

### Magnify  ·  3000g
**Base stats:** magical power 60, max health 300, ability haste 15, omnivamp 10

**Passive — Shredding Spells:** *[Upon damaging Heroes with an Ability:]* • Reduce their Magical Armor by 6% for 3.5s . • Stacks up to 5 times.

**→ Modeled as:**
- `armor_shred` — strips 30% of the target's magical armor (ramps over 8s) — so ALL your magical damage lands harder.

---

### Megacosm  ·  3000g
**Base stats:** magical power 65, max health 250, ability haste 10

**Passive 1 — Disintegrate:** *[On dealing Ability Damage:]* • Deal 2.5% of Target's Max Health as Damage over 3s . • Additional applications refresh the duration.
**Passive 2 — Star Killer:** *[On dealing Ability Damage to Heroes:]* • Deal 6% of Target's Bonus Health as Damage over 3s .
**Passive 3 — :** Damage Dealt: {DamageDealt} Damage Dealt to Heroes: {DamageDealtHeroes}

**→ Modeled as:**
- `on_ability_hit` — each eligible ability adds 2.5% of target max HP magical damage (≤ once / 3s per target).
- `unmodeled` — **not modeled** — Star Killer (6% of target BONUS health) needs a base/bonus health split the reference profiles do not carry

---

### Noxia  ·  3000g
**Base stats:** magical power 90, ability haste 20

**Passive 1 — Evil Eye:** *[Mark Heroes for 3s upon dealing Ability Damage:]* • With a separate ability, deal damage to a Marked Hero to activate Dark Matter .
**Passive 2 — Dark Matter:** • Deal 6% of Target's Maximum Health as bonus Damage .
**Passive 3 — :** Damage Dealt: {DamageDealt}

**→ Modeled as:**
- `on_ability_hit`, `marked_target` — reserve the first ability hit for marking; remaining hits receive aggregate 6% max-HP magical proc credit capped by the global 8s cooldown. This is provisional: mark expiry, ability identity, repeated ticks and source ownership are not simulated. A lone hit on an initially unmarked target gives no proc damage.

---

### Orb Of Enlightenment  ·  3000g
**Base stats:** magical power 70, max health 250, max mana 250

**Passive 1 — Enlightened:** *[For each Hero Level:]* • Gain 3 Magical Power . • Gain 12 Health .
**Passive 2 — Art Of Fortitude:** *[On Ability Cast:]* • Restore 3% Missing Health over 5s .
**Passive 3 — :** Health Restored: {HealthRestored}

**→ Modeled as:**
- `stat_flat` — +0 (+3/level) magical power — straight into the build's stat totals.
- `stat_flat` — +0 (+12/level) health — straight into the build's stat totals.
- `unmodeled` — **not modeled** — Art of Fortitude restores 3% missing health over 5s on cast; health-state-dependent sustain is unmodeled.

---

### Orb Of Growth  ·  3000g
**Base stats:** magical power 70, max health 250, max mana 250

**Passive 1 — Inner Growth:** *[On Killing Units, gain bonus XP :]* • Minions and Monsters grant 6 . • Camp Leaders grant 15 . • Takedowns grant 50 . • On gaining 500 bonus XP : • Enter Base to Evolve this item into Orb Of Enlightenment .
**Passive 2 — Art Of Fortitude:** *[On Ability Cast:]* • Restore 3% Missing Health over 5s .
**Passive 3 — :** Health Restored: {HealthRestored}

**→ Modeled as:**
- `stat_flat` — +0 (+3/level) magical power — straight into the build's stat totals.
- `stat_flat` — +0 (+12/level) health — straight into the build's stat totals.
- `unmodeled` — **not modeled** — This is the item the field actually BUYS; it evolves (~500 bonus XP, mid-game) into Orb of Enlightenment, so it is credited at its evolved per-level MP/HP value. Inner Growth's bonus-XP economy (faster leveling) and Art of Fortitude's 3% missing-health heal stay unmodeled (out of combat scope). Pre-evolution the per-level growth is slightly optimistic; evolution-timing gating is a future refinement.

---

### Painweaver  ·  3000g
**Base stats:** physical power 55, physical penetration 10, movement speed 3

**Passive — Splice:** *[On Ability Cast:]* • Gain 2 Physical Penetration for 4s . • Gain 2% Movement Speed for 4s . • Stacks up to 4 times.

**→ Modeled as:**
- `flat_pen` — 8 flat physical pen (ramps over 8s).

---

### Plasma Blade  ·  3000g
**Base stats:** physical power 35, magical power 45, attack speed 30, critical chance 20

**Passive — Vibro Cutter:** *[On Basic Attacking Heroes:]* • Gain 4% Critical Strike Chance for 3s . • Stacks up to 5 times.

**→ Modeled as:**
- `ramp_to_stat` — stacks up to +20 critical chance over a fight; credited at 60% mean uptime.

---

### Prophecy  ·  3000g
**Base stats:** magical power 75, attack speed 30, ability haste 15

**Passive 1 — Magical Strikes:** *[On Basic Attacks:]* • Deal 20 (+15% ) Damage On-Hit .
**Passive 2 — :** Damage Dealt: {DamageDealt} Damage Dealt to Heroes: {DamageDealtHeroes}

**→ Modeled as:**
- `on_hit` — every basic attack adds 20 (+15% magical power) magical damage — rate-capped over the attack window.

---

### Spectral Schematics  ·  3000g
**Base stats:** magical power 55, max health 300, ability haste 20

**Passive 1 — Breakthrough:** *[Upon Immobilzing an Enemy Unit:]* • Deal 40 (+5% Target's Current Health) additional Damage .
**Passive 2 — :** Damage Dealt: {DamageDealt} Damage Dealt to Heroes: {DamageDealtHeroes}

**→ Modeled as:**
- `on_ability_hit` — each reviewed root/stun cast that lands adds 40 + 5% of target current HP magical damage.
- `unmodeled` — **not modeled** — Partial trigger coverage: one proc per reviewed root/stun cast that lands on one target. Displacement-only, empowered, stacked and stance-dependent CC are not credited. Delays, stored charges, repeated applications, immunity and target current-health progression are unmodeled.

---

### Stonewall  ·  3000g
**Base stats:** max health 275, physical armor 70, health regeneration 100

**Passive — Bulwark:** • Mitigate 5 (+5% )% of Physical Damage .

**→ Modeled as:**
- `damage_reduction` — {"kind":"damage_reduction","pct":5,"damageType":"physical"}
- `unmodeled` — **not modeled** — Base 5% physical mitigation credited to physical EHP; the (+5%) scaling term (per-stat, unstated) is not.

---

### Tainted Bastion  ·  3000g
**Base stats:** max health 250, magical armor 45, health regeneration 80, ability haste 8

**Passive 1 — Blighted Veil:** *[On taking Magical Damage :]* • Reduce the Source's Healing by 45% for 3s .
**Passive 2 — Colossus:** • Mitigate 3.5% of damage taken. • Doubled against Blighted Targets.

**→ Modeled as:**
- `anti_heal` — cuts the target's healing by 45% — matters vs sustain.
- `unmodeled` — **not modeled** — Colossus is flat damage mitigation (defensive).

---

### Tainted Guard  ·  3000g
**Base stats:** max health 250, physical armor 55, ability haste 8

**Passive 1 — Blighted Thorns:** *[On being hit by a Basic Attack:]* • Reduce the Source's Healing by 45% for 3s . • Apply a Bleed dealing 30 (+30% ) Damage over 3s .
**Passive 2 — :** Damage Dealt: {DamageDealt} Damage Dealt to Heroes: {DamageDealtHeroes}

**→ Modeled as:**
- `anti_heal` — cuts the target's healing by 45% — matters vs sustain.
- `unmodeled` — **not modeled** — Bleed thorns require incoming basic attacks; no incoming-attack model yet

---

### Tainted Rounds  ·  3000g
**Base stats:** physical power 35, attack speed 30, critical chance 20

**Passive 1 — Blighted Strikes:** *[On Successful Basic Attacks:]* • Reduce the Target's Healing by 45% for 3s . • Deal (+10% ) (+20% ) Damage On-Hit . • Increases by up to 100% as the Target's Health decreases.
**Passive 2 — :** Damage Dealt: {DamageDealt} Damage Dealt to Heroes: {DamageDealtHeroes}

**→ Modeled as:**
- `anti_heal` — cuts the target's healing by 45% — matters vs sustain.
- `on_hit` — every basic attack adds (+10% physical power) magical damage — rate-capped over the attack window.
- `unmodeled` — **not modeled** — second on-hit scaling term (icon-ambiguous) and missing-health amplification up to +100%

---

### Tainted Scepter  ·  3000g
**Base stats:** magical power 75, max health 200, ability haste 10

**Passive 1 — Blighted Spells:** *[On Dealing Magical Damage :]* • Reduce the Target's Healing by 45% for 4s .
**Passive 2 — Malice:** *[Once every second:]* • Gain a stack of Malice . • Stacks up to 15 times. • Takedowns grant 15 stacks instantly. • Hitting a Hero with Ability Damage will deal 1.5 (+1% ) Damage per stack.
**Passive 3 — :** Damage Dealt: {DamageDealt}

**→ Modeled as:**
- `anti_heal` — cuts the target's healing by 45% — matters vs sustain.
- `on_ability_hit` — each eligible ability adds 22.5 (+15% magical power) magical damage.
- `unmodeled` — **not modeled** — Malice currently uses a 15-second damage ramp in the production simulator. The recovered client instead starts with full stacks, consumes stacks on eligible hero damage, and replenishes them through timed callbacks or takedowns. Item and proc damage are excluded. Diagnostic state-transition tests exist, but native defaults, timer phase and event ordering are unresolved; this production ramp does not reproduce that stack cycle.

---

### Timewarp  ·  3000g
**Base stats:** magical power 75, mana regeneration 150, ability haste 25

**Passive — Chime:** *[Every 8s:]* • Subtract 1s from Non-Ultimate Cooldowns .

**→ Modeled as:**
- `cooldown_rate` — 12.5% faster non-ultimate cooldowns — more casts per fight.

---

### Dust Devil  ·  2950g
**Base stats:** physical power 30, attack speed 30, critical chance 20, movement speed 4

**Passive 1 — Menace:** *[On Basic Attacking Heroes:]* • Gain 3% Attack Speed for 3s On-Hit . • Stacks up to 5 times. • At 5 stacks gain 10% Movement Speed . • Critical Strikes grant 2 stacks.
**Passive 2 — :** Menace Time: {MenaceTime}s

**→ Modeled as:**
- `ramp_to_stat` — stacks up to +15 attack speed over a fight; credited at 60% mean uptime.
- `unmodeled` — **not modeled** — At 5 stacks grants 10% movement speed (out of scope).

---

### Equinox  ·  2950g
**Base stats:** physical power 40, attack speed 30, critical chance 20, tenacity 20

**Passive — Adamance:** *[On going below 40% Health :]* • Gain a 350-750 Shield for 4s . • Shield size increases with Level .

**→ Modeled as:**
- `shield_per_fight` — ~350 shield per fight — counted as effective HP.

---

### Spirit Of Amir  ·  2950g
**Base stats:** magical power 80, max health 200, magical penetration 7, ability haste 10

**Passive 1 — Natural Selection:** *[Gain Effects, based on your location:]* • In the Jungle: Gain 8% Magical Lifesteal . • Outside the Jungle: Gain 8% Magical Power .
**Passive 2 — Monster Slayer:** • Abilities deal 12% more damage to Monsters .
**Passive 3 — :** Damage Dealt: {DamageDealt}

**→ Modeled as:**
- `stat_multiplier` — multiplies magical power by 1.08× before the sim runs.
- `unmodeled` — **not modeled** — Jungle branch grants magical lifesteal instead, and Monster Slayer is +12% vs monsters (PvE).

---

### Catalytic Drive  ·  2900g
**Base stats:** max health 250, magical armor 40, health regeneration 80, ability haste 10

**Passive 1 — Deconstruct:** *[Against Minions & Small Monsters:]* • Your next Basic Attack On-Hit Executes them. • Deals 60 (+5% ) Damage to nearby Enemies. • Heals you for 30 (+3% ) . • Grants you +8 bonus Gold .
**Passive 2 — Converter:** *[Upon Executing 20 Units:]* • Enter Base to Evolve this item into Cybernetic Drive .
**Passive 3 — :** Health Restored: {HealthRestored}

**→ Modeled as:**
- `armor_multiplier` — armor ×1.12 — raises effective HP vs that damage type.
- `unmodeled` — **not modeled** — This is the buyable; it evolves into Cybernetic Drive, so it is credited with that form's +12% total armor (Cybernetic Conversion). The PvE execute/AoE/heal (Deconstruct) and the +gold stay unmodeled (out of combat scope).

---

### Caustica  ·  2900g
**Base stats:** magical power 75, mana regeneration 100

**Passive 1 — Magus:** • Ignore 35% of Magical Armor .
**Passive 2 — Arcane Might:** *[On dealing Ability Damage to a Hero:]* • While they are above 50% Health . • For every point of Bonus Magical Armor they possess. • Deal 0.2% more Damage .
**Passive 3 — :** Damage Dealt: {DamageDealt}

**→ Modeled as:**
- `percent_pen` — 35% magical penetration (multiplicative, 1.14 rule).
- `unmodeled` — **not modeled** — Arcane Might: +0.2% damage per point of target bonus Magical Armor while above 50% health

---

### Cybernetic Drive  ·  2900g
**Base stats:** max health 250, magical armor 45, health regeneration 100, ability haste 10

**Passive 1 — Lesser Deconstruct:** *[Against Minions & Small Monsters:]* • Your next Basic Attack On-Hit Executes them. • Deals 80 (+5% ) Damage to nearby Enemies. • Heals you for 30 (+3% ) .
**Passive 2 — Cybernetic Conversion:** • Gain 12% Total Physical Armor . • Gain 12% Total Magical Armor .
**Passive 3 — :** Health Restored: {HealthRestored}

**→ Modeled as:**
- `armor_multiplier` — armor ×1.12 — raises effective HP vs that damage type.
- `unmodeled` — **not modeled** — Lesser Deconstruct executes minions/small monsters (PvE).

---

### Elafrost  ·  2900g
**Base stats:** max health 325, physical armor 45, mana regeneration 125, ability haste 15

**Passive 1 — Frostblade:** *[On Ability Cast:]* • Empower your next Basic Attack within 4s . • Deal 70 (+2% ) Damage On-Hit around the Target. • Slows by 35% for 1.5s . • Damage is increased by 60% against Monsters .
**Passive 2 — :** Damage Dealt: {DamageDealt} Damage Dealt to Heroes: {DamageDealtHeroes} Times Applied to Heroes: {TimesApplied}

**→ Modeled as:**
- `on_ability_hit` — each eligible ability adds 70 (+2% health) magical damage (≤ once / 4s per target).

---

### Inquisition  ·  2900g
**Base stats:** max health 275, max mana 200, magical armor 40, ability haste 10

**Passive 1 — Psywave:** *[On Ability Cast:]* • Emit a wave of energy. • Deals 65 (+1.5% ) Damage to Enemies in the area. • Damage is increased by 45% against Monsters .
**Passive 2 — :** Damage Dealt: {DamageDealt} Damage Dealt to Heroes: {DamageDealtHeroes}

**→ Modeled as:**
- `on_ability_hit` — each eligible ability adds 65 (+1.5% health) magical damage.

---

### Mindrazor  ·  2900g
**Base stats:** physical power 45, max mana 300, ability haste 15

**Passive 1 — Razor Cleave:** *[On Successful Basic Attack:]* • Deal (+40% ) Damage around the Target. • Damage decreases from 100% to 50% based on distance.
**Passive 2 — Technician:** • Gain (+2% ) Physical Power .
**Passive 3 — :** Damage Dealt: {DamageDealt} Damage Dealt to Heroes: {DamageDealtHeroes} Power Gained: {PowerGained}

**→ Modeled as:**
- `stat_conversion` — converts 2% of max mana into physical power.
- `unmodeled` — **not modeled** — Razor Cleave is AoE splash around the target (multi-target), no single-target value.

---

### Necrosis  ·  2900g
**Base stats:** physical power 40, attack speed 35, critical chance 20

**Passive 1 — Necro's Edge:** • Gain 25 Ultimate Haste .
**Passive 2 — Matter Disruptor:** • Your Ultimate Ability deals 15% more damage.

**→ Modeled as:**
- `haste` — +25 ultimate haste — shortens the relevant cooldowns.
- `damage_amp` — +15% to your ultimate damage — applied as an amp on every qualifying hit.

---

### Spear Of Desolation  ·  2900g
**Base stats:** physical power 45, physical penetration 12, ability haste 10

**Passive 1 — Final Hour:** *[On casting your Ultimate:]* • Deal 10% increased damage for 6s .
**Passive 2 — Razor's Edge:** • Gain 25 Ultimate Haste .
**Passive 3 — :** Activations: {Activations}

**→ Modeled as:**
- `haste` — +25 ultimate haste — shortens the relevant cooldowns.
- `damage_amp` — +10% to your damage (when window only, credited at partial uptime) — applied as an amp on every qualifying hit.

---

### Tainted Trident  ·  2900g
**Base stats:** physical power 45, physical penetration 11, ability haste 10

**Passive 1 — Blighted Strikes:** *[On dealing Physical Damage :]* • Reduce the Target's Healing by 45% for 3s .
**Passive 2 — Woundseeker:** *[On dealing Ability Damage to a Blighted Unit:]* • Deal 3 (+6% ) % additional Damage .
**Passive 3 — :** Damage Dealt: {DamageDealt}

**→ Modeled as:**
- `anti_heal` — cuts the target's healing by 45% — matters vs sustain.
- `unmodeled` — **not modeled** — Woundseeker adds a small ability bonus that scales with physical penetration (3 +6%-of-pen %), gated on a self-applied Blighted mark; a stat-scaled conditional amp with no clean primitive.

---

### Orion  ·  2850g
**Base stats:** magical power 80, max mana 300, ability haste 15

**Passive 1 — Hasty:** • Gain Attack Speed equal to 80% of your Ability Haste from Items.
**Passive 2 — Interstellar:** *[Upon successful On-Hit Attack:]* • Deal 2% increased damage to the Target for 3.5s , up to a maximum of 16% .
**Passive 3 — :** Damage Dealt: {DamageDealt} Damage Dealt to Heroes: {DamageDealtHeroes}

**→ Modeled as:**
- `stat_conversion` — converts 80% of ability haste into attack speed.
- `damage_amp` — +16% to your damage (when window only, credited at partial uptime) — applied as an amp on every qualifying hit.

---

### Tyranny  ·  2850g
**Base stats:** physical power 45, max health 300, ability haste 10

**Passive 1 — Oppression:** *[On casting your Ultimate:]* • Gain 30% Decaying Movement Speed over 4s . • Gain 20 Ability Haste for 8s . • Takedowns within this time re-trigger Oppression .
**Passive 2 — Tyrant's Edge:** • Gain 20 Ultimate Haste .
**Passive 3 — :** Activations: {Activations} Times Retriggered: {Retriggers}

**→ Modeled as:**
- `haste` — +20 ultimate haste — shortens the relevant cooldowns.
- `unmodeled` — **not modeled** — Oppression grants a timed +20 ability haste window after ulting (uptime-dependent) plus MS; out of scope.

---

### Echelon Cloak  ·  2800g
**Base stats:** physical power 45, attack speed 25, max health 250, ability haste 10

**Passive 1 — Shadow:** *[On standing still and unharmed for 2s:]* • Become Camouflaged . • Moving 800u from this location, casting an ability, or receiving damage ends this effect.
**Passive 2 — Unseen Threat:** *[While Camouflaged:]* • Gain 1% of your Missing Health and Mana every second. • Increase your damage dealt by 8% . • Lasts 3s after exiting Camouflage .
**Passive 3 — :** Health Restored: {HealthRestored} Mana Restored: {ManaRestored}

**→ Modeled as:**
- `damage_amp` — +8% to your damage (when burst only, credited at partial uptime) — applied as an amp on every qualifying hit.
- `unmodeled` — **not modeled** — Camouflage requires standing still 2s and grants missing-HP/mana regen; only the opener burst is credited.

---

### Flux Matrix  ·  2800g
**Base stats:** max health 300, magical armor 45, ability haste 15

**Passive — Unstable Shackles:** *[Nearby Enemy Heroes:]* • Take 10% additional Magical Damage . • Have their Tenacity decreased by 50% .

**→ Modeled as:**
- `damage_amp` — +10% to your ability damage (when window only, credited at partial uptime) — applied as an amp on every qualifying hit.

---

### Manta Scythe  ·  2800g
**Base stats:** physical power 30, physical penetration 10, attack speed 25, lifesteal 7

**Passive 1 — Insatiable Harvest:** *[On Basic Attack:]* • Deal 1.5x damage to Minions and Small Monsters . • Upon killing Siege Minions and Camp Leaders , permanently gain +0.5 Physical Power .
**Passive 2 — Divide & Conquer:** *[Against Enemy Units within 2500u:]* • If they have no Ally within 1000u of themselves, deal 8% more damage to them.
**Passive 3 — :** Insatiable Harvest Damage Dealt: {DamageDealt}

**→ Modeled as:**
- `damage_amp` — +8% to your damage — applied as an amp on every qualifying hit.
- `unmodeled` — **not modeled** — Insatiable Harvest is a PvE 1.5x-to-minions + per-kill PP farming stack.

---

### Spectra  ·  2800g
**Base stats:** attack speed 50, ability haste 10

**Passive 1 — Radiant Strikes:** *[On Basic Attacks:]* • Deal 20 Damage On-Hit . • Reduces the Cooldown of Prisma by 3s . • Applies a stack of Prism to Heroes & Monsters for 2.5s , stacking up to 3 times. • If the Target has 3 Prism stacks on them, trigger Prisma .
**Passive 2 — Prisma:** • Deals 30 ( +4 per Level) Damage . • Increases from 1x-2.5x based on Target's Missing Health .
**Passive 3 — :** On-Hit Damage Dealt: {DamageDealt} True Damage Dealt: {TrueDamageDealt} True Damage Dealt to Heroes: {TrueDamageDealtHeroes}

**→ Modeled as:**
- `on_hit` — every basic attack adds 20 magical damage — rate-capped over the attack window.
- `on_hit` — every basic attack adds 30 (+4/lvl) magical damage (≤ once / 2.5s) — rate-capped over the attack window.

---

### Nuclear Rounds  ·  2650g
**Base stats:** attack speed 55, critical chance 20, ability haste 20

**Passive 1 — Havoc:** *[Based on Critical Strike Chance:]* • Increase Ability Damage by 10-20% .
**Passive 2 — :** Damage Dealt: {DamageDealt}

**→ Modeled as:**
- `damage_amp_from_crit` — {"kind":"damage_amp_from_crit","minPct":10,"maxPct":20,"scope":"abilities"}

---

### Dynamo  ·  2400g
**Base stats:** max health 300, physical armor 30, ability haste 10

**Passive 1 — Immobilizer:** *[On Immobilizing an Enemy:]* • They take 8% more damage for 2.5s .
**Passive 2 — Adaptive Aggression:** • Gain 20 Physical Power . • When your Magical Power > Bonus Physical Power . • Gain 30 Magical Power instead.
**Passive 3 — :** Times Applied: {TimesApplied}

**→ Modeled as:**
- `damage_amp` — +8% to your damage (when window only, credited at partial uptime) — applied as an amp on every qualifying hit.
- `unmodeled` — **not modeled** — Immobilizer currently assumes an immobilization window; Adaptive Aggression (20 physical or 30 magical power depending on build) is not represented.

---

### Marshal  ·  2400g
**Base stats:** magical power 45, mana regeneration 100, ability haste 15

**Passive 1 — Sheriff:** *[Buff yourself and nearby Heroes to:]* • Gain 15% Attack Speed . • Deal 10 (+1 Per Level) Damage On-Hit .
**Passive 2 — :** Damage Dealt: {DamageDealt} Damage Dealt to Heroes: {DamageDealtHeroes}

**→ Modeled as:**
- `stat_flat` — +15 attack speed — straight into the build's stat totals.
- `on_hit` — every basic attack adds 10 (+1/lvl) physical damage — rate-capped over the attack window.


---

## ⚠️ Honestly unmodeled (out of a single-hero damage sim's scope — reason stated)

### Terminus  ·  3150g
**Base stats:** physical power 60, critical chance 20, lifesteal 15

**Passive — Anon:** *[On Overhealing from Lifesteal:]* • Convert excess Healing into a Shield . • Max Shield size: (+100% ) . • The Shield slowly decays 15s after leaving combat.

**→ Modeled as:**
- `unmodeled` — **not modeled** — overheal-to-shield needs a health-state model; the 15% lifesteal line is valued by the sustain objective

---

### Absolution  ·  3100g
**Base stats:** physical power 30, attack speed 35, magical armor 40, tenacity 25

**Passive 1 — Bravery:** *[On being Immobilized :]* • Gain 25% Damage Mitigation . • Gain 40% Movement Speed . • Lasts 3s .
**Passive 2 — :** Activations: {Activations}

**→ Modeled as:**
- `unmodeled` — **not modeled** — A defensive, CC-triggered mitigation buff; no incoming-mitigation primitive.

---

### Crystalline Cuirass  ·  3100g
**Base stats:** max health 300, magical armor 60, movement speed 3

**Passive 1 — Celestial Carapace:** *[On taking Magical Damage :]* • Gain a stack of Celestite for 5s . • Stacks up to 5 times. • Stacks can only be gained once every 0.5s .
**Passive 2 — Celestite:** • Gain 5 Magical Armor per stack. • At 5 stacks gain 12% Movement Speed .
**Passive 3 — :** Celestite Time: {CelestiteTime}s

**→ Modeled as:**
- `unmodeled` — **not modeled** — A defensive stack gained from incoming magical damage.

---

### Lightning Hawk  ·  3100g
**Base stats:** physical power 55, attack speed 25, critical chance 20

**Passive 1 — Chilling Momentum:** *[While moving or landing Basic Attacks:]* • Generate stacks of Momentum . • At 100 stacks empower your next Basic Attack On-Hit . • Deal 40 (+20% ) Damage . • Slows by 20% for 0.75s .
**Passive 2 — :** Damage Dealt: {DamageDealt} Damage Dealt to Heroes: {DamageDealtHeroes}

**→ Modeled as:**
- `unmodeled` — **not modeled** — Momentum proc cadence remains unmodeled. Recovered movement grants use straight-line displacement sampled after 0.25 seconds, rounded down per 50 world units; fractional travel is not carried between samples. Basic-hit grants depend on unresolved scalar defaults and native event scaling, with separate AoE gating. Movement sampling is tested diagnostically, but total charge rate and successful proc timing are not verified.

---

### Raiment of Renewal  ·  3100g
**Base stats:** max health 700, health regeneration 50, ability haste 15, tenacity 20

**Passive 1 — Regenerator:** *[While Out Of Combat:]* • Regenerate 3% of your Missing Health each second.
**Passive 2 — Synthesis:** *[For each Level:]* • Gain 5% additional Base Health Regen .

**→ Modeled as:**
- `unmodeled` — **not modeled** — out-of-combat missing-health regen — outside the in-fight window

---

### Scattershot  ·  3100g
**Base stats:** physical power 50, attack speed 25, critical chance 20

**Passive 1 — Scatter:** *[Upon successful On-Hit Attack:]* • Summon 2 projectiles from the Target. • These home towards the closest Enemies. • Each deals (+40% ) Damage . • Applies On-Hit effects at 50% effectiveness. • Can Critically Strike and deals 1.5x damage to Minions .
**Passive 2 — :** Damage Dealt: {DamageDealt} Damage Dealt to Heroes: {DamageDealtHeroes}

**→ Modeled as:**
- `unmodeled` — **not modeled** — Scattershot is not simulated in populated scenes: its target search excludes the triggering enemy and attempts two nearby secondary-target projectiles behind a cooldown gate. The second attempt can retain the first target. With no eligible secondary targets it spawns none, so a truly isolated one-enemy scene gets no Scattershot projectile damage. Saved lock-on-only collision is enforced by a native guard, with a custom-hit-interface exception. Collision outcomes, critical-strike resolution and downstream passive interactions still need integration; the shared damage path passes its captured on-hit percentage through event data.

---

### Solstice  ·  3100g
**Base stats:** physical power 40, physical armor 30, magical armor 30

**Passive 1 — Pendulum:** • Gain 25 stacks each second, up to 100 Max. • Takedowns grant you Max stacks.
**Passive 2 — Mornfall:** *[On Basic Attack:]* • Consume all Pendulum stacks. • Deal 10 Damage . • Increased by (+0-50% ) , based on stacks consumed. • Damage is increased by 2x at Max stacks. • Heals for 135% of the damage dealt to Heroes .
**Passive 3 — :** Damage Dealt: {DamageDealt} Damage Dealt to Heroes: {DamageDealtHeroes} Health Restored: {HealthRestored}

**→ Modeled as:**
- `unmodeled` — **not modeled** — Stack-consume cadence and the scaling base are unstated/ambiguous.

---

### Vainglory  ·  3100g
**Base stats:** max health 200, physical armor 45, magical armor 40

**Passive 1 — Pride:** *[Upon dealing or taking Hero Damage:]* • Gain a stack of Vanity for 4s . • Each stack grants +0.5% increased Armors . • Max Stacks: 10 .
**Passive 2 — In Vain:** *[While at Max Vanity stacks:]* • Gain an additional 12% increased Armors .
**Passive 3 — :** Time In Vain: {TimeInVain}s

**→ Modeled as:**
- `unmodeled` — **not modeled** — Pride grants 0.5% armors per stack (10 maximum); In Vain grants an additional 12% only at maximum stacks. Neither is unconditional; stack state is not represented.

---

### Warden's Faith  ·  3100g
**Base stats:** max health 300, physical armor 70

**Passive 1 — Stalwart:** • Take 20% less damage from Critical Strikes .
**Passive 2 — Mocking Presence:** *[Nearby Enemy Heroes:]* • Have their Physical Power reduced by 8% .

**→ Modeled as:**
- `unmodeled` — **not modeled** — Both are defensive/debuff (crit mitigation, enemy-power reduction); no offensive primitive.

---

### Berserker's Axe  ·  3050g
**Base stats:** physical power 45, max health 275, ability haste 15, movement speed 3

**Passive 1 — Blitz:** *[On Dashing or Leaping:]* • Empower your next Basic Attack within 3s . • Deal 50 (+40% ) Damage . • Slows by 55% for 1s .
**Passive 2 — Mist Runner:** *[On crossing a Fog Wall:]* • Gain 15% Movement Speed for 1.5s .
**Passive 3 — :** Damage Dealt: {DamageDealt} Damage Dealt to Heroes: {DamageDealtHeroes} Times Triggered: {TimesTriggered}

**→ Modeled as:**
- `unmodeled` — **not modeled** — The empowered-basic cadence depends on the hero mobility cooldowns, which are not modeled.

---

### Amulet Of Chaos  ·  3000g
**Base stats:** magical power 95, magical penetration 11

**Passive 1 — Deadly Wish:** *[On Takedown:]* • Reduce your current Basic Ability Cooldowns by 65% . • Restore 35% of your Missing Mana .
**Passive 2 — :** Mana Restored: {ManaRestored}

**→ Modeled as:**
- `unmodeled` — **not modeled** — Takedown-gated; a 1v1 kill-window sim has no takedown model.

---

### Draconum  ·  3000g
**Base stats:** physical power 45, physical armor 40, ability haste 15

**Passive 1 — Surge:** *[On dealing damage to Heroes or Monsters:]* • Gain 2% increased Healing for 5s . • Stacks up to 10 times.
**Passive 2 — Flow:** *[On Takedown:]* • Restore (+120% )(+6% ) Health .
**Passive 3 — :** Health Restored: {HealthRestored}

**→ Modeled as:**
- `unmodeled` — **not modeled** — healing-amp stacks and an on-takedown heal — sustain/economy, not single-target combat damage

---

### Fire Blossom  ·  3000g
**Base stats:** max health 350, physical armor 50

**Passive 1 — Heatwave:** *[Burn nearby Enemy Units:]* • Deals 15 (+1% ) Damage each second. Firestorm - When Heatwave damages a Target: • Deals 5% more damage each second, up to 40% . • Resets after not damaging the Target for 2.5s .
**Passive 2 — :** Damage Dealt: {DamageDealt} Damage Dealt to Heroes: {DamageDealtHeroes}

**→ Modeled as:**
- `unmodeled` — **not modeled** — proximity burn aura; uptime depends on positioning the closed-form sim cannot observe

---

### Frostguard  ·  3000g
**Base stats:** max health 200, physical armor 40, magical armor 40

**Passive 1 — Chilling Presence:** *[On being near Enemy Heroes:]* • Apply a stack of Stifle every 1s .
**Passive 2 — Stifle:** *[On being hit by a Basic Attack:]* • Reduce the Source's Attack Speed by 3.5% for 2.5s . • Stacks up to 5 times.
**Passive 3 — :** Times Applied: {TimesApplied}

**→ Modeled as:**
- `unmodeled` — **not modeled** — A defensive, incoming-basic-gated debuff.

---

### Golem's Gift  ·  3000g
**Base stats:** magical power 75, physical armor 40, mana regeneration 100, ability haste 15

**Passive 1 — Stone Skin:** *[When out of combat:]* • Gain 5 stacks of Stone Skin . • Gain 4 Magical Power and 4 Physical Armor per stack.
**Passive 2 — Stoneweaver:** • On taking Physical Damage from a Hero: Lose 1 stack. • On casting an Ability: Restore 1 stack.

**→ Modeled as:**
- `unmodeled` — **not modeled** — Stacks build out of combat and deplete in a fight; net in-fight uptime is indeterminate.

---

### Legacy  ·  3000g
**Base stats:** physical power 40, max health 225, magical armor 40, tenacity 25

**Passive 1 — Tenacious Bravery:** *[On going below 40% Health :]* • Self Cleanse . • Gain CC Immunity for 3s .
**Passive 2 — :** Activations: {Activations}

**→ Modeled as:**
- `unmodeled` — **not modeled** — A defensive, health-state-gated cleanse/immunity.

---

### Lifecore  ·  3000g
**Base stats:** magical power 85, max mana 350, ability haste 15, heal shield increase 12

**Passive 1 — Life Extraction:** *[Upon damaging Heroes:]* • Gain charges equal to 15% of damage dealt. • At 100 charges, damage a Hero to trigger Healing Wisp .
**Passive 2 — Healing Wisp:** • Fire a healing wisp at the Lowest Health Allied Hero within a 1000u radius. • Heals for 100 (+40% ) .
**Passive 3 — :** Health Restored: {HealthRestored}

**→ Modeled as:**
- `unmodeled` — **not modeled** — A team-side ally heal, not the holder damage.

---

### Mistmeadow Buckler  ·  3000g
**Base stats:** physical power 45, magical armor 40, health regeneration 125, ability haste 15

**Passive 1 — Mistwood Guard:** • Gain 100 charges. Regenerate 5 charges each second. • While at 100 charges, gain 15 Magical Armor .
**Passive 2 — Bark Skin:** *[On taking Magical Damage :]* • Consume Mistwood Guard charges. • Block 1 Damage for each charge consumed. • Can block up to 50% of the Damage received.
**Passive 3 — :** Magical Damage Blocked: {DamageBlocked}

**→ Modeled as:**
- `unmodeled` — **not modeled** — Defensive, incoming-magical mitigation from a regenerating charge pool.

---

### Omen  ·  3000g
**Base stats:** physical power 50, physical penetration 10, ability haste 10

**Passive — Bestial Momentum:** *[While moving or landing Basic Attacks:]* • Generate stacks of Momentum . • At 100 stacks empower your next Basic Attack On-Hit . • Deal 30 (+20% ) Damage . • Reduce your Non-Ultimate Cooldowns by 20% .

**→ Modeled as:**
- `unmodeled` — **not modeled** — The Momentum stack cadence (movement + attacks) is unstated.

---

### Overlord  ·  3000g
**Base stats:** physical power 30, max health 275

**Passive 1 — Colossal Cleave:** *[On Successful Basic Attack:]* • Deal (+1% ) Damage . • Deal (+30% ) (+2.5% ) Damage around the Target. • Damage decreases from 100% to 50% based on distance.
**Passive 2 — Devourer:** *[On Killing an Enemy Unit:]* • Permanently gain 1 Health . • Camp Leaders grant 3 . • Heroes grant 5 . • Upon reaching 100 stacks, gain an additional 125 Health .
**Passive 3 — :** Single Target Damage Dealt to Heroes: {DamageDealt} Cleave Damage Dealt: {CleaveDamageDealt} Cleave Damage Dealt to Heroes: {CleaveDamageDealtHeroes}

**→ Modeled as:**
- `unmodeled` — **not modeled** — cleave is multi-target value (no single-target change at this text precision); Devourer health stacking is kill-economy

---

### Rebirth  ·  3000g
**Base stats:** physical power 45, max health 275

**Passive 1 — Mechanica:** *[Upon Dying :]* • After 3s , Resurrect with 50% Base Health & Max Mana .
**Passive 2 — :** Resurrections: {Resurrections}

**→ Modeled as:**
- `unmodeled` — **not modeled** — A death-revive mechanic; out of any damage/EHP model.

---

### Ruination  ·  3000g
**Base stats:** physical power 70, critical chance 20, ability haste 10

**Passive — Spirit Bleed:** *[Upon successful On-Hit Attack:]* • Apply a bleed that drains Mana by 30 (+8% Target's Max Mana) over 4s . • Deals True Damage equal to 80% of the Mana Drained . • Damaging the Target with an Ability while Spirit Bleed is active will refresh its duration.

**→ Modeled as:**
- `unmodeled` — **not modeled** — Damage scales with the target max mana; target-mana-dependent, out of scope.

---

### Salvation  ·  3000g
**Base stats:** physical power 40, max health 375, tenacity 25

**Passive — Aegis:** *[On going below 30% Health :]* • Gain a (+25% ) Shield for 6s . • Reduced to 50% Effectiveness for Ranged Heroes. • Gain 10% Omnivamp for 6s .

**→ Modeled as:**
- `unmodeled` — **not modeled** — A defensive, health-state-gated shield/sustain.

---

### Soulbinder  ·  3000g
**Base stats:** magical power 85, max mana 400, ability haste 20

**Passive 1 — Arcane Salvo:** *[Damage Heroes from afar with Abilities:]* • Deal 8% bonus Damage . • Activates at 1450+ Range .
**Passive 2 — Farseer:** *[Upon triggering Arcane Salvo:]* • Permanently gain 1 Magical Power .
**Passive 3 — :** Damage Dealt: {DamageDealt}

**→ Modeled as:**
- `unmodeled` — **not modeled** — Arcane Salvo grants 8% bonus ability damage only at 1450+ range; Farseer permanently grants 1 magical power on triggering it (8s cooldown). Range and historical stacks are not represented.

---

### Storm Breaker  ·  3000g
**Base stats:** physical power 40, attack speed 30

**Passive 1 — Electric Momentum:** *[While moving or landing Basic Attacks:]* • Generate stacks of Momentum . • At 100 stacks empower your next Basic Attack On-Hit . • Release a bolt of lightning that chains to 7 Targets. • Deal 70 (+20% ) Damage . • Applies On-Hit effects.
**Passive 2 — :** Damage Dealt: {DamageDealt} Damage Dealt to Heroes: {DamageDealtHeroes}

**→ Modeled as:**
- `unmodeled` — **not modeled** — empowered basic procs every 100 Momentum stacks; the generation rate is unstated so the cadence cannot be derived

---

### Syonic Echo  ·  3000g
**Base stats:** physical power 60, ability haste 15, lifesteal 15

**Passive 1 — Duplicity:** *[On Ability Cast:]* • Your next 3 Basic Attacks within 3s gain 30% Total Attack Speed .
**Passive 2 — Close Combat:** *[On Melee Heroes only:]* • Activating Duplicity resets your Basic Attack Cooldown .
**Passive 3 — :** Activations: {Activations}

**→ Modeled as:**
- `unmodeled` — **not modeled** — A windowed 3-basic AS burst with no clean primitive (Close Combat reset is melee-only).

---

### Transference  ·  3000g
**Base stats:** max health 200, physical armor 40, magical armor 40, heal shield increase 8

**Passive 1 — Shield Transference:** *[Upon Shields expiring:]* • 50% of its remaining value is restored as Health over 3s . • Reduced to 25% for Ally Shields .
**Passive 2 — Ionizing Charge:** *[While Shielded :]* • Gain 8% Movement Speed . • Gain 10% increased Armors .
**Passive 3 — :** Health Restored: {HealthRestored}

**→ Modeled as:**
- `unmodeled` — **not modeled** — Defensive, shield-state-gated.

---

### Astral Catalyst  ·  2950g
**Base stats:** magical power 85, max mana 250, ability haste 20

**Passive 1 — Ravenous:** • Hero Kills reduce your Ultimate Cooldown by 25% . • Hero Assists reduce your Ultimate Cooldown by 15% .
**Passive 2 — Event Horizon:** *[On damaging a Shielded Target:]* • Deal 40% bonus Damage . • Does not exceed the size of the Shield .
**Passive 3 — :** Damage Dealt: {DamageDealt} Takedowns: {Takedowns}

**→ Modeled as:**
- `unmodeled` — **not modeled** — Takedown-gated and enemy-shield-gated; neither state exists in the sim.

---

### Ashbringer  ·  2900g
**Base stats:** physical power 45, attack speed 25, critical chance 20, ability haste 10

**Passive — Chrono Strikes:** *[On Successful Basic Attack:]* • Decrease current Non-Ultimate Cooldowns by 8% On-Hit . • Reduced to 4% against Non-Heroes . • Only triggers once per ability. • Critical Strikes grant 1.5x the cooldown reduction.

**→ Modeled as:**
- `unmodeled` — **not modeled** — The cooldown ripple depends on ability interleaving the sim does not track.

---

### Claw Of Hermes  ·  2900g
**Base stats:** magical power 85, max health 200, health regeneration 80, max mana 250

**Passive 1 — Mana Burn:** *[On Successful Basic Attack:]* • Against Melee Heroes: Drain 2.5% of their Max Mana . • Against Ranged Heroes: Drain 4% of their Max Mana . • Deals True Damage equal to 75% of the Mana Drained . • If you are a Ranged Hero, Mana Burn is 50% as effective.
**Passive 2 — Mindflare:** *[Based on the Target's Missing Mana :]* • Abilities deal 0-12% more Damage .
**Passive 3 — :** Mana Drained: {ManaDrained} Ability Damage Dealt: {DamageDealt}

**→ Modeled as:**
- `unmodeled` — **not modeled** — Damage scales with the target max/missing mana; target-mana-dependent, explicitly out of scope.

---

### Demon Edge  ·  2900g
**Base stats:** physical power 50, physical penetration 10, max health 200, ability haste 15

**Passive 1 — Demonic:** *[On damaging a Shielded Target:]* • Gain 20% Movement Speed for 2s . • Deal 45% bonus Damage . • Does not exceed the size of the Shield .
**Passive 2 — :** Damage Dealt: {DamageDealt}

**→ Modeled as:**
- `unmodeled` — **not modeled** — Requires the enemy to be Shielded; no enemy-shield state in the sim.

---

### Dread  ·  2900g
**Base stats:** physical power 55, physical penetration 12, magical armor 40

**Passive — Vital Shield:** *[On receiving Magical Damage from a Hero:]* • Block 25% of Magical Damage for 3s . • Vital Shield returns after not taking Hero Damage for 15s .

**→ Modeled as:**
- `unmodeled` — **not modeled** — A defensive, incoming-damage effect with no offensive component.

---

### Envy  ·  2900g
**Base stats:** physical power 45, physical penetration 10, max mana 250

**Passive 1 — Sacrificial Strike:** *[On Dashing, Leaping or exiting Camo:]* • Your next Basic Attack within 2.5s will Critically Strike .
**Passive 2 — Hush:** *[On using Sacrificial Strike on a Hero:]* • Silence them for 0.8s .
**Passive 3 — :** Sacrificial Strikes {SacrificialStrikes} Times Hushed: {TimesHushed}

**→ Modeled as:**
- `unmodeled` — **not modeled** — The guaranteed-crit cadence depends on mobility uptime; Hush is a silence (CC).

---

### Gaussian Greaves  ·  2900g
**Base stats:** magical power 55, max health 200, physical armor 35, ability haste 10

**Passive 1 — System Shock:** • Gain the ability to Double Jump while mid-air. • After Double Jumping, emit a shockwave upon landing. • Deals 100 (+50% ) Damage . • Slows by 40% for 1.25s .
**Passive 2 — Galvanize:** *[While out of combat:]* • Gain 7% Movement Speed.
**Passive 3 — :** Damage Dealt: {DamageDealt} Damage Dealt to Heroes: {DamageDealtHeroes}

**→ Modeled as:**
- `unmodeled` — **not modeled** — A mobility-gated AoE, not a sustained combat proc.

---

### Giant's Ring  ·  2900g
**Base stats:** max health 300, physical armor 50, ability haste 15

**Passive 1 — Retribution:** *[When hit by Basic Attacks:]* • Reduce your Non-Ultimate Cooldowns by 0.25s .
**Passive 2 — Gigantism:** *[On casting your Ultimate:]* • Gain 20% Hero Size . • Mitigate 8% of damage taken. • Double the effectiveness of Retribution for 6s .
**Passive 3 — :** Giant Time: {GiantTime}s

**→ Modeled as:**
- `unmodeled` — **not modeled** — Cooldown refunds and a defensive ult buff gated on being attacked.

---

### Malady  ·  2900g
**Base stats:** physical power 50, physical penetration 11, ability haste 8

**Passive 1 — Parting Gift:** *[On Killing a Unit:]* • Cause them to explode. • Deals Damage based on their Max Health .
**Passive 2 — Demise:** *[On damaging a Hero below 40% Health :]* • Deal 20 (+15% ) Damage . • Gain a stack of Demise . • Damage increases by 4 per stack of Demise . • Takedowns reset the Cooldown .
**Passive 3 — :** Parting Gift Damage Dealt: {PartingGiftDamageDealt} Parting Gift Damage Dealt to Heroes: {PartingGiftDamageDealtHeroes} Demise Damage Dealt: {DemiseDamageDealt}

**→ Modeled as:**
- `unmodeled` — **not modeled** — Demise's finisher fires only on sub-40%-health targets and ramps +4 per stack at an unstated cadence; Parting Gift's on-kill explosion deals an unstated % of Max Health. A fixed-target damage-over-window sim can neither gate nor stack it.

---

### Nightfall  ·  2900g
**Base stats:** physical power 50, physical penetration 10, omnivamp 8

**Passive 1 — Eclipse:** • Abilities Heal for 6% of damage dealt to Heroes.
**Passive 2 — Dusk Reaver:** *[On Takedown:]* • Gain a 200 - 400 Shield for 3.5s . • Shield size increases with Level .
**Passive 3 — :** Health Restored: {HealthRestored} Activations: {Activations}

**→ Modeled as:**
- `unmodeled` — **not modeled** — Ability sustain (no damage component) and a takedown-gated shield.

---

### Penumbra  ·  2900g
**Base stats:** physical power 50, max health 200, physical penetration 8, ability haste 20

**Passive — Essence Reaper:** *[On Takedown:]* • Reduce Non-Ultimate Cooldowns by 4s .

**→ Modeled as:**
- `unmodeled` — **not modeled** — Takedown-gated; no takedown model in a 1v1 kill window.

---

### Spellbreaker  ·  2900g
**Base stats:** magical power 75, magical armor 40, ability haste 10

**Passive 1 — Veil:** • Gain a Spell Shield that blocks the next Ability.
**Passive 2 — Malefic:** *[While Veil is active:]* • Increase your Magical Power by 15% .
**Passive 3 — :** Spells Blocked: {SpellBlocked}

**→ Modeled as:**
- `unmodeled` — **not modeled** — The +15% holds only until the Veil blocks an ability and breaks; in-fight uptime is indeterminate.

---

### Void Helm  ·  2900g
**Base stats:** max health 400, magical armor 45, ability haste 10

**Passive — Abyssal Gift:** • Heal 20% more from all sources.

**→ Modeled as:**
- `unmodeled` — **not modeled** — A healing-received amp (sustain); not a damage or EHP primitive.

---

### Vyzar Carapace  ·  2900g
**Base stats:** physical power 45, max health 250, ability haste 15

**Passive 1 — Shell Shock:** *[Against Enemy Heroes:]* • Basic Attacks and Abilities apply a stack of Scorn . • Apply 3 stacks to a Hero to trigger Shell Smash . • Scorn can only be applied once per ability.
**Passive 2 — Shell Smash:** • Deals 60-170 Damage , based on Level . • Gain a 50 (+12% ) Shield for 3s .
**Passive 3 — :** Damage Dealt: {DamageDealt} Times Applied: {TimesApplied}

**→ Modeled as:**
- `unmodeled` — **not modeled** — The proc damage type is ambiguous and it grants a self-shield; a clean credit is unsafe.

---

### Mesmer  ·  2850g
**Base stats:** physical power 55, max health 250, physical penetration 10

**Passive 1 — Vengeful Shroud:** • Gain a Spell Shield that blocks the next Ability.
**Passive 2 — :** Spells Blocked: {SpellBlocked}

**→ Modeled as:**
- `unmodeled` — **not modeled** — A defensive spell shield; carries no damage effect.

---

### Gaia Greaves  ·  2800g
**Base stats:** max health 300, physical armor 50, ability haste 10

**Passive 1 — Tremor:** *[Move to generate up to 100 stacks:]* • Stacks grant up to 40 Movement Speed . • Basic Attacks expend all stacks for bonus Damage . • Deals up to 40 (+60% ) (+5% ) Damage . • Lose 50 stacks per second while Slowed or Immobilized .
**Passive 2 — Unburden:** • Increase your Jump Height by 50% .
**Passive 3 — :** Damage Dealt: {DamageDealt} Damage Dealt to Heroes: {DamageDealtHeroes}

**→ Modeled as:**
- `unmodeled` — **not modeled** — The bonus-damage cadence is movement-stack-dependent and unstated.

---

### Lifebinder  ·  2800g
**Base stats:** magical power 80, magical lifesteal 12, ability haste 15

**Passive — Twilight Sonata:** *[For every 10% Missing Health]* • Gain 2.5 Magical Power and 1% Magical Lifesteal .

**→ Modeled as:**
- `unmodeled` — **not modeled** — Scales with the holder missing health; no health-state uptime model.

---

### Unbroken Will  ·  2800g
**Base stats:** max health 400, magical armor 45, tenacity 30

**Passive 1 — Undying:** *[On being Immobilized :]* • Increase your Physical Armor by 25% for 2.5s . • Increase your Magical Armor by 25% for 2.5s .
**Passive 2 — :** Activations: {Activations}

**→ Modeled as:**
- `unmodeled` — **not modeled** — A defensive, CC-triggered armor buff.

---

### Onixian Quiver  ·  2750g
**Base stats:** attack speed 55, critical chance 20, lifesteal 7

**Passive 1 — Multishot:** *[On Ranged Basic Attack:]* • Fire 2 additional projectiles. • Each deals 10-35% (increases with Range ) ( ) Damage . • Can Critically Strike and apply Lifesteal .
**Passive 2 — Onixia:** *[On Melee Heroes only:]* • Increase your Total Critical Strike Chance by 25% . • Gain 1% Damage Mitigation for every 10% Missing Health .
**Passive 3 — :** Damage Dealt: {DamageDealt} Damage Dealt to Heroes: {DamageDealtHeroes}

**→ Modeled as:**
- `unmodeled` — **not modeled** — Multishot is not simulated: angled projectiles scale with travel distance and hero basic scaling. Recovered effect defaults bind attack-damage scaling and the custom distance calculation. Collision, critical-strike/lifesteal resolution and complete native aggregation still need integration. Melee Onixia crit and missing-health mitigation are also omitted; ranged carries receive no melee benefit.

---

### Volcanica  ·  2750g
**Base stats:** physical power 30, max health 325, ability haste 10

**Passive — Hellstorm:** *[On Ability Cast:]* • Reduce your other current Basic Ability Cooldowns by 0.5s . • Increased to 1.5s when casting your Ultimate Ability . Restriction: • Hellstorm has 40% effectiveness for Stance Switchers .

**→ Modeled as:**
- `unmodeled` — **not modeled** — The cooldown ripple depends on ability interleaving the sim does not track.

---

### Dreambinder  ·  2650g
**Base stats:** magical power 70, max health 325

**Passive 1 — Chilling Spells:** *[On dealing Ability Damage:]* • Slows by 30% for 1s . • Reduced to 20% for DoT Abilities.
**Passive 2 — :** Restriction: Does not apply with Proc Damage.

**→ Modeled as:**
- `unmodeled` — **not modeled** — A slow only (CC).

---

### Devotion  ·  2550g
**Base stats:** magical power 40, magical armor 35, mana regeneration 80, heal shield increase 10

**Passive 1 — Fidelity:** • Your Heals and Shields are 10% stronger on Allied Heroes that are below 40% Health .
**Passive 2 — Mystica:** *[Upon taking magical damage:]* • If the incoming damage instance is greater than 150 , reduce it by 15% .
**Passive 3 — :** Bonus Healing: {Healing} Bonus Shielding: {Shielding} Magical Damage Blocked: {DamageBlocked}

**→ Modeled as:**
- `unmodeled` — **not modeled** — Both are support/defensive (team-side heal boost, incoming-magical mitigation).

---

### Galaxy Greaves  ·  2500g
**Base stats:** physical armor 30, magical armor 30, mana regeneration 100, ability haste 10

**Passive 1 — ZeroG:** *[While moving:]* • Generate stacks of ZeroG . • At 100 stacks your next jump has increased height.
**Passive 2 — Celerity:** *[While out of combat:]* • Gain 7% Movement Speed.
**Passive 3 — :** Activations: {Activations}

**→ Modeled as:**
- `unmodeled` — **not modeled** — Movement and out-of-combat MS utility; no combat damage component.

---

### Everbloom  ·  2450g
**Base stats:** magical power 45, max health 200, heal shield increase 10

**Passive 1 — Divine Protection:** *[On Healing or Shielding an Ally:]* • Grant them 5% Damage Mitigation and 20 Tenacity for 2s .
**Passive 2 — :** Times Applied: {TimesApplied}

**→ Modeled as:**
- `unmodeled` — **not modeled** — A support, team-side defensive grant.

---

### Hexbound Bracers  ·  2450g
**Base stats:** max health 375, max mana 300, ability haste 15, heal shield increase 8

**Passive 1 — Mana Reactor:** • Restore Mana equal to 15% of damage taken. • Reduced to 5% when damaged by Non-Heroes. • Based on your Missing Mana , gain 1-3 additional Mana Regen .
**Passive 2 — Hexed Guard:** • Take 5 (+1 per Level) less damage from Hero Basic Attacks.
**Passive 3 — :** Mana Restored: {ManaRestored}

**→ Modeled as:**
- `unmodeled` — **not modeled** — Mana sustain and basic-attack mitigation; defensive/economy.

---

### Lunaria  ·  2450g
**Base stats:** magical power 55, ability haste 10, heal shield increase 15

**Passive 1 — Incandescence:** *[On dealing damage to Heroes:]* • Gain charges equal to 25% of damage dealt. • Charge Limit: 100-250, based on Level .
**Passive 2 — Mending:** *[On Healing or Shielding an Ally Hero:]* • Consume all Incandescence charges. • Heal them for the amount. • Prioritizes Lowest Health Target.
**Passive 3 — :** Health Restored: {HealthRestored}

**→ Modeled as:**
- `unmodeled` — **not modeled** — A support, team-side heal-conversion.

---

### Vanguardian  ·  2450g
**Base stats:** physical armor 35, magical armor 35, ability haste 10, tenacity 25

**Passive — Guardian:** *[Nearby Allied Heroes gain:]* • 15 Physical Armor . • 15 Magical Armor .

**→ Modeled as:**
- `unmodeled` — **not modeled** — A team-side defensive aura.

---

### Crystal Tear  ·  2400g
**Base stats:** magical power 40, ability haste 10, mana regeneration 150, heal shield increase 12

**Passive — Elation:** *[On Healing or Shielding Heroes:]* • You both gain 30 Magical Power for 5s . • You both gain 15 Ability Haste for 5s .

**→ Modeled as:**
- `unmodeled` — **not modeled** — A support, team-side buff on heal/shield cast.

---

### Enra's Blessing  ·  2400g
**Base stats:** magical power 40, max health 225, max mana 250, ability haste 15

**Passive 1 — Enra's Protection:** • When within 1000u of an Ally Hero, if they are Immobilized : • Grant them a 50 (+30% ) (+8% ) Shield for 3.5s . • Cooldown is per Target.
**Passive 2 — :** Times Applied: {TimesApplied}

**→ Modeled as:**
- `unmodeled` — **not modeled** — shields an immobilized ally — team-side value outside the single-hero sim

---

### Luxforge Lantern  ·  2400g
**Base stats:** physical power 35, max health 200, ability haste 15

**Passive 1 — Lumos:** *[On Takedown or Ward Kill, gain stacks:]* • Stacks permanently grant +1 Physical Power . • Takedowns: 2 stacks. • Ward Kills: 2 stacks. • Max Stacks: 30 .
**Passive 2 — The Wanderer:** *[While out of combat:]* • Gain 7% Movement Speed.

**→ Modeled as:**
- `unmodeled` — **not modeled** — A permanent economy/farming stack.

---

### Xenia  ·  2400g
**Base stats:** max health 200, physical armor 30, magical armor 25, ability haste 10

**Passive 1 — Xenos Guard:** *[When within 200u to an Ally Hero:]* • Grant them a 50 (+10% ) (+5 per Level) Shield for 4s . • Cooldown is per Target.
**Passive 2 — :** Restriction: • Subsequent applications to the same Hero within 10s are 50% effective.
**Passive 3 — :** Times Applied: {TimesApplied}

**→ Modeled as:**
- `unmodeled` — **not modeled** — shields a nearby ally — team-side value outside the single-hero sim


---

## ⏳ Not yet reviewed (flat-stats-only — on the queue)


