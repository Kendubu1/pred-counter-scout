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
    // A real tank is never counted as a diver, even with a high-dive kit (Kaelen, 2026-11-08): the
    // diver read is about heroes that leave the front line empty, which a tank does not.
    diver: cls !== 'TANK' && (profile?.dive ? profile.dive === 'high' : DIVER_OVERRIDES[h.slug] ?? cls === 'ASSASSIN'),
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

/** Kit features of one team, from data/game-data/kit-index.json (catalog-scanned). */
export interface KitTraits { hardCC: number; longCC: number; mobility: number; unstoppable: number; healers: number; magical: number; cleanse: number }
export function kitTraits(heroes: string[], kit: Record<string, { abilities: { hard: string[]; hardSec: number | null; mobility: string[]; heal: boolean }[]; unstoppable: boolean; cleanse: boolean }>, power: Map<string, string>): KitTraits | null {
  const k = heroes.map((h) => kit[h]);
  if (k.some((x) => !x)) return null;
  const ab = k.flatMap((x) => x!.abilities);
  return {
    hardCC: ab.filter((a) => a.hard.length).length, longCC: ab.filter((a) => a.hard.length && (a.hardSec ?? 0) >= 1).length,
    mobility: ab.filter((a) => a.mobility.length).length, unstoppable: k.filter((x) => x!.unstoppable).length,
    healers: k.filter((x) => x!.abilities.some((a) => a.heal)).length, magical: heroes.filter((h) => power.get(h) === 'magical').length,
    cleanse: k.filter((x) => x!.cleanse).length,
  };
}

/** One team-side of a match, already tagged. */
export interface Side {
  kit?: KitTraits; enemyKit?: KitTraits; matchId: string; win: boolean; traits: TeamTraits; enemy: TeamTraits; heroes: { hero: string; role: string }[]; plat: boolean }

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
  /** win rate by each kit feature count (kitByCount) and vs the enemy's count (kitByDiff, clamped +-3) */
  kitByCount: Record<string, Record<string, Rate>>;
  kitByDiff: Record<string, Record<string, Rate>>;
  /** hard-CC gap (cc- = 2+ fewer, cc+ = 2+ more) within each tank gap (-1 = fewer tanks, clamped) */
  ccWithinTanks: Record<string, Record<string, Rate>>;
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
  const kbc: Record<string, Record<string, { n: number; w: number }>> = {}, kbd: Record<string, Record<string, { n: number; w: number }>> = {}, cwt: Record<string, Record<string, { n: number; w: number }>> = {};
  for (const s of sides) {
    if (!s.kit || !s.enemyKit) continue;
    for (const k of Object.keys(s.kit) as (keyof KitTraits)[]) {
      acc((kbc[k] ??= {}), String(s.kit[k]), s.win);
      const d = Math.max(-3, Math.min(3, s.kit[k] - s.enemyKit[k]));
      acc((kbd[k] ??= {}), (d > 0 ? '+' : '') + d, s.win);
    }
    const td = Math.max(-1, Math.min(1, s.traits.tanks - s.enemy.tanks)), cd = s.kit.hardCC - s.enemyKit.hardCC;
    acc((cwt[`tanks${td > 0 ? '+' : ''}${td}`] ??= {}), cd <= -2 ? 'cc-' : cd >= 2 ? 'cc+' : 'cc=', s.win);
  }
  const num = (o: Record<string, Rate>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => Number(a) - Number(b)));
  const pairs: CompReport['pairs'] = {};
  for (const [lane, o] of Object.entries(pairAcc)) {
    pairs[lane] = Object.entries(o).filter(([, v]) => v.n >= minPairN).map(([key, v]) => ({ key, rate: rate(v.n, v.w) })).sort((x, y) => y.rate.wr - x.rate.wr);
  }
  return {
    sides: sides.length, matches: new Set(sides.map((s) => s.matchId)).size,
    byCount, byDiff, styles: fin(st),
    shapeGrid: Object.fromEntries(Object.entries(grid).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, rate(v.n, v.w)])),
    styleVsStyle: Object.fromEntries(Object.entries(svs).map(([k, v]) => [k, fin(v)])),
    kitByCount: Object.fromEntries(Object.entries(kbc).map(([k, v]) => [k, num(fin(v))])),
    kitByDiff: Object.fromEntries(Object.entries(kbd).map(([k, v]) => [k, num(fin(v))])),
    ccWithinTanks: Object.fromEntries(Object.entries(cwt).sort().map(([k, v]) => [k, fin(v)])),
    pairs,
  };
}

/** Role tags: what each hero is known for, read from its kit profile archetype, class and the
 *  scanned kit (hard-CC ability count, self-heal). Up to three per hero, in this priority order.
 *  Descriptive labels for the review's team balance line, not inputs to any win-rate rule. */
export const ROLE_TAGS = ['tank', 'diver', 'engage', 'peel', 'control', 'burst', 'poke', 'dps', 'sustain', 'duelist'] as const;
export type RoleTag = (typeof ROLE_TAGS)[number];
export function roleTags(h: HeroInfo, profile: KitProfile | undefined, kit: { hardCount: number; frontline?: boolean; selfHeal: boolean } | undefined): RoleTag[] {
  const t = tagHero(h, profile);
  const a = (profile?.archetype ?? '').toLowerCase();
  const out = new Set<RoleTag>();
  if (t.cls === 'TANK') out.add('tank');
  if (t.diver && t.cls !== 'TANK') out.add('diver');
  if (/engage|initiator/.test(a) || (t.cls === 'TANK' && (kit?.hardCount ?? 0) >= 2)) out.add('engage');
  if (/peel|enchanter|warden|shield|heal, revive/.test(a) || t.enchanter) out.add('peel');
  if (/control|zone|catch/.test(a) || (kit?.hardCount ?? 0) >= 3) out.add('control');
  if (/burst|assassin|execute|pick/.test(a)) out.add('burst');
  if (/poke|long-range/.test(a)) out.add('poke');
  if (t.cls === 'MARKSMAN' || /sustained dps|marksman carry|battle mage/.test(a)) out.add('dps');
  if (/\bsustain\b(?!ed)|drain/.test(a) || (t.frontline && kit?.selfHeal)) out.add('sustain');
  if (/duel|skirmish/.test(a)) out.add('duelist');
  return ROLE_TAGS.filter((x) => out.has(x)).slice(0, 3);
}
