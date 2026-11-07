// Team-comp rules (pure): tag each hero, sum each team's tags, and count win
// rates by comp shape from the lineups in data/aggregates/team-comps/
// (ingest/team-comps.ts). Read by `npm run comps` (zero-API).
//
// Hero tags, from committed data only:
//   class    one primary bucket from the catalog classes:
//            TANK (Tank/Warden) > BRUISER (Fighter) > ASSASSIN >
//            MARKSMAN (Sharpshooter or Executioner: Revenant, TwinBlast, Drongo,
//            Grim.exe are carry-lane damage, not frontline) > MAGE >
//            SUPPORT (Enchanter/Support/Catcher)
//   frontline TANK or BRUISER
//   engage   kit-profiles archetype names engage/initiator/tank/catch/pull/CC;
//            a hero with no profile counts when its class is TANK
//   diver    kit-profiles dive "high"; else DIVER_OVERRIDES; else ASSASSIN class
//   enchanter kit-profiles archetype "enchanter" or the Enchanter class
//
// Teams are labelled by STYLE: dive (3+ divers), brawl (3+ frontline),
// engage-peel (2+ engage and an enchanter), else mixed, checked in that order.
// These are descriptive buckets for reading the field, not recommendations.

export type HeroClass = 'TANK' | 'BRUISER' | 'ASSASSIN' | 'MARKSMAN' | 'MAGE' | 'SUPPORT';
export interface HeroTags { cls: HeroClass; frontline: boolean; engage: boolean; diver: boolean; enchanter: boolean }
export interface HeroInfo { slug: string; classes: string[] }
export interface KitProfile { archetype?: string; dive?: string }

// Heroes with no kit profile yet whose dive the maintainer has stated.
// Scarlett: a diver (maintainer, 2026-11-07).
export const DIVER_OVERRIDES: Record<string, boolean> = { scarlett: true };

const ENGAGE_WORDS = /engage|initiator|tank|catch|pull|\bcc\b|\(cc/i;

export function heroClass(classes: string[]): HeroClass {
  const c = new Set(classes);
  if (c.has('Tank') || c.has('Warden')) return 'TANK';
  if (c.has('Fighter')) return 'BRUISER';
  if (c.has('Assassin')) return 'ASSASSIN';
  if (c.has('Sharpshooter') || c.has('Executioner')) return 'MARKSMAN';
  if (c.has('Mage')) return 'MAGE';
  return 'SUPPORT';
}

export function tagHero(h: HeroInfo, profile?: KitProfile): HeroTags {
  const cls = heroClass(h.classes);
  const arch = profile?.archetype ?? '';
  return {
    cls,
    frontline: cls === 'TANK' || cls === 'BRUISER',
    engage: arch ? ENGAGE_WORDS.test(arch) : cls === 'TANK',
    diver: profile?.dive ? profile.dive === 'high' : DIVER_OVERRIDES[h.slug] ?? cls === 'ASSASSIN',
    enchanter: /enchanter/i.test(arch) || h.classes.includes('Enchanter'),
  };
}

export interface TeamTraits {
  frontline: number; tanks: number; assassins: number; engage: number; divers: number;
  enchanters: number; mages: number; marksmen: number; style: 'dive' | 'brawl' | 'engage-peel' | 'mixed';
}

export function teamTraits(heroes: string[], tags: Map<string, HeroTags>): TeamTraits | null {
  const t = heroes.map((h) => tags.get(h));
  if (t.some((x) => !x)) return null;
  const ts = t as HeroTags[];
  const n = (f: (x: HeroTags) => boolean) => ts.filter(f).length;
  const tr = {
    frontline: n((x) => x.frontline), tanks: n((x) => x.cls === 'TANK'), assassins: n((x) => x.cls === 'ASSASSIN'),
    engage: n((x) => x.engage), divers: n((x) => x.diver), enchanters: n((x) => x.enchanter),
    mages: n((x) => x.cls === 'MAGE'), marksmen: n((x) => x.cls === 'MARKSMAN'),
  };
  const style: TeamTraits['style'] = tr.divers >= 3 ? 'dive' : tr.frontline >= 3 ? 'brawl' : tr.engage >= 2 && tr.enchanters >= 1 ? 'engage-peel' : 'mixed';
  return { ...tr, style };
}

export interface Rate { n: number; w: number; wr: number; ci95: number }
export const rate = (n: number, w: number): Rate => ({ n, w, wr: n ? Math.round((1000 * w) / n) / 10 : 0, ci95: n ? Math.round(1960 * Math.sqrt(0.25 / n)) / 10 : 0 });

/** One team-side of a match, already tagged. */
export interface Side { matchId: string; win: boolean; traits: TeamTraits; enemy: TeamTraits; heroes: { hero: string; role: string }[]; plat: boolean }

const COUNT_KEYS = ['frontline', 'tanks', 'assassins', 'engage', 'divers', 'enchanters', 'mages', 'marksmen'] as const;

export interface CompReport {
  sides: number; matches: number;
  byCount: Record<string, Record<string, Rate>>;
  /** this team's count minus the enemy's, clamped to -2..+2 */
  byDiff: Record<string, Record<string, Rate>>;
  styles: Record<string, Rate>;
  /** row style vs column style, from the row team's side */
  styleVsStyle: Record<string, Record<string, Rate>>;
  /** shape = real tanks x high-dive kits, each capped at 2 ("2" = 2+): key shapeKey() */
  shapeGrid: Record<string, Rate>;
  /** lane pairs on the same team: "jungle+midlane" -> "khaimera+renna" */
  pairs: Record<string, { key: string; rate: Rate }[]>;
}

/** "1t2d" = 1 real tank, 2+ high-dive kits (both capped at 2). */
export const shapeKey = (t: Pick<TeamTraits, 'tanks' | 'divers'>) => `${Math.min(t.tanks, 2)}t${Math.min(t.divers, 2)}d`;

const PAIR_LANES: [string, string][] = [['carry', 'support'], ['jungle', 'midlane'], ['offlane', 'jungle']];

export function buildReport(sides: Side[], minN = 30, minPairN = 40): CompReport {
  const acc = <K extends string>(o: Record<K, { n: number; w: number }>, k: K, won: boolean) => { const c = (o[k] ??= { n: 0, w: 0 }); c.n++; if (won) c.w++; };
  const fin = (o: Record<string, { n: number; w: number }>, floor = minN) =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v.n >= floor).sort(([a], [b]) => (Number(a) - Number(b)) || a.localeCompare(b)).map(([k, v]) => [k, rate(v.n, v.w)]));
  const byCount: CompReport['byCount'] = {}, byDiff: CompReport['byDiff'] = {};
  for (const key of COUNT_KEYS) {
    const c: Record<string, { n: number; w: number }> = {}, d: Record<string, { n: number; w: number }> = {};
    for (const s of sides) {
      acc(c, String(s.traits[key]), s.win);
      const diff = Math.max(-2, Math.min(2, s.traits[key] - s.enemy[key]));
      acc(d, (diff > 0 ? '+' : '') + diff, s.win);
    }
    byCount[key] = fin(c);
    byDiff[key] = Object.fromEntries(Object.entries(fin(d)).sort(([a], [b]) => Number(a) - Number(b)));
  }
  const st: Record<string, { n: number; w: number }> = {};
  const grid: Record<string, { n: number; w: number }> = {};
  const svs: Record<string, Record<string, { n: number; w: number }>> = {};
  const pairAcc: Record<string, Record<string, { n: number; w: number }>> = {};
  for (const s of sides) {
    acc(st, s.traits.style, s.win);
    acc(grid, shapeKey(s.traits), s.win);
    acc((svs[s.traits.style] ??= {}), s.enemy.style, s.win);
    for (const [a, b] of PAIR_LANES) {
      const ha = s.heroes.find((h) => h.role === a)?.hero, hb = s.heroes.find((h) => h.role === b)?.hero;
      if (ha && hb) acc((pairAcc[`${a}+${b}`] ??= {}), `${ha}+${hb}`, s.win);
    }
  }
  const pairs: CompReport['pairs'] = {};
  for (const [lane, o] of Object.entries(pairAcc)) {
    pairs[lane] = Object.entries(o).filter(([, v]) => v.n >= minPairN).map(([key, v]) => ({ key, rate: rate(v.n, v.w) })).sort((x, y) => y.rate.wr - x.rate.wr);
  }
  return {
    sides: sides.length, matches: new Set(sides.map((s) => s.matchId)).size,
    byCount, byDiff, styles: fin(st),
    shapeGrid: Object.fromEntries(Object.entries(grid).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, rate(v.n, v.w)])),
    styleVsStyle: Object.fromEntries(Object.entries(svs).map(([k, v]) => [k, fin(v)])),
    pairs,
  };
}
