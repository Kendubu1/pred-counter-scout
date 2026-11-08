// Team damage mix for one reviewed game (pure): each team's hero damage split physical / magical /
// true (players[i].stream.dealtToHeroes, saved from the pred.gg match stream), where the true
// damage came from (each player with 5%+ of their own hero damage as true: the items, crest,
// Eternal, minors, augment and abilities whose catalog text deals true damage), and the patch's
// win rate for a team with that magical share; and per team, who built armor of each type
// against the damage that team faced (final items with physical_armor / magical_armor) (hero-role-norms.json teamMix; an association,
// since damage dealt follows how the game went).

export interface Mix { physical: number; magical: number; true: number; total: number }
export interface ArmorRead { faced: 'physical' | 'magical' | 'mixed'; physical: string[]; magical: string[]; of: number }
export interface TrueSource { hero: string; us: boolean; amount: number; share: number; from: { name: string; kind: string }[] }
export interface DamageMix {
  us: Mix; them: Mix; trueFrom: TrueSource[];
  /** per team: who built armor of each type, read against the damage that team faced */
  armor: { us: ArmorRead; them: ArmorRead };
  field: { us: { wr: number; n: number; band: string } | null; them: { wr: number; n: number; band: string } | null; best: string } | null;
}

const plain = (t: unknown) => String(t ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
const TRUE = /true damage/i;

export function damageMix(
  players: { us: boolean; heroName: string; heroSlug: string; items?: { slug: string }[]; loadout?: { eternal?: string; minor1?: string; minor2?: string; augment?: { id: string; name: string } | null; crestSlug?: string } | null; stream?: { dealtToHeroes: { physical: number; magical: number; true: number } } | null }[],
  ctx: {
    items: Map<string, { display_name?: string; name?: string; slug: string; stats?: Record<string, number>; effects?: { condition?: string | null; menu_description?: string | null }[] }>;
    eternals: { name: string; major: string; minorSlot1: { name: string; desc: string }[]; minorSlot2: { name: string; desc: string }[] }[];
    augments: Record<string, { name: string; description: string }>;
    abilities: Map<string, { display_name: string; menu_description?: string | null; game_description?: string | null }[]>;
    teamMix?: { magical: { from: number; to: number; n: number; w: number }[] } | null;
  },
): DamageMix | null {
  if (!players.every((p) => p.stream)) return null;
  const sum = (us: boolean): Mix => {
    const m = { physical: 0, magical: 0, true: 0, total: 0 };
    for (const p of players.filter((x) => x.us === us)) { const d = p.stream!.dealtToHeroes; m.physical += d.physical; m.magical += d.magical; m.true += d.true; }
    m.total = m.physical + m.magical + m.true;
    return m;
  };
  const us = sum(true), them = sum(false);
  const trueFrom: TrueSource[] = [];
  for (const p of players) {
    const d = p.stream!.dealtToHeroes, tot = d.physical + d.magical + d.true;
    if (!tot || d.true / tot < 0.05) continue;
    const from: TrueSource['from'] = [];
    const lo = p.loadout ?? {};
    for (const slug of [...(p.items ?? []).map((i) => i.slug), ...(lo.crestSlug ? [lo.crestSlug] : [])]) {
      const it = ctx.items.get(slug);
      if (it && (it.effects ?? []).some((e) => TRUE.test(`${plain(e.condition)} ${plain(e.menu_description)}`))) from.push({ name: it.display_name ?? it.name ?? slug, kind: slug === lo.crestSlug ? 'crest' : 'item' });
    }
    const et = ctx.eternals.find((e) => e.name === lo.eternal);
    if (et && TRUE.test(et.major)) from.push({ name: et.name, kind: 'Eternal' });
    for (const m of et ? [...et.minorSlot1, ...et.minorSlot2].filter((x) => x.name === lo.minor1 || x.name === lo.minor2) : []) if (TRUE.test(m.desc)) from.push({ name: m.name, kind: 'Eternal minor' });
    const aug = lo.augment ? ctx.augments[lo.augment.id] : undefined;
    if (aug && TRUE.test(aug.description)) from.push({ name: aug.name, kind: 'augment' });
    for (const a of ctx.abilities.get(p.heroSlug) ?? []) if (TRUE.test(plain(a.menu_description ?? a.game_description))) from.push({ name: a.display_name, kind: 'ability' });
    trueFrom.push({ hero: p.heroName, us: p.us, amount: d.true, share: Math.round((100 * d.true) / tot), from });
  }
  trueFrom.sort((a, b) => b.amount - a.amount);
  let field: DamageMix['field'] = null;
  const bands = ctx.teamMix?.magical ?? [];
  if (bands.length) {
    const at = (m: Mix) => { if (!m.total) return null; const b = bands[Math.min(bands.length - 1, Math.floor((10 * m.magical) / m.total))]!; return b.n >= 100 ? { wr: Math.round((1000 * b.w) / b.n) / 10, n: b.n, band: `${b.from}-${b.to}% magical` } : null; };
    const best = [...bands].filter((b) => b.n >= 1000).sort((a, b) => b.w / b.n - a.w / a.n)[0];
    field = { us: at(us), them: at(them), best: best ? `${best.from}-${best.to}% magical (${Math.round((1000 * best.w) / best.n) / 10}% win)` : '' };
  }
  // Armor against the damage each team faced (the other team's mix): who built which type.
  const armorOf = (us: boolean, faced: Mix): ArmorRead => {
    const side = players.filter((p) => p.us === us);
    const has = (p: (typeof players)[number], k: string) => (p.items ?? []).some((i) => (ctx.items.get(i.slug)?.stats?.[k] ?? 0) > 0);
    const mag = faced.total ? faced.magical / faced.total : 0, phy = faced.total ? faced.physical / faced.total : 0;
    return { faced: mag >= 0.55 ? 'magical' : phy >= 0.55 ? 'physical' : 'mixed', physical: side.filter((p) => has(p, 'physical_armor')).map((p) => p.heroName), magical: side.filter((p) => has(p, 'magical_armor')).map((p) => p.heroName), of: side.length };
  };
  return { us, them, trueFrom, armor: { us: armorOf(true, them), them: armorOf(false, us) }, field };
}
