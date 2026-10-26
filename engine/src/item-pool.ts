// The wider item pool per hero: what players build BEYOND the three-item core
// the Builds card shows, so the page can say "and here is what else this hero
// commonly picks up, and when". Zero-API, deterministic, from committed data:
//
//   finished   — the daily match samples (data/aggregates/<date>.json, written
//                by `npm run aggregate`): every item in a player's END-OF-GAME
//                inventory, per hero, with wins. Hero-wide (the sample has no
//                per-role inventory). Only non-overlapping windows of the
//                current patch are summed, so no match is counted twice.
//   core       — build-matchups.json (ranked match stream): per hero-role,
//                the share of players with the item among their FIRST THREE
//                completed items, all ranks and Plat+ (rank at match time).
//
// The page drops whatever the open build already shows and groups the rest
// into core swaps, late finishers and situational answers.

export interface NW { n: number; w: number }
export interface DailyWindow { file: string; from: string; to: string; versions: Record<string, number> }
export interface DailyAggregate {
  meta: { window: { from: string; to: string }; versions?: Record<string, number>; modes?: string[] };
  heroes: Record<string, { games: number; wins: number; byRole?: Record<string, NW>; items?: Record<string, NW> }>;
}
export interface CatalogItem {
  game_id: number; slug: string; name: string; display_name?: string; rarity: string; slot_type: string;
  aggression_type?: string; total_price: number;
}
export interface CoreCell { n: number; i: Record<string, number>; p?: { n: number; i: Record<string, number> } }

export interface PoolItem {
  slug: string; name: string;
  /** End-of-game inventories (hero-wide sample) that held it, and their wins. */
  n: number; w: number;
  /** n / hero games in the sample. */
  share: number;
  /** Share of this hero-role's first-three-item cores that included it (all ranks / Plat+). */
  core: Record<string, number>;
  corePlat: Record<string, number>;
  tag: string | null;
}
export interface HeroPool { games: number; wins: number; roleShare: Record<string, number>; coreGames: Record<string, number>; coreGamesPlat: Record<string, number>; items: PoolItem[] }

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** Newest-first, keep each window that overlaps none already kept; current patch only. */
export function pickWindows(windows: DailyWindow[], patch: string): DailyWindow[] {
  const kept: DailyWindow[] = [];
  const onPatch = windows.filter((w) => {
    const v = Object.keys(w.versions || {});
    return v.length > 0 && v.every((x) => x === patch);
  }).sort((a, b) => Date.parse(b.to) - Date.parse(a.to));
  for (const w of onPatch) {
    const f = Date.parse(w.from), t = Date.parse(w.to);
    if (kept.every((k) => t <= Date.parse(k.from) || f >= Date.parse(k.to))) kept.push(w);
  }
  return kept;
}

// What a situational item answers, from the catalog's aggression type. Only
// types that name an enemy threat get a tag; plain offense items get none.
export const SITUATIONAL: Record<string, string> = {
  AntiHeal: 'into healing and lifesteal',
  AntiShield: 'into shields',
  AntiTank: 'into tanks and high-health frontliners',
  PhysicalShred: 'into armor stacking',
  MagicalShred: 'into magic-armor stacking',
  AntiMagic: 'into heavy magical damage',
  SpellShield: 'into burst mages and pick abilities',
  AntiBurst: 'into burst',
  AntiCrit: 'into crit carries',
  AntiDisruption: 'into crowd control',
  Cleanse: 'into crowd control',
  Stasis: 'into dives and all-in burst',
  Defense: 'when you are being focused',
  ReflectDamage: 'into auto-attack carries',
};

export function itemPool(
  dailies: DailyAggregate[],
  cores: Record<string, { all: CoreCell }>,
  catalog: CatalogItem[],
  opts: { minShare?: number; minCoreShare?: number; maxItems?: number } = {},
): Record<string, HeroPool> {
  const minShare = opts.minShare ?? 0.04, minCore = opts.minCoreShare ?? 0.04, maxItems = opts.maxItems ?? 24;
  const byId = new Map(catalog.map((it) => [String(it.game_id), it]));
  const bySlug = new Map(catalog.map((it) => [it.slug, it]));
  // Finished Epic items only: crests, wards, potions and components are not "build" items.
  const isBuildItem = (it: CatalogItem | undefined): it is CatalogItem => !!it && it.rarity === 'Epic' && it.slot_type !== 'Crest' && it.total_price >= 1000;

  const heroes: Record<string, { games: number; wins: number; roles: Record<string, number>; items: Map<string, NW> }> = {};
  for (const d of dailies) {
    for (const [slug, h] of Object.entries(d.heroes || {})) {
      const acc = (heroes[slug] ??= { games: 0, wins: 0, roles: {}, items: new Map() });
      acc.games += h.games || 0; acc.wins += h.wins || 0;
      for (const [r, c] of Object.entries(h.byRole || {})) acc.roles[r] = (acc.roles[r] || 0) + (c.n || 0);
      for (const [id, c] of Object.entries(h.items || {})) {
        const it = byId.get(id);
        if (!isBuildItem(it)) continue;
        const prev = acc.items.get(it.slug) || { n: 0, w: 0 };
        acc.items.set(it.slug, { n: prev.n + c.n, w: prev.w + c.w });
      }
    }
  }

  // Core shares per hero-role (all ranks + Plat+).
  const coreBy: Record<string, Record<string, { all: CoreCell }>> = {};
  for (const [k, v] of Object.entries(cores)) {
    const [slug, role] = k.split('|');
    if (slug && role && v && v.all) (coreBy[slug] ??= {})[role] = v;
  }

  const out: Record<string, HeroPool> = {};
  for (const slug of new Set([...Object.keys(heroes), ...Object.keys(coreBy)])) {
    const h = heroes[slug] || { games: 0, wins: 0, roles: {}, items: new Map<string, NW>() };
    const roleCells = coreBy[slug] || {};
    const roleTotal = Object.values(h.roles).reduce((s, n) => s + n, 0);
    const slugs = new Set<string>([...h.items.keys()]);
    for (const c of Object.values(roleCells)) for (const s of Object.keys(c.all.i || {})) if (isBuildItem(bySlug.get(s))) slugs.add(s);
    const items: PoolItem[] = [];
    for (const s of slugs) {
      const it = bySlug.get(s)!;
      const fin = h.items.get(s) || { n: 0, w: 0 };
      const core: Record<string, number> = {}, corePlat: Record<string, number> = {};
      for (const [role, c] of Object.entries(roleCells)) {
        if (c.all.n && c.all.i?.[s]) core[role] = r3(c.all.i[s]! / c.all.n);
        if (c.all.p?.n && c.all.p.i?.[s]) corePlat[role] = r3(c.all.p.i[s]! / c.all.p.n);
      }
      const share = h.games ? fin.n / h.games : 0;
      if (share < minShare && !Object.values(core).some((x) => x >= minCore)) continue;
      items.push({
        slug: s, name: it.display_name || it.name, n: fin.n, w: fin.w, share: r3(share), core, corePlat,
        tag: (it.aggression_type && SITUATIONAL[it.aggression_type]) || null,
      });
    }
    items.sort((a, b) => (b.share + Math.max(0, ...Object.values(b.core))) - (a.share + Math.max(0, ...Object.values(a.core))));
    out[slug] = {
      games: h.games, wins: h.wins,
      roleShare: Object.fromEntries(Object.entries(h.roles).map(([r, n]) => [r, roleTotal ? r3(n / roleTotal) : 0])),
      coreGames: Object.fromEntries(Object.entries(roleCells).map(([r, c]) => [r, c.all.n])),
      coreGamesPlat: Object.fromEntries(Object.entries(roleCells).filter(([, c]) => c.all.p?.n).map(([r, c]) => [r, c.all.p!.n])),
      items: items.slice(0, maxItems),
    };
  }
  return out;
}
