// How an enemy's build worked (pure): for the enemy who ran the game (kitRead.threat) and each
// lane nemesis's killer, read their Eternal + minors, augment, crest and final items from the
// catalog text and the game's own numbers, and show the interactions to learn from:
//
//   haste    every ability-haste source we can count: item and crest stats, takedown-scaling
//            minors (Tithe of Death: 2 per takedown up to 30), ultimate-haste minors and
//            augments, and in-fight stacking augments (Natural Infusion: +10 for 6s per Harvest
//            Nettles hit). Cooldown = base x 100 / (100 + haste), verified in practice mode
//            (engine/fixtures/calibration.json abilityHaste, 2026-10-15).
//   ult      the ultimate's top-rank cooldown: base, with the haste held at the end of the game,
//            and inside a fight with the stacking bonus (THEORY: assumes every cast hits and
//            that haste gained mid-cooldown shortens it)
//   fed by   every effect that triggers on takedowns (minors, items, passive, augment), with the
//            takedown count (kills + assists)
//   ult+     item effects that enhance the ultimate
// Estimates are labelled; levels, ranks and buy times are not in the match data (item times
// come from the gold-curve estimate in players[i].itemTimeline).

export interface TbAbility { key?: string; display_name: string; cooldown?: number[]; menu_description?: string | null; game_description?: string | null }
export interface TbItem { slug: string; display_name?: string; name?: string; stats?: Record<string, number>; effects?: { name?: string; condition?: string | null; menu_description?: string | null }[] }
export interface TbPlayer {
  heroSlug: string; heroName: string; kills: number; deaths: number; assists: number;
  items?: { slug: string; name?: string }[]; itemTimeline?: { slug: string; estMin: number }[];
  /** exact purchase times and level-ups from the match stream (players[i].stream), when saved */
  stream?: { purchases?: { slug: string; sec: number }[]; levelUps?: { sec: number; ab: string }[]; level?: number | null } | null;
  loadout?: { eternal?: string; minor1?: string; minor2?: string; augment?: { id: string; name: string } | null; crest?: string; crestSlug?: string } | null;
}
export interface ThreatBuild {
  hero: string; slug: string; takedowns: number;
  loadout: string;
  haste: { sources: { what: string; amount: number; note?: string; kind?: string; how?: string }[]; total: number; fightBonus: { what: string; amount: number; note: string } | null; ultOnly: number };
  ult: { name: string; base: number; endGame: number; inFight: number | null; rank?: number; rankKnown?: boolean } | null;
  fedBy: string[]; ultPlus: string[];
  lines: string[];
  /** the same read, structured for the page: cooldown before/after, haste by source, the other
   *  takedown and ultimate effects in a few words each, and the lesson */
  card?: {
    ult: ThreatBuild['ult'];
    haste: { name: string; kind: string; amount: number; how: string }[];
    fight: { name: string; kind: string; amount: number; how: string } | null;
    takedowns: { count: number; kills: number; assists: number };
    extras: { name: string; kind: string; how: string }[];
    heals: boolean; lesson: string | null;
  };
}

const plain = (t: unknown) => String(t ?? '').replace(/<[^>]+>/g, '').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').replace(/^• /, '').replace(/ • /g, ' ').trim();
/** A catalog effect in a few words: the first one or two sentences, with the stock lead-ins shortened. */
const short = (t: unknown) => plain(t)
  .replace(/^Each time .*? achieves a Takedown,? (?:she|he|it|they) /i, 'Each takedown ')
  .replace(/^Enhance your Ultimate Ability: ?/i, 'Ultimate: ')
  .split(/(?<=\.)\s+/).slice(0, 2).join(' ');
const cd = (base: number, haste: number) => Math.round((base * 100 / (100 + haste)) * 10) / 10;

export function threatBuild(
  p: TbPlayer, ctx: {
    hero: { abilities: TbAbility[] } | undefined; items: Map<string, TbItem>;
    eternals: { name: string; major: string; minorSlot1: { name: string; desc: string }[]; minorSlot2: { name: string; desc: string }[] }[];
    augments: Record<string, { name: string; description: string }>;
    takedownTimes?: number[];
    durationMin?: number;
  },
): ThreatBuild {
  const td = p.kills + p.assists;
  const lo = p.loadout ?? {};
  const owned = [...(p.items ?? []).map((i) => i.slug), ...(lo.crestSlug ? [lo.crestSlug] : [])].filter((s, i, a) => a.indexOf(s) === i);
  const sources: ThreatBuild['haste']['sources'] = [];
  const fedBy: string[] = [], ultPlus: string[] = [];
  const extras: { name: string; kind: string; how: string }[] = [];
  let fightHow = '';
  let ultOnly = 0, fightBonus: ThreatBuild['haste']['fightBonus'] = null;
  const exact = (slug: string) => p.stream?.purchases?.find((t) => t.slug === slug)?.sec;
  const est = (slug: string) => exact(slug) != null ? Math.round(exact(slug)! / 60) : p.itemTimeline?.find((t) => t.slug === slug)?.estMin;
  const bought = (slug: string) => exact(slug) != null ? `bought at ${Math.floor(exact(slug)! / 60)}:${String(exact(slug)! % 60).padStart(2, '0')}` : est(slug) != null ? `bought around ${est(slug)} min (estimate)` : '';

  for (const slug of owned) {
    const it = ctx.items.get(slug);
    if (!it) continue;
    const name = it.display_name ?? it.name ?? slug;
    const h = it.stats?.ability_haste ?? 0;
    if (h) sources.push({ what: name, amount: h, note: slug === lo.crestSlug ? 'crest' : bought(slug) || undefined, kind: slug === lo.crestSlug ? 'crest' : 'item', how: `+${h} ability haste${slug !== lo.crestSlug && bought(slug) ? `, ${bought(slug).replace(' (estimate)', '')}` : ''}` });
    for (const e of it.effects ?? []) {
      const text = `${plain(e.condition)} ${plain(e.menu_description)}`.trim();
      if (/takedown/i.test(text)) { fedBy.push(`${name}${e.name ? ` (${e.name})` : ''}: ${text}`); extras.push({ name, kind: slug === lo.crestSlug ? 'crest' : 'item', how: short(text) }); }
      if (/ultimate/i.test(text)) { ultPlus.push(`${name}${e.name ? ` (${e.name})` : ''}: ${text}`); extras.push({ name, kind: 'item', how: short(text) }); }
    }
  }
  const et = ctx.eternals.find((e) => e.name === lo.eternal);
  const minors = et ? [...et.minorSlot1, ...et.minorSlot2].filter((m) => m.name === lo.minor1 || m.name === lo.minor2) : [];
  // Random procs (Lotus: every 2 minutes and every takedown, one of four bonuses, one of them
  // +4 ability haste): expected haste = procs x amount / options. An estimate, labelled.
  for (const [name, kind, text] of [...(et ? [[et.name, 'Eternal', et.major]] : []), ...minors.map((m) => [m.name, 'Eternal minor', m.desc])] as [string, string, string][]) {
    const rnd = /every (\d+) minutes?(?: and every takedown)? randomly grants (.+)/i.exec(text);
    const h = rnd ? /\+(\d+(?:\.\d+)?) ability haste/i.exec(rnd[2]!) : null;
    if (rnd && h) {
      const options = rnd[2]!.split(/,\s*(?:or\s+)?|\s+or\s+/).filter((x) => x.trim()).length;
      const procs = Math.floor((ctx.durationMin ?? 0) / Number(rnd[1])) + (/takedown/i.test(rnd[0]!) ? td : 0);
      const exp = Math.round((procs * Number(h[1])) / Math.max(options, 1));
      if (exp > 0) sources.push({ what: name, amount: exp, note: `random: ${procs} procs, 1 in ${options} is +${h[1]} haste (expected value)`, kind, how: `${procs} random bonuses (every ${rnd[1]} min${/takedown/i.test(rnd[0]!) ? ' and every takedown' : ''}), 1 in ${options} is +${h[1]} haste: about +${exp} expected` });
    }
  }
  if (et && /takedown/i.test(et.major)) { fedBy.push(`${et.name} (Eternal): ${plain(et.major)}`); extras.push({ name: et.name, kind: 'Eternal', how: short(et.major) }); }
  for (const m of minors) {
    const tk = /takedowns?[^.]*?grant (\d+(?:\.\d+)?) ability haste, up to (\d+)/i.exec(m.desc);
    if (tk) {
      const per = Number(tk[1]), cap = Number(tk[2]), got = Math.min(cap, per * td), need = Math.ceil(cap / per);
      const when = capMinute(ctx.takedownTimes, need).match(/around (\d+) min/)?.[1];
      sources.push({ what: `${m.name} (minor)`, amount: got, note: `${per} per takedown, ${td} takedowns${got >= cap ? `, capped at ${cap} from the ${need}th${capMinute(ctx.takedownTimes, need)}` : ''}`, kind: 'Eternal minor', how: `+${per} per takedown, up to ${cap}: ${got >= cap ? `maxed at takedown ${need}${when ? ` (around ${when} min)` : ''}` : `${td} takedowns`}` });
    }
    const ult = /(\d+) ultimate (?:ability )?haste/i.exec(m.desc);
    if (ult) ultOnly += Number(ult[1]);
    if (/takedown/i.test(m.desc)) { fedBy.push(`${m.name} (minor): ${plain(m.desc)}`); if (!tk) extras.push({ name: m.name, kind: 'Eternal minor', how: short(m.desc) }); }
  }
  const aug = lo.augment ? ctx.augments[lo.augment.id] : undefined;
  const abilities = ctx.hero?.abilities ?? [];
  if (aug) {
    const ult = /(\d+) ultimate (?:ability )?haste/i.exec(aug.description);
    if (ult) ultOnly += Number(ult[1]);
    if (/takedown/i.test(aug.description)) { fedBy.push(`${aug.name} (augment): ${plain(aug.description)}`); extras.push({ name: aug.name, kind: 'augment', how: short(aug.description) }); }
  }
  const passive = abilities.find((a) => /passive/i.test(a.key ?? ''));
  if (passive && /takedown/i.test(plain(passive.menu_description ?? passive.game_description))) { fedBy.push(`${passive.display_name} (passive): ${plain(passive.menu_description ?? passive.game_description)}`); extras.push({ name: passive.display_name, kind: 'passive', how: short(passive.menu_description ?? passive.game_description) }); }
  const total = sources.reduce((a, s) => a + s.amount, 0);
  if (aug) {
    const st = /(\d+) ability haste for (\d+(?:\.\d+)?)s, stacking/i.exec(aug.description);
    const by = st ? abilities.find((a) => a.display_name && aug.description.includes(a.display_name)) : undefined;
    const byCd = by?.cooldown?.length ? by.cooldown[by.cooldown.length - 1]! : null;
    if (st && by && byCd) {
      const per = Number(st[1]), dur = Number(st[2]);
      const exact = (byCd * 100) / (100 + total), each = cd(byCd, total);
      const stacks = Math.floor(dur / exact + 1e-9) + 1;
      fightHow = `+${per} for ${dur}s each time ${by.display_name} hits a hero, up to ${stacks} at once`;
      fightBonus = { what: `${aug.name} (augment)`, amount: per * stacks, note: `${per} per ${by.display_name} hit for ${dur}s; ${by.display_name} comes back every ${each}s at ${total} haste, so up to ${stacks} stacks if every cast hits` };
    }
  }
  const r = abilities.find((a) => a.key === 'R');
  // The ultimate's rank at the end: from the level-ups when the stream saved them, else top rank.
  const uRanks = p.stream?.levelUps ? p.stream.levelUps.filter((l) => l.ab === 'U').length : null;
  const rank = r?.cooldown?.length ? Math.min(r.cooldown.length, Math.max(1, uRanks ?? r.cooldown.length)) : 0;
  const base = r?.cooldown?.length ? r.cooldown[rank - 1]! : null;
  const ult = r && base ? { name: r.display_name, base, rank, rankKnown: uRanks != null, endGame: cd(base, total + ultOnly), inFight: fightBonus ? cd(base, total + ultOnly + fightBonus.amount) : null } : null;

  const lines: string[] = [];
  const loadout = [lo.eternal ? `${lo.eternal}${minors.length ? ` (${minors.map((m) => m.name).join(' + ')})` : ''}` : '', lo.augment?.name ? `augment ${lo.augment.name}` : '', lo.crest ? `crest ${lo.crest}` : ''].filter(Boolean).join(', ');
  if (ult && (total || ultOnly)) {
    const pct = Math.round((1 - ult.endGame / ult.base) * 100);
    lines.push(`${ult.name} at ${ult.rankKnown ? `rank ${ult.rank}` : 'top rank'}: ${ult.base}s base, about ${ult.endGame}s by the end (${pct}% shorter) from ${total + ultOnly} ability haste: ${[...sources.map((s) => `${s.what} ${s.amount}`), ...(ultOnly ? [`ultimate haste ${ultOnly}`] : [])].join(', ')}.`);
    if (fightBonus && ult.inFight != null) lines.push(`Mid-fight, ${fightBonus.what} adds up to ${fightBonus.amount} more (${fightBonus.note}): ${ult.name} about ${ult.inFight}s (estimate).`);
  }
  for (const s of sources) if (s.note && /takedown/.test(s.note)) lines.push(`${s.what}: ${s.note}.`);
  if (fedBy.length) lines.push(`${td} takedowns (${p.kills} kills, ${p.assists} assists) fed: ${fedBy.map((x) => x.split(':')[0]).join(', ')}.`);
  for (const u of ultPlus) lines.push(`${u}.`.replace(/\.\.$/, '.'));
  // The lesson, from the same numbers: takedown-fed cooldowns, and healing an anti-heal item cuts.
  const fed = sources.find((x) => /takedown/.test(`${x.note ?? ''} ${x.how ?? ''}`));
  if (ult && fed) lines.unshift(`Lesson: takedowns were the fuel. Each one ${p.heroName} touched shortened ${ult.name}, so feeding early made it come back faster (about ${ult.endGame}s late${ult.inFight != null ? `, about ${ult.inFight}s mid-fight` : ''}); fight right after ${ult.name} is spent.`);
  if (ultPlus.some((u) => /heal/i.test(u)) || owned.some((sl) => (ctx.items.get(sl)?.stats?.magical_lifesteal ?? 0) + (ctx.items.get(sl)?.stats?.physical_lifesteal ?? 0) + (ctx.items.get(sl)?.stats?.omnivamp ?? 0) > 0)) lines.push('Their build heals off damage: anti-heal (the Tainted items) cuts it.');
  const heals = lines.some((l) => /anti-heal/.test(l));
  const pctU = ult ? Math.round((1 - ult.endGame / ult.base) * 100) : 0;
  const lesson = ult && fed ? `${p.heroName}'s takedowns fed ${ult.name}: every kill or assist made it come back sooner. Deny early takedowns and fight right after ${ult.name} is used.` : ult && pctU >= 25 ? `${ult.name} came back about every ${Math.round(ult.endGame)}s instead of ${ult.base}s by the end (${pctU}% shorter). Count it, and take fights while it is down.` : null;
  const card = {
    ult, takedowns: { count: td, kills: p.kills, assists: p.assists }, heals, lesson,
    haste: sources.map((x) => ({ name: x.what.replace(/ \(minor\)$/, ''), kind: x.kind ?? '', amount: x.amount, how: x.how ?? '' })),
    fight: fightBonus ? { name: fightBonus.what.replace(/ \(augment\)$/, ''), kind: 'augment', amount: fightBonus.amount, how: fightHow } : null,
    extras: extras.filter((x, i, a) => a.findIndex((y) => y.name === x.name && y.how === x.how) === i && !sources.some((h) => h.what.replace(/ \(minor\)$/, '') === x.name)),
  };
  return { hero: p.heroName, slug: p.heroSlug, takedowns: td, loadout, haste: { sources, total, fightBonus, ultOnly }, ult, fedBy, ultPlus, lines, card };
}

/** The minute the Nth takedown landed: kill times are known; assist times are spread evenly
 *  over the team's other kills (an estimate), so the answer is labelled as one. */
function capMinute(times: number[] | undefined, n: number): string {
  if (!times || times.length < n) return '';
  const t = [...times].sort((a, b) => a - b)[n - 1]!;
  return ` takedown, around ${Math.round(t)} min (estimate)`;
}

/** Takedown times for one enemy: their own kill minutes, plus their assists placed evenly over
 *  their team's other kills (assists are not timestamped). */
export function takedownTimes(slug: string, assists: number, kills: { min: number; killerSlug?: string; killerSide?: string }[], side: string): number[] {
  const mine = kills.filter((k) => k.killerSlug === slug).map((k) => k.min);
  const others = kills.filter((k) => k.killerSide === side && k.killerSlug !== slug).map((k) => k.min).sort((a, b) => a - b);
  const a = Math.min(assists, others.length);
  const picked = a ? Array.from({ length: a }, (_, i) => others[Math.floor(((i + 0.5) * others.length) / a)]!) : [];
  return [...mine, ...picked].sort((x, y) => x - y);
}
