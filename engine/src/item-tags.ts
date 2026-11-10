// Item tag sheet (pure): one consistent read of every completed item, built from
// data/catalog/items.json alone, so every place the site names an item can say the
// same things about it in the same words.
//
//   gives    what the item's stats give you, in one fixed order ("35 Physical power")
//   does     how its passive / active works, from one fixed vocabulary (DOES)
//   answers  which enemy problem it answers (ANSWERS), the key the matchup
//            adjustments and the role language hang off
//   purpose  what the item is for when it answers no particular enemy (PURPOSE_LANGUAGE);
//            every item has one, so every item gets a line in the lane's words
//   unique   one or two statements of the item's own passive / active, condensed
//            from the game's text (never reworded into a claim the text does not make)
//
// Rules, not authored copy: a tag exists only when the catalog stat or the game
// text supports it (see RULES), so a patch that changes an item changes its tags on
// the next `npm run itemtags`. roleLine() phrases an answer the way that lane plays.
// Written to data/aggregates/item-tags.json by src/ingest/item-tags.ts.

export interface CatalogEffect { name?: string | null; active?: boolean; condition?: string | null; menu_description?: string | null }
export interface CatalogItem {
  slug: string; display_name?: string; name?: string; rarity?: string | null; slot_type?: string | null;
  aggression_type?: string | null; stats?: Record<string, number>; effects?: CatalogEffect[];
}
export type Answer = 'tanks' | 'healing' | 'shields' | 'magic' | 'physical' | 'cc' | 'burst' | 'crit';
export type Role = 'carry' | 'midlane' | 'offlane' | 'jungle' | 'support';
/** What the item is FOR when it answers no particular enemy: every item has exactly one. */
export type Purpose = 'support' | 'crit' | 'onhit' | 'burst' | 'sustain' | 'mobility' | 'control' | 'area' | 'cooldowns' | 'scaling' | 'durable' | 'mana' | 'power';
export interface Give { k: string; label: string; v: number; pct: boolean }
export interface ItemTagRow {
  name: string; kind: 'item' | 'crest' | 'consumable';
  gives: Give[]; does: string[]; answers: Answer[]; purpose: Purpose; unique: string[];
}

// Stat chips, most build-defining first. pct = the game shows the number as a percent.
const STATS: [key: string, label: string, pct: boolean][] = [
  ['physical_power', 'Physical power', false], ['magical_power', 'Magical power', false],
  ['attack_speed', 'Attack speed', true], ['critical_chance', 'Crit chance', true],
  ['physical_penetration', 'Physical pen', false], ['magical_penetration', 'Magical pen', false],
  ['ability_haste', 'Ability haste', false], ['max_health', 'Health', false],
  ['physical_armor', 'Physical armor', false], ['magical_armor', 'Magical armor', false],
  ['tenacity', 'Tenacity', false], ['lifesteal', 'Lifesteal', true], ['magical_lifesteal', 'Magical lifesteal', true],
  ['omnivamp', 'Omnivamp', true], ['heal_shield_increase', 'Heal and shield power', true],
  ['movement_speed', 'Move speed', true], ['max_mana', 'Mana', false], ['mana_regeneration', 'Mana regen', true],
  ['health_regeneration', 'Health regen', true], ['gold_per_second', 'Gold income', false],
];

export const strip = (s: string) => s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/[ \t]+/g, ' ');
/** Effects that describe the item (drops the in-game damage trackers and purchase restrictions). */
const realEffects = (it: CatalogItem) => (it.effects ?? []).filter((e) => {
  const d = e.menu_description ?? '';
  return d && !/\{[A-Za-z]+\}/.test(d) && !/^restriction/i.test((e.name ?? '').trim()) && !/^\s*Restriction/i.test(strip(d));
});
const textOf = (it: CatalogItem) => realEffects(it).map((e) => strip(`${e.condition ?? ''} ${e.menu_description ?? ''}`)).join(' \n ');

/** The fixed "how it works" vocabulary: [tag, test on the item's effect text / catalog fields]. */
type Rule = [tag: string, test: (t: string, it: CatalogItem) => boolean];
const agg = (it: CatalogItem, ...a: string[]) => a.includes(it.aggression_type ?? '');
export const RULES: Rule[] = [
  ['Anti-heal', (t, it) => agg(it, 'AntiHeal') || /healing reduction|reduc\w* (their |all )?(incoming )?healing|anti-?heal|less healing/i.test(t)],
  ['% health damage', (t) => /% of (their|the |its )?(target'?s? )?(max|maximum|current|bonus|missing) health as/i.test(t) || /deal \d+(\.\d+)?% of (their|target'?s?) (max|maximum|current|bonus|missing) health/i.test(t) || /\(\+\d+(\.\d+)?% target'?s? (max|maximum|current|bonus|missing) health\)/i.test(t)],
  ['Armor ignore', (t) => /ignore \d+% of (bonus )?(physical|magical) armor/i.test(t)],
  ['Physical armor shred', (t, it) => agg(it, 'PhysicalShred') || /shred \d+%? ?physical armor|reduce\w* (their )?physical armor/i.test(t)],
  ['Magical armor shred', (t, it) => agg(it, 'MagicalShred') || /shred \d+%? ?magical armor|reduce\w* (their )?magical armor/i.test(t)],
  ['Shield breaker', (t, it) => agg(it, 'AntiShield') || /shielded target/i.test(t)],
  ['True damage', (t) => /true damage/i.test(t)],
  ['Execute', (t) => /(hero|heroes|enemies) below \d+% health|execute (them|heroes|enemy)/i.test(t)],
  ['Damage amp', (t, it) => agg(it, 'DamageAmp') || /gain \(\+[\d.]+%\) (physical|magical) power|increase your (magical|physical) power by|increases? your (magical |ability |physical )?damage dealt|deals? \d+% (more|bonus) (magical |physical )?damage|increase ability damage|gain [\d.]+ (magical|physical) power/i.test(t)],
  ['Crit amp', (t, it) => agg(it, 'CritAmp') || /critical strikes deal \d+% more/i.test(t)],
  ['Attack speed burst', (t) => /gain \(?\+?[\d.]+%\)? (total )?attack speed|increase your total attack speed/i.test(t)],
  ['On-hit', (t, it) => agg(it, 'OnHit', 'OnHitAura') || /on-hit|on successs?ful basic attack|on basic attacking|on ranged basic attack/i.test(t)],
  ['Ability damage', (t) => /on dealing ability damage|ability damage dealt|ability hits on heroes|alternate ability deals|ultimate.{0,30}damage/i.test(t)],
  ['Area damage', (t, it) => agg(it, 'AreaDamage') || /damage (around|to nearby)|nearby (enemies|heroes)\b.{0,40}damage|deals? .{0,40}damage to nearby/i.test(t)],
  ['Damage over time', (t, it) => agg(it, 'DamageOverTime') || /damage over \d/i.test(t)],
  ['Slow', (t) => /\bslows? (by|enemies|them)|are slowed/i.test(t)],
  ['Crowd control', (t) => /\bstuns?\b|\broots?\b|\bsilences?\b|\bgrounds?\b|launches|knock/i.test(t)],
  ['Shield', (t) => /gain a .{0,40}shield|shields? you|grant .{0,40}shield|into a shield|shield for \d/i.test(t.replace(/spell shield/gi, ''))],
  ['Damage reduction', (t) => /damage mitigation|mitigate \d|block \d+%? (of|damage)|take \d+% (less|reduced) damage|reduce\w* damage taken|reduce it by \d+%|less damage from/i.test(t)],
  ['Armor up', (t) => /gain \d+%? (total )?(physical|magical) armor|increased armors|increase your (physical|magical) armor|gain \d+ (physical|magical) armor/i.test(t)],
  ['Attack speed slow', (t) => /reduce the source'?s? attack speed/i.test(t)],
  ['Stealth', (t) => /camouflag/i.test(t)],
  ['Cleanse', (t, it) => agg(it, 'Cleanse') || /cleanse|cc immunity/i.test(t)],
  ['Spell block', (t, it) => agg(it, 'SpellShield') || /block the next (enemy )?ability|spell ?shield/i.test(t)],
  ['Stasis', (t, it) => agg(it, 'Stasis') || /enter stasis/i.test(t)],
  ['Revive', (t, it) => agg(it, 'Resurrection') || /revive|resurrect/i.test(t)],
  ['Reflect', (t, it) => agg(it, 'ReflectDamage') || /reflect/i.test(t)],
  ['Heal', (t) => /\bheals? (you|for|yourself)|restore \(?\+?\d.{0,20}health|regenerate \d.{0,30}health/i.test(t)],
  ['Stronger healing on you', (t) => /heal \d+% more from all sources/i.test(t)],
  ['Ally buff', (t) => /on healing or shielding|allies? (on|within|gain)|nearby all(y|ied|ies)|you both gain|grant them/i.test(t)],
  ['Enemy debuff aura', (t) => /nearby enemy heroes:?\s*\n?\s*•? ?(take|have)/i.test(t)],
  ['Cooldown cut', (t, it) => agg(it, 'ReducedCooldowns') || /(reduce|decrease)\w* .{0,40}cooldowns?/i.test(t)],
  ['Move speed burst', (t) => /gain \d+%? (decaying )?movement speed|grant\w* up to \d+ movement speed/i.test(t)],
  ['Stacks up', (t, it) => agg(it, 'Scaling', 'ScalingMana') || /stacks up to \d{2,}|evolve this item|upon reaching \d+ stacks/i.test(t)],
  ['Active', (_t, it) => realEffects(it).some((e) => e.active)],
];
export const DOES = RULES.map((r) => r[0]);

/** What enemy problem the item answers, from its tags and defensive stats. */
function answersOf(it: CatalogItem, does: Set<string>, t: string): Answer[] {
  const s = it.stats ?? {}, a: Answer[] = [];
  if (does.has('Anti-heal')) a.push('healing');
  if (does.has('% health damage') || does.has('Physical armor shred') || does.has('Magical armor shred') || does.has('Armor ignore') || agg(it, 'AntiTank')) a.push('tanks');
  if (does.has('Shield breaker')) a.push('shields');
  if ((s.magical_armor ?? 0) >= 30 || agg(it, 'AntiMagic') || does.has('Spell block')) a.push('magic');
  if ((s.physical_armor ?? 0) >= 30 || agg(it, 'AntiCrit')) a.push('physical');
  if ((s.tenacity ?? 0) > 0 || does.has('Cleanse') || /on being immobilized/i.test(t)) a.push('cc');
  if (agg(it, 'AntiBurst') || does.has('Stasis') || does.has('Revive') || /on going below \d+% health/i.test(t)) a.push('burst');
  if (agg(it, 'AntiCrit') || /critical strike damage (taken|received)|damage from critical/i.test(t)) a.push('crit');
  return a;
}

/** The item's one purpose, most distinctive first: what it is bought for, from its stats and tags. */
function purposeOf(it: CatalogItem, does: Set<string>): Purpose {
  const s = it.stats ?? {}, has = (k: string) => (s[k] ?? 0) > 0;
  if (has('heal_shield_increase') || does.has('Ally buff') || agg(it, 'HealingAndShielding')) return 'support';
  if (has('critical_chance')) return 'crit';
  if (has('attack_speed') || does.has('On-hit') || does.has('Attack speed burst')) return 'onhit';
  if (agg(it, 'Burst', 'UltimateDamage', 'EnhancedAbility') || does.has('Execute')) return 'burst';
  if (agg(it, 'Scaling', 'ScalingMana')) return 'scaling'; // an item that evolves or stacks is bought for that, whatever else it does
  if (has('lifesteal') || has('omnivamp') || has('magical_lifesteal') || agg(it, 'Sustain', 'Regen', 'Healing') || does.has('Heal')) return 'sustain';
  if (agg(it, 'Mobility') || has('movement_speed') || does.has('Move speed burst')) return 'mobility';
  if (does.has('Slow') || does.has('Crowd control') || agg(it, 'Disruption', 'SlowingSpells')) return 'control';
  if (does.has('Area damage')) return 'area';
  if (does.has('Cooldown cut') || (s.ability_haste ?? 0) >= 20) return 'cooldowns';
  if (does.has('Stacks up')) return 'scaling';
  if (has('physical_armor') || has('magical_armor') || (s.max_health ?? 0) >= 300 || does.has('Damage reduction') || does.has('Armor up') || does.has('Shield')
    || agg(it, 'Defense', 'DefensiveAura', 'TeamfightDurability', 'SustainedDurability', 'Shielding')) return 'durable';
  if (!has('magical_power') && !has('physical_power') && ((s.max_mana ?? 0) >= 300 || has('mana_regeneration'))) return 'mana';
  return 'power';
}

const MAX_UNIQUE = 2, MAX_LEN = 130;
/** One or two statements of the item's own effects: "<Effect>: <when>: <what>", cut at bullet ends. */
function uniqueOf(it: CatalogItem): string[] {
  const out: string[] = [];
  for (const e of realEffects(it)) {
    const lines = strip(`${e.condition ?? ''}\n${e.menu_description ?? ''}`).split('\n').map((l) => l.trim()).filter(Boolean);
    let when = '';
    const what: string[] = [];
    for (const l of lines) {
      if (l.startsWith('•')) {
        const b = l.replace(/^•\s*/, '').trim();
        // Crest upgrade bookkeeping is not what the item does in a fight.
        if (/^after (restoring|gaining)|enter base to evolve|evolves into/i.test(b)) continue;
        what.push(b.replace(/\.$/, ''));
      } else if (!what.length) when = when ? `${when} ${l}` : l;
      else break; // a second condition block: the first one is the statement
    }
    when = when.replace(/:$/, '').trim();
    if (!what.length && !when) continue;
    const head = `${e.active ? 'Active' : ''}${e.active && e.name?.trim() ? ', ' : ''}${e.name?.trim() ?? ''}`.trim();
    let body = when;
    for (const b of what) {
      const next = body ? `${body}${body === when ? ': ' : '; '}${b}` : b;
      if (next.length > MAX_LEN && body && body !== when) break;
      body = next;
    }
    const line = `${head ? `${head}: ` : ''}${body}`.replace(/\s+/g, ' ').replace(/\( ?\)/g, '').replace(/%\)%/g, '%)').trim();
    if (line && !out.includes(line)) out.push(line.length > MAX_LEN + 40 ? `${line.slice(0, MAX_LEN + 37).replace(/\s+\S*$/, '')}…` : line);
    if (out.length >= MAX_UNIQUE) break;
  }
  return out;
}

export function tagItem(it: CatalogItem): ItemTagRow {
  const t = textOf(it), s = it.stats ?? {};
  const does = RULES.filter(([, test]) => test(t, it)).map(([tag]) => tag);
  const gives = STATS.filter(([k]) => (s[k] ?? 0) > 0).map(([k, label, pct]) => ({ k, label, v: s[k]!, pct }));
  const kind: ItemTagRow['kind'] = it.slot_type === 'Crest' ? 'crest' : it.slot_type === 'Active' ? 'consumable' : 'item';
  return { name: it.display_name ?? it.name ?? it.slug, kind, gives, does, answers: answersOf(it, new Set(does), t), purpose: purposeOf(it, new Set(does)), unique: uniqueOf(it) };
}

/** Every completed item (Epic and Legendary) by slug. */
export function tagItems(items: CatalogItem[]): Record<string, ItemTagRow> {
  const out: Record<string, ItemTagRow> = {};
  for (const it of items) if (it.rarity === 'Epic' || it.rarity === 'Legendary') out[it.slug] = tagItem(it);
  return out;
}

// How each lane says it. One line per answer per role, in the words that role
// plays by: a carry hits what is in front of them, a mid lands a combo, an offlaner
// trades and holds a side lane, a jungler ganks and fights objectives, a support
// keeps the carry alive and starts fights.
export const ROLE_LANGUAGE: Record<Answer, Record<Role, string>> = {
  tanks: {
    carry: 'Cuts down the front line you have to hit first',
    midlane: 'Keeps your combo hurting into stacked health',
    offlane: 'Wins the long trade against a tankier laner',
    jungle: 'Lets you kill their tank in objective fights',
    support: 'Helps your team burn through their front line',
  },
  healing: {
    carry: 'Cuts the healing on whoever you are hitting',
    midlane: 'Stops them healing back through your combo',
    offlane: 'Takes away the sustain that out-trades you in lane',
    jungle: 'Makes ganks stick on targets that heal themselves',
    support: 'Puts anti-heal on their healers for your whole team',
  },
  shields: {
    carry: 'Breaks the shields that soak your attacks',
    midlane: 'Breaks the shield that eats your combo',
    offlane: 'Punishes a laner who trades behind a shield',
    jungle: 'Gets your gank damage through their shields',
    support: 'Cracks enemy shields so your carry can finish',
  },
  magic: {
    carry: 'Lets you live through the magic combo aimed at you',
    midlane: 'Survive the enemy mid in a magic matchup',
    offlane: 'Holds the lane against a magic damage laner',
    jungle: 'Lets you dive into their mages and walk out',
    support: 'Keeps you standing in front against magic damage',
  },
  physical: {
    carry: 'Buys time against the assassin or carry on you',
    midlane: 'Survive the physical jungler and assassin dives',
    offlane: 'Holds the lane against a physical damage laner',
    jungle: 'Lets you fight their carry and physical jungler',
    support: 'Keeps you standing in front against their carry',
  },
  cc: {
    carry: 'Shortens the lockdown that kills you before you attack',
    midlane: 'Gets you out of the stun that sets up their kill',
    offlane: 'Keeps you moving through their crowd control in fights',
    jungle: 'Lets you finish a dive through their crowd control',
    support: 'Keeps you free to peel when they chain crowd control',
  },
  burst: {
    carry: 'Saves you from the one combo that deletes you',
    midlane: 'Survive the all-in from their assassin or jungler',
    offlane: 'Gives you a second wind when a dive goes long',
    jungle: 'Lets you go in first and survive the reply',
    support: 'Survive being the first target of their engage',
  },
  crit: {
    carry: 'Blunts the enemy carry in the late duel',
    midlane: 'Takes the sting out of their crit carry',
    offlane: 'Lets you dive a crit carry and live',
    jungle: 'Lets you jump their crit carry and live',
    support: 'Stand in front of their crit carry for longer',
  },
};
export const ANSWER_LABEL: Record<Answer, string> = {
  tanks: 'vs tanks', healing: 'vs healing', shields: 'vs shields', magic: 'vs magic damage',
  physical: 'vs physical damage', cc: 'vs crowd control', burst: 'vs burst', crit: 'vs crit',
};
// The same for an item that answers no particular enemy: what it is for, in that lane's words.
export const PURPOSE_LANGUAGE: Record<Purpose, Record<Role, string>> = {
  support: {
    carry: 'Stronger heals and shields for the team around you',
    midlane: 'Stronger heals and shields from your abilities',
    offlane: 'Stronger heals and shields in the fight you start',
    jungle: 'Stronger heals and shields on the allies you gank for',
    support: 'Stronger heals and shields on the carry you protect',
  },
  crit: {
    carry: 'Bigger crits for the late-game team fights',
    midlane: 'Crit damage for a mid who wins with basic attacks',
    offlane: 'Crit damage to win the long duel',
    jungle: 'Crit damage to clear camps and duel faster',
    support: 'Crit damage if you are playing for kills',
  },
  onhit: {
    carry: 'More attacks, and each one hits harder',
    midlane: 'Basic attacks that add to your combo',
    offlane: 'Faster attacks for long trades in lane',
    jungle: 'Faster attacks for camps and sticking to a target',
    support: 'Faster attacks to add damage from the front',
  },
  burst: {
    carry: 'Finishes low targets before they get away',
    midlane: 'More damage in the one combo that gets the kill',
    offlane: 'Turns a won trade into a kill',
    jungle: 'More damage up front on a gank',
    support: 'Adds kill damage to the pick you start',
  },
  sustain: {
    carry: 'Heals you back while you keep attacking',
    midlane: 'Heals you back as your abilities land',
    offlane: 'Lets you stay in lane through trades',
    jungle: 'Keeps you healthy between camps and fights',
    support: 'Keeps you alive while you stand in front',
  },
  mobility: {
    carry: 'Speed to kite and keep your spacing',
    midlane: 'Speed to roam and dodge abilities',
    offlane: 'Speed to stick to a target or get out',
    jungle: 'Speed to reach ganks and objectives first',
    support: 'Speed to reach the fight and your carry',
  },
  control: {
    carry: 'Slows what you hit so it cannot reach you',
    midlane: 'Holds targets so the rest of your combo lands',
    offlane: 'Holds targets so they cannot leave the trade',
    jungle: 'Holds targets so the gank sticks',
    support: 'Holds targets so your team can catch them',
  },
  area: {
    carry: 'Hits everything near your target and clears waves',
    midlane: 'Clears waves fast so you can roam',
    offlane: 'Clears waves fast and hits grouped enemies',
    jungle: 'Clears camps faster and hits grouped enemies',
    support: 'Adds area damage around the fight you start',
  },
  cooldowns: {
    carry: 'Abilities back sooner between attacks',
    midlane: 'Abilities back sooner for a second combo',
    offlane: 'Abilities back sooner in long fights',
    jungle: 'Abilities back sooner for the next gank',
    support: 'Abilities back sooner to peel and engage again',
  },
  scaling: {
    carry: 'Grows as you farm: strongest late',
    midlane: 'Grows as you farm and get takedowns',
    offlane: 'Grows through the lane: strongest late',
    jungle: 'Grows as you clear camps and get takedowns',
    support: 'Grows over the game, so buy it early',
  },
  durable: {
    carry: 'Extra toughness so one mistake does not kill you',
    midlane: 'Extra toughness to survive being jumped',
    offlane: 'Makes you harder to kill in long fights',
    jungle: 'Makes you harder to kill when you go in first',
    support: 'Makes you harder to kill at the front',
  },
  mana: {
    carry: 'Mana to keep using abilities in lane',
    midlane: 'Mana to keep casting through the lane',
    offlane: 'Mana to keep trading with abilities',
    jungle: 'Mana to keep clearing with abilities',
    support: 'Mana to keep healing and poking in lane',
  },
  power: {
    carry: 'Raw damage on every attack and ability',
    midlane: 'Raw power: every ability hits harder',
    offlane: 'Raw damage for every trade',
    jungle: 'Raw damage for ganks and camps',
    support: 'Raw damage if your team needs more from you',
  },
};
/** One line for every item in a lane's words: its lead answer, else what it is for. */
export const roleLine = (row: ItemTagRow, role: Role): string => (row.answers[0] ? ROLE_LANGUAGE[row.answers[0]][role] : PURPOSE_LANGUAGE[row.purpose][role]);
