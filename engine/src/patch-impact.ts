// "What this patch means for you": the newest patch digest read against one
// squad member's own data. Pure (no I/O) so the rules are unit-tested
// (test/patch-impact.test.ts); src/ingest/player-review.ts feeds it.
//
// Same rules for every member, each line gated by a bar written next to it:
//   - heroes   : a changed hero with 20+ career games in the member's pool
//                (pred.gg profile); text is the patch review's forecast
//   - Eternals, minors, augments, items: something the member ran in 3+ of
//                their squad films on the current patch AND in 20%+ of them
//                (15% for items, which share six slots)
//   - new hero : offered when the lane the patch review lists for it is one of
//                the member's two most-played lanes
//   - new items: offered when the notes name one of the member's top-5 heroes
//   - ranked   : everyone, read against their current rank
// Numbers come only from the digest, the predictions file, the profile and
// the films. Nothing here estimates an effect.

export interface DigestHero { slug: string; trend: string; changes: string[] }
export interface DigestEternal { name: string; dir: string; change: string }
export interface DigestItem { slug: string; name: string; dir: string; change: string }
export interface Digest {
  patch: string; name?: string | null;
  heroes: DigestHero[];
  eternals?: { changes: DigestEternal[] };
  itemChanges?: DigestItem[];
  ranked?: { summary?: string; changes?: string[] } | null;
}
export interface Prediction { name: string; role?: string; altRoles?: string[]; trend: string; willChange: string }
export interface EternalDef { name: string; minorSlot1?: { name: string }[]; minorSlot2?: { name: string }[] }
export interface PoolHero { slug: string; name: string; games: number; myRoles?: { role: string; games: number }[] }
export interface MemberProfile {
  player: { name: string; current: { rank: string } };
  roles: { role: string; games: number }[];
  pool: PoolHero[];
}
/** One squad film for this member: what they played and ran. */
export interface MemberGame {
  heroSlug: string; heroName: string; role: string;
  items: string[];               // item slugs in the final inventory
  eternal?: string | null; minor1?: string | null; minor2?: string | null;
  augment?: string | null;
}
export interface ImpactLine { kind: 'hero' | 'eternal' | 'augment' | 'item' | 'new' | 'ranked'; dir: string; title: string; text: string; receipt: string }
export interface PatchImpact { patch: string; name: string | null; headline: string; lines: ImpactLine[]; games: number }

export const HERO_MIN_GAMES = 20;
export const RAN_MIN_GAMES = 3;
export const RAN_MIN_SHARE = 0.2;
export const ITEM_MIN_SHARE = 0.15;
const MAX_HEROES = 4;
const MAX_ITEMS = 3;

// Notes name these heroes for the new items (1.18: Vortex Stone for Riktor,
// Steel, Adele; Forticus for Kaelen and Steel). Read from the digest text so a
// later patch's new items work without code changes.
function namedHeroes(change: string, pool: PoolHero[]): PoolHero[] {
  return pool.filter((h) => new RegExp(`\\b${h.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(change));
}

/** First sentence of the review's "What it'll change" line: the forecast. */
export function forecast(willChange: string): string {
  const m = willChange.match(/^.*?[.!?](?=\s|$)/);
  return (m ? m[0] : willChange).trim();
}

const count = <T>(xs: T[]) => {
  const m = new Map<T, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

export function buildPatchImpact(
  digest: Digest,
  predictions: Record<string, Prediction>,
  eternals: EternalDef[],
  profile: MemberProfile,
  games: MemberGame[],
): PatchImpact {
  const lines: ImpactLine[] = [];
  const n = games.length;
  const ranOften = (k: number, share = RAN_MIN_SHARE) => k >= RAN_MIN_GAMES && n > 0 && k / n >= share;
  const of = (k: number) => `${k} of your ${n} squad games this patch`;

  // Heroes: changed heroes in the pool, most-played first.
  const changed = new Map(digest.heroes.map((h) => [h.slug, h]));
  const pool = [...profile.pool].sort((a, b) => b.games - a.games);
  // Where the member plays that hero: forecasts can differ by lane (Steel).
  const lane = (h: PoolHero) => {
    const r = [...(h.myRoles ?? [])].sort((a, b) => b.games - a.games)[0];
    return r && r.games >= 10 ? `, mostly ${r.role} (${r.games})` : '';
  };
  pool.forEach((h, i) => {
    const d = changed.get(h.slug); const p = predictions[h.slug];
    if (!d || !p || d.trend === 'new' || h.games < HERO_MIN_GAMES) return;
    if (lines.filter((l) => l.kind === 'hero').length >= MAX_HEROES) return;
    lines.push({
      kind: 'hero', dir: d.trend,
      title: `${h.name}, your #${i + 1} hero`,
      text: forecast(p.willChange),
      receipt: `${h.games} career games${lane(h)} · forecast from the patch ${digest.patch} review`,
    });
  });

  // Eternals and their minors.
  const etCounts = count(games.map((g) => g.eternal).filter((x): x is string => !!x));
  for (const e of digest.eternals?.changes ?? []) {
    const k = etCounts.find(([name]) => name.toLowerCase() === e.name.toLowerCase())?.[1] ?? 0;
    if (!ranOften(k)) continue;
    const def = eternals.find((x) => x.name.toLowerCase() === e.name.toLowerCase());
    const minorNames = [...(def?.minorSlot1 ?? []), ...(def?.minorSlot2 ?? [])].map((m) => m.name);
    const mine = count(games.filter((g) => g.eternal?.toLowerCase() === e.name.toLowerCase())
      .flatMap((g) => [g.minor1, g.minor2]).filter((x): x is string => !!x))
      .filter(([m, c]) => c >= RAN_MIN_GAMES && minorNames.includes(m) && e.change.includes(m)).map(([m]) => m);
    lines.push({
      kind: 'eternal', dir: e.dir,
      title: `${e.name}, your Eternal in ${k} of ${n} games`,
      text: e.change + (mine.length ? ` That includes ${mine.length === 1 ? 'your usual minor' : 'your usual minors'} ${mine.join(' and ')}.` : ''),
      receipt: `${of(k)} · loadouts from the pred.gg match stream`,
    });
  }

  // Augments: an augment the member ran whose name appears in its hero's changes.
  const augByHero = count(games.filter((g) => g.augment).map((g) => `${g.heroSlug}|${g.heroName}|${g.augment}`));
  for (const [key, k] of augByHero) {
    if (k < RAN_MIN_GAMES) continue;
    const [slug, heroName, aug] = key.split('|') as [string, string, string];
    const hit = changed.get(slug)?.changes.find((c) => c.toLowerCase().includes(aug.toLowerCase()));
    if (!hit) continue;
    lines.push({ kind: 'augment', dir: changed.get(slug)!.trend, title: `${aug} on ${heroName}`, text: hit.replace(/\.?$/, '.'), receipt: `you ran it in ${k} squad games this patch` });
  }

  // Items in the final inventory.
  const itemCounts = count(games.flatMap((g) => [...new Set(g.items)]));
  let items = 0;
  for (const it of digest.itemChanges ?? []) {
    if (it.dir === 'new' || items >= MAX_ITEMS) continue;
    const k = itemCounts.find(([s]) => s === it.slug)?.[1] ?? 0;
    if (!ranOften(k, ITEM_MIN_SHARE)) continue;
    items++;
    lines.push({ kind: 'item', dir: it.dir, title: `${it.name}, in ${k} of your ${n} builds`, text: it.change, receipt: `${of(k)} · final inventories` });
  }

  // New hero for one of your two main lanes; new items named for your heroes.
  const mainLanes = [...profile.roles].sort((a, b) => b.games - a.games).slice(0, 2).map((r) => r.role);
  for (const h of digest.heroes.filter((x) => x.trend === 'new')) {
    const p = predictions[h.slug];
    const lanes = [p?.role, ...(p?.altRoles ?? [])].filter((x): x is string => !!x);
    const hit = lanes.find((l) => mainLanes.includes(l));
    if (!p || !hit) continue;
    lines.push({ kind: 'new', dir: 'new', title: `${p.name}, new hero for ${hit}`, text: forecast(p.willChange), receipt: `${hit} is one of your two most-played lanes · kit-only read, no games yet` });
  }
  const top5 = pool.slice(0, 5);
  for (const it of (digest.itemChanges ?? []).filter((x) => x.dir === 'new')) {
    const yours = namedHeroes(it.change, top5);
    if (!yours.length) continue;
    lines.push({ kind: 'new', dir: 'new', title: `${it.name}, new item`, text: forecast(it.change), receipt: `the notes name ${yours.map((h) => h.name).join(' and ')}, in your top 5 heroes` });
  }

  // Ranked: everyone.
  if (digest.ranked) {
    const rank = profile.player.current.rank || 'unranked';
    const top = /diamond|master|paragon/i.test(rank);
    lines.push({
      kind: 'ranked', dir: 'mixed', title: 'Ranked reset',
      text: `The split ends on release, so you re-place from ${rank}.`
        + (top ? ' Master is new between Diamond I and Paragon, Paragon becomes the top 100, and both decay.' : ' Expect uneven lobbies for the first week.'),
      receipt: `your rank on your pred.gg profile · patch ${digest.patch} ranked news`,
    });
  }

  const heroN = lines.filter((l) => l.kind === 'hero').length;
  const runN = lines.filter((l) => l.kind === 'eternal' || l.kind === 'augment' || l.kind === 'item').length;
  const parts = [
    heroN ? `${heroN} of your heroes` : '',
    runN ? `${runN} thing${runN === 1 ? '' : 's'} you run` : '',
  ].filter(Boolean);
  const headline = parts.length
    ? `Changes ${parts.join(' and ')}.`
    : 'Leaves your main heroes and loadouts alone.';
  return { patch: digest.patch, name: digest.name ?? null, headline, lines, games: n };
}
