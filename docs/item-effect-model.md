# Item-effect model — reasoning breakdown

Generated from `data/omeda/items.json` + `engine/fixtures/effects.json`
(`npm run item-model`). For every completed item: its base stats, each
passive split out (with the trigger condition), the effect primitive it maps
to, and how that rolls into the simulator. Flat stats are always counted;
this doc is about the **passives**. THEORY until in-game calibration.

**Coverage: 65 modeled · 61 honestly unmodeled (with reasons) · 0 not yet reviewed · 126 total.**

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

### World Breaker  ·  3200g
**Base stats:** max health 350, magical power 45, tenacity 80

**Passive 1 — Fiend:** *[On dealing Magical Damage to a Hero:]* • Increases your Magical Damage dealt by 2% for 4.5s . • Stacks up to 6 times.
**Passive 2 — Maya:** • Gain (+5% ) Magical Power .

**→ Modeled as:**
- `damage_amp` — +12% to your ability damage (when window only, credited at partial uptime) — applied as an amp on every qualifying hit.
- `stat_conversion` — converts 5% of health into magical power.

---

### The Perforator  ·  3200g
**Base stats:** physical penetration 8, ability haste 15, physical power 45

**Passive 1 — Chilling Spells:** *[On dealing Ability Damage:]* • Slows by 10% for 1s .
**Passive 2 — Puncture:** • Ignore 30% of Physical Armor .

**→ Modeled as:**
- `percent_pen` — 30% physical penetration (multiplicative, 1.14 rule).
- `unmodeled` — **not modeled** — Chilling Spells is a 10% slow (CC) on ability damage.

---

### Mutilator  ·  3150g
**Base stats:** physical power 45, omnivamp 12, ability haste 15

**Passive 1 — Mutilate:** *[On Basic Attacking Heroes:]* • Deal 1% of their Max Health as Damage .
**Passive 2 — Devour:** *[Ability Hits on Heroes:]* • Apply Mutilate 3 times (once per ability).

**→ Modeled as:**
- `on_hit` — every basic attack adds 1% of target max HP physical damage — rate-capped over the attack window.
- `on_ability_hit` — each ability adds 3% of target max HP physical damage — credited per ability in a combo.

---

### Cursed Scroll  ·  3150g
**Base stats:** attack speed 20, magical armor 30, health regeneration 150, physical armor 50

**Passive 1 — Curse of Pain:** *[On Basic Attack:]* • Deal 30 (+4% ) Damage to yourself and the Enemy Target. • This damage cannot hurt you below 35% Health .
**Passive 2 — Forbidden Art:** *[For every 100 Health you are missing:]* • Gain +2.5% Attack Speed. • Gain +25% Base Health Regen .
**Passive 3 — :** Restriction: Limited to 1 Cursed Item.

**→ Modeled as:**
- `on_hit` — every basic attack adds 30 (+4% health) magical damage — rate-capped over the attack window.
- `unmodeled` — **not modeled** — Forbidden Art scales AS/regen with the holder missing health; no health-state uptime model.

---

### Aegis Of Agawar  ·  3150g
**Base stats:** critical chance 15, physical power 20, max health 400

**Passive 1 — Bludgeon:** • Gain (+2.5% ) Physical Power .
**Passive 2 — Agawar's Protection:** • Gain 10% Total Physical Armor . • Gain 10% Total Magical Armor . While below 40% Health: • Gain 20% Total Physical Armor instead. • Gain 20% Total Magical Armor instead.

**→ Modeled as:**
- `stat_conversion` — converts 2.5% of health into physical power.
- `armor_multiplier` — armor ×1.10 — raises effective HP vs that damage type.
- `unmodeled` — **not modeled** — Agawar's Protection doubles to 20% armor while below 40% Health; a health-state-gated defensive tier.

---

### Augmentation  ·  3150g
**Base stats:** physical power 30, ability haste 20, attack speed 25, max health 225

**Passive — True Strike:** *[On Ability Cast:]* • Empower your next Basic Attack within 4s . • Deal (+90% Base Physical Power ) Damage On-Hit .

**→ Modeled as:**
- `on_ability_hit` — each ability adds (+90% physical power) physical damage (≤ once / 4s per target) — credited per ability in a combo.

---

### Solaris  ·  3100g
**Base stats:** critical chance 20, max mana 350, physical power 55, ability haste 15

**Passive — Solarblade:** *[On Ability Cast:]* • Empower your next Basic Attack within 4s . • Deal 45 (+35% ) Damage On-Hit . • Can Critically Strike . • Heals you for 65% of damage dealt.

**→ Modeled as:**
- `on_ability_hit` — each ability adds 45 (+35% physical power) physical damage (≤ once / 4s per target) — credited per ability in a combo.

---

### Viper  ·  3100g
**Base stats:** attack speed 30, physical power 30, physical penetration 8

**Passive 1 — Corrode:** *[On damaging a Hero:]* • Reduce their Physical Armor by 4.5% for 3s . • Stacks up to 6 times. • At 6 stacks they become Eroded .
**Passive 2 — Diligence:** *[Against Eroded Heroes:]* • Deal 8% increased On-Hit and Ability damage.

**→ Modeled as:**
- `armor_shred` — strips 27% of the target's physical armor (ramps over 6s) — so ALL your physical damage lands harder.
- `damage_amp` — +8% to your damage — applied as an amp on every qualifying hit.

---

### Tainted Blade  ·  3100g
**Base stats:** physical power 40, max health 250, ability haste 10

**Passive 1 — Blighted Strikes:** *[On dealing Physical Damage :]* • Reduce the Target's Healing by 45% for 3s .
**Passive 2 — Hex:** *[On dealing Ability Damage to a Blighted Target:]* • Cause them to take 5% more damage for 3s .

**→ Modeled as:**
- `anti_heal` — cuts the target's healing by 45% — matters vs sustain.
- `damage_amp` — +5% to your damage (when window only, credited at partial uptime) — applied as an amp on every qualifying hit.

---

### Overseer  ·  3100g
**Base stats:** magical power 85, magical lifesteal 7, magical penetration 8

**Passive — Exalted:** *[Enhance your Ultimate Ability:]* • Deals 15% more damage. • Heals you for 25% of the damage dealt to Heroes.

**→ Modeled as:**
- `damage_amp` — +15% to your ultimate damage — applied as an amp on every qualifying hit.

---

### Rapture  ·  3100g
**Base stats:** omnivamp 7, attack speed 30, max health 300

**Passive — Nearsight:** *[While within 475u of an Enemy Unit:]* • Your Basic Attacks deal 20 (+3% ) (+15% ) Damage On-Hit to them.

**→ Modeled as:**
- `on_hit` — every basic attack adds 20 (+15% physical power) physical damage — rate-capped over the attack window.

---

### Oathkeeper  ·  3100g
**Base stats:** max mana 250, magical power 80, ability haste 15, max health 175

**Passive — Celestial Spellblade:** *[On Ability Cast:]* • Empower your next Basic Attack within 4s . • Deal 60 (+35% ) Damage On-Hit .

**→ Modeled as:**
- `on_ability_hit` — each ability adds 60 (+35% magical power) magical damage (≤ once / 4s per target) — credited per ability in a combo.

---

### Demolisher  ·  3100g
**Base stats:** critical chance 20, physical power 45

**Passive 1 — Puncture:** • Ignore 25% of Physical Armor .
**Passive 2 — Trauma:** • Additionally, your Basic Attacks and Critical Strikes ignore 30% of Bonus Physical Armor .

**→ Modeled as:**
- `percent_pen` — 25% physical penetration (multiplicative, 1.14 rule).
- `unmodeled` — **not modeled** — Trauma ignores 30% of BONUS physical armor only; reference profiles do not split base vs bonus armor.

---

### Resolution  ·  3100g
**Base stats:** attack speed 20, physical power 40, physical penetration 9, max mana 350

**Passive 1 — Darksteel:** *[On Successful Basic Attacks:]* • Deal (+2% ) Damage On-Hit .
**Passive 2 — Potent Font:** *[On Killing any Unit:]* • Gain 5 Max Mana . • Camp Leaders grant 15 . • Stacks up to 400 . • At 400 , gain (+2.5% ) Physical Power .

**→ Modeled as:**
- `on_hit` — every basic attack adds (+2% max mana) physical damage — rate-capped over the attack window.
- `unmodeled` — **not modeled** — Potent Font is a per-kill max-mana farming stack (caps at 400 then grants PP); economy.

---

### Vanquisher  ·  3100g
**Base stats:** physical power 50, physical penetration 12, critical chance 20

**Passive — Annihilate:** *[On taking a Hero below 5% Health :]* • Execute them.

**→ Modeled as:**
- `execute` — below 5% HP the target is a free kill — credited as 5% of their max HP as bonus burst.

---

### Wraith Leggings  ·  3100g
**Base stats:** magical power 100, magical penetration 11, movement speed 4

**Passive — Carnage:** *[Against Heroes below 40% Health :]* • Abilities deal 12% bonus Magical Damage .

**→ Modeled as:**
- `damage_amp` — +12% to your ability damage — applied as an amp on every qualifying hit.

---

### Sky Splitter  ·  3100g
**Base stats:** attack speed 30, lifesteal 8, physical power 40

**Passive — Rend:** *[On Successful Basic Attacks:]* • Deal 5.5% of Target's Current Health as Damage On-Hit . • Reduced to 3.5% for Ranged Heroes. • Minimum of 12 Damage .

**→ Modeled as:**
- `on_hit` — every basic attack adds 5.5% of target current HP physical damage — rate-capped over the attack window.

---

### Basilisk  ·  3050g
**Base stats:** max health 275, physical power 40, ability haste 20

**Passive 1 — Corrode:** *[On damaging a Hero:]* • Reduce their Physical Armor by 4.5% for 3s . • Stacks up to 6 times. • At 6 stacks they become Eroded .
**Passive 2 — Eminence:** *[Upon damaging an Eroded Hero:]* • Gain 8% Movement Speed for 2 s.

**→ Modeled as:**
- `armor_shred` — strips 27% of the target's physical armor (ramps over 6s) — so ALL your physical damage lands harder.

---

### Orb Of Enlightenment  ·  3000g
**Base stats:** magical power 70, max health 250, max mana 250

**Passive 1 — Enlightened:** *[For each Hero Level:]* • Gain 3 Magical Power . • Gain 15 Health .
**Passive 2 — Art Of Fortitude:** *[On Ability Cast:]* • Restore 3% Missing Health over 3s .

**→ Modeled as:**
- `stat_flat` — +0 (+3/level) magical power — straight into the build's stat totals.
- `stat_flat` — +0 (+15/level) health — straight into the build's stat totals.
- `unmodeled` — **not modeled** — Art of Fortitude restores 3% missing health over 3s on cast; out-of-combat-style sustain.

---

### Prophecy  ·  3000g
**Base stats:** attack speed 30, magical power 75, ability haste 15

**Passive — Magical Strikes:** *[On Basic Attacks:]* • Deal 20 (+15% ) Damage On-Hit .

**→ Modeled as:**
- `on_hit` — every basic attack adds 20 (+15% magical power) magical damage — rate-capped over the attack window.

---

### Combustion  ·  3000g
**Base stats:** max mana 400, magical power 85, magical penetration 9

**Passive 1 — Pyro:** *[On dealing Ability Damage:]* • Deal 50 (+18% ) Damage to the Target and nearby Enemies.
**Passive 2 — Pyromaniac:** *[On damaging Heroes:]* • Reduce the Cooldown of Pyro by 0.5s .

**→ Modeled as:**
- `on_ability_hit` — each ability adds 50 (+18% magical power) magical damage (≤ once / 15s per target) — credited per ability in a combo.
- `unmodeled` — **not modeled** — Pyromaniac: damaging heroes reduces Pyro cooldown by 0.5s per hit

---

### Magnify  ·  3000g
**Base stats:** omnivamp 10, magical power 60, max health 300, ability haste 15

**Passive — Shredding Spells:** *[Upon damaging Heroes with an Ability:]* • Reduce their Magical Armor by 6% for 3.5s . • Stacks up to 5 times.

**→ Modeled as:**
- `armor_shred` — strips 30% of the target's magical armor (ramps over 8s) — so ALL your magical damage lands harder.

---

### Citadel  ·  3000g
**Base stats:** physical armor 35, physical power 35, max health 300

**Passive 1 — Fortification:** *[For each nearby Enemy Hero:]* • Gain 5 Physical Armor .
**Passive 2 — Intimidation:** *[Nearby Enemy Heroes:]* • Have their Physical Armor decreased by 20% .

**→ Modeled as:**
- `armor_shred` — strips 20% of the target's physical armor — so ALL your physical damage lands harder.
- `unmodeled` — **not modeled** — Fortification is a defensive armor aura (+5 per nearby enemy).

---

### Earthshaker  ·  3000g
**Base stats:** attack speed 20, max health 250, physical power 40, ability haste 10

**Passive — Battleborn:** *[On dealing damage to Heroes or Monsters:]* • Increase your Ability Damage dealt by 1% for 3s . • Stacks up to 10 times. • Melee Heroes gain Stacks twice as fast.

**→ Modeled as:**
- `damage_amp` — +10% to your ability damage (when window only, credited at partial uptime) — applied as an amp on every qualifying hit.

---

### Plasma Blade  ·  3000g
**Base stats:** critical chance 20, physical power 35, magical power 45, attack speed 30

**Passive — Vibro Cutter:** *[On Basic Attacking Heroes:]* • Gain 4% Critical Strike Chance for 3s . • Stacks up to 5 times.

**→ Modeled as:**
- `ramp_to_stat` — stacks up to +20 critical chance over a fight; credited at 60% mean uptime.

---

### Tainted Scepter  ·  3000g
**Base stats:** max health 200, magical power 75, ability haste 10

**Passive 1 — Blighted Spells:** *[On Dealing Magical Damage :]* • Reduce the Target's Healing by 45% for 4s .
**Passive 2 — Malice:** *[Once every second:]* • Gain a stack of Malice . • Stacks up to 15 times. • Takedowns grant 15 stacks instantly. • Hitting a Hero with Ability Damage will deal 1.5 (+1% ) Damage per stack.

**→ Modeled as:**
- `anti_heal` — cuts the target's healing by 45% — matters vs sustain.
- `on_ability_hit` — each ability adds 22.5 (+15% magical power) magical damage — credited per ability in a combo.

---

### Noxia  ·  3000g
**Base stats:** magical power 90, ability haste 20

**Passive 1 — Evil Eye:** *[Mark Heroes for 3s upon dealing Ability Damage:]* • With a separate ability, deal damage to a Marked Hero to activate Dark Matter .
**Passive 2 — Dark Matter:** • Deal 6% of Target's Maximum Health as bonus Damage .

**→ Modeled as:**
- `on_ability_hit` — each ability adds 6% of target max HP magical damage (≤ once / 8s per target) — credited per ability in a combo.

---

### Spectral Schematics  ·  3000g
**Base stats:** max health 300, magical power 55, ability haste 20

**Passive — Breakthrough:** *[Upon Immobilzing an Enemy Unit:]* • Deal 40 (+5% Target's Current Health) additional Damage .

**→ Modeled as:**
- `on_ability_hit` — each ability adds 40 + 5% of target current HP magical damage — credited per ability in a combo.

---

### Megacosm  ·  3000g
**Base stats:** max health 250, ability haste 10, magical power 65

**Passive 1 — Disintegrate:** *[On dealing Ability Damage:]* • Deal 2.5% of Target's Max Health as Damage over 3s . • Additional applications refresh the duration.
**Passive 2 — Star Killer:** *[On dealing Ability Damage to Heroes:]* • Deal 6% of Target's Bonus Health as Damage over 3s .

**→ Modeled as:**
- `on_ability_hit` — each ability adds 2.5% of target max HP magical damage (≤ once / 3s per target) — credited per ability in a combo.
- `unmodeled` — **not modeled** — Star Killer (6% of target BONUS health) needs a base/bonus health split the reference profiles do not carry

---

### Entropy  ·  3000g
**Base stats:** ability haste 15, magical power 70, max mana 400

**Passive — Degradation:** *[On dealing Ability Damage:]* • Deal 3 (+3% ) additional Damage . • Each Ability can only trigger this effect once every 0.2s , per Target.

**→ Modeled as:**
- `on_ability_hit` — each ability adds 3 (+3% magical power) magical damage (≤ once / 0.2s per target) — credited per ability in a combo.

---

### Tainted Rounds  ·  3000g
**Base stats:** physical power 35, attack speed 30, critical chance 20

**Passive — Blighted Strikes:** *[On Successful Basic Attacks:]* • Reduce the Target's Healing by 45% for 3s . • Deal (+10% ) (+20% ) Damage On-Hit . • Increases by up to 100% as the Target's Health decreases.

**→ Modeled as:**
- `anti_heal` — cuts the target's healing by 45% — matters vs sustain.
- `on_hit` — every basic attack adds (+10% physical power) physical damage — rate-capped over the attack window.
- `unmodeled` — **not modeled** — second on-hit scaling term (icon-ambiguous) and missing-health amplification up to +100%

---

### Azure Core  ·  3000g
**Base stats:** ability haste 15, magical power 70, max mana 450

**Passive 1 — Spirit Shield:** *[On going below 40% Health :]* • Gain a 100 (+12% ) Shield for 5s .
**Passive 2 — Font:** *[On Killing any Unit:]* • Gain 5 Max Mana . • Camp Leaders grant 15 . • Stacks up to 400 . • At 400 , gain (+3.5% ) Magical Power .

**→ Modeled as:**
- `shield_per_fight` — ~100 shield per fight — counted as effective HP.

---

### Tainted Bastion  ·  3000g
**Base stats:** health regeneration 80, max health 250, magical armor 45, ability haste 8

**Passive 1 — Blighted Veil:** *[On taking Magical Damage :]* • Reduce the Source's Healing by 45% for 3s .
**Passive 2 — Colossus:** • Mitigate 3.5% of damage taken. • Doubled against Blighted Targets.

**→ Modeled as:**
- `anti_heal` — cuts the target's healing by 45% — matters vs sustain.
- `unmodeled` — **not modeled** — Colossus is flat damage mitigation (defensive).

---

### Timewarp  ·  3000g
**Base stats:** mana regeneration 125, ability haste 25, magical power 75

**Passive — Chime:** *[Every 8s:]* • Subtract 1s from Non-Ultimate Cooldowns .

**→ Modeled as:**
- `cooldown_rate` — 0.125% faster non-ultimate cooldowns — more casts per fight.

---

### Infernum  ·  3000g
**Base stats:** physical penetration 9, physical power 45, max mana 250, ability haste 10

**Passive 1 — Cinder:** *[Damaging Abilities and Basic Attacks:]* • Apply stacks of Kindling to Enemy Units for 2.5s . • At 4 stacks, ignite them. • Deals 4 (+1.5% )% of their Max Health as Damage over 2s .
**Passive 2 — Furnace:** *[Based on Enemy Bonus Armor:]* • For each point, Cinder deals 0.65% more Damage .

**→ Modeled as:**
- `on_hit` — every basic attack adds 4% of target max HP physical damage (every 4th hit) — rate-capped over the attack window.
- `unmodeled` — **not modeled** — Cinder also adds +1.5%-of-physical-power to the %max-health (stat-scaled %health) and Furnace scales with enemy bonus armor; neither is cleanly expressible.

---

### Alternator  ·  3000g
**Base stats:** physical penetration 10, ability haste 10, max mana 300, physical power 50

**Passive 1 — Alternate Reality:** • Your Alternate Ability deals 15% more damage.
**Passive 2 — Adeptus:** *[Damage Heroes with your Alternate Ability :]* • Upon triggering Adeptus , gain a stack (once per ability). • Upon reaching 15 stacks, return to Base to Evolve this item into Alternata .

**→ Modeled as:**
- `ability_damage_amp` — {"kind":"ability_damage_amp","abilityKey":"ALTERNATE","pct":15}
- `unmodeled` — **not modeled** — Adeptus is an evolve stack (15 hits with the Alternate Ability evolves into Alternata).

---

### Tainted Guard  ·  3000g
**Base stats:** physical armor 55, max health 250, ability haste 8

**Passive — Blighted Thorns:** *[On being hit by a Basic Attack:]* • Reduce the Source's Healing by 45% for 3s . • Apply a Bleed dealing 30 (+30% ) Damage over 3s .

**→ Modeled as:**
- `anti_heal` — cuts the target's healing by 45% — matters vs sustain.
- `unmodeled` — **not modeled** — Bleed thorns require incoming basic attacks; no incoming-attack model yet

---

### Soulbinder  ·  3000g
**Base stats:** ability haste 20, magical power 85, max mana 400

**Passive 1 — Arcane Salvo:** *[Damage Heroes from afar with Abilities:]* • Deal 7% bonus Damage . • Activates at 1450+ Range .
**Passive 2 — Farseer:** *[Upon triggering Arcane Salvo:]* • Permanently gain 1 Magical Power .

**→ Modeled as:**
- `damage_amp` — +7% to your ability damage — applied as an amp on every qualifying hit.

---

### Painweaver  ·  3000g
**Base stats:** physical power 55, physical penetration 10, movement speed 3

**Passive — Splice:** *[On Ability Cast:]* • Gain 2 Physical Penetration for 4s . • Gain 2% Movement Speed for 4s . • Stacks up to 4 times.

**→ Modeled as:**
- `flat_pen` — 8 flat physical pen (ramps over 8s).

---

### Deathstalker  ·  3000g
**Base stats:** physical penetration 10, attack speed 20, physical power 45

**Passive 1 — Virulent Strikes:** *[On Basic Attacking Heroes:]* • Shred 3 Physical Armor for 3s . • Stacks up to 4 times.
**Passive 2 — Onslaught:** • Gain (+100% ) Attack Speed .

**→ Modeled as:**
- `armor_shred` — strips 12 of the target's physical armor (ramps over 3s) — so ALL your physical damage lands harder.
- `stat_conversion` — converts 100% of physical penetration into attack speed.

---

### Alternata  ·  3000g
**Base stats:** max mana 350, physical power 50, ability haste 10, physical penetration 12

**Passive 1 — Alternate Reality:** • Your Alternate Ability deals 15% more damage.
**Passive 2 — Nata Style:** *[Upon using your Alternate Ability:]* • Reduce your other current Basic Ability Cooldowns by 12% .

**→ Modeled as:**
- `ability_damage_amp` — {"kind":"ability_damage_amp","abilityKey":"ALTERNATE","pct":15}
- `unmodeled` — **not modeled** — Nata Style cooldown ripple (-12% of other current basic cooldowns per Alternate cast) depends on cast interleaving; not modeled

---

### Fist Of Razuul  ·  3000g
**Base stats:** max health 550, ability haste 20

**Passive 1 — Razuul's Might:** *[When dealing or receiving damage:]* • For the next 3s, generate a stack each second. • Upon reaching 4 stacks, Empower your next Basic Attack. • Deals (+2.5% ) bonus Damage , increased by 2x on Heroes & Monsters. • Heal for 65% of bonus damage dealt.
**Passive 2 — Minion Crusher:** • Deal 25% increased damage to Minions .

**→ Modeled as:**
- `on_hit` — every basic attack adds (+5% health) physical damage (≤ once / 4s) — rate-capped over the attack window.

---

### Spirit Of Amir  ·  2950g
**Base stats:** magical penetration 7, magical power 80, ability haste 10, max health 200

**Passive 1 — Natural Selection:** *[Gain Effects, based on your location:]* • In the Jungle: Gain 8% Magical Lifesteal . • Outside the Jungle: Gain 8% Magical Power .
**Passive 2 — Monster Slayer:** • Abilities deal 12% more damage to Monsters .

**→ Modeled as:**
- `stat_multiplier` — multiplies magical power by 1.08× before the sim runs.
- `unmodeled` — **not modeled** — Jungle branch grants magical lifesteal instead, and Monster Slayer is +12% vs monsters (PvE).

---

### Dust Devil  ·  2950g
**Base stats:** movement speed 4, critical chance 20, attack speed 30, physical power 30

**Passive — Menace:** *[On Basic Attacking Heroes:]* • Gain 3% Attack Speed for 3s . • Stacks up to 5 times. • At 5 stacks gain 10% Movement Speed . • Critical Strikes grant 2 stacks.

**→ Modeled as:**
- `ramp_to_stat` — stacks up to +15 attack speed over a fight; credited at 60% mean uptime.
- `unmodeled` — **not modeled** — At 5 stacks grants 10% movement speed (out of scope).

---

### Equinox  ·  2950g
**Base stats:** physical power 40, critical chance 20, attack speed 30, tenacity 80

**Passive — Adamance:** *[On going below 40% Health :]* • Gain a 350-750 Shield for 4s . • Shield size increases with Level .

**→ Modeled as:**
- `shield_per_fight` — ~350 shield per fight — counted as effective HP.

---

### Spear Of Desolation  ·  2900g
**Base stats:** ability haste 10, physical penetration 12, physical power 45

**Passive 1 — Final Hour:** *[On casting your Ultimate:]* • Deal 10% increased damage for 6s .
**Passive 2 — Razor's Edge:** • Gain 25 Ultimate Haste .

**→ Modeled as:**
- `haste` — +25 ultimate haste — shortens the relevant cooldowns.
- `damage_amp` — +10% to your damage (when window only, credited at partial uptime) — applied as an amp on every qualifying hit.

---

### Inquisition  ·  2900g
**Base stats:** ability haste 10, max mana 200, magical armor 40, max health 275

**Passive — Psywave:** *[On Ability Cast:]* • Emit a wave of energy. • Deals 65 (+1.5% ) Damage to Enemies in the area. • Damage is increased by 45% against Monsters .

**→ Modeled as:**
- `on_ability_hit` — each ability adds 65 (+1.5% health) magical damage — credited per ability in a combo.

---

### Mindrazor  ·  2900g
**Base stats:** ability haste 15, physical power 45, max mana 300

**Passive 1 — Razor Cleave:** *[On Successful Basic Attack:]* • Deal (+40% ) Damage around the Target. • Damage decreases from 100% to 50% based on distance.
**Passive 2 — Technician:** • Gain (+2% ) Physical Power .

**→ Modeled as:**
- `stat_conversion` — converts 2% of max mana into physical power.
- `unmodeled` — **not modeled** — Razor Cleave is AoE splash around the target (multi-target), no single-target value.

---

### Tainted Trident  ·  2900g
**Base stats:** physical penetration 11, ability haste 10, physical power 45

**Passive 1 — Blighted Strikes:** *[On dealing Physical Damage :]* • Reduce the Target's Healing by 45% for 3s .
**Passive 2 — Woundseeker:** *[On dealing Ability Damage to a Blighted Unit:]* • Deal 3 (+6% ) % additional Damage .

**→ Modeled as:**
- `anti_heal` — cuts the target's healing by 45% — matters vs sustain.
- `unmodeled` — **not modeled** — Woundseeker adds a small ability bonus that scales with physical penetration (3 +6%-of-pen %), gated on a self-applied Blighted mark; a stat-scaled conditional amp with no clean primitive.

---

### Necrosis  ·  2900g
**Base stats:** attack speed 35, physical power 40, critical chance 20

**Passive 1 — Necro's Edge:** • Gain 25 Ultimate Haste .
**Passive 2 — Matter Disruptor:** • Your Ultimate Ability deals 15% more damage.

**→ Modeled as:**
- `haste` — +25 ultimate haste — shortens the relevant cooldowns.
- `damage_amp` — +15% to your ultimate damage — applied as an amp on every qualifying hit.

---

### Echelon Cloak  ·  2900g
**Base stats:** attack speed 25, max health 250, physical power 40, ability haste 10

**Passive 1 — Shadow:** *[On standing still and unharmed for 2s:]* • Become Camouflaged . • Moving 800u from this location, casting an ability, or receiving damage ends this effect.
**Passive 2 — Unseen Threat:** *[While Camouflaged:]* • Gain 1% of your Missing Health and Mana every second. • Increase your damage dealt by 8% . • Lasts 3s after exiting Camouflage .

**→ Modeled as:**
- `damage_amp` — +8% to your damage (when burst only, credited at partial uptime) — applied as an amp on every qualifying hit.
- `unmodeled` — **not modeled** — Camouflage requires standing still 2s and grants missing-HP/mana regen; only the opener burst is credited.

---

### Elafrost  ·  2900g
**Base stats:** max health 300, mana regeneration 125, physical armor 45, ability haste 15

**Passive — Frostblade:** *[On Ability Cast:]* • Empower your next Basic Attack within 4s . • Deal 70 (+2% ) Damage On-Hit around the Target. • Slows by 35% for 1.25s . • Damage is increased by 60% against Monsters .

**→ Modeled as:**
- `on_ability_hit` — each ability adds 70 (+2% health) magical damage (≤ once / 4s per target) — credited per ability in a combo.

---

### Caustica  ·  2900g
**Base stats:** mana regeneration 100, magical power 75

**Passive 1 — Magus:** • Ignore 35% of Magical Armor .
**Passive 2 — Arcane Might:** *[On dealing Ability Damage to a Hero:]* • While they are above 50% Health . • For every point of Bonus Magical Armor they possess. • Deal 0.2% more Damage .

**→ Modeled as:**
- `percent_pen` — 35% magical penetration (multiplicative, 1.14 rule).
- `unmodeled` — **not modeled** — Arcane Might: +0.2% damage per point of target bonus Magical Armor while above 50% health

---

### Cybernetic Drive  ·  2900g
**Base stats:** ability haste 10, magical armor 45, health regeneration 100, max health 250

**Passive 1 — Lesser Deconstruct:** *[Against Minions & Small Monsters:]* • Your next Basic Attack On-Hit Executes them. • Deals 80 (+5% ) Damage to nearby Enemies. • Heals you for 30 (+3% ) .
**Passive 2 — Cybernetic Conversion:** • Gain 12% Total Physical Armor . • Gain 12% Total Magical Armor .

**→ Modeled as:**
- `armor_multiplier` — armor ×1.12 — raises effective HP vs that damage type.
- `unmodeled` — **not modeled** — Lesser Deconstruct executes minions/small monsters (PvE).

---

### Tyranny  ·  2850g
**Base stats:** physical power 40, ability haste 10, max health 300

**Passive 1 — Oppression:** *[On casting your Ultimate:]* • Gain 30% Decaying Movement Speed over 4s . • Gain 20 Ability Haste for 8s . • Takedowns within this time re-trigger Oppression .
**Passive 2 — Tyrant's Edge:** • Gain 15 Ultimate Haste .

**→ Modeled as:**
- `haste` — +15 ultimate haste — shortens the relevant cooldowns.
- `unmodeled` — **not modeled** — Oppression grants a timed +20 ability haste window after ulting (uptime-dependent) plus MS; out of scope.

---

### Orion  ·  2850g
**Base stats:** max mana 300, ability haste 15, magical power 80

**Passive 1 — Hasty:** • Gain Attack Speed equal to 80% of your Ability Haste from Items.
**Passive 2 — Interstellar:** *[Upon successful On-Hit Attack:]* • Deal 2% increased damage to the Target for 3.5s , up to a maximum of 16% .

**→ Modeled as:**
- `stat_conversion` — converts 80% of ability haste into attack speed.
- `damage_amp` — +16% to your damage (when window only, credited at partial uptime) — applied as an amp on every qualifying hit.

---

### Flux Matrix  ·  2800g
**Base stats:** ability haste 12, magical armor 40, max health 300

**Passive — Unstable Shackles:** *[Nearby Enemy Heroes:]* • Take 10% additional Magical Damage . • Have their Tenacity decreased by 50% .

**→ Modeled as:**
- `damage_amp` — +10% to your ability damage (when window only, credited at partial uptime) — applied as an amp on every qualifying hit.

---

### Spectra  ·  2800g
**Base stats:** ability haste 10, attack speed 50

**Passive 1 — Radiant Strikes:** *[On Basic Attacks:]* • Deal 20 Damage On-Hit . • Reduces the Cooldown of Prisma by 3s . • Applies a stack of Prism to Heroes & Monsters for 2.5s , stacking up to 3 times. • If the Target has 3 Prism stacks on them, trigger Prisma .
**Passive 2 — Prisma:** • Deals 30 ( +4 per Level) Damage . • Increases from 1x-2.5x based on Target's Missing Health .

**→ Modeled as:**
- `on_hit` — every basic attack adds 20 magical damage — rate-capped over the attack window.
- `on_hit` — every basic attack adds 30 (+4/lvl) magical damage (≤ once / 2.5s) — rate-capped over the attack window.

---

### Manta Scythe  ·  2800g
**Base stats:** lifesteal 7, physical penetration 10, physical power 30, attack speed 25

**Passive 1 — Insatiable Harvest:** *[On Basic Attack:]* • Deal 1.5x damage to Minions and Small Monsters . • Upon killing Siege Minions and Camp Leaders , permanently gain +0.5 Physical Power .
**Passive 2 — Divide & Conquer:** *[Against Enemy Units within 2500u:]* • If they have no Ally within 1000u of themselves, deal 10% more damage to them.

**→ Modeled as:**
- `damage_amp` — +10% to your damage — applied as an amp on every qualifying hit.
- `unmodeled` — **not modeled** — Insatiable Harvest is a PvE 1.5x-to-minions + per-kill PP farming stack.

---

### Nuclear Rounds  ·  2650g
**Base stats:** attack speed 55, critical chance 20, ability haste 20

**Passive — Havoc:** *[Based on Critical Strike Chance:]* • Increase Ability Damage by 10-20% .

**→ Modeled as:**
- `damage_amp_from_crit` — {"kind":"damage_amp_from_crit","minPct":10,"maxPct":20,"scope":"abilities"}

---

### Crescelia  ·  2450g
**Base stats:** magical power 45, ability haste 20, mana regeneration 125

**Passive — Moonblade:** *[On Ability Cast:]* • Empower your next Basic Attack within 4s . • Deal 50 (+20% ) Damage On-Hit . • Reduce Non-Ultimate Cooldowns by 12% .

**→ Modeled as:**
- `on_ability_hit` — each ability adds 50 (+20% magical power) magical damage (≤ once / 4s per target) — credited per ability in a combo.
- `cooldown_rate` — 12% faster non-ultimate cooldowns — more casts per fight.

---

### Marshal  ·  2400g
**Base stats:** mana regeneration 100, magical power 45, ability haste 15

**Passive — Sheriff:** *[Buff yourself and nearby Heroes to:]* • Gain 15% Attack Speed . • Deal 10 (+1 Per Level) Damage On-Hit .

**→ Modeled as:**
- `stat_flat` — +15 attack speed — straight into the build's stat totals.
- `on_hit` — every basic attack adds 10 (+1/lvl) physical damage — rate-capped over the attack window.

---

### Dynamo  ·  2400g
**Base stats:** physical armor 25, ability haste 10, max health 300

**Passive 1 — Immobilizer:** *[On Immobilizing an Enemy:]* • They take 10% more damage for 2.5s .
**Passive 2 — Adaptive Aggression:** • Gain 20 Physical Power . • When your Magical Power > Bonus Physical Power . • Gain 30 Magical Power instead.

**→ Modeled as:**
- `damage_amp` — +10% to your damage (when window only, credited at partial uptime) — applied as an amp on every qualifying hit.


---

## ⚠️ Honestly unmodeled (out of a single-hero damage sim's scope — reason stated)

### Terminus  ·  3150g
**Base stats:** critical chance 20, physical power 60, lifesteal 15

**Passive — Anon:** *[On Overhealing from Lifesteal:]* • Convert excess Healing into a Shield . • Max Shield size: (+100% ) . • The Shield slowly decays 15s after leaving combat.

**→ Modeled as:**
- `unmodeled` — **not modeled** — overheal-to-shield needs a health-state model; the 15% lifesteal line is valued by the sustain objective

---

### Warden's Faith  ·  3100g
**Base stats:** physical armor 70, max health 300

**Passive 1 — Stalwart:** • Take 20% less damage from Critical Strikes .
**Passive 2 — Mocking Presence:** *[Nearby Enemy Heroes:]* • Have their Physical Power reduced by 8% .

**→ Modeled as:**
- `unmodeled` — **not modeled** — Both are defensive/debuff (crit mitigation, enemy-power reduction); no offensive primitive.

---

### Crystalline Cuirass  ·  3100g
**Base stats:** max health 300, movement speed 3, magical armor 60

**Passive 1 — Celestial Carapace:** *[On taking Magical Damage :]* • Gain a stack of Celestite for 5s . • Stacks up to 5 times. • Stacks can only be gained once every 0.5s .
**Passive 2 — Celestite:** • Gain 5 Magical Armor per stack. • At 5 stacks gain 12% Movement Speed .

**→ Modeled as:**
- `unmodeled` — **not modeled** — A defensive stack gained from incoming magical damage.

---

### Absolution  ·  3100g
**Base stats:** tenacity 75, physical power 40, magical armor 35, attack speed 25

**Passive — Bravery:** *[On being Immobilized :]* • Gain 25% Damage Mitigation . • Gain 40% Movement Speed . • Lasts 3s .

**→ Modeled as:**
- `unmodeled` — **not modeled** — A defensive, CC-triggered mitigation buff; no incoming-mitigation primitive.

---

### Raiment of Renewal  ·  3100g
**Base stats:** health regeneration 50, ability haste 15, tenacity 80, max health 700

**Passive 1 — Regenerator:** *[While Out Of Combat:]* • Regenerate 3% of your Missing Health each second.
**Passive 2 — Synthesis:** *[For each Level:]* • Gain 5% additional Base Health Regen .

**→ Modeled as:**
- `unmodeled` — **not modeled** — out-of-combat missing-health regen — outside the in-fight window

---

### Solstice  ·  3100g
**Base stats:** magical armor 30, physical armor 30, physical power 40

**Passive 1 — Pendulum:** • Gain 25 stacks each second, up to 100 Max. • Takedowns grant you Max stacks.
**Passive 2 — Mornfall:** *[On Basic Attack:]* • Consume all Pendulum stacks. • Deal 10 Damage . • Increased by (+0-55% ) , based on stacks consumed. • Damage is increased by 2x at Max stacks. • Heals for 135% of the damage dealt to Heroes .

**→ Modeled as:**
- `unmodeled` — **not modeled** — Stack-consume cadence and the scaling base are unstated/ambiguous.

---

### Cursed Ring  ·  3100g
**Base stats:** magical power 35, attack speed 35, physical power 35

**Passive 1 — Curse of Swiftness:** • Increase your Total Attack Speed by 1.2x . • Your Basic Attacks deal 25% less damage.
**Passive 2 — Broken Chains:** • Increase the Attacks per Second Cap from 3 to 4.
**Passive 3 — :** Restriction: Limited to 1 Cursed Item.

**→ Modeled as:**
- `unmodeled` — **not modeled** — The +20% AS is inseparable from a basics-only -25% damage penalty and a cap change the sim cannot express; crediting the upside alone would overvalue it.

---

### Lightning Hawk  ·  3100g
**Base stats:** attack speed 25, critical chance 20, physical power 55

**Passive — Chilling Momentum:** *[While moving or landing Basic Attacks:]* • Generate stacks of Momentum . • At 100 stacks empower your next Basic Attack On-Hit . • Deal 40 (+20% ) Damage . • Slows by 20% for 0.75s .

**→ Modeled as:**
- `unmodeled` — **not modeled** — empowered basic procs every 100 Momentum stacks, but the stack-generation rate is unstated, so the proc cadence cannot be derived

---

### Scattershot  ·  3100g
**Base stats:** critical chance 20, physical power 50, attack speed 25

**Passive — Scatter:** *[Upon successful On-Hit Attack:]* • Summon 2 projectiles from the Target. • These home towards the closest Enemies. • Each deals (+30% ) Damage . • Applies On-Hit effects at 50% effectiveness. • Can Critically Strike and apply Lifesteal .

**→ Modeled as:**
- `unmodeled` — **not modeled** — multi-target projectiles; single-target value unverified

---

### Vainglory  ·  3100g
**Base stats:** max health 200, physical armor 45, magical armor 35

**Passive 1 — Pride:** *[Upon dealing or taking Hero Damage:]* • Gain a stack of Vanity for 4s . • Each stack grants +0.5% increased Armors . • Max Stacks: 10 .
**Passive 2 — In Vain:** *[While at Max Vanity stacks:]* • Gain an additional 10% increased Armors .

**→ Modeled as:**
- `unmodeled` — **not modeled** — A defensive ramping armor stat.

---

### Berserker's Axe  ·  3050g
**Base stats:** physical power 40, ability haste 15, max health 300, movement speed 3

**Passive 1 — Blitz:** *[On Dashing or Leaping:]* • Empower your next Basic Attack within 3s . • Deal 50 (+40% ) Damage . • Slows by 50% for 0.75s .
**Passive 2 — Mist Runner:** *[On crossing a Fog Wall:]* • Gain 15% Movement Speed for 1.5s .

**→ Modeled as:**
- `unmodeled` — **not modeled** — The empowered-basic cadence depends on the hero mobility cooldowns, which are not modeled.

---

### Storm Breaker  ·  3000g
**Base stats:** physical power 45, attack speed 30

**Passive — Electric Momentum:** *[While moving or landing Basic Attacks:]* • Generate stacks of Momentum . • At 100 stacks empower your next Basic Attack On-Hit . • Release a bolt of lightning that chains to 7 Targets. • Deal 70 (+20% ) Damage . • Applies On-Hit effects.

**→ Modeled as:**
- `unmodeled` — **not modeled** — empowered basic procs every 100 Momentum stacks; the generation rate is unstated so the cadence cannot be derived

---

### Lifecore  ·  3000g
**Base stats:** magical power 85, max mana 350, ability haste 15, heal shield increase 12

**Passive 1 — Life Extraction:** *[Upon damaging Heroes:]* • Gain charges equal to 15% of damage dealt. • At 100 charges, damage a Hero to trigger Healing Wisp .
**Passive 2 — Healing Wisp:** • Fire a healing wisp at the Lowest Health Allied Hero within a 1000u radius. • Heals for 100 (+40% ) .

**→ Modeled as:**
- `unmodeled` — **not modeled** — A team-side ally heal, not the holder damage.

---

### Draconum  ·  3000g
**Base stats:** physical power 45, ability haste 15, physical armor 40

**Passive 1 — Surge:** *[On dealing damage to Heroes or Monsters:]* • Gain 2% increased Healing for 5s . • Stacks up to 10 times.
**Passive 2 — Flow:** *[On Takedown:]* • Restore (+120% )(+6% ) Health .

**→ Modeled as:**
- `unmodeled` — **not modeled** — healing-amp stacks and an on-takedown heal — sustain/economy, not single-target combat damage

---

### Omen  ·  3000g
**Base stats:** physical power 50, physical penetration 10, ability haste 10

**Passive — Bestial Momentum:** *[While moving or landing Basic Attacks:]* • Generate stacks of Momentum . • At 100 stacks empower your next Basic Attack On-Hit . • Deal 30 (+20% ) Damage . • Reduce your Non-Ultimate Cooldowns by 25% .

**→ Modeled as:**
- `unmodeled` — **not modeled** — The Momentum stack cadence (movement + attacks) is unstated.

---

### Amulet Of Chaos  ·  3000g
**Base stats:** magical penetration 11, magical power 95

**Passive — Deadly Wish:** *[On Takedown:]* • Reduce your current Basic Ability Cooldowns by 65% . • Restore 35% of your Missing Mana .

**→ Modeled as:**
- `unmodeled` — **not modeled** — Takedown-gated; a 1v1 kill-window sim has no takedown model.

---

### Mistmeadow Buckler  ·  3000g
**Base stats:** physical power 45, ability haste 15, health regeneration 100, magical armor 40

**Passive 1 — Mistwood Guard:** • Gain 100 charges. Regenerate 5 charges each second. • While at 100 charges, gain 15 Magical Armor .
**Passive 2 — Bark Skin:** *[On taking Magical Damage :]* • Consume Mistwood Guard charges. • Block 1 Damage for each charge consumed. • Can block up to 50% of the Damage received.

**→ Modeled as:**
- `unmodeled` — **not modeled** — Defensive, incoming-magical mitigation from a regenerating charge pool.

---

### Salvation  ·  3000g
**Base stats:** tenacity 75, physical power 40, max health 375

**Passive — Aegis:** *[On going below 30% Health :]* • Gain a (+22% ) Shield for 6s . • Reduced to 50% Effectiveness for Ranged Heroes. • Gain 10% Omnivamp for 6s .

**→ Modeled as:**
- `unmodeled` — **not modeled** — A defensive, health-state-gated shield/sustain.

---

### Syonic Echo  ·  3000g
**Base stats:** ability haste 15, lifesteal 15, physical power 55

**Passive 1 — Duplicity:** *[On Ability Cast:]* • Your next 3 Basic Attacks within 3s gain 30% Total Attack Speed .
**Passive 2 — Close Combat:** *[On Melee Heroes only:]* • Activating Duplicity resets your Basic Attack Cooldown .

**→ Modeled as:**
- `unmodeled` — **not modeled** — A windowed 3-basic AS burst with no clean primitive (Close Combat reset is melee-only).

---

### Ruination  ·  3000g
**Base stats:** critical chance 20, physical power 70, ability haste 10

**Passive — Spirit Bleed:** *[Upon successful On-Hit Attack:]* • Apply a bleed that drains Mana by 30 (+8% Target's Max Mana) over 4s . • Deals True Damage equal to 80% of the Mana Drained . • Damaging the Target with an Ability while Spirit Bleed is active will refresh its duration.

**→ Modeled as:**
- `unmodeled` — **not modeled** — Damage scales with the target max mana; target-mana-dependent, out of scope.

---

### Stonewall  ·  3000g
**Base stats:** physical armor 70, max health 250, health regeneration 80

**Passive — Bulwark:** • Mitigate 5 (+5% )% of Physical Damage .

**→ Modeled as:**
- `unmodeled` — **not modeled** — Flat physical-damage mitigation; defensive, and no mitigation primitive exists.

---

### Orb Of Growth  ·  3000g
**Base stats:** max mana 250, magical power 70, max health 250

**Passive 1 — Inner Growth:** *[On Killing Units, gain bonus XP :]* • Minions and Monsters grant 6 . • Camp Leaders grant 15 . • Takedowns grant 50 . • On gaining 500 bonus XP : • Enter Base to Evolve this item into Orb Of Enlightenment .
**Passive 2 — Art Of Fortitude:** *[On Ability Cast:]* • Restore 3% Missing Health over 3s .

**→ Modeled as:**
- `unmodeled` — **not modeled** — XP-stacking item that evolves into Orb of Enlightenment — economy/progression, outside combat objectives

---

### Golem's Gift  ·  3000g
**Base stats:** ability haste 15, physical armor 40, magical power 75, mana regeneration 100

**Passive 1 — Stone Skin:** *[When out of combat:]* • Gain 5 stacks of Stone Skin . • Gain 4 Magical Power and 4 Physical Armor per stack.
**Passive 2 — Stoneweaver:** • On taking Physical Damage from a Hero: Lose 1 stack. • On casting an Ability: Restore 1 stack.

**→ Modeled as:**
- `unmodeled` — **not modeled** — Stacks build out of combat and deplete in a fight; net in-fight uptime is indeterminate.

---

### Frostguard  ·  3000g
**Base stats:** magical armor 40, max health 200, physical armor 40

**Passive 1 — Chilling Presence:** *[On being near Enemy Heroes:]* • Apply a stack of Stifle every 1s .
**Passive 2 — Stifle:** *[On being hit by a Basic Attack:]* • Reduce the Source's Attack Speed by 3.5% for 2.5s . • Stacks up to 5 times.

**→ Modeled as:**
- `unmodeled` — **not modeled** — A defensive, incoming-basic-gated debuff.

---

### Legacy  ·  3000g
**Base stats:** max health 225, magical armor 40, tenacity 75, physical power 35

**Passive — Tenacious Bravery:** *[On going below 40% Health :]* • Self Cleanse . • Gain CC Immunity for 3s .

**→ Modeled as:**
- `unmodeled` — **not modeled** — A defensive, health-state-gated cleanse/immunity.

---

### Gaussian Greaves  ·  2900g
**Base stats:** max health 200, magical power 55, ability haste 10, physical armor 30

**Passive 1 — System Shock:** • Gain the ability to Double Jump while mid-air. • After Double Jumping, emit a shockwave upon landing. • Deals 100 (+50% ) Damage . • Slows by 40% for 1.25s .
**Passive 2 — Galvanize:** *[While out of combat:]* • Gain 7% Movement Speed.

**→ Modeled as:**
- `unmodeled` — **not modeled** — A mobility-gated AoE, not a sustained combat proc.

---

### Dread  ·  2900g
**Base stats:** physical power 55, magical armor 40, physical penetration 12

**Passive — Vital Shield:** *[On receiving Magical Damage from a Hero:]* • Block 25% of Magical Damage for 3s . • Vital Shield returns after not taking Hero Damage for 20s .

**→ Modeled as:**
- `unmodeled` — **not modeled** — A defensive, incoming-damage effect with no offensive component.

---

### Giant's Ring  ·  2900g
**Base stats:** ability haste 15, max health 300, physical armor 45

**Passive 1 — Retribution:** *[When hit by Basic Attacks:]* • Reduce your Non-Ultimate Cooldowns by 0.25s .
**Passive 2 — Gigantism:** *[On casting your Ultimate:]* • Gain 15% Hero Size . • Mitigate 5% of damage taken. • Double the effectiveness of Retribution for 6s .

**→ Modeled as:**
- `unmodeled` — **not modeled** — Cooldown refunds and a defensive ult buff gated on being attacked.

---

### Overlord  ·  2900g
**Base stats:** max health 275, physical power 30

**Passive 1 — Colossal Cleave:** *[On Successful Basic Attack:]* • Deal (+1% ) Damage . • Deal (+30% ) (+2.5% ) Damage around the Target. • Damage decreases from 100% to 50% based on distance.
**Passive 2 — Devourer:** *[On Killing an Enemy Unit:]* • Permanently gain 1 Health . • Camp Leaders grant 3 . • Heroes grant 5 . • Upon reaching 100 stacks, gain an additional 125 Health .

**→ Modeled as:**
- `unmodeled` — **not modeled** — cleave is multi-target value (no single-target change at this text precision); Devourer health stacking is kill-economy

---

### Claw Of Hermes  ·  2900g
**Base stats:** magical power 90, health regeneration 80, max health 200, max mana 250

**Passive 1 — Mana Burn:** *[On Successful Basic Attack:]* • Against Melee Heroes: Drain 2.5% of their Max Mana . • Against Ranged Heroes: Drain 4% of their Max Mana . • Deals True Damage equal to 75% of the Mana Drained . • If you are a Ranged Hero, Mana Burn is 50% as effective.
**Passive 2 — Mindflare:** *[Based on the Target's Missing Mana :]* • Abilities deal 0-12% more Damage .

**→ Modeled as:**
- `unmodeled` — **not modeled** — Damage scales with the target max/missing mana; target-mana-dependent, explicitly out of scope.

---

### Spellbreaker  ·  2900g
**Base stats:** magical armor 40, ability haste 10, magical power 75

**Passive 1 — Veil:** • Gain a Spell Shield that blocks the next Ability.
**Passive 2 — Malefic:** *[While Veil is active:]* • Increase your Magical Power by 15% .

**→ Modeled as:**
- `unmodeled` — **not modeled** — The +15% holds only until the Veil blocks an ability and breaks; in-fight uptime is indeterminate.

---

### Fire Blossom  ·  2900g
**Base stats:** max health 350, physical armor 50

**Passive — Heatwave:** *[Burn nearby Enemy Units:]* • Deals 15 (+0.7% ) Damage each second. Firestorm - When Heatwave damages a Target: • Deals 6.25% more damage each second, up to 50% . • Resets after not damaging the Target for 2.5s .

**→ Modeled as:**
- `unmodeled` — **not modeled** — proximity burn aura; uptime depends on positioning the closed-form sim cannot observe

---

### Vyzar Carapace  ·  2900g
**Base stats:** max health 225, ability haste 15, physical power 45

**Passive 1 — Shell Shock:** *[Against Enemy Heroes:]* • Basic Attacks and Abilities apply a stack of Scorn . • Apply 3 stacks to a Hero to trigger Shell Smash . • Scorn can only be applied once per ability.
**Passive 2 — Shell Smash:** • Deals 60-170 Damage , based on Level . • Gain a 50 (+12% ) Shield for 3s .

**→ Modeled as:**
- `unmodeled` — **not modeled** — The proc damage type is ambiguous and it grants a self-shield; a clean credit is unsafe.

---

### Void Helm  ·  2900g
**Base stats:** ability haste 10, max health 400, magical armor 45

**Passive — Abyssal Gift:** • Heal 20% more from all sources.

**→ Modeled as:**
- `unmodeled` — **not modeled** — A healing-received amp (sustain); not a damage or EHP primitive.

---

### Ashbringer  ·  2900g
**Base stats:** attack speed 25, ability haste 10, critical chance 20, physical power 45

**Passive — Chrono Strikes:** *[On Successful Basic Attack:]* • Decrease current Non-Ultimate Cooldowns by 8% On-Hit . • Reduced to 4% against Non-Heroes . • Only triggers once per ability. • Critical Strikes grant 1.5x the cooldown reduction.

**→ Modeled as:**
- `unmodeled` — **not modeled** — The cooldown ripple depends on ability interleaving the sim does not track.

---

### Malady  ·  2900g
**Base stats:** physical power 50, physical penetration 12, ability haste 8

**Passive 1 — Parting Gift:** *[On Killing a Unit:]* • Cause them to explode. • Deals Damage based on their Max Health .
**Passive 2 — Demise:** *[On damaging a Hero below 40% Health :]* • Deal 20 (+15% ) Damage . • Gain a stack of Demise . • Damage increases by 4 per stack of Demise . • Takedowns reset the Cooldown .

**→ Modeled as:**
- `unmodeled` — **not modeled** — Demise's finisher fires only on sub-40%-health targets and ramps +4 per stack at an unstated cadence; Parting Gift's on-kill explosion deals an unstated % of Max Health. A fixed-target damage-over-window sim can neither gate nor stack it.

---

### Demon Edge  ·  2900g
**Base stats:** physical penetration 10, physical power 45, ability haste 10, max health 200

**Passive — Demonic:** *[On damaging a Shielded Target:]* • Gain 20% Movement Speed for 2s . • Deal 45% bonus Damage . • Does not exceed the size of the Shield .

**→ Modeled as:**
- `unmodeled` — **not modeled** — Requires the enemy to be Shielded; no enemy-shield state in the sim.

---

### Transference  ·  2900g
**Base stats:** magical armor 35, physical armor 40, max health 200, heal shield increase 12

**Passive 1 — Shield Transference:** *[Upon Shields expiring:]* • 50% of its remaining value is restored as Health over 3s . • Reduced to 25% for Ally Shields .
**Passive 2 — Ionizing Charge:** *[While Shielded :]* • Gain 12% Movement Speed . • Gain 10% increased Armors .

**→ Modeled as:**
- `unmodeled` — **not modeled** — Defensive, shield-state-gated.

---

### Catalytic Drive  ·  2900g
**Base stats:** max health 250, magical armor 40, health regeneration 80, ability haste 10

**Passive 1 — Deconstruct:** *[Against Minions & Small Monsters:]* • Your next Basic Attack On-Hit Executes them. • Deals 60 (+5% ) Damage to nearby Enemies. • Heals you for 30 (+3% ) . • Grants you +8 bonus Gold .
**Passive 2 — Converter:** *[Upon Executing 20 Units:]* • Enter Base to Evolve this item into Cybernetic Drive .

**→ Modeled as:**
- `unmodeled` — **not modeled** — PvE execute and an evolve trigger; no combat-damage component.

---

### Nightfall  ·  2900g
**Base stats:** physical power 50, omnivamp 8, physical penetration 10

**Passive 1 — Eclipse:** • Abilities Heal for 6% of damage dealt to Heroes.
**Passive 2 — Dusk Reaver:** *[On Takedown:]* • Gain a 200 - 400 Shield for 3.5s . • Shield size increases with Level .

**→ Modeled as:**
- `unmodeled` — **not modeled** — Ability sustain (no damage component) and a takedown-gated shield.

---

### Envy  ·  2900g
**Base stats:** physical penetration 10, max mana 250, physical power 45

**Passive 1 — Sacrificial Strike:** *[On Dashing, Leaping or exiting Camo:]* • Your next Basic Attack within 2.5s will Critically Strike .
**Passive 2 — Hush:** *[On using Sacrificial Strike on a Hero:]* • Silence them for 0.8s .

**→ Modeled as:**
- `unmodeled` — **not modeled** — The guaranteed-crit cadence depends on mobility uptime; Hush is a silence (CC).

---

### Penumbra  ·  2900g
**Base stats:** max health 200, physical penetration 8, ability haste 20, physical power 50

**Passive — Essence Reaper:** *[On Takedown:]* • Reduce Non-Ultimate Cooldowns by 4s .

**→ Modeled as:**
- `unmodeled` — **not modeled** — Takedown-gated; no takedown model in a 1v1 kill window.

---

### Astral Catalyst  ·  2850g
**Base stats:** max mana 250, ability haste 20, magical power 80

**Passive 1 — Ravenous:** *[On Takedown:]* • Reduce Ultimate Cooldown by 20% .
**Passive 2 — Event Horizon:** *[On damaging a Shielded Target:]* • Deal 40% bonus Damage . • Does not exceed the size of the Shield .

**→ Modeled as:**
- `unmodeled` — **not modeled** — Takedown-gated and enemy-shield-gated; neither state exists in the sim.

---

### Mesmer  ·  2850g
**Base stats:** physical power 55, physical penetration 10, max health 250

**Passive — Vengeful Shroud:** • Gain a Spell Shield that blocks the next Ability.

**→ Modeled as:**
- `unmodeled` — **not modeled** — A defensive spell shield; carries no damage effect.

---

### Lifebinder  ·  2800g
**Base stats:** magical lifesteal 12, ability haste 15, magical power 80

**Passive — Twilight Sonata:** *[For every 10% Missing Health]* • Gain 2.5 Magical Power and 1% Magical Lifesteal .

**→ Modeled as:**
- `unmodeled` — **not modeled** — Scales with the holder missing health; no health-state uptime model.

---

### Gaia Greaves  ·  2800g
**Base stats:** physical armor 45, max health 300, ability haste 10

**Passive 1 — Tremor:** *[Move to generate up to 100 stacks:]* • Stacks grant up to 40 Movement Speed . • Basic Attacks expend all stacks for bonus Damage . • Deals up to 40 (+60% ) (+5% ) Damage . • Lose 50 stacks per second while Slowed or Immobilized .
**Passive 2 — Unburden:** • Increase your Jump Height by 65% .

**→ Modeled as:**
- `unmodeled` — **not modeled** — The bonus-damage cadence is movement-stack-dependent and unstated.

---

### Unbroken Will  ·  2800g
**Base stats:** magical armor 45, max health 400, tenacity 75

**Passive — Undying:** *[On being Immobilized :]* • Increase your Physical Armor by 25% for 2.5s . • Increase your Magical Armor by 25% for 2.5s .

**→ Modeled as:**
- `unmodeled` — **not modeled** — A defensive, CC-triggered armor buff.

---

### Onixian Quiver  ·  2750g
**Base stats:** critical chance 20, lifesteal 7, attack speed 55

**Passive 1 — Multishot:** *[On Ranged Basic Attack:]* • Fire 2 additional projectiles. • Each deals 8-30% (increases with Range ) ( ) Damage . • Can Critically Strike and apply Lifesteal .
**Passive 2 — Onixia:** *[On Melee Heroes only:]* • Increase your Total Critical Strike Chance by 25% . • Gain 1% Damage Mitigation for every 10% Missing Health .

**→ Modeled as:**
- `unmodeled` — **not modeled** — Multishot is multi-projectile/splash and Onixia is melee-only; crediting it globally would overvalue ranged carries.

---

### Volcanica  ·  2750g
**Base stats:** max health 300, ability haste 10, physical power 30

**Passive — Hellstorm:** *[On Ability Cast:]* • Reduce your other current Basic Ability Cooldowns by 0.5s . • Increased to 1.5s when casting your Ultimate Ability . Restriction: • Hellstorm has 40% effectiveness for Stance Switchers .

**→ Modeled as:**
- `unmodeled` — **not modeled** — The cooldown ripple depends on ability interleaving the sim does not track.

---

### Dreambinder  ·  2650g
**Base stats:** magical power 80, max health 325

**Passive 1 — Chilling Spells:** *[On dealing Ability Damage:]* • Slows by 25% for 1s . • Reduced to 15% for DoT Abilities.
**Passive 2 — :** Restriction: Does not apply with Proc Damage.

**→ Modeled as:**
- `unmodeled` — **not modeled** — A slow only (CC).

---

### Rebirth  ·  2600g
**Base stats:** physical armor 40, magical armor 35, ability haste 15

**Passive 1 — Mechanica:** *[Upon Dying :]* • After 1.75s , come back to life as a Drone . • Survive for 7s to Resurrect with 50% Health & Mana .
**Passive 2 — Droney:** *[While in Drone form:]* • You have 600-2100 Health , based on Level . • Stats are reduced and you cannot use Abilities or Items. • Gain +50% Jump Height . • You can Basic Attack for reduced damage.

**→ Modeled as:**
- `unmodeled` — **not modeled** — A death-revive mechanic; out of any damage/EHP model.

---

### Devotion  ·  2550g
**Base stats:** magical power 40, magical armor 35, heal shield increase 10, mana regeneration 80

**Passive 1 — Fidelity:** • Your Heals and Shields are 10% stronger on Allied Heroes that are below 40% Health .
**Passive 2 — Mystica:** *[Upon taking magical damage:]* • If the incoming damage instance is greater than 150 , reduce it by 15% .

**→ Modeled as:**
- `unmodeled` — **not modeled** — Both are support/defensive (team-side heal boost, incoming-magical mitigation).

---

### Galaxy Greaves  ·  2500g
**Base stats:** magical armor 30, mana regeneration 100, ability haste 10, physical armor 30

**Passive 1 — ZeroG:** *[While moving:]* • Generate stacks of ZeroG . • At 100 stacks your next jump has increased height.
**Passive 2 — Celerity:** *[While out of combat:]* • Gain 7% Movement Speed.

**→ Modeled as:**
- `unmodeled` — **not modeled** — Movement and out-of-combat MS utility; no combat damage component.

---

### Lunaria  ·  2450g
**Base stats:** ability haste 10, magical power 55, heal shield increase 15

**Passive 1 — Incandescence:** *[On dealing damage to Heroes:]* • Gain charges equal to 25% of damage dealt. • Charge Limit: 100-250, based on Level .
**Passive 2 — Mending:** *[On Healing or Shielding an Ally Hero:]* • Consume all Incandescence charges. • Heal them for the amount. • Prioritizes Lowest Health Target.

**→ Modeled as:**
- `unmodeled` — **not modeled** — A support, team-side heal-conversion.

---

### Everbloom  ·  2450g
**Base stats:** magical power 45, max health 200, heal shield increase 10

**Passive — Divine Protection:** *[On Healing or Shielding an Ally:]* • Grant them 5% Damage Mitigation and 20 Tenacity for 2s .

**→ Modeled as:**
- `unmodeled` — **not modeled** — A support, team-side defensive grant.

---

### Hexbound Bracers  ·  2450g
**Base stats:** ability haste 15, max mana 300, max health 375, heal shield increase 10

**Passive 1 — Mana Reactor:** • Restore Mana equal to 15% of damage taken. • Reduced to 5% when damaged by Non-Heroes. • Based on your Missing Mana , gain 1-3 additional Mana Regen .
**Passive 2 — Hexed Guard:** • Take 5 (+1 per Level) less damage from Hero Basic Attacks.

**→ Modeled as:**
- `unmodeled` — **not modeled** — Mana sustain and basic-attack mitigation; defensive/economy.

---

### Xenia  ·  2450g
**Base stats:** physical armor 30, magical armor 25, ability haste 10, max health 200

**Passive 1 — Xenos Guard:** *[When within 200u to an Ally Hero:]* • Grant them a 50 (+10% ) (+5 per Level) Shield for 4s . • Cooldown is per Target.
**Passive 2 — :** Restriction: • Subsequent applications to the same Hero within 10s are 50% effective.

**→ Modeled as:**
- `unmodeled` — **not modeled** — shields a nearby ally — team-side value outside the single-hero sim

---

### Vanguardian  ·  2450g
**Base stats:** physical armor 35, magical armor 35, tenacity 80, ability haste 10

**Passive — Guardian:** *[Nearby Allied Heroes gain:]* • 15 Physical Armor . • 12 Magical Armor .

**→ Modeled as:**
- `unmodeled` — **not modeled** — A team-side defensive aura.

---

### Crystal Tear  ·  2400g
**Base stats:** magical power 40, mana regeneration 150, ability haste 10, heal shield increase 12

**Passive — Elation:** *[On Healing or Shielding Heroes:]* • You both gain 30 Magical Power for 5s . • You both gain 15 Ability Haste for 5s .

**→ Modeled as:**
- `unmodeled` — **not modeled** — A support, team-side buff on heal/shield cast.

---

### Enra's Blessing  ·  2400g
**Base stats:** max health 225, max mana 250, ability haste 15, magical power 40

**Passive — Enra's Protection:** • When within 1000u of an Ally Hero, if they are Immobilized : • Grant them a 50 (+30% ) (+8% ) Shield for 3.5s . • Cooldown is per Target.

**→ Modeled as:**
- `unmodeled` — **not modeled** — shields an immobilized ally — team-side value outside the single-hero sim

---

### Luxforge Lantern  ·  2400g
**Base stats:** ability haste 15, physical power 30, max health 200

**Passive 1 — Lumos:** *[On Takedown or Ward Kill, gain stacks:]* • Stacks permanently grant +1 Physical Power . • Takedowns: 2 stacks. • Ward Kills: 2 stacks. • Max Stacks: 30 .
**Passive 2 — The Wanderer:** *[While out of combat:]* • Gain 7% Movement Speed.

**→ Modeled as:**
- `unmodeled` — **not modeled** — A permanent economy/farming stack.


---

## ⏳ Not yet reviewed (flat-stats-only — on the queue)


