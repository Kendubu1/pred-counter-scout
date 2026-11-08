// Why a build worked (pure), for learning from it and maybe copying it:
//
//   stacks    effects that share a trigger, read from the catalog text of the player's items,
//             crest, Eternal, minors and augment: every ability hit, every basic attack, every
//             takedown, % of the target's health, enemies below a health line, healing. Two or
//             more on one trigger is a stack. The kit says how often it fires (abilities that
//             deal damage, how many hit an area) and ability haste says how much more often
//             (cooldown x 100 / (100 + haste), verified).
//   countered what the other team did about it: armor of the damage type on the players it
//             killed, anti-heal against a healing build, the deaths it took
//   copy      the same Eternal + minors and the same 3-item core across this patch for that
//             hero-role (predgg-augments / predgg-builds, the daily public-stream counts): the pair
//             against the hero-role's win rate, the core against all of its cores; each part gets
//             its own above / level / below, then proven, mixed, standard or beat-us
// Effects are catalog text, not measured procs.

export type Family = 'ability' | 'attack' | 'takedown' | 'pctHealth' | 'lowHealth' | 'heal';
export interface Member { name: string; kind: string; text: string }
export interface Why {
  stacks: { family: Family; title: string; members: Member[]; text: string }[];
  eternalPart: string | null;
  countered: { ok: boolean; text: string }[];
  copy: { text: string; verdict: 'proven' | 'standard' | 'beat-us' | 'unknown' } | null;
}

const plain = (t: unknown) => String(t ?? '').replace(/<[^>]+>/g, '').replace(/\{[^}]*\}/g, '').replace(/\s*•\s*/g, ' ').replace(/\s+/g, ' ').trim();
const FAM: [Family, RegExp][] = [
  ['ability', /on dealing ability damage|ability damage dealt|abilities deal|on ability hit|ability hits?/i],
  ['attack', /basic attacks?|on[- ]hit\b|on attacking/i],
  ['takedown', /takedown/i],
  ['pctHealth', /% of (?:the )?(?:target'?s?|their) (?:max(?:imum)?|current|bonus|missing) health/i],
  ['lowHealth', /below \d+% health/i],
  ['heal', /\bheal(?:s|ing|ed)?\b|lifesteal|omnivamp/i],
];
const TITLE: Record<Family, string> = { ability: 'Every ability hit set off', attack: 'Every basic attack set off', takedown: 'Every takedown fed', pctHealth: 'Damage that scales with our health', lowHealth: 'Finishing damage on low-health targets', heal: 'Healing off the damage' };
const pct = (w: number, n: number) => Math.round((1000 * w) / n) / 10;

export function buildWhy(
  p: { heroName: string; role: string; deaths: number; items?: { slug: string }[]; loadout?: { eternal?: string; minor1?: string; minor2?: string; augment?: { id: string; name: string } | null; crestSlug?: string; crest?: string } | null },
  ctx: {
    items: Map<string, { slug: string; display_name?: string; name?: string; stats?: Record<string, number>; effects?: { name?: string; condition?: string | null; menu_description?: string | null }[] }>;
    eternals: { name: string; major: string; minorSlot1: { name: string; desc: string }[]; minorSlot2: { name: string; desc: string }[] }[];
    augments: Record<string, { name: string; description: string }>;
    kit: { key: string; name: string; damage: boolean; aoe: boolean }[];
    haste: number; damageType: 'magical' | 'physical';
    /** the other team: what they built, and how often this player killed each */
    foes: { hero: string; items: { slug: string }[]; diedTo: number }[];
    healingPct?: number | null;
    field?: { games: number; wins: number; eternal?: { name: string; n: number; w: number; pair?: { n: number; w: number } } | null; core?: { n: number; w: number } | null; coreBase?: { n: number; w: number } | null } | null;
  },
): Why {
  const lo = p.loadout ?? {};
  const nm = (it: { display_name?: string; name?: string; slug: string }) => it.display_name ?? it.name ?? it.slug;
  const sources: Member[] = [];
  for (const slug of [...(p.items ?? []).map((i) => i.slug), ...(lo.crestSlug ? [lo.crestSlug] : [])]) {
    const it = ctx.items.get(slug);
    if (!it) continue;
    for (const e of it.effects ?? []) {
      const text = `${plain(e.condition)} ${plain(e.menu_description)}`.trim();
      if (text && !/^(damage dealt|health restored|mana restored)\b/i.test(text)) sources.push({ name: nm(it), kind: slug === lo.crestSlug ? 'crest' : 'item', text });
    }
    if ((it.stats?.lifesteal ?? 0) + (it.stats?.magical_lifesteal ?? 0) + (it.stats?.omnivamp ?? 0) > 0) sources.push({ name: nm(it), kind: 'item', text: 'lifesteal' });
  }
  const et = ctx.eternals.find((e) => e.name === lo.eternal);
  if (et) sources.push({ name: et.name, kind: 'Eternal', text: plain(et.major) });
  const minors = et ? [...et.minorSlot1, ...et.minorSlot2].filter((m) => m.name === lo.minor1 || m.name === lo.minor2) : [];
  for (const m of minors) sources.push({ name: m.name, kind: 'Eternal minor', text: plain(m.desc) });
  const aug = lo.augment ? ctx.augments[lo.augment.id] : undefined;
  if (aug) sources.push({ name: aug.name, kind: 'augment', text: plain(aug.description) });
  // A minor that changes the major ("The major also deals ...") belongs to the major's trigger.
  const majorFam = et ? FAM.filter(([, re]) => re.test(et.major)).map(([f]) => f) : [];
  const famOf = (m: Member) => { const fs = FAM.filter(([, re]) => re.test(m.text)).map(([f]) => f); return /^the major\b/i.test(m.text) ? [...new Set([...fs, ...majorFam])] : fs; };

  const dmgAb = ctx.kit.filter((a) => a.damage && a.key !== 'LMB' && a.key !== 'Passive');
  const aoeAb = dmgAb.filter((a) => a.aoe);
  const fewer = ctx.haste ? Math.round((1 - 100 / (100 + ctx.haste)) * 100) : 0;
  const stacks: Why['stacks'] = [];
  for (const [f] of FAM) {
    const members = sources.filter((m) => famOf(m).includes(f));
    const uniq = members.filter((m, i, a) => a.findIndex((x) => x.name === m.name) === i);
    if (uniq.length < 2) continue;
    const names = uniq.map((m) => m.name).join(', ');
    let text = `${uniq.length} effects on one trigger: ${names}.`;
    if (f === 'ability') text += ` ${p.heroName} has ${dmgAb.length} damaging abilities${aoeAb.length ? ` (${aoeAb.map((a) => a.name).join(', ')} hit an area, so one cast sets them off on several heroes)` : ''}${fewer ? `, and ${ctx.haste} ability haste brought them back ${fewer}% sooner: more casts, more triggers` : ''}.`;
    if (f === 'pctHealth') text += ' The more health a target stacks, the more these deal, so health items on our side fed them.';
    if (f === 'takedown') text += ' Each kill or assist made the next fight easier.';
    if (f === 'lowHealth') text += ' Once a fight started going their way, these finished it.';
    stacks.push({ family: f, title: TITLE[f], members: uniq, text });
  }
  stacks.sort((a, b) => b.members.length - a.members.length);
  const etInStack = stacks.filter((s) => s.members.some((m) => m.kind === 'Eternal' || m.kind === 'Eternal minor'));
  const eternalPart = et && etInStack.length ? `The Eternal was part of it: ${et.name}${minors.length ? ` (${minors.map((m) => m.name).join(' + ')})` : ''} sits on the same trigger${etInStack.length > 1 ? 's' : ''} as the items (${etInStack.map((s) => s.title.toLowerCase()).join('; ')}), so the same hits paid out twice.` : null;

  // Did we counter it?
  const countered: Why['countered'] = [];
  const armorKey = `${ctx.damageType}_armor`;
  const hit = ctx.foes.filter((f) => f.diedTo > 0).sort((a, b) => b.diedTo - a.diedTo);
  if (hit.length) {
    const built = hit.filter((f) => f.items.some((i) => (ctx.items.get(i.slug)?.stats?.[armorKey] ?? 0) > 0));
    countered.push({ ok: built.length === hit.length, text: `${built.length} of the ${hit.length} players ${p.heroName} killed built ${ctx.damageType} armor${built.length ? ` (${built.map((f) => f.hero).join(', ')})` : ''}.` });
  }
  if (stacks.some((s) => s.family === 'heal') || (ctx.healingPct ?? 0) >= 75) {
    const anti = ctx.foes.filter((f) => f.items.some((i) => i.slug.startsWith('tainted-')));
    countered.push({ ok: anti.length > 0, text: anti.length ? `Anti-heal on ${anti.map((f) => f.hero).join(', ')}.` : 'No anti-heal on the team against a build that heals.' });
  }
  if (stacks.some((s) => s.family === 'pctHealth')) {
    const tanky = hit.filter((f) => f.items.some((i) => (ctx.items.get(i.slug)?.stats?.max_health ?? 0) >= 300));
    if (tanky.length) countered.push({ ok: false, text: `Health items on ${tanky.map((f) => f.hero).join(', ')} raised the %-health damage they took.` });
  }
  countered.push({ ok: p.deaths >= 4, text: `We killed ${p.heroName} ${p.deaths} time${p.deaths === 1 ? '' : 's'}.` });

  // Can we copy it? The Eternal pair against the hero-role's own rate; the core against all of
  // that hero-role's cores (core rates run high: finishing three items means a longer game).
  let copy: Why['copy'] = null;
  const fd = ctx.field;
  if (fd && fd.games >= 100) {
    const base = pct(fd.wins, fd.games);
    const parts: string[] = [];
    const verdicts: number[] = [];
    const e = fd.eternal;
    if (e && e.n >= 100) {
      const src = e.pair && e.pair.n >= 100 ? e.pair : e;
      const wr = pct(src.w, src.n), d = Math.round((wr - base) * 10) / 10;
      verdicts.push(d);
      parts.push(`${e.name}${e.pair && e.pair.n >= 100 && minors.length ? ` (${minors.map((m) => m.name).join(' + ')})` : ''}: ${wr}% in ${src.n.toLocaleString('en-US')} ${p.heroName} ${p.role} games, ${d >= 1 ? 'above' : d <= -1 ? 'below' : 'level with'} the hero's ${base}%`);
    }
    if (fd.core && fd.core.n >= 50 && fd.coreBase && fd.coreBase.n) {
      const wr = pct(fd.core.w, fd.core.n), cb = pct(fd.coreBase.w, fd.coreBase.n), d = Math.round((wr - cb) * 10) / 10;
      verdicts.push(d);
      parts.push(`this 3-item core: ${wr}% in ${fd.core.n.toLocaleString('en-US')} games, ${d >= 1 ? 'above' : d <= -1 ? 'below' : 'level with'} the ${cb}% of that hero-role's cores`);
    }
    if (parts.length) {
      const up = verdicts.filter((d) => d >= 1).length, down = verdicts.filter((d) => d <= -1).length;
      const verdict = up && !down ? 'proven' : down && !up ? 'beat-us' : 'standard';
      copy = { verdict, text: `${parts.join('; ')}. ${verdict === 'proven' ? 'Proven this patch: worth copying.' : verdict === 'beat-us' ? 'It wins less than usual elsewhere: it beat us, not the field.' : up && down ? 'Mixed: copy the part that wins, not the whole setup.' : 'A standard setup: what made it work was this game, not a secret build.'}` };
    }
  }
  if (!copy) copy = { verdict: 'unknown', text: `Too few ${p.heroName} ${p.role} games with this Eternal or core this patch to say whether it wins elsewhere.` };
  return { stacks, eternalPart, countered, copy };
}
