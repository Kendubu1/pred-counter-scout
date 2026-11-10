// The loadout, piece by piece (pure): augment, Eternal, both minors and crest for any player, so
// every high performer is read to the same depth (2026-11-09 audit: only 51% of augments and 54% of
// minors were explained, because the build read only recognised a few effect patterns).
//
// For each piece: what it does (catalog text), the ability it changes (augments name one in 135 of
// 192 cases) with that ability's cooldown at the end of the game, numbers evaluated for this game
// (per-minute growth at the game's length, per-level ranges at the player's level, "reduces the
// cooldown of X by N% / Ns" applied to X), and how it does on this hero-role this patch (pick share
// and win rate against the hero-role's own, from the daily public-stream counts). Catalog text is
// not measured uptime.

export interface LrAbility { key?: string; display_name: string; cooldown?: number[]; menu_description?: string | null; game_description?: string | null }
export interface LrPiece {
  kind: 'augment' | 'Eternal' | 'minor' | 'crest';
  name: string; text: string;
  ability: { name: string; key: string; what: string; cd: number | null; cdHaste: number | null } | null;
  numbers: string[];
  field: { wr: number; n: number; share: number | null; base: number; verdict: 'above' | 'level' | 'below' } | null;
}

const plain = (t: unknown) => String(t ?? '').replace(/<[^>]+>/g, '').replace(/\{[^}]*\}/g, '').replace(/\s*•\s*/g, ' ').replace(/\s+/g, ' ').trim();
const first = (t: string) => (t.split(/(?<=\.)\s+/)[0] ?? t).trim();
const r1 = (x: number) => Math.round(x * 10) / 10;
const pct = (w: number, n: number) => Math.round((1000 * w) / n) / 10;

/** Numbers in a piece's text worked out for this game. */
export function evaluate(text: string, g: { durationMin: number; level: number; takedowns?: number; ability?: { name: string; cd: number | null; cdHaste: number | null } | null }): string[] {
  const out: string[] = [];
  // "7% (+0.4% per minute)" at the game's length
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)% \(\+(\d+(?:\.\d+)?)% per minute\)/gi)) out.push(`${m[1]}% growing ${m[2]}% a minute: about ${r1(Number(m[1]) + Number(m[2]) * g.durationMin)}% by the end (${Math.round(g.durationMin)} min)`);
  // "10-34% ... Increases with Hero Level" at the player's level (linear between level 1 and 18)
  const lv = /(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)%[^.]*?\.?[^.]*increases with (?:hero )?level/i.exec(text);
  if (lv) out.push(`${lv[1]}-${lv[2]}% by level: about ${r1(Number(lv[1]) + ((Number(lv[2]) - Number(lv[1])) * (g.level - 1)) / 17)}% at level ${g.level}`);
  // "1.5 (+0.4 per level)" at the player's level
  for (const m of text.matchAll(/(\d+(?:\.\d+)?) \(\+(\d+(?:\.\d+)?) per level\)/gi)) out.push(`${m[1]} + ${m[2]} a level: ${r1(Number(m[1]) + Number(m[2]) * g.level)} at level ${g.level}`);
  // random procs every N minutes (and every takedown): how many this game, each option's expected count
  const rnd = /every (\d+) minutes?( and every takedown)? randomly grants (.+?)(?:\.(?=\s|$)|$)/i.exec(text);
  if (rnd) {
    const opts = rnd[3]!.split(/,\s*(?:or\s+)?|\s+or\s+/).map((x) => x.trim()).filter(Boolean);
    const procs = Math.floor(g.durationMin / Number(rnd[1])) + (rnd[2] ? g.takedowns ?? 0 : 0);
    const each = procs / opts.length;
    const totals = opts.map((o) => { const m = /^\+?(\d+(?:\.\d+)?)(%?)\s*(.+)$/.exec(o); return m ? `about +${r1(Number(m[1]) * each)}${m[2]} ${m[3].toLowerCase()}` : o; });
    out.push(`${procs} random bonuses this game (every ${rnd[1]} min${rnd[2] ? ` plus ${g.takedowns ?? 0} takedowns` : ''}), 1 in ${opts.length} each: ${totals.join(', ')} (expected)`);
  }
  // "per Level" flat scaling
  for (const m of text.matchAll(/(\d+(?:\.\d+)?) ([A-Za-z ]{3,30}?) per level/gi)) out.push(`${m[1]} ${m[2].trim().toLowerCase()} per level: ${r1(Number(m[1]) * g.level)} at level ${g.level}`);
  // cooldown cuts on the named ability
  if (g.ability && g.ability.cdHaste) {
    const p = /reduces? (?:the |its own )?cooldown(?: of [A-Za-z' ]+?)? by (\d+(?:\.\d+)?)%/i.exec(text);
    const s = /reduces? (?:the |its own )?cooldown(?: of [A-Za-z' ]+?)? by (\d+(?:\.\d+)?)s/i.exec(text);
    if (p) out.push(`${g.ability.name}: ${g.ability.cdHaste}s cooldown with this player's haste; each trigger takes ${p[1]}% off what is left`);
    if (s) out.push(`${g.ability.name}: ${g.ability.cdHaste}s cooldown with this player's haste; each trigger takes ${s[1]}s off (${Math.round((100 * Number(s[1])) / g.ability.cdHaste)}% of it)`);
  }
  return out;
}

export function loadoutRead(
  p: { heroSlug: string; heroName: string; role: string; loadout?: { eternal?: string; minor1?: string; minor2?: string; augment?: { id: string; name: string } | null; crest?: string; crestSlug?: string } | null },
  ctx: {
    abilities: LrAbility[];
    eternals: { name: string; major: string; minorSlot1: { name: string; desc: string }[]; minorSlot2: { name: string; desc: string }[] }[];
    augments: Record<string, { name: string; description: string; hero?: string }>;
    items: Map<string, { display_name?: string; name?: string; effects?: { name?: string; condition?: string | null; menu_description?: string | null }[] }>;
    haste: number; ultHaste?: number; level: number; durationMin: number; ultRank?: number | null; takedowns?: number;
    field?: { games: number; wins: number; augments?: { id?: string; name: string; n: number; w: number }[]; eternals?: { name: string; n: number; w: number; minor1?: { name: string; n: number; w: number }[]; minor2?: { name: string; n: number; w: number }[] }[]; crests?: { name?: string; slug?: string; n: number; w: number }[] } | null;
  },
): LrPiece[] {
  const lo = p.loadout ?? {};
  const fd = ctx.field;
  const base = fd && fd.games ? pct(fd.wins, fd.games) : null;
  const fieldOf = (row: { n: number; w: number } | undefined, total: number | null): LrPiece['field'] => {
    if (!row || row.n < 30 || base == null) return null;
    const wr = pct(row.w, row.n), d = wr - base;
    return { wr, n: row.n, share: total ? Math.round((100 * row.n) / total) : null, base, verdict: d >= 1 ? 'above' : d <= -1 ? 'below' : 'level' };
  };
  const abilityIn = (text: string): LrPiece['ability'] => {
    const a = [...ctx.abilities].filter((x) => x.display_name && x.display_name.length > 2 && text.includes(x.display_name)).sort((x, y) => y.display_name.length - x.display_name.length)[0];
    if (!a) return null;
    const cds = a.cooldown ?? [];
    const rank = a.key === 'R' && ctx.ultRank ? Math.min(cds.length, ctx.ultRank) : cds.length;
    const cd = cds.length ? cds[rank - 1]! : null;
    const haste = ctx.haste + (a.key === 'R' ? ctx.ultHaste ?? 0 : 0);
    return { name: a.display_name, key: a.key ?? '', what: first(plain(a.menu_description ?? a.game_description)), cd, cdHaste: cd ? r1((cd * 100) / (100 + haste)) : null };
  };
  const g = (ability: LrPiece['ability']) => ({ durationMin: ctx.durationMin, level: ctx.level, takedowns: ctx.takedowns, ability });
  const out: LrPiece[] = [];
  const aug = lo.augment ? ctx.augments[lo.augment.id] : undefined;
  if (lo.augment) {
    const text = plain(aug?.description ?? '');
    const ab = abilityIn(text);
    const augTotal = (fd?.augments ?? []).reduce((a, x) => a + x.n, 0);
    out.push({ kind: 'augment', name: lo.augment.name, text: text || 'No catalog text for this augment.', ability: ab, numbers: evaluate(text, g(ab)), field: fieldOf((fd?.augments ?? []).find((x) => x.id === lo.augment!.id || x.name === lo.augment!.name), augTotal || null) });
  }
  const et = ctx.eternals.find((e) => e.name === lo.eternal);
  if (lo.eternal) {
    const text = plain(et?.major ?? '');
    const fe = (fd?.eternals ?? []).find((x) => x.name === lo.eternal);
    const etTotal = (fd?.eternals ?? []).reduce((a, x) => a + x.n, 0);
    out.push({ kind: 'Eternal', name: lo.eternal, text: text || 'No catalog text for this Eternal.', ability: null, numbers: evaluate(text, g(null)), field: fieldOf(fe, etTotal || null) });
    for (const [slot, mn] of [['minor1', lo.minor1], ['minor2', lo.minor2]] as const) {
      if (!mn) continue;
      const m = et ? [...et.minorSlot1, ...et.minorSlot2].find((x) => x.name === mn) : undefined;
      const mt = plain(m?.desc ?? '');
      const ab = abilityIn(mt);
      const rows = (fe?.[slot] ?? []) as { name: string; n: number; w: number }[];
      out.push({ kind: 'minor', name: mn, text: mt || 'No catalog text for this minor.', ability: ab, numbers: evaluate(mt, g(ab)), field: fieldOf(rows.find((x) => x.name === mn), rows.reduce((a, x) => a + x.n, 0) || null) });
    }
  }
  if (lo.crest) {
    const it = lo.crestSlug ? ctx.items.get(lo.crestSlug) : undefined;
    const text = (it?.effects ?? []).map((e) => `${e.name ? `${e.name}: ` : ''}${plain(e.condition)} ${plain(e.menu_description)}`.trim()).filter((t) => t && !/^(damage dealt|health restored)/i.test(t)).join(' ');
    const crTotal = (fd?.crests ?? []).reduce((a, x) => a + x.n, 0);
    out.push({ kind: 'crest', name: lo.crest, text: text || 'No catalog text for this crest.', ability: null, numbers: evaluate(text, g(null)), field: fieldOf((fd?.crests ?? []).find((x) => x.name === lo.crest || x.slug === lo.crestSlug), crTotal || null) });
  }
  return out;
}
