// What else a build brought besides cooldowns (pure), for the build read (src/threat-build.ts):
//
//   damage    item + crest power of the hero's damage type; penetration (flat stats and
//             "Ignore N% of <type> Armor" effects) and what it did to the other team's armor:
//             each target's armor = hero base stats at an estimated level + their items' armor,
//             damage taken = 100 / (100 + armor) (verified, calibration mitigation K=100); percent
//             penetration applied before flat (an assumption, labelled); levels are PROVISIONAL
//             (calibration checkpoints: the match data has no level), so this is an estimate
//   amps      every item / Eternal / minor / augment effect that adds damage, in a few words, with
//             per-minute growth evaluated at the game's length (Vesh: 7% + 0.4% a minute)
//   sustain   lifesteal / omnivamp stats and healing effects, with the healing the game recorded
//   tough     health and armor from items, with the damage taken and mitigated the game recorded
// Measured numbers (damage, healing, taken, mitigated) come from the film; everything else is
// catalog text.

export interface BpItem { slug: string; display_name?: string; name?: string; stats?: Record<string, number>; effects?: { name?: string; condition?: string | null; menu_description?: string | null }[] }
export interface BpTarget { name: string; heroSlug: string; heroName: string; items?: { slug: string }[]; diedTo?: number; level?: number | null; takenFromHeroes?: { total: number; physical: number; magical: number; true: number } | null }
export interface PowerProfile {
  type: 'magical' | 'physical';
  power: number;
  pen: { flat: number; pct: number; sources: string[] };
  vs: { name: string; hero: string; armor: number; after: number; more: number; diedTo: number; level: number; levelKnown: boolean; taken: { type: number; total: number } | null }[];
  level: number;
  amps: { name: string; kind: string; how: string }[];
  /** the damage build, item by item (power of the hero's type, penetration, damage effects), in
   *  buy order when known; pred.gg does not report damage per item, so this is what each item
   *  added, not what it dealt */
  items: { slug: string; name: string; kind: string; power: number; pen: number; penPct: number; effects: string[] }[];
  dealt: { damage: number; share: number } | null;
  sustain: { stats: string[]; effects: { name: string; kind: string; how: string }[]; healing: number } | null;
  tough: { stats: string[]; taken: number; mitigated: number; deaths: number } | null;
}

const plain = (t: unknown) => String(t ?? '').replace(/<[^>]+>/g, '').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').replace(/\s*•\s*/g, ' ').trim();
const short = (t: string) => { const ss = t.replace(/^Enhance your Ultimate Ability: ?/i, 'Ultimate: ').split(/(?<=\.)\s+/); let out = ss[0] ?? ''; for (const x of ss.slice(1)) { if ((out + ' ' + x).length > 190) break; out += ' ' + x; } return out; };
const placeholder = (t: string) => /^(damage dealt|health restored|mana restored)\b/i.test(t) || !/[a-z]{3}/i.test(t);
const r1 = (x: number) => Math.round(x * 10) / 10;

export function powerProfile(
  p: { heroName: string; damageToHeroes?: number; healingDone?: number; damageTaken?: number; mitigated?: number; deaths: number; items?: { slug: string }[]; loadout?: { eternal?: string; minor1?: string; minor2?: string; augment?: { id: string } | null; crestSlug?: string } | null },
  ctx: {
    items: Map<string, BpItem>; teamDamage: number; durationMin: number; level: number;
    powerType?: 'magical' | 'physical' | null;
    heroStats: Map<string, Record<string, number[]>>; targets: BpTarget[];
    eternals: { name: string; major: string; minorSlot1: { name: string; desc: string }[]; minorSlot2: { name: string; desc: string }[] }[];
    augments: Record<string, { name: string; description: string }>;
  },
): PowerProfile {
  const lo = p.loadout ?? {};
  const owned = [...(p.items ?? []).map((i) => i.slug), ...(lo.crestSlug ? [lo.crestSlug] : [])].filter((s, i, a) => a.indexOf(s) === i).map((s) => ctx.items.get(s)).filter((x): x is BpItem => !!x);
  const sum = (k: string) => owned.reduce((a, it) => a + (it.stats?.[k] ?? 0), 0);
  const type: 'magical' | 'physical' = ctx.powerType ?? (sum('magical_power') >= sum('physical_power') ? 'magical' : 'physical');
  const T = type === 'magical' ? 'Magical' : 'Physical';
  const nm = (it: BpItem) => it.display_name ?? it.name ?? it.slug;

  // Penetration
  const penSources: string[] = [];
  const flat = sum(`${type}_penetration`);
  for (const it of owned) if (it.stats?.[`${type}_penetration`]) penSources.push(`${nm(it)} ${it.stats[`${type}_penetration`]}`);
  let keep = 1;
  for (const it of owned) for (const e of it.effects ?? []) {
    const m = new RegExp(`ignore (\\d+(?:\\.\\d+)?)% of ${T} armor`, 'i').exec(plain(e.menu_description));
    if (m) { keep *= 1 - Number(m[1]) / 100; penSources.push(`${nm(it)} ignores ${m[1]}%`); }
  }
  const pct = Math.round((1 - keep) * 100);
  const vs = ctx.targets.map((t) => {
    const lvl = t.level ?? ctx.level;
    const base = ctx.heroStats.get(t.heroSlug)?.[`${type}_armor`]?.[lvl - 1] ?? 0;
    const armor = base + (t.items ?? []).reduce((a, i) => a + (ctx.items.get(i.slug)?.stats?.[`${type}_armor`] ?? 0), 0);
    const after = Math.max(0, armor * keep - flat);
    return { name: t.name, hero: t.heroName, armor: Math.round(armor), after: Math.round(after), more: Math.round(((100 + armor) / (100 + after) - 1) * 100), diedTo: t.diedTo ?? 0, level: lvl, levelKnown: t.level != null,
      taken: t.takenFromHeroes ? { type: t.takenFromHeroes[type], total: t.takenFromHeroes.total } : null };
  }).sort((a, b) => b.diedTo - a.diedTo || b.more - a.more);

  // Damage amplifiers: item effects, Eternal, minors, augment that add damage
  const amps: PowerProfile['amps'] = [];
  const isAmp = (t: string) => /\d+(?:\.\d+)?%[^.]*(?:damage|health as)|(?:more|bonus|increased|additional)[^.]*damage|damage[^.]*\d+(?:\.\d+)?%/i.test(t) && !/^damage dealt/i.test(t) && !/ignore \d+% of/i.test(t);
  for (const it of owned) for (const e of it.effects ?? []) {
    const text = `${plain(e.condition)} ${plain(e.menu_description)}`.trim();
    if (text && !placeholder(text) && isAmp(text)) amps.push({ name: nm(it), kind: lo.crestSlug === it.slug ? 'crest' : 'item', how: short(text) });
  }
  const et = ctx.eternals.find((e) => e.name === lo.eternal);
  const grow = (t: string) => t.replace(/(\d+(?:\.\d+)?)% \(\+(\d+(?:\.\d+)?)% per minute\)/i, (_, a, b) => `${a}% (+${b}% a minute, about ${r1(Number(a) + Number(b) * ctx.durationMin)}% by the end)`);
  if (et && isAmp(et.major)) amps.push({ name: et.name, kind: 'Eternal', how: short(grow(plain(et.major))) });
  for (const m of et ? [...et.minorSlot1, ...et.minorSlot2].filter((x) => x.name === lo.minor1 || x.name === lo.minor2) : []) if (isAmp(m.desc)) amps.push({ name: m.name, kind: 'Eternal minor', how: short(grow(plain(m.desc))) });
  const aug = lo.augment ? ctx.augments[lo.augment.id] : undefined;
  if (aug && isAmp(aug.description)) amps.push({ name: aug.name, kind: 'augment', how: short(plain(aug.description)) });

  // The damage build, item by item.
  const items: PowerProfile['items'] = owned.map((it) => {
    const effects = (it.effects ?? []).map((e) => `${plain(e.condition)} ${plain(e.menu_description)}`.trim()).filter((t) => t && !placeholder(t) && isAmp(t)).map(short);
    const pctM = (it.effects ?? []).map((e) => new RegExp(`ignore (\\d+(?:\\.\\d+)?)% of ${T} armor`, 'i').exec(plain(e.menu_description))).find(Boolean);
    return { slug: it.slug, name: nm(it), kind: lo.crestSlug === it.slug ? 'crest' : 'item', power: it.stats?.[`${type}_power`] ?? 0, pen: it.stats?.[`${type}_penetration`] ?? 0, penPct: pctM ? Number(pctM[1]) : 0, effects };
  }).filter((x) => x.power || x.pen || x.penPct || x.effects.length);

  // Sustain
  const sStats = [['lifesteal', 'lifesteal'], ['magical_lifesteal', 'magical lifesteal'], ['omnivamp', 'omnivamp'], ['heal_shield_increase', 'heal and shield power']]
    .map(([k, l]) => [sum(k!), l] as [number, string]).filter(([v]) => v > 0).map(([v, l]) => `${v}% ${l}`);
  const sEff: PowerProfile['amps'] = [];
  for (const it of owned) for (const e of it.effects ?? []) {
    const text = `${plain(e.condition)} ${plain(e.menu_description)}`.trim();
    if (!placeholder(text) && /\bheal(?:s|ing|ed)?\b|restores? [^.]*health|\bshields?\b/i.test(text) && !(/reduc\w*[^.]{0,40}heal/i.test(text) && !/heals? you|restore|shield/i.test(text))) sEff.push({ name: nm(it), kind: 'item', how: short(text) });
  }
  for (const m of et ? [...et.minorSlot1, ...et.minorSlot2].filter((x) => x.name === lo.minor1 || x.name === lo.minor2) : []) if (/lifesteal|\bheal(?:s|ing|ed)?\b|omnivamp/i.test(m.desc)) sEff.push({ name: m.name, kind: 'Eternal minor', how: short(plain(m.desc)) });
  const healing = p.healingDone ?? 0;
  const sustain = sStats.length || sEff.length ? { stats: sStats, effects: sEff, healing } : null;

  // Toughness
  const tStats = [['max_health', ' health'], ['physical_armor', ' physical armor'], ['magical_armor', ' magical armor'], ['tenacity', '% tenacity']]
    .map(([k, l]) => [sum(k!), l] as [number, string]).filter(([v]) => v > 0).map(([v, l]) => `+${v}${l}`);
  const tough = tStats.length ? { stats: tStats, taken: p.damageTaken ?? 0, mitigated: p.mitigated ?? 0, deaths: p.deaths } : null;

  return {
    type, power: sum(`${type}_power`), pen: { flat, pct, sources: penSources }, vs, level: ctx.level, amps, items,
    dealt: p.damageToHeroes != null ? { damage: p.damageToHeroes, share: ctx.teamDamage ? Math.round((100 * p.damageToHeroes) / ctx.teamDamage) : 0 } : null,
    sustain, tough,
  };
}

/** Plain sentences for the coach / critic source. */
export function powerLines(pp: PowerProfile, hero: string): string[] {
  const out: string[] = [];
  if (pp.dealt) out.push(`${hero} dealt ${pp.dealt.damage.toLocaleString('en-US')} hero damage, ${pp.dealt.share}% of their team's, with +${pp.power} ${pp.type} power from items.`);
  if (pp.pen.flat || pp.pen.pct) {
    const top = pp.vs.filter((v) => v.more > 0).slice(0, 2);
    out.push(`Penetration: ${pp.pen.sources.join(', ')}${top.length ? `; against ${top.map((v) => `${v.hero} (level ${v.level}${v.levelKnown ? '' : ' estimated'}: about ${v.armor} ${pp.type} armor, ${v.after} after penetration${v.taken ? `; took ${v.taken.type.toLocaleString('en-US')} ${pp.type} damage from heroes, ${Math.round((100 * v.taken.type) / Math.max(1, v.taken.total))}% of all hero damage they took` : ''})`).join(' and ')} that is about ${top.map((v) => `${v.more}%`).join(' and ')} more damage (estimate: percent penetration taken before flat)` : ''}.`);
  }
  for (const a of pp.amps) out.push(`${a.name} (${a.kind}): ${a.how}`);
  if (pp.sustain) out.push(`Sustain: ${[...pp.sustain.stats, ...pp.sustain.effects.map((e) => `${e.name}: ${e.how}`)].join('; ')}; ${pp.sustain.healing.toLocaleString('en-US')} healing recorded.`);
  if (pp.tough) out.push(`Toughness: ${pp.tough.stats.join(', ')}; took ${pp.tough.taken.toLocaleString('en-US')} damage, mitigated ${pp.tough.mitigated.toLocaleString('en-US')}, died ${pp.tough.deaths} times.`);
  return out;
}

/** One plain lesson from the damage side, when penetration clearly mattered. */
export function powerLesson(pp: PowerProfile, hero: string): string | null {
  const hit = pp.vs.filter((v) => v.diedTo > 0).sort((a, b) => b.diedTo - a.diedTo)[0] ?? pp.vs[0];
  if (!hit || hit.more < 15) return null;
  return `${hero}'s penetration cut through: ${hit.hero} took about ${hit.more}% more ${pp.type} damage than their armor alone allows (estimate: at level ${hit.level}${hit.levelKnown ? '' : ' (estimated)'} their armor was about ${hit.armor}, about ${hit.after} after ${[pp.pen.flat ? `${pp.pen.flat} flat` : '', pp.pen.pct ? `${pp.pen.pct}%` : ''].filter(Boolean).join(' + ')} penetration).`;
}
