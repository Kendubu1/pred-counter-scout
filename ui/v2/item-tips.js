// Manual item classification - identity, buy tips, counter tips
// Organized by category for maintainability
const ITEM_TIPS = {
// ── Anti-Heal (Tainted Family) ──
'Tainted Blade': { id: 'Physical anti-heal for bruisers', tags: ['anti-heal'], buy: 'Enemy has healing AND you auto-attack as a bruiser', tip: 'Hex makes you take 5% more from ALL sources. Disengage when marked.' },
'Tainted Rounds': { id: 'Carry anti-heal with execute scaling', tags: ['anti-heal','crit'], buy: 'Enemy has healing AND you\'re an auto-attack carry', tip: 'Damage ramps as you get lower. Don\'t fight low HP against this.' },
'Tainted Trident': { id: 'Ability-based physical anti-heal', tags: ['anti-heal','pen'], buy: 'Enemy has healing AND you deal ability-based physical damage', tip: 'Adds flat bonus damage on top of anti-heal. Bursty trades are extra dangerous.' },
'Tainted Scepter': { id: 'Mage anti-heal with stacking damage', tags: ['anti-heal'], buy: 'Enemy has healing AND you\'re a mage', tip: 'Malice stacks reset on death. Kill the mage to remove their ramp.' },
'Tainted Bastion': { id: 'Tank anti-heal vs magic damage', tags: ['anti-heal','defense'], buy: 'Enemy mages have healing (Narbash, Phase)', tip: 'Reactive anti-heal (triggers when hit). Poke from range to avoid applying blight.' },
'Tainted Guard': { id: 'Tank anti-heal vs physical damage', tags: ['anti-heal','defense'], buy: 'Enemy physical heroes have lifesteal', tip: 'Punishes you for hitting the tank. Focus someone else or kite.' },
'Tainted Charm': { id: 'Support anti-heal aura', tags: ['anti-heal','support'], buy: 'You\'re support and enemy has heavy healing', tip: 'Aura effect. Stay outside the support\'s range to avoid the heal cut.' },
'Tainted Totem': { id: 'Budget support anti-heal', tags: ['anti-heal','support'], buy: 'Early anti-heal needed, cheapest option at 2300g', tip: 'Shares anti-heal to allies. Focus the totem carrier to remove the source.' },

// ── Penetration / Armor Shred ──
'Caustica': { id: 'Magic tank-buster. Ignores 35% MR.', tags: ['pen','anti-tank'], buy: 'Enemy is stacking magic resist', tip: 'Arcane Might only works above 50% HP. Less effective once chunked.' },
'Demolisher': { id: 'Crit carry armor shredder', tags: ['pen','anti-tank','crit'], buy: 'Enemy has armor stackers and you\'re a crit carry', tip: 'Shreds bonus armor. HP stacking is better than armor stacking against this.' },
'The Perforator': { id: 'Ability-based 30% armor pen + slow', tags: ['pen','anti-tank'], buy: 'AD caster vs armor stackers', tip: 'HP stacking > armor stacking vs this item.' },
'Deathstalker': { id: 'AS armor shredder with burst window', tags: ['pen','dps'], buy: 'Need sustained shred + burst windows', tip: 'Onslaught AS burst is temporary. Disengage when it procs.' },
'Viper': { id: 'Sustained armor shred + on-hit amp', tags: ['pen','dps'], buy: 'Extended fights vs armor stackers', tip: 'Needs 6 hits to fully stack. Short trades prevent full shred.' },
'Basilisk': { id: 'Bruiser armor shred + chase', tags: ['pen','bruiser'], buy: 'Bruiser who wants shred + stickiness', tip: 'Same as Viper. Short trades prevent full Corrode stacking.' },
'Magnify': { id: 'Magic armor shred + sustain', tags: ['pen','sustain'], buy: 'Team does magic damage and enemy has MR', tip: 'Stacks need sustained ability hits. Burst the mage before they stack.' },
'Wraith Leggings': { id: 'Pure magic damage amp + mobility', tags: ['pen','burst'], buy: 'Maximum magic damage output', tip: '90 MP + 12% bonus damage is massive burst. Stack MR or kill first.' },

// ── Critical Strike ──
'Imperator': { id: 'THE crit damage amplifier', tags: ['crit','burst'], buy: 'Already critting, want maximum per-hit damage', tip: 'Warden\'s Faith reduces crit damage by 20%. Build it.' },
'Dust Devil': { id: 'Mobile crit + ramping AS', tags: ['crit','dps','movement'], buy: 'Sustained DPS with kiting potential', tip: 'Menace stacks fall off. Disengage to reset their AS ramp.' },
'Ashbringer': { id: 'Crit carry CDR (crits reduce cooldowns)', tags: ['crit','cdr'], buy: 'Carry with useful abilities that crits', tip: 'Abilities up way more often than expected. Don\'t assume cooldowns.' },
'Lightning Hawk': { id: 'Momentum proc with slow', tags: ['crit','on-hit'], buy: 'Consistent damage + catch potential', tip: 'Momentum proc is telegraphed. Watch for empowered swing.' },
'Onixian Quiver': { id: 'Multishot + built-in survivability', tags: ['crit','dps'], buy: 'Core carry teamfight DPS item', tip: 'Don\'t clump up (multishot). Gets tankier at low HP.' },
'Scattershot': { id: 'Bouncing projectile splash damage', tags: ['crit','dps'], buy: 'Enemy groups up, want splash', tip: 'Scatter projectiles home to nearby enemies. Spread out.' },
'Necrosis': { id: 'Ultimate-focused carry item', tags: ['crit','cdr'], buy: 'Ult is a big part of your kit', tip: 'Ult up more often AND hits harder. Track the CD.' },
'Nuclear Rounds': { id: 'Hybrid carry boosting ability damage', tags: ['crit','burst'], buy: 'Carry who relies on abilities too', tip: 'More ability damage than expected from an ADC.' },
'Equinox': { id: 'Defensive carry shield + tenacity', tags: ['crit','defense'], buy: 'Getting dove or CC\'d as a carry', tip: '90s cooldown. Bait the shield, then re-engage.' },
'Plasma Blade': { id: 'Hybrid damage (physical + magical)', tags: ['crit','hybrid'], buy: 'Hero deals hybrid damage (Serath)', tip: 'Mixed damage. Single-resist stacking is less effective.' },
'Solaris': { id: 'Spellblade carry with crit + mana + self-heal', tags: ['crit','sustain'], buy: 'AD carry who weaves autos between abilities and needs mana', tip: 'Heals 65% of spellblade damage. Anti-heal cuts the sustain. Procs every 1.5s.' },

// ── Sustain / Lifesteal ──
'Terminus': { id: 'Overheal becomes a shield', tags: ['lifesteal','shield'], buy: 'Already lifesteal enough to overheal', tip: 'Anti-heal destroys this. Shield decays after 15s out of combat.' },
'Lifebinder': { id: 'Mage sustain + scaling power', tags: ['sustain','scaling'], buy: 'Sustain through fights as a mage', tip: 'Anti-heal. Gets stronger over time with stacks.' },
'Syonic Echo': { id: 'Assassin lifesteal with AA reset burst', tags: ['lifesteal','burst'], buy: 'Burst + sustain on melee physical hero', tip: 'Double-auto burst is fast. Big chunk damage from Duplicity.' },
'Sky Splitter': { id: 'Current HP shred on-hit (tank melter)', tags: ['on-hit','anti-tank'], buy: 'Enemy stacking HP', tip: 'Shreds current HP. Less effective as target gets lower. Armor still helps.' },
'Manta Scythe': { id: 'Split-push + isolation hunter', tags: ['lifesteal','split-push'], buy: 'Split push or pick off isolated targets', tip: 'Don\'t get caught alone. 10% more damage to isolated targets.' },
'Draconum': { id: 'Fighter sustain through healing amp', tags: ['sustain','defense'], buy: 'Melee fighter in extended fights', tip: 'Anti-heal destroys Surge stacking. Burst them instead.' },
'Nightfall': { id: 'Ability sustain + burst shield', tags: ['sustain','shield'], buy: 'AD caster who needs sustain + survivability', tip: 'Shield has a cooldown. Bait it, then burst.' },

// ── Shields / Survivability ──
'Salvation': { id: 'Emergency shield + omnivamp burst', tags: ['shield','defense'], buy: 'Panic button for bruisers/fighters', tip: '60s CD. 50% effective on ranged. Track the cooldown.' },
'Mesmer': { id: 'Spell shield for physical heroes', tags: ['spell-shield'], buy: 'One key enemy ability ruins your engage', tip: 'Pop the spell shield with a throwaway ability first.' },
'Spellbreaker': { id: 'Spell shield for mages', tags: ['spell-shield'], buy: 'One key enemy ability threatens you', tip: 'Same as Mesmer. Pop with a low-value ability first.' },
'Legacy': { id: 'Self-cleanse + CC immunity', tags: ['cleanse','defense'], buy: 'Heavy CC locks you down', tip: '120s CD. Bait cleanse with lesser CC, then use real lockdown.' },
'Rebirth': { id: 'Resurrection on death', tags: ['defense'], buy: 'You\'re the win condition and dying loses the fight', tip: '210s (3.5 min) CD. Kill them, wait it out, force next fight.' },
'Dread': { id: 'Magic damage shield for physical heroes', tags: ['anti-mage'], buy: 'Enemy mage is bursting you', tip: 'Shield needs 20s to refresh. Poke to keep it down.' },
'Absolution': { id: 'Emergency damage mitigation + speed', tags: ['defense','movement'], buy: 'Survive burst AND escape', tip: '45s CD. 3s window is small. Layer CC to outlast it.' },

// ── Tank / Defense ──
'Stonewall': { id: 'Maximum physical armor', tags: ['defense','anti-carry'], buy: 'Enemy physical damage is destroying you', tip: 'Only blocks physical. Magic damage ignores it.' },
'Warden\'s Faith': { id: 'Anti-crit + AD reduction aura', tags: ['defense','anti-carry'], buy: 'Enemy carry is crit-based', tip: '8% AD reduction aura. Stay out of range if not fighting the tank.' },
'Void Helm': { id: 'HP tank + 20% healing amplification', tags: ['defense','sustain'], buy: 'Have self-healing + enemy has magic damage', tip: 'Anti-heal is critical. 20% more healing makes sustain tanks unkillable.' },
'Frostguard': { id: 'Attack speed slow aura', tags: ['defense','anti-carry'], buy: 'Enemy carry relies on attack speed', tip: 'Aura effect. Carry should stay away from this tank.' },
'Fire Blossom': { id: 'Ramping AOE damage just by existing', tags: ['defense','dps'], buy: 'Want to deal damage by standing near enemies', tip: 'Resets after 2.5s without damage. Kite the tank.' },
'Raiment of Renewal': { id: 'Maximum HP regeneration', tags: ['defense','sustain'], buy: 'Want to never die through pure regen', tip: 'Anti-heal is mandatory. 3% missing HP/s is absurd without it.' },
'Giant\'s Ring': { id: 'CDR tank + size/mitigation burst', tags: ['defense','cdr'], buy: 'Tank with lots of CC abilities', tip: 'Gigantism makes them bigger (easier to hit) but tankier.' },
'Vainglory': { id: 'Stacking armor amplifier for extended fights', tags: ['defense','bruiser'], buy: 'You need both armors and plan to brawl for extended periods', tip: 'Vanity stacks fall off after 4s. Burst or disengage to prevent full stacking. Up to 15% bonus armor at max.' },
'Crystalline Cuirass': { id: 'Stacking MR + movement speed vs mages', tags: ['defense','anti-mage'], buy: 'Enemy has sustained magic damage dealers', tip: 'Stacks up to 25 bonus MR + 12% MS at 5 stacks. Burst instead of sustained poke to prevent stacking.' },
'Citadel': { id: 'Armor stacker that shreds enemy armor', tags: ['defense','pen'], buy: 'Physical bruiser vs other physical heroes', tip: 'Reduces YOUR armor by 20% when near them. Gives them free armor stacking. Magic damage ignores both effects.' },
'Frosted Lure': { id: 'AOE slow + shield on 45s CD', tags: ['defense','cc'], buy: 'Tank who needs AOE peel and wave management', tip: '45s CD AOE slow. Shield scales with enemies hit. Spread out to reduce shield value.' },
'Unbroken Will': { id: 'Anti-magic + tenacity with armor burst', tags: ['defense','anti-mage'], buy: 'Enemy has magic damage + CC and you need tenacity', tip: 'Active gives 25% bonus to BOTH armors for 2.5s. Bait the active then engage.' },
'Vanguardian': { id: 'Cheap dual-resist + tenacity aura for allies', tags: ['defense','support'], buy: 'Budget tank item when you need tenacity and both resists', tip: 'Grants nearby allies 15 phys armor and 12 magic armor. Kill the tank or fight outside aura range.' },
'Cursed Scroll': { id: 'Self-damage tank that scales regen and AS', tags: ['defense','dps'], buy: 'Tank who wants attack speed + regen and can afford self-damage', tip: 'Hurts itself on-hit but can\'t go below 35% HP from it. Anti-heal counters the regen. Limited to 1 Cursed item.' },
'Golem\'s Gift': { id: 'Mage-tank hybrid with stacking AP + armor', tags: ['defense','burst'], buy: 'AP bruiser who takes physical damage and casts often', tip: 'Loses stacks from physical hits, regains from casting. Burst with physical damage between their casts to strip stacks.' },

// ── Mana / Burst ──
'Oblivion Crown': { id: 'THE raw magic power item. Pure AP.', tags: ['burst'], buy: 'Maximum magic damage output', tip: 'No defensive stats at all. Dive the mage.' },
'Timewarp': { id: 'Maximum cooldown reduction', tags: ['cdr'], buy: 'Want to spam abilities non-stop', tip: 'Abilities up constantly. Engage hard, don\'t trade poke.' },
'Noxia': { id: 'Mark-and-detonate 6% max HP burst', tags: ['burst','anti-tank'], buy: 'Combo mage (mark with one ability, pop with another)', tip: 'Dark Matter has 8s CD. Window after combo is blown.' },
'Amulet Of Chaos': { id: 'Ability reset + mana restore on kill', tags: ['burst'], buy: 'Cleanup/reset mage', tip: 'Power spikes on getting a kill. Don\'t let them snowball.' },
'Spectral Schematics': { id: 'Burst + % current HP damage', tags: ['burst','anti-tank'], buy: 'Front-loaded burst damage', tip: 'Current HP scaling. Weaker as finisher.' },
'Megacosm': { id: '%HP burn (max + bonus HP)', tags: ['anti-tank'], buy: 'Enemy has HP stackers', tip: 'MR reduces the burn. Doesn\'t stack, just refreshes.' },
'Entropy': { id: 'Mage poke with bonus damage per ability hit', tags: ['burst','poke'], buy: 'Spam mage who hits multiple abilities in quick succession', tip: 'Each ability adds 3 (+3%) bonus damage. Dodge abilities or all-in between cooldowns.' },
'Combustion': { id: 'AOE burst mage item with CDR on ability hits', tags: ['burst','aoe'], buy: 'Mage who hits multiple targets and wants Pyro resets', tip: 'Pyro deals AOE damage on 15s CD, reduced by 0.5s per ability hit. Spread out to limit AOE value.' },
'Soulbinder': { id: 'Long-range mage with stacking AP and bonus damage at range', tags: ['burst','scaling'], buy: 'Artillery mage who fights from 1450+ range', tip: 'Deals 7% bonus damage at long range. Close the gap to deny Arcane Salvo. Permanently stacks AP.' },
'Astral Catalyst': { id: 'Ultimate CDR + shield-breaking burst', tags: ['burst','cdr'], buy: 'Mage whose ultimate is their win condition', tip: '20% ult CDR means ult is up way more often. 40% bonus damage that can\'t exceed shield size. Track their ult timer.' },

// ── On-Hit ──
'Oathkeeper': { id: 'Spellblade mage (empowered auto after ability)', tags: ['on-hit','burst'], buy: 'Weave autos between abilities', tip: 'They auto between every ability. Kite to deny the proc.' },
'Prophecy': { id: 'On-hit magic DPS', tags: ['on-hit','dps'], buy: 'Sustained magic DPS through autos', tip: 'MR reduces on-hit. Attack speed slows counter hard.' },
'Orion': { id: 'Converts Ability Haste into Attack Speed', tags: ['on-hit','hybrid'], buy: 'High AH build + want to auto-attack', tip: 'Ramps damage over 10 hits. Short trades prevent ramp.' },
'Cursed Ring': { id: 'Attack speed cap 3→4 (on-hit builds)', tags: ['on-hit','dps'], buy: 'Maximum attack speed on-hit build', tip: 'Autos do 25% less. On-hit effects compensate. Armor works.' },
'Rapture': { id: 'On-hit %HP + %MP shredder', tags: ['on-hit','anti-tank'], buy: 'Enemy has HP/mana stackers', tip: 'CC/kite to deny auto attacks.' },
'Spectra': { id: 'On-hit + execute proc', tags: ['on-hit','execute'], buy: 'On-hit with execute burst', tip: 'Prisma deals up to 3x at low HP. Don\'t fight low.' },
'Storm Breaker': { id: 'Chain lightning to 7 targets', tags: ['on-hit','aoe'], buy: 'AOE on-hit teamfight damage', tip: 'Chain hits 7 targets. Spread out.' },

// ── Unique / Utility ──
'Ruination': { id: 'Mana drain + true damage', tags: ['mana-burn','burst'], buy: 'Enemy is mana-dependent', tip: 'Deals TRUE damage from your mana. Mana-less heroes unaffected.' },
'Claw Of Hermes': { id: 'Mana drain mage item', tags: ['mana-burn'], buy: 'Enemy is mana-reliant', tip: 'Mana-less heroes ignore this. Ranged users get 50% effectiveness.' },
'Envy': { id: 'Guaranteed crit + silence', tags: ['burst','cc'], buy: 'Guaranteed burst + interrupt', tip: 'Hush silence 60s CD. Guaranteed crit always happens.' },
'Echelon Cloak': { id: 'Stealth + damage amp + sustain', tags: ['stealth','burst'], buy: 'Stealth engages or flanks', tip: 'Wards reveal camouflage. 3s damage window after exiting.' },
'Warp Stream': { id: 'Tele-blink + ult CDR', tags: ['mobility','cdr'], buy: 'Blink up more often + ult CDR', tip: 'Disabled 3s after taking damage. Poke to prevent escape.' },
'Dreambinder': { id: 'Every ability slows enemies', tags: ['cc'], buy: 'Kite or lock people down with abilities', tip: 'Every ability slows. Tenacity helps. Don\'t chase.' },

// ── Bruiser / Fighter ──
'Earthshaker': { id: 'Stacking ability damage amp (melee 2x)', tags: ['dps','bruiser'], buy: 'Auto-attack + ability damage bruiser', tip: 'Ramps ability damage over time. Burst or disengage early.' },
'Fist Of Razuul': { id: 'HP tank with empowered auto + self-heal', tags: ['sustain','bruiser'], buy: 'Beefy, clear waves, still threaten', tip: 'Anti-heal reduces self-heal. Stacks take 3s to build.' },
'Penumbra': { id: 'CDR reset on kill', tags: ['cdr','snowball'], buy: 'Get kills and chain fights', tip: 'CDs reset on kills. Don\'t feed resets.' },
'Tyranny': { id: 'Snowball chaser (MS + AH on takedown)', tags: ['snowball','movement'], buy: 'Chase down teamfight resets', tip: 'Don\'t be the second target. Group up.' },
'Demon Edge': { id: 'Bruiser burst with movement speed steroid', tags: ['bruiser','burst'], buy: 'Physical bruiser who wants burst + chase potential', tip: 'Gives 20% MS for 2s and 40% bonus damage on proc. Disengage during the speed boost window.' },
'Overlord': { id: 'Cleave + permanent HP stacking bruiser item', tags: ['bruiser','scaling'], buy: 'Melee fighter who farms a lot and wants AOE clear + scaling HP', tip: 'Permanently stacks HP from kills. At 100 stacks gains bonus 125 HP. Punish early before stacks accumulate.' },
'Berserker\'s Axe': { id: 'Empowered auto with slow + movement speed', tags: ['bruiser','cc'], buy: 'Melee bruiser who needs catch and sticking power', tip: '50% slow for 0.75s every 8s plus 15% MS burst. Kite after the slow wears off.' },
'Painweaver': { id: 'Stacking pen + movement speed on abilities', tags: ['bruiser','pen'], buy: 'AD caster who wants ramping pen and chase', tip: 'Stacks up to 8 pen and 8% MS over 4 hits. Short trades deny full stacks.' },
'Solstice': { id: 'Pendulum stacking burst + self-heal for dual-resist bruisers', tags: ['bruiser','sustain'], buy: 'Bruiser who wants burst windows with both armor types', tip: 'Mornfall at max stacks deals 2x damage and heals 135%. Disengage to let stacks decay, or burst before they reach 100.' },
'Vyzar Carapace': { id: 'Scorn stacking into AOE burst + shield', tags: ['bruiser','burst'], buy: 'Bruiser who can apply 3 hits quickly for Shell Smash proc', tip: 'Shell Smash on 15s CD does 60-170 damage + shield. Don\'t let them hit you 3 times quickly.' },
'Mutilator': { id: 'Max HP% shred + omnivamp bruiser', tags: ['bruiser','anti-tank'], buy: 'Bruiser into tanky enemies, want sustained %HP damage + sustain', tip: 'Ult applies Mutilate 2.5 times at once. Armor reduces the damage. Anti-heal cuts the omnivamp.' },
'Mindrazor': { id: 'Cleave + mana scaling physical power', tags: ['bruiser','aoe'], buy: 'Mana-stacking AD bruiser who wants waveclear', tip: 'Cleave damage falls off with distance. Don\'t clump behind the primary target.' },
'Augmentation': { id: 'Spellblade bruiser with base AD scaling', tags: ['bruiser','on-hit'], buy: 'Bruiser who weaves autos between abilities and scales base AD', tip: 'True Strike deals 80% base AD on-hit every 1.5s. Kite to deny auto weaving.' },
'Infernum': { id: 'Stacking burn that ignites at 4 stacks for %HP damage', tags: ['bruiser','burn'], buy: 'AD caster who can apply multiple ability hits quickly', tip: 'At 4 Kindling stacks, ignites for 3% max HP over 2s. Disengage before 4 stacks or cleanse the burn.' },

// ── Support ──
'Crystal Tear': { id: 'Buff ally on heal/shield', tags: ['support'], buy: 'Want to buff carry when you heal/shield them', tip: 'Buff is temporary (5s).' },
'Devotion': { id: 'Stronger heals on low HP allies', tags: ['support','sustain'], buy: 'Want heals stronger on dying allies', tip: 'Only kicks in below 40%. Burst through threshold.' },
'Lifecore': { id: 'Damage converts to healing wisps', tags: ['support','sustain'], buy: 'Deal consistent damage + want teamfight healing', tip: 'Anti-heal. Wisps auto-target lowest HP ally.' },
'Hexbound Bracers': { id: 'Mana from taking damage', tags: ['support','defense'], buy: 'Tanky support who needs mana', tip: 'They WANT to take damage for mana.' },
'Truesilver Bracelet': { id: 'CC immunity shield (explodes on break)', tags: ['support','shield'], buy: 'Need to survive engage', tip: 'Break shield fast to remove CC immunity. 40s CD.' },
'Everbloom': { id: 'Heal/shield grants ally damage mitigation + tenacity', tags: ['support','defense'], buy: 'Support who heals/shields and wants to give allies survivability', tip: 'Grants 5% damage mitigation and 15% tenacity for 2s on heal/shield. Focus targets not recently buffed.' },
'Lunaria': { id: 'Damage-charging healer that auto-heals lowest ally', tags: ['support','sustain'], buy: 'Damage-dealing support who wants passive healing output', tip: 'Charges from damage dealt, then auto-heals lowest HP ally. Anti-heal and focus the support to stop charge generation.' },
'Xenia': { id: 'Auto-shield allies on CC with dual resists', tags: ['support','shield'], buy: 'Support vs heavy CC comp, want to auto-protect allies', tip: 'Shields ally when they\'re CC\'d. 10s CD per target, 50% weaker on repeat within 10s. Bait with minor CC first.' },
'Enra\'s Blessing': { id: 'Auto-shield allies when immobilized', tags: ['support','shield'], buy: 'Support vs hard CC, want to protect allies who get locked down', tip: 'Shields immobilized allies for up to 50+30%+8% HP. 15s CD per target. Chain CC quickly before shield expires.' },
'Windcaller': { id: 'Movement speed buff to allies on heal/shield', tags: ['support','movement'], buy: 'Support who wants to grant allies mobility on heal/shield', tip: 'Grants 8% MS to both support and target for 1.5s. Minor but constant. Hard CC still catches them.' },
'Transference': { id: 'Shield-to-heal converter + armor amp for supports', tags: ['support','sustain'], buy: 'Shield-based support who wants shields to convert into healing', tip: '50% of expired shield value restores as HP over 3s. Anti-heal reduces the converted healing.' },

// ── Execute Items ──
'Vanquisher': { id: 'Pure execute item', tags: ['execute','pen'], buy: 'Need to finish tanky targets', tip: 'Don\'t fight at low HP. Shields can block the execute.' },
'Malady': { id: 'Execute + %HP on kill explosion', tags: ['execute','burst'], buy: 'Want to snowball off kills', tip: 'Explodes on kill. Don\'t stand near dying allies.' },

// ── Evolving ──
'Alternator': { id: 'Alt ability enhancer (evolves into Alternata)', tags: ['evolving','burst'], buy: 'Your alternate ability is core to your kit', tip: 'Track evolution. Pre-evolved = just 12% more Q2 damage.' },
'Alternata': { id: 'Evolved alt ability enhancer + CDR', tags: ['burst','cdr'], buy: 'Evolved from Alternator. 12% CDR on other abilities.', tip: 'Fully online. Very strong ability rotation.' },
'Orb Of Growth': { id: 'XP stacking mage (evolves into Orb Of Enlightenment)', tags: ['evolving','scaling'], buy: 'Scaling mage who farms well', tip: 'Punish early. Gets absurd once evolved and stacked.' },
'Orb Of Enlightenment': { id: 'Evolved Orb Of Growth with stacking AP + HP', tags: ['scaling','sustain'], buy: 'Evolved from Orb Of Growth. Gives scaling AP, HP, and 3% missing HP regen', tip: 'Permanently stacks AP and HP. %HP damage counters the HP stacking. Punish before full evolution.' },
'Catalytic Drive': { id: 'Tank execute on-hit that evolves into Cybernetic Drive', tags: ['evolving','defense'], buy: 'Tank/bruiser jungle who wants on-hit execute + gold generation', tip: 'Execute on 15s CD. Evolves into Cybernetic Drive. Punish before evolution completes.' },
'Cybernetic Drive': { id: 'Evolved Catalytic Drive with stronger execute + armor conversion', tags: ['defense','on-hit'], buy: 'Evolved from Catalytic Drive. Stronger execute + 12% armor conversion', tip: 'Execute on 15s CD heals and gives bonus gold. Gains 12% of both armors as bonus. Avoid trading into the execute window.' },

// ── Mage Items ──
'Marshal': { id: 'Hybrid mage with on-hit attacks + mana regen', tags: ['on-hit','hybrid'], buy: 'Auto-attack mage who needs mana sustain and on-hit damage', tip: 'Gives 15% AS and on-hit magic damage scaling with level. MR reduces the on-hit. Short trades work.' },
'World Breaker': { id: 'Tanky mage with stacking magic damage amp + tenacity', tags: ['bruiser','scaling'], buy: 'Mage bruiser who fights extended and wants HP + tenacity', tip: 'Stacks 2% magic damage per hit up to 12%. Plus 6% bonus MP from HP. Burst before stacks ramp.' },
'Spirit Of Amir': { id: 'Jungle mage with lifesteal in jungle, power outside', tags: ['jungle','sustain'], buy: 'Magic jungle hero who wants sustain in jungle and power in lanes', tip: 'Gets 8% magic lifesteal in jungle OR 8% MP outside. 12% more monster damage. Invade to deny farm.' },
'Crescelia': { id: 'Spellblade mage with CDR on empowered auto', tags: ['on-hit','cdr'], buy: 'Mage who weaves autos and wants non-ult CDR from auto attacks', tip: 'Empowered auto reduces non-ult CDs by 12% every 1.5s. Kite to deny auto weaving.' },
'Overseer': { id: 'Ult-boosted mage with lifesteal and pen', tags: ['burst','sustain'], buy: 'Mage whose ultimate is key and wants sustain', tip: 'Ult deals 15% more damage and heals 25% of damage dealt to heroes. Anti-heal and dodge the ult.' },
'Volcanica': { id: 'Ability CDR on every cast, especially ult', tags: ['cdr','bruiser'], buy: 'Physical bruiser/caster who spams abilities and wants ult-driven CDR', tip: 'Every ability cast reduces other CDs by 0.5s (1.5s from ult). Abilities up more often than expected. 40% reduced for stance switchers.' },

// ── Spear / Pen ──
'Spear Of Desolation': { id: 'Physical pen + ult haste + damage amp', tags: ['pen','cdr'], buy: 'AD caster whose ultimate is critical and wants pen', tip: '10% increased damage for 6s after ability hit + 25 ult haste. Track their ult timer closely.' },
'Omen': { id: 'Momentum proc that resets cooldowns by 25%', tags: ['on-hit','cdr'], buy: 'AD bruiser/assassin who auto-attacks between abilities', tip: 'Empowered auto reduces non-ult CDs by 25%. Very fast ability rotations. CC to prevent auto attacks.' },

// ── Tank Utility ──
'Dawnstar': { id: 'Debilitate enemies on-hit + AS steroid', tags: ['defense','dps'], buy: 'Tank who auto-attacks and wants to reduce enemy damage', tip: 'Reduces your damage by 2.5% per stack (up to 12.5%). Gains 35% AS burst. Kite instead of trading into the tank.' },
'Elafrost': { id: 'Empowered auto slow + AOE damage for tanks', tags: ['defense','cc'], buy: 'Tank who needs waveclear and on-hit slow for peeling', tip: 'Empowered auto every 1.5s slows 35% for 1s with AOE damage. Stay out of melee range.' },
'Dynamo': { id: 'Cheap CC amplifier that makes enemies take 10% more damage', tags: ['defense','cc'], buy: 'Tank with hard CC who wants to amplify team damage on targets', tip: 'CC\'d targets take 10% more damage for 2.5s. Gives adaptive power. Cleanse the CC quickly.' },
'Flux Matrix': { id: 'Anti-mage tank item that reduces enemy tenacity', tags: ['defense','anti-mage'], buy: 'Tank vs heavy magic damage comp, want to make CC stick longer', tip: 'Makes enemies take 10% more magic damage AND reduces their tenacity by 20%. CC lasts longer on enemies near this tank.' },
'Gaia Greaves': { id: 'Movement stacking tank boots with jump height', tags: ['defense','movement'], buy: 'Engage tank who wants movement speed stacking + enhanced jump', tip: 'Stacks MS while moving, expends on auto for bonus damage. Slows/CC drain stacks. Kite to prevent auto.' },
'Galaxy Greaves': { id: 'Utility boots with enhanced jump + movement speed', tags: ['defense','movement'], buy: 'Support/tank who wants mobility and mana regen', tip: 'Enhanced jump at 100 ZeroG stacks + 7% MS. Low combat stats. Focus in fights.' },
'Gaussian Greaves': { id: 'Double-jump AOE slam + movement speed', tags: ['defense','engage'], buy: 'Engage tank/mage who wants aerial engage with AOE slow', tip: 'Double jump into 100+50% damage AOE slam with 40% slow. 15s CD. Dodge the landing zone.' },
'Mistmeadow Buckler': { id: 'Magic resist + damage block shield for physical casters', tags: ['defense','anti-mage'], buy: 'AD bruiser who needs MR and ability-based damage block', tip: 'Blocks up to 50% of incoming damage from charges. Regenerates 5 charges/s. Sustained damage drains it faster than it regens.' },
'Inquisition': { id: 'Tank waveclear + MR with spammable AOE', tags: ['defense','waveclear'], buy: 'Tank who needs magic resist and constant AOE damage/waveclear', tip: 'Psywave deals AOE damage every 1s. Low individual damage but constant. Stay out of melee range.' },

// ── Carry Items ──
'Resolution': { id: 'On-hit carry with mana stacking into AD conversion', tags: ['on-hit','scaling'], buy: 'Auto-attack carry who wants mana scaling into physical power', tip: 'At 400 mana stacks gains 2.5% bonus AD. Gets stronger over time. Punish early before fully stacked.' },
'Aegis Of Agawar': { id: 'Tanky crit carry with armor scaling below 40% HP', tags: ['crit','defense'], buy: 'Carry who gets dove and wants HP + crit + armor when low', tip: 'Doubles armor bonuses (10%→20%) below 40% HP. Don\'t fight them when low—they\'re tankier than expected.' },
'Azure Core': { id: 'Mage mana stacker with shield + scaling AP', tags: ['scaling','shield'], buy: 'Mana-stacking mage who wants a safety shield and scaling power', tip: '90s CD shield. At 400 mana stacks gains 4% bonus AP. Punish before full stacks. Pop shield with poke.' },

// ── Misc Items ──
'Luxforge Lantern': { id: 'Roaming AD item with permanent stacking from wards/kills', tags: ['snowball','movement'], buy: 'Roaming support/jungler who wants stacking AD from wards and kills', tip: 'Permanently stacks AD (max 30). 7% MS. Deny ward kills and roam kills to slow stacking.' },
'Lucky Feather': { id: 'High-risk gold generation item, destroyed on death', tags: ['snowball','gold'], buy: 'Jungle/roam when confident you won\'t die, generates bonus gold from kills', tip: 'Destroyed on death. Kill the carrier to delete 700g investment. Only sells for 400g.' },
'Divine Potion': { id: 'Permanent refillable potion upgrade', tags: ['sustain','utility'], buy: 'Early game for 250g, permanently upgrades your potion to 2 charges of 180-360 HP', tip: 'Gives sustained lane presence. Forces less backs. All-in to make the sustain irrelevant.' },
'Stamina Tonic': { id: 'Late-game HP + ability haste consumable', tags: ['consumable','defense'], buy: 'Level 13+ when you need 12% max HP and 15 AH for a key fight', tip: 'Lost on death. Kill the carrier to waste 500g. Only available at level 13+.' },
'Intellect Tonic': { id: 'Late-game AP + mana regen consumable', tags: ['consumable','burst'], buy: 'Level 13+ mage who needs 60 AP and mana regen for a fight', tip: 'Lost on death. Kill the mage to waste 500g. Only available at level 13+.' },
'Protection Tonic': { id: 'Late-game dual armor + tenacity consumable', tags: ['consumable','defense'], buy: 'Level 13+ when you need 25 of both armors and 30% tenacity', tip: 'Lost on death. Kill the carrier to waste 500g. 30% tenacity is massive—chain CC to overwhelm.' },
'Strength Tonic': { id: 'Late-game AD + omnivamp consumable', tags: ['consumable','burst'], buy: 'Level 13+ physical hero who needs 30 AD and 10% omnivamp', tip: 'Lost on death. Kill the carrier to waste 500g. Anti-heal reduces the omnivamp.' },
'Void Conduit': { id: 'Budget HP/mana/MR regen + movement speed', tags: ['sustain','utility'], buy: 'Cheap utility when you need passive sustain and MR', tip: 'Passive missing HP and mana regen. Low combat stats. All-in instead of poking.' },

// ── Legendary Carry Crests ──
'Eviscerator': { id: 'All-in DPS steroid crest', tags: ['crest','dps'], buy: 'Burst of DPS + sustain', tip: '90s CD. Disengage when active.' },
'Exodus': { id: 'Self-peel grenade crest', tags: ['crest','peel'], buy: 'Divers keep getting on you', tip: '120s CD. Bait then dive again.' },
'Liberator': { id: 'Anti-CC cleanse + shield crest', tags: ['crest','cleanse'], buy: 'Enemy CC is your death sentence', tip: '180s (3 min) CD. Very long. Bait it.' },
'Pacifier': { id: 'Execute dash crest (resets on kill)', tags: ['crest','execute'], buy: 'Finish low-HP targets', tip: '135s CD but resets on kill.' },

// ── Legendary Fighter Crests ──
'Brutallax': { id: 'Cleanse + sustained tenacity crest', tags: ['crest','cleanse'], buy: 'CC chains kill you', tip: '165s CD. Very long between uses.' },
'Gravitum': { id: 'Anti-mobility ground crest', tags: ['crest','cc'], buy: 'Enemy has dash-reliant heroes', tip: 'Skillshot. Dodge it. 90s CD.' },
'Iceskorn Talons': { id: 'Team-fight zone buff crest', tags: ['crest','team-fight'], buy: 'Empower team in fights', tip: 'Walk out of ice sheet. 10% slow is mild.' },
'Judgement': { id: 'Low-CD AOE damage + sustain crest', tags: ['crest','sustain'], buy: 'Front-line brawler', tip: 'Anti-heal. Very short CD, used often.' },

// ── Legendary Assassin Crests ──
'Abyssal Dart': { id: 'Mark → teleport gap closer crest', tags: ['crest','mobility'], buy: 'Need guaranteed engage on a target', tip: 'Dart is a skillshot. Dodge to prevent teleport.' },
'Nex': { id: 'Store damage → AOE burst crest', tags: ['crest','burst'], buy: 'Poke then all-in', tip: 'Sow charges decay after 4s. Disengage to let them fall.' },
'Ortus': { id: 'Snowball permanent AD crest', tags: ['crest','snowball'], buy: 'Want to snowball off kills', tip: 'Don\'t feed them kills. AD stacks permanently.' },
'Witchstalker': { id: 'Anti-mage cleanse + %HP burst crest', tags: ['crest','cleanse'], buy: 'Enemy mages debuff you', tip: '165s CD. Very long.' },

// ── Legendary Mage Crests ──
'Epoch': { id: 'Stasis (Zhonyas) crest', tags: ['crest','defense'], buy: 'Keep getting one-shot', tip: 'Wait out 2.5s stasis then burst.' },
'Soulbearer': { id: 'Sustain mage shield + lifesteal crest', tags: ['crest','sustain'], buy: 'Sustain through fights', tip: 'Anti-heal reduces lifesteal.' },
'Time-Flux Band': { id: 'Engage → teleport back crest', tags: ['crest','mobility'], buy: 'Dive aggressively with safety net', tip: 'Wait at the mark location for the teleport back.' },
'Voidgazer': { id: 'Catch + 15% damage amp crest', tags: ['crest','burst'], buy: 'Need to catch someone + amp damage', tip: 'Dodge the skillshot. Damage amp is huge.' },
'Obelisk': { id: 'Soul-stacking permanent AP crest', tags: ['crest','scaling'], buy: 'Want to scale infinitely', tip: 'Deny CS to prevent soul stacks.' },
'Tempest': { id: 'Sustained AOE damage aura crest', tags: ['crest','dps'], buy: 'Constant damage in teamfights', tip: 'Anti-heal + spread out.' },
'Typhoon': { id: 'On-hit mage + dash crest', tags: ['crest','on-hit'], buy: 'Auto-attack mage who needs a dash', tip: '35s dash CD is short but hero has no other escape.' },
'Winter\'s Fury': { id: 'Zone control ice sphere crest', tags: ['crest','cc'], buy: 'Teamfight zone control', tip: 'Walk out of expanding sphere. Don\'t fight in it.' },

// ── Legendary Tank Crests ──
'Earth Spirit': { id: 'Unstoppable rolling stun crest', tags: ['crest','engage'], buy: 'Need hard engage from distance', tip: 'Can\'t be stopped. Dodge sideways. 165s base CD.' },
'Nyr Warboots': { id: 'Chase/escape + regen crest', tags: ['crest','movement'], buy: 'Flexible engage or disengage', tip: '75s CD. Just running fast, no CC.' },
'Razorback': { id: 'Damage reflection crest', tags: ['crest','defense'], buy: 'High DPS enemy, want them to hurt themselves', tip: 'Don\'t attack during Echidna. Focus someone else for 5s.' },
'Saphir\'s Mantle': { id: 'Scaling HP growth crest', tags: ['crest','scaling'], buy: 'Want to scale HP over the game', tip: '%HP damage items counter permanent HP growth.' },

// ── Legendary Support Crests ──
'Tranquility': { id: 'THE healing support crest (40s CD)', tags: ['crest','sustain'], buy: 'Team needs sustain', tip: 'Anti-heal. 40s is short, used every fight.' },
'Sanctification': { id: 'Team shield + tenacity crest', tags: ['crest','defense'], buy: 'Enemy has AOE CC + burst', tip: 'Break shield fast to remove tenacity. 120s CD.' },
'Leafsong': { id: 'Team speed boost + slow immunity crest', tags: ['crest','movement'], buy: 'Team needs to engage or escape together', tip: 'Hard CC still works. Only slow immunity.' },
'Reclamation': { id: 'Team cleanse crest', tags: ['crest','cleanse'], buy: 'Enemy CC wins them every fight', tip: '180s (3 min) CD. Bait then engage for real.' },
'Rift Walkers': { id: 'Dash + pull enemies crest', tags: ['crest','engage'], buy: 'Need hard engage as support', tip: '120s CD. Don\'t clump when support is engaging.' },
'Silentium': { id: 'Targeted silence crest', tags: ['crest','cc'], buy: 'Need to interrupt a channel/combo', tip: '1s silence is short. Tenacity reduces it.' },
'Pygmy Dust': { id: 'Shrink enemy (30% less damage) crest', tags: ['crest','cc'], buy: 'One enemy carry is the whole team', tip: 'Cleanse works. Expect to be shrunk if fed.' },
'Florescence': { id: 'Bouncy mushroom zone control crest', tags: ['crest','utility'], buy: 'Creative map control / vision', tip: 'Mushroom is visible. Avoid it.' },

// ── Evolving Crests ──
'Titan Crest': { id: 'Tank starter crest, evolves into Goliath', tags: ['crest','evolving'], buy: 'Starting item for tanks', tip: 'Starter item. Low threat early.' },
'Goliath Crest': { id: 'Evolved Titan Crest, evolves into legendary tank crest', tags: ['crest','evolving'], buy: 'Mid-evolution tank crest', tip: 'Still evolving. Moderate stats only.' },
'Warrior Crest': { id: 'Fighter starter crest, evolves into Champion', tags: ['crest','evolving'], buy: 'Starting item for fighters', tip: 'Starter item. Low threat early.' },
'Champion Crest': { id: 'Evolved Warrior Crest, evolves into legendary fighter crest', tags: ['crest','evolving'], buy: 'Mid-evolution fighter crest', tip: 'Still evolving. Moderate stats only.' },
'Marksman Crest': { id: 'Carry starter crest, evolves into Sharpshooter', tags: ['crest','evolving'], buy: 'Starting item for carries', tip: 'Starter item. Low threat early.' },
'Sharpshooter Crest': { id: 'Evolved Marksman Crest, evolves into legendary carry crest', tags: ['crest','evolving'], buy: 'Mid-evolution carry crest', tip: 'Still evolving. Moderate stats only.' },
'Magician Crest': { id: 'Mage starter crest, evolves into Wizard', tags: ['crest','evolving'], buy: 'Starting item for mages', tip: 'Starter item. Low threat early.' },
'Wizard Crest': { id: 'Evolved Magician Crest, evolves into legendary mage crest', tags: ['crest','evolving'], buy: 'Mid-evolution mage crest', tip: 'Still evolving. Moderate stats only.' },
'Rogue Crest': { id: 'Assassin starter crest, evolves into Assassin Crest', tags: ['crest','evolving'], buy: 'Starting item for assassins', tip: 'Starter item. Low threat early.' },
'Assassin Crest': { id: 'Evolved Rogue Crest, evolves into legendary assassin crest', tags: ['crest','evolving'], buy: 'Mid-evolution assassin crest', tip: 'Still evolving. Moderate stats only.' },
'Occult Crest': { id: 'Magic bruiser starter crest, evolves into Warlock', tags: ['crest','evolving'], buy: 'Starting item for magic bruisers', tip: 'Starter item. Low threat early.' },
'Warlock Crest': { id: 'Evolved Occult Crest, evolves into legendary magic bruiser crest', tags: ['crest','evolving'], buy: 'Mid-evolution magic bruiser crest', tip: 'Still evolving. Moderate stats only.' },
'Consort Crest': { id: 'Support starter crest (gold gen), evolves into Keeper', tags: ['crest','evolving'], buy: 'Starting item for supports (damage type)', tip: 'Starter item. Low threat early.' },
'Guardian Crest': { id: 'Support starter crest (heal gen), evolves into Keeper', tags: ['crest','evolving'], buy: 'Starting item for supports (heal type)', tip: 'Starter item. Low threat early.' },
'Keeper Crest': { id: 'Evolved support crest, evolves into legendary support crest', tags: ['crest','evolving'], buy: 'Mid-evolution support crest', tip: 'Still evolving. Moderate stats only.' },
'Warden Crest': { id: 'Tank support starter crest, evolves into legendary support crest', tags: ['crest','evolving'], buy: 'Starting item for tank supports', tip: 'Starter item. Low threat early.' },
};
