// One-shot batch applier for the item-effect modeling pass (priorities.md #11).
// Adds verified item-passive encodings + explicit unmodeled-with-reason entries
// so every completed-tier item carries a coverage decision. Run once:
//   npx tsx src/ingest/apply-item-batch.ts
// Idempotent: re-running overwrites the same keys with the same values.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FILE = path.join(ROOT, 'engine/fixtures/effects.json');
const SRC = 'omeda items.json 1.14.4 (incl. condition field)';

type Eff = Record<string, unknown>;
type Entry = { name: string; sourceText: string; source: string; effects: Eff[] };

// ── newly modeled (verified against the omeda snapshot text) ──
const modeled: Record<string, Entry> = {
  'item:elafrost': {
    name: 'Elafrost / Frostblade',
    sourceText: 'On Ability Cast: empower next basic (within 4s) for 70 (+2% max health) On-Hit.',
    source: SRC,
    effects: [{ kind: 'on_ability_hit', flat: 70, scalingPct: 2, scaleStat: 'health', damageType: 'magical', icdSeconds: 4 }],
  },
  'item:inquisition': {
    name: 'Inquisition / Psywave',
    sourceText: 'On Ability Cast: 65 (+1.5% max health) area Damage.',
    source: SRC,
    effects: [{ kind: 'on_ability_hit', flat: 65, scalingPct: 1.5, scaleStat: 'health', damageType: 'magical', icdSeconds: 0 }],
  },
  'item:mutilator': {
    name: 'Mutilator / Mutilate + Devour',
    sourceText: 'Basics deal 1% of target Max Health; Ability hits apply Mutilate 3x (3% Max Health, once per ability).',
    source: SRC,
    effects: [
      { kind: 'on_hit', pctTargetHealth: 1, healthBasis: 'max', damageType: 'physical' },
      { kind: 'on_ability_hit', pctTargetHealth: 3, healthBasis: 'max', damageType: 'physical' },
    ],
  },
  'item:spectral-schematics': {
    name: 'Spectral Schematics / Breakthrough',
    sourceText: 'Upon Immobilizing an Enemy: 40 (+5% target current Health) additional Damage. Modeled assuming the immobilize lands.',
    source: SRC,
    effects: [{ kind: 'on_ability_hit', flat: 40, pctTargetHealth: 5, healthBasis: 'current', damageType: 'magical' }],
  },
  'item:fist-of-razuul': {
    name: "Fist Of Razuul / Razuul's Might",
    sourceText: 'At 4 stacks (~4s), empower next basic for (+2.5% max health) bonus, x2 vs Heroes = 5% own Max Health.',
    source: SRC,
    effects: [{ kind: 'on_hit', scalingPct: 5, scaleStat: 'health', damageType: 'physical', icdSeconds: 4 }],
  },
  'item:demolisher': {
    name: 'Demolisher / Puncture',
    sourceText: 'Ignore 25% of Physical Armor.',
    source: SRC,
    effects: [
      { kind: 'percent_pen', pct: 25, damageType: 'physical' },
      { kind: 'unmodeled', note: 'Trauma ignores 30% of BONUS physical armor only; reference profiles do not split base vs bonus armor.' },
    ],
  },
  'item:the-perforator': {
    name: 'The Perforator / Puncture',
    sourceText: 'Ignore 30% of Physical Armor.',
    source: SRC,
    effects: [
      { kind: 'percent_pen', pct: 30, damageType: 'physical' },
      { kind: 'unmodeled', note: 'Chilling Spells is a 10% slow (CC) on ability damage.' },
    ],
  },
  'item:tainted-trident': {
    name: 'Tainted Trident / Blighted Strikes',
    sourceText: 'On Physical Damage: reduce target Healing by 45% for 3s.',
    source: SRC,
    effects: [
      { kind: 'anti_heal', pct: 45 },
      { kind: 'unmodeled', note: 'Woundseeker adds a small ability bonus that scales with physical penetration (3 +6%-of-pen %), gated on a self-applied Blighted mark; a stat-scaled conditional amp with no clean primitive.' },
    ],
  },
  'item:spear-of-desolation': {
    name: 'Spear Of Desolation / Final Hour + Razors Edge',
    sourceText: 'On casting Ultimate: +10% damage for 6s. Passive: +25 Ultimate Haste.',
    source: SRC,
    effects: [
      { kind: 'haste', amount: 25, scope: 'ultimate' },
      { kind: 'damage_amp', pct: 10, scope: 'all', appliesWhen: 'window_only' },
    ],
  },
  'item:overseer': {
    name: 'Overseer / Exalted',
    sourceText: 'Enhance Ultimate: deals 15% more damage (heal omitted).',
    source: SRC,
    effects: [{ kind: 'damage_amp', pct: 15, scope: 'ultimate' }],
  },
  'item:earthshaker': {
    name: 'Earthshaker / Battleborn',
    sourceText: 'On dealing damage: +1% Ability Damage for 3s, stacks to 10 (=10%).',
    source: SRC,
    effects: [{ kind: 'damage_amp', pct: 10, scope: 'abilities', appliesWhen: 'window_only' }],
  },
  'item:world-breaker': {
    name: 'World Breaker / Fiend + Maya',
    sourceText: 'On Magical Damage to a Hero: +2% Magical Damage 4.5s, stacks to 6 (=12%). Passive: +5% max Health as Magical Power.',
    source: SRC,
    effects: [
      { kind: 'damage_amp', pct: 12, scope: 'abilities', appliesWhen: 'window_only' },
      { kind: 'stat_conversion', from: 'health', to: 'magical_power', pct: 5 },
    ],
  },
  'item:orion': {
    name: 'Orion / Hasty + Interstellar',
    sourceText: 'Gain Attack Speed = 80% of Ability Haste from Items (sim uses total AH). On-Hit: +2% damage to target 3.5s, up to 16%.',
    source: SRC,
    effects: [
      { kind: 'stat_conversion', from: 'ability_haste', to: 'attack_speed', pct: 80 },
      { kind: 'damage_amp', pct: 16, scope: 'all', appliesWhen: 'window_only' },
    ],
  },
  'item:aegis-of-agawar': {
    name: "Aegis Of Agawar / Bludgeon + Agawar's Protection",
    sourceText: 'Gain (+2.5% max Health) Physical Power. Gain 10% Total Physical & Magical Armor.',
    source: SRC,
    effects: [
      { kind: 'stat_conversion', from: 'health', to: 'physical_power', pct: 2.5 },
      { kind: 'armor_multiplier', pct: 10 },
      { kind: 'unmodeled', note: "Agawar's Protection doubles to 20% armor while below 40% Health; a health-state-gated defensive tier." },
    ],
  },
  'item:mindrazor': {
    name: 'Mindrazor / Technician',
    sourceText: 'Gain (+2% max Mana) Physical Power.',
    source: SRC,
    effects: [
      { kind: 'stat_conversion', from: 'max_mana', to: 'physical_power', pct: 2 },
      { kind: 'unmodeled', note: 'Razor Cleave is AoE splash around the target (multi-target), no single-target value.' },
    ],
  },
  'item:resolution': {
    name: 'Resolution / Darksteel',
    sourceText: 'On basics: (+2% max Mana) Damage On-Hit.',
    source: SRC,
    effects: [
      { kind: 'on_hit', scalingPct: 2, scaleStat: 'max_mana', damageType: 'physical' },
      { kind: 'unmodeled', note: 'Potent Font is a per-kill max-mana farming stack (caps at 400 then grants PP); economy.' },
    ],
  },
  'item:cursed-scroll': {
    name: 'Cursed Scroll / Curse of Pain',
    sourceText: 'On Basic Attack: 30 (+4% max Health) Damage to the target (self-damage ignored).',
    source: SRC,
    effects: [
      { kind: 'on_hit', flat: 30, scalingPct: 4, scaleStat: 'health', damageType: 'magical' },
      { kind: 'unmodeled', note: 'Forbidden Art scales AS/regen with the holder missing health; no health-state uptime model.' },
    ],
  },
  'item:citadel': {
    name: 'Citadel / Intimidation',
    sourceText: 'Nearby Enemy Heroes have their Physical Armor decreased by 20%.',
    source: SRC,
    effects: [
      { kind: 'armor_shred', pct: 20, damageType: 'physical' },
      { kind: 'unmodeled', note: 'Fortification is a defensive armor aura (+5 per nearby enemy).' },
    ],
  },
  'item:flux-matrix': {
    name: 'Flux Matrix / Unstable Shackles',
    sourceText: 'Nearby Enemy Heroes take 10% additional Magical Damage (proximity aura; the holder own magical abilities benefit).',
    source: SRC,
    effects: [{ kind: 'damage_amp', pct: 10, scope: 'abilities', appliesWhen: 'window_only' }],
  },
  'item:tainted-bastion': {
    name: 'Tainted Bastion / Blighted Veil',
    sourceText: 'On taking Magical Damage: reduce the source Healing by 45% for 3s.',
    source: SRC,
    effects: [
      { kind: 'anti_heal', pct: 45 },
      { kind: 'unmodeled', note: 'Colossus is flat damage mitigation (defensive).' },
    ],
  },
  'item:spirit-of-amir': {
    name: 'Spirit Of Amir / Natural Selection',
    sourceText: 'Outside the Jungle: gain 8% Magical Power.',
    source: SRC,
    effects: [
      { kind: 'stat_multiplier', stat: 'magical_power', pct: 8 },
      { kind: 'unmodeled', note: 'Jungle branch grants magical lifesteal instead, and Monster Slayer is +12% vs monsters (PvE).' },
    ],
  },
  'item:manta-scythe': {
    name: 'Manta-Scythe / Divide & Conquer',
    sourceText: 'Against an isolated target (no ally within 1000u): deal 10% more damage. Kill-window sims are 1v1 by construction.',
    source: SRC,
    effects: [
      { kind: 'damage_amp', pct: 10, scope: 'all', appliesWhen: 'always' },
      { kind: 'unmodeled', note: 'Insatiable Harvest is a PvE 1.5x-to-minions + per-kill PP farming stack.' },
    ],
  },
  'item:infernum': {
    name: 'Infernum / Cinder',
    sourceText: 'At 4 Kindling stacks: 4% of target Max Health as Damage over 2s.',
    source: SRC,
    effects: [
      { kind: 'on_hit', pctTargetHealth: 4, healthBasis: 'max', damageType: 'physical', everyN: 4 },
      { kind: 'unmodeled', note: 'Cinder also adds +1.5%-of-physical-power to the %max-health (stat-scaled %health) and Furnace scales with enemy bonus armor; neither is cleanly expressible.' },
    ],
  },
  'item:cybernetic-drive': {
    name: 'Cybernetic Drive / Cybernetic Conversion',
    sourceText: 'Gain 12% Total Physical & Magical Armor.',
    source: SRC,
    effects: [
      { kind: 'armor_multiplier', pct: 12 },
      { kind: 'unmodeled', note: 'Lesser Deconstruct executes minions/small monsters (PvE).' },
    ],
  },
  'item:tyranny': {
    name: "Tyranny / Tyrant's Edge",
    sourceText: 'Gain 15 Ultimate Haste.',
    source: SRC,
    effects: [
      { kind: 'haste', amount: 15, scope: 'ultimate' },
      { kind: 'unmodeled', note: 'Oppression grants a timed +20 ability haste window after ulting (uptime-dependent) plus MS; out of scope.' },
    ],
  },
  'item:orb-of-enlightenment': {
    name: 'Orb Of Enlightenment / Enlightened',
    sourceText: 'Per Hero Level: gain 3 Magical Power and 15 Health.',
    source: SRC,
    effects: [
      { kind: 'stat_flat', stat: 'magical_power', base: 0, perLevel: 3 },
      { kind: 'stat_flat', stat: 'health', base: 0, perLevel: 15 },
      { kind: 'unmodeled', note: 'Art of Fortitude restores 3% missing health over 3s on cast; out-of-combat-style sustain.' },
    ],
  },
  'item:dust-devil': {
    name: 'Dust Devil / Menace',
    sourceText: 'On Basic Attacking Heroes: +3% Attack Speed 3s, stacks to 5 (=15%).',
    source: SRC,
    effects: [
      { kind: 'ramp_to_stat', stat: 'attack_speed', perStack: 3, maxStacks: 5 },
      { kind: 'unmodeled', note: 'At 5 stacks grants 10% movement speed (out of scope).' },
    ],
  },
  'item:alternator': {
    name: 'Alternator / Alternate Reality',
    sourceText: 'Your Alternate Ability deals 15% more damage.',
    source: SRC,
    effects: [
      { kind: 'ability_damage_amp', abilityKey: 'ALTERNATE', pct: 15 },
      { kind: 'unmodeled', note: 'Adeptus is an evolve stack (15 hits with the Alternate Ability evolves into Alternata).' },
    ],
  },
  'item:echelon-cloak': {
    name: 'Echelon Cloak / Unseen Threat',
    sourceText: 'While Camouflaged (and 3s after): increase damage dealt by 8%. Credited as a camo-opener burst.',
    source: SRC,
    effects: [
      { kind: 'damage_amp', pct: 8, scope: 'all', appliesWhen: 'burst_only' },
      { kind: 'unmodeled', note: 'Camouflage requires standing still 2s and grants missing-HP/mana regen; only the opener burst is credited.' },
    ],
  },
  'item:tainted-charm': {
    name: 'Tainted Charm / Blighted Presence',
    sourceText: 'While near Enemy Heroes: reduce their Healing by 45%.',
    source: SRC,
    effects: [
      { kind: 'anti_heal', pct: 45 },
      { kind: 'unmodeled', note: 'Blighted Presence also slows 12% (CC); only the anti-heal is credited.' },
    ],
  },
  'item:tainted-totem': {
    name: 'Tainted Totem / Blighted Touch',
    sourceText: 'On dealing damage: reduce the target Healing by 45% for 3s.',
    source: SRC,
    effects: [
      { kind: 'anti_heal', pct: 45 },
      { kind: 'unmodeled', note: 'Blighted Well spreads the anti-heal to allies on heal/shield; team-side, not extra holder damage.' },
    ],
  },
  'item:warp-stream': {
    name: 'Warp Stream / Quantum Edge',
    sourceText: 'Gain 25 Ultimate Haste.',
    source: SRC,
    effects: [
      { kind: 'haste', amount: 25, scope: 'ultimate' },
      { kind: 'unmodeled', note: 'Tele-Blink is a mobility blink swap (out of scope).' },
    ],
  },
};

// ── explicit unmodeled-with-reason (reviewed, out of the damage/EHP model) ──
const unmodeled: Record<string, [string, string, string]> = {
  // key: [name, sourceText, reason]
  'item:absolution': ['Absolution / Bravery', 'On being Immobilized: 25% Damage Mitigation + 40% MS for 3s.', 'A defensive, CC-triggered mitigation buff; no incoming-mitigation primitive.'],
  'item:amulet-of-chaos': ['Amulet Of Chaos / Deadly Wish', 'On Takedown: -65% basic ability cooldowns, restore 35% missing mana.', 'Takedown-gated; a 1v1 kill-window sim has no takedown model.'],
  'item:ashbringer': ['Ashbringer / Chrono Strikes', 'On basic: -8% current non-ult cooldowns On-Hit (once per ability).', 'The cooldown ripple depends on ability interleaving the sim does not track.'],
  'item:astral-catalyst': ['Astral Catalyst / Ravenous + Event Horizon', 'On Takedown: -20% ult CD. On damaging a Shielded target: +40% bonus damage.', 'Takedown-gated and enemy-shield-gated; neither state exists in the sim.'],
  'item:berserkers-axe': ["Berserker's Axe / Blitz", 'On Dashing/Leaping: empower next basic for 50 (+40%) Damage.', 'The empowered-basic cadence depends on the hero mobility cooldowns, which are not modeled.'],
  'item:claw-of-hermes': ['Claw Of Hermes / Mana Burn', 'On basic: drain 2.5-4% target Max Mana, deal True Damage = 75% of mana drained.', 'Damage scales with the target max/missing mana; target-mana-dependent, explicitly out of scope.'],
  'item:crystal-tear': ['Crystal Tear / Elation', 'On Healing or Shielding Heroes: both gain 30 MP + 15 AH for 5s.', 'A support, team-side buff on heal/shield cast.'],
  'item:crystalline-cuirass': ['Crystalline Cuirass / Celestite', 'On taking Magical Damage: +5 Magical Armor per stack (to 5).', 'A defensive stack gained from incoming magical damage.'],
  'item:dawnstar': ['Dawnstar / Debilitating Strikes', 'On basics: reduce target damage dealt 2.5% (to 5 stacks).', 'A defensive enemy-damage debuff; the AS rider is immobilize-gated team utility.'],
  'item:demon-edge': ['Demon Edge / Demonic', 'On damaging a Shielded target: +20% MS and +45% bonus damage.', 'Requires the enemy to be Shielded; no enemy-shield state in the sim.'],
  'item:devotion': ['Devotion / Fidelity + Mystica', 'Heals/Shields 10% stronger on sub-40% allies; reduce large incoming magical hits 15%.', 'Both are support/defensive (team-side heal boost, incoming-magical mitigation).'],
  'item:dread': ['Dread / Vital Shield', 'On receiving Hero Magical Damage: block 25% of Magical Damage for 3s.', 'A defensive, incoming-damage effect with no offensive component.'],
  'item:dreambinder': ['Dreambinder / Chilling Spells', 'On ability damage: Slow 25% for 1s; does not apply with proc damage.', 'A slow only (CC).'],
  'item:envy': ['Envy / Sacrificial Strike', 'On Dash/Leap/Camo-exit: next basic crits; Hush silences for 0.8s.', 'The guaranteed-crit cadence depends on mobility uptime; Hush is a silence (CC).'],
  'item:everbloom': ['Everbloom / Divine Protection', 'On Healing/Shielding an ally: grant 5% mitigation + 20 Tenacity.', 'A support, team-side defensive grant.'],
  'item:frosted-lure': ['Frosted Lure / Frostwave', 'Near enemies 4s: 50 (+4%) AoE Damage + slow + self-shield.', 'A proximity AoE nuke (multi-target) with an ambiguous scaling stat and a self-shield.'],
  'item:frostguard': ['Frostguard / Stifle', "On being basic-attacked: reduce the source Attack Speed 3.5% (to 5 stacks).", 'A defensive, incoming-basic-gated debuff.'],
  'item:gaia-greaves': ['Gaia Greaves / Tremor', 'Move to build up to 100 stacks; basics expend them for up to 40 (+60%)(+5%) Damage.', 'The bonus-damage cadence is movement-stack-dependent and unstated.'],
  'item:galaxy-greaves': ['Galaxy Greaves / ZeroG + Celerity', 'Jump-height stacks while moving; +7% MS out of combat.', 'Movement and out-of-combat MS utility; no combat damage component.'],
  'item:gaussian-greaves': ['Gaussian Greaves / System Shock', 'Double-jump, then a landing shockwave for 100 (+50%) Damage + slow.', 'A mobility-gated AoE, not a sustained combat proc.'],
  'item:giants-ring': ['Giants Ring / Retribution + Gigantism', 'On being basic-attacked: -0.25s non-ult CDs; on Ultimate: size + 5% mitigation.', 'Cooldown refunds and a defensive ult buff gated on being attacked.'],
  'item:golems-gift': ['Golems Gift / Stone Skin', 'Out of combat: 5 stacks of 4 MP + 4 Physical Armor; lost on taking physical hits.', 'Stacks build out of combat and deplete in a fight; net in-fight uptime is indeterminate.'],
  'item:hexbound-bracers': ['Hexbound Bracers / Mana Reactor', 'Restore mana = 15% of damage taken; take 5 (+1/level) less basic damage.', 'Mana sustain and basic-attack mitigation; defensive/economy.'],
  'item:legacy': ['Legacy / Tenacious Bravery', 'On going below 40% Health: self-cleanse + 3s CC immunity.', 'A defensive, health-state-gated cleanse/immunity.'],
  'item:lifebinder': ['Lifebinder / Twilight Sonata', 'Per 10% missing health: +2.5 MP and +1% Magical Lifesteal.', 'Scales with the holder missing health; no health-state uptime model.'],
  'item:lifecore': ['Lifecore / Healing Wisp', 'At 100 charges: fire a heal at the lowest-health ally for 100 (+40%).', 'A team-side ally heal, not the holder damage.'],
  'item:lunaria': ['Lunaria / Mending', 'On Healing/Shielding an ally: consume damage charges to heal them.', 'A support, team-side heal-conversion.'],
  'item:luxforge-lantern': ['Luxforge Lantern / Lumos', 'On Takedown/Ward-kill: permanent +1 Physical Power (to 30 stacks).', 'A permanent economy/farming stack.'],
  'item:mesmer': ['Mesmer / Vengeful Shroud', 'Gain a Spell Shield that blocks the next ability.', 'A defensive spell shield; carries no damage effect.'],
  'item:mistmeadow-buckler': ['Mistmeadow Buckler / Bark Skin', 'Consume charges to block magical damage (up to 50% of a hit).', 'Defensive, incoming-magical mitigation from a regenerating charge pool.'],
  'item:nightfall': ['Nightfall / Eclipse + Dusk Reaver', 'Abilities heal 6% of damage dealt; on Takedown: a 200-400 shield.', 'Ability sustain (no damage component) and a takedown-gated shield.'],
  'item:omen': ['Omen / Bestial Momentum', 'At 100 Momentum: empower a basic for 30 (+20%) + -25% non-ult CDs.', 'The Momentum stack cadence (movement + attacks) is unstated.'],
  'item:penumbra': ['Penumbra / Essence Reaper', 'On Takedown: -4s non-ultimate cooldowns.', 'Takedown-gated; no takedown model in a 1v1 kill window.'],
  'item:rebirth': ['Rebirth / Mechanica', 'Upon dying, return as a Drone and possibly resurrect.', 'A death-revive mechanic; out of any damage/EHP model.'],
  'item:ruination': ['Ruination / Spirit Bleed', 'On-hit bleed drains 30 (+8% target Max Mana); True Damage = 80% of mana drained.', 'Damage scales with the target max mana; target-mana-dependent, out of scope.'],
  'item:salvation': ['Salvation / Aegis', 'On going below 30% Health: a (+22%) shield + 10% omnivamp for 6s.', 'A defensive, health-state-gated shield/sustain.'],
  'item:solstice': ['Solstice / Mornfall', 'Consume Pendulum stacks on basic for 10 (+0-55%) Damage, 2x at max.', 'Stack-consume cadence and the scaling base are unstated/ambiguous.'],
  'item:spellbreaker': ['Spellbreaker / Malefic', 'While the Veil spell-shield is active: +15% Magical Power.', 'The +15% holds only until the Veil blocks an ability and breaks; in-fight uptime is indeterminate.'],
  'item:stonewall': ['Stonewall / Bulwark', 'Mitigate 5 (+5%)% of Physical Damage.', 'Flat physical-damage mitigation; defensive, and no mitigation primitive exists.'],
  'item:syonic-echo': ['Syonic Echo / Duplicity', 'On cast: next 3 basics gain 30% Total Attack Speed (3s).', 'A windowed 3-basic AS burst with no clean primitive (Close Combat reset is melee-only).'],
  'item:transference': ['Transference / Shield Transference', 'Expiring shields restore 50% of remaining value as Health; +MS/armor while shielded.', 'Defensive, shield-state-gated.'],
  'item:unbroken-will': ['Unbroken Will / Undying', 'On being Immobilized: +25% Physical & Magical Armor for 2.5s.', 'A defensive, CC-triggered armor buff.'],
  'item:vainglory': ['Vainglory / Vanity', 'On dealing/taking damage: +0.5% Armors per stack (to 10), +10% at max.', 'A defensive ramping armor stat.'],
  'item:vanguardian': ['Vanguardian / Guardian', 'Nearby allies gain 15 Physical + 12 Magical Armor.', 'A team-side defensive aura.'],
  'item:void-conduit': ['Void Conduit / Relativity', 'Near an ally: both gain 6% Omnivamp + 1% missing-mana regen/s.', 'A team-side sustain aura.'],
  'item:void-helm': ['Void Helm / Abyssal Gift', 'Heal 20% more from all sources.', 'A healing-received amp (sustain); not a damage or EHP primitive.'],
  'item:volcanica': ['Volcanica / Hellstorm', 'On cast: -0.5s other basic-ability CDs (1.5s on Ultimate).', 'The cooldown ripple depends on ability interleaving the sim does not track.'],
  'item:vyzar-carapace': ['Vyzar Carapace / Shell Smash', 'At 3 Scorn stacks: 60-170 (by level) Damage + a 50 (+12%) shield.', 'The proc damage type is ambiguous and it grants a self-shield; a clean credit is unsafe.'],
  'item:wardens-faith': ["Warden's Faith / Stalwart + Mocking Presence", 'Take 20% less crit damage; nearby enemies -8% Physical Power.', 'Both are defensive/debuff (crit mitigation, enemy-power reduction); no offensive primitive.'],
  'item:windcaller': ['Windcaller / Zephyr', 'On Healing/Shielding an ally: both gain 8% MS for 1.5s.', 'A team-side movement utility.'],
  // reviewed, kept unmodeled (no clean primitive / would mislead the optimizer)
  'item:onixian-quiver': ['Onixian Quiver / Multishot + Onixia', 'Fire 2 extra projectiles (8-30% by range); melee only: +25% crit chance.', 'Multishot is multi-projectile/splash and Onixia is melee-only; crediting it globally would overvalue ranged carries.'],
  'item:cursed-ring': ['Cursed Ring / Curse of Swiftness', 'Total Attack Speed x1.2, but Basic Attacks deal 25% less damage; AS cap 3->4.', 'The +20% AS is inseparable from a basics-only -25% damage penalty and a cap change the sim cannot express; crediting the upside alone would overvalue it.'],
  'item:catalytic-drive': ['Catalytic Drive / Deconstruct + Converter', 'Next basic executes minions/small monsters (+gold); evolve after 20 executes.', 'PvE execute and an evolve trigger; no combat-damage component.'],
};

const reg = JSON.parse(readFileSync(FILE, 'utf8')) as { _readme: string; targets: Record<string, Entry> };

for (const [k, v] of Object.entries(modeled)) reg.targets[k] = v;
for (const [k, [name, sourceText, note]] of Object.entries(unmodeled)) {
  reg.targets[k] = { name, sourceText, source: SRC, effects: [{ kind: 'unmodeled', note }] };
}
// sharpen the pre-existing malady stub
reg.targets['item:malady'] = {
  name: 'Malady / Demise + Parting Gift',
  sourceText: 'On damaging a Hero below 40% Health: 20 (+15% PP) Damage, +4 per stack; on Killing a Unit: explode for unstated % of Max Health.',
  source: SRC,
  effects: [{ kind: 'unmodeled', note: "Demise's finisher fires only on sub-40%-health targets and ramps +4 per stack at an unstated cadence; Parting Gift's on-kill explosion deals an unstated % of Max Health. A fixed-target damage-over-window sim can neither gate nor stack it." }],
};

writeFileSync(FILE, JSON.stringify(reg, null, 1) + '\n');

const items = Object.keys(reg.targets).filter((k) => k.startsWith('item:'));
const modeledCount = items.filter((k) => reg.targets[k]!.effects.some((e) => (e as { kind: string }).kind !== 'unmodeled')).length;
console.log(`applied. item entries: ${items.length}, modeled: ${modeledCount}, unmodeled-only: ${items.length - modeledCount}`);
