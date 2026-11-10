// Build notes for one reviewed game (pure): for each of our players, what the
// lane matchup and this enemy comp asked of the build, read from committed
// field data, and whether the player's final items answered it.
//
//   lane     head-to-head record vs the lane opponent (feed-matchups.json, shrunk)
//   adapt    items the field buys MORE into that lane opponent than usual
//            (build-matchups.json: share of 3-item cores holding the item, into this
//            opponent vs the hero-role overall; 20+ games into the opponent, +8 pts),
//            with each item's own win rate on the hero-role (build-links.json, 50+ games)
//   needs    what the enemy kit called for (film.kitRead + kit-index.json):
//            tenacity vs a 2+ hard-CC gap, anti-heal vs 3+ self-healing kits or a
//            healing threat, armor of the damage type that kept killing this player
//   coreVs   the best common core INTO this lane opponent (matchup-cores.json, counted from the
//            patch's ranked lineups; pair 60+ games, core 20+, shrunk toward the pair's own
//            win rate with 50 games of prior; only cores with 10% of the pair's games can lead,
//            and a lone such core is labelled most played); null when the matchup is too thin, and the page
//            then labels the overall core as all matchups
//   has      whether a final item already covers it (catalog stats: tenacity,
//            physical_armor, magical_armor; anti-heal = the Tainted line)
// Field shares describe what other players do; they are not proof an item wins
// that matchup. Wired by `npm run postgame:comp` as film.buildNotes.
import { itemAnswer, type HeroMeta, type KitRead } from './kit-read.js';

export interface ItemInfo { slug: string; name: string; stats: Record<string, number>; rarity?: string | null }
export interface BuildCell { n: number; i: Record<string, number> }
export type AdaptVs = { slug: string; name: string; into: number; usual: number; wr: number | null; n: number | null; has: boolean; vs: string };
export interface LinkCell { n: number; w: number }
export interface NotePlayer { pid: string; us: boolean; heroSlug: string; heroName: string; role: string; items?: { slug: string; name: string }[] }
export interface BuildNote {
  pid: string; hero: string; role: string;
  lane: { opp: string; oppSlug: string; wr: number; n: number } | null;
  adapt: AdaptVs[];
  needs: { why: string; answer: string; has: boolean }[];
  /** the best of this hero-role's common 3-item cores this patch (40+ games, shrunk toward the
   *  hero-role rate; core rates run high since finishing three items means a longer or winning
   *  game, so read it against the other cores, not the hero's win rate) */
  core: { items: { slug: string; name: string; has: boolean }[]; wr: number; n: number } | null;
  /** the best common core into this lane opponent (see coreVs above) */
  coreVs?: { vs: string; items: { slug: string; name: string; has: boolean }[]; wr: number; n: number; pairN: number; pairWr: number; basis: 'best' | 'most played' } | null;
  /** completed items the player finished with (final inventory, Epic and Legendary) */
  built: { slug: string; name: string }[];
}

const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);
const isAntiHeal = (slug: string) => slug.startsWith('tainted-');

export function buildNotes(
  players: NotePlayer[], kitRead: KitRead | null,
  kit: Record<string, { abilities: { heal: boolean }[] }>,
  items: Map<string, ItemInfo>, meta: Map<string, HeroMeta>,
  pairs: Record<string, { n: number; shrunkWr: number; lane?: string }>,
  bm: Record<string, { all: BuildCell; lane: Record<string, BuildCell>; team?: Record<string, BuildCell> }>,
  links: Record<string, Record<string, Record<string, LinkCell>>>,
  cores: Record<string, Record<string, { coreSlugs: string[]; n: number; w: number }[]>> = {},
  baselines: Record<string, Record<string, { all: { n: number; w: number } }>> = {},
  matchupCores: Record<string, { n: number; w: number; cores: { coreSlugs: string[]; n: number; w: number }[] }> = {},
): BuildNote[] {
  const us = players.filter((p) => p.us), them = players.filter((p) => !p.us);
  const healers = them.filter((p) => kit[p.heroSlug]?.abilities.some((a) => a.heal));
  const ccGap = kitRead ? kitRead.cc.them.length - kitRead.cc.us.length : 0;
  const out: BuildNote[] = [];
  for (const p of us) {
    const mine = new Set((p.items ?? []).map((i) => i.slug));
    const stat = (k: string) => [...mine].some((s) => (items.get(s)?.stats?.[k] ?? 0) > 0);
    const opp = them.find((e) => e.role === p.role);
    const pr = opp ? pairs[`${p.heroSlug}|${opp.heroSlug}`] : undefined;
    const lane = opp && pr && pr.n >= 20 ? { opp: opp.heroName, oppSlug: opp.heroSlug, wr: pr.shrunkWr, n: pr.n } : null;

    const cell = bm[`${p.heroSlug}|${p.role}`];
    const adapt: AdaptVs[] = [];
    const shifts = (into: BuildCell | undefined, vs: string) => {
      if (!cell || !into || into.n < 20) return;
      for (const [slug, c] of Object.entries(into.i)) {
        const a = pct(c, into.n), u = pct(cell.all.i[slug] ?? 0, cell.all.n);
        if (a - u < 8 || !items.get(slug) || adapt.some((x) => x.slug === slug)) continue;
        const l = links[p.heroSlug]?.[p.role]?.[slug];
        adapt.push({ slug, name: items.get(slug)!.name, into: a, usual: u, wr: l && l.n >= 50 ? Math.round((1000 * l.w) / l.n) / 10 : null, n: l && l.n >= 50 ? l.n : null, has: mine.has(slug), vs });
      }
    };
    if (opp) shifts(cell?.lane?.[opp.heroSlug], opp.heroName);
    // The enemy who kept killing this player (nemesis, else the threat), anywhere on their team.
    const nemFirst = kitRead?.nemeses.find((n) => n.pid === p.pid);
    const hunter = nemFirst?.bySlug ?? (kitRead?.threat?.victims.some((v) => v.hero === p.heroName && v.count >= 3) ? kitRead!.threat!.slug : undefined);
    if (hunter && hunter !== opp?.heroSlug) shifts(cell?.team?.[hunter], them.find((e) => e.heroSlug === hunter)?.heroName ?? hunter);
    adapt.sort((x, y) => (y.into - y.usual) - (x.into - x.usual));
    adapt.splice(3);

    const me: HeroMeta = meta.get(p.heroSlug) ?? { power: null, cls: 'BRUISER' };
    const needs: BuildNote['needs'] = [];
    const nem = kitRead?.nemeses.find((n) => n.pid === p.pid);
    const victimOfThreat = kitRead?.threat?.victims.find((v) => v.hero === p.heroName && v.count >= 3);
    const frontline = me.cls === 'TANK' || me.cls === 'BRUISER';
    if (ccGap >= 2 && (frontline || nem?.enemyCc.length)) {
      needs.push({ why: `they brought ${ccGap} more hard-CC abilities`, answer: `tenacity (${itemAnswer('tenacity', me)})`, has: stat('tenacity') });
    }
    const threatHeals = kitRead?.threat && kit[kitRead.threat.slug]?.abilities.some((a) => a.heal);
    if (healers.length >= 3 || threatHeals) {
      needs.push({ why: healers.length >= 3 ? `${healers.length} enemy kits heal themselves (${healers.map((h) => h.heroName).join(', ')})` : `${kitRead!.threat!.hero} heals through fights`, answer: `anti-heal (${itemAnswer('antiheal', me)})`, has: [...mine].some(isAntiHeal) });
    }
    const killer = nem ? nem.bySlug : victimOfThreat ? kitRead!.threat!.slug : null;
    const kp = killer ? meta.get(killer)?.power : null;
    if (killer && kp) {
      const name = them.find((e) => e.heroSlug === killer)?.heroName ?? killer;
      needs.push({ why: `${name} kept killing ${p.heroName}`, answer: `${kp} armor`, has: stat(kp === 'physical' ? 'physical_armor' : 'magical_armor') });
    }
    // An unfavoured lane asks for armor of the lane opponent's damage type.
    const op = opp ? meta.get(opp.heroSlug)?.power : null;
    if (lane && lane.wr < 48 && op && !needs.some((n) => n.answer === `${op} armor`)) {
      needs.push({ why: `${lane.opp} wins this lane ${Math.round(1000 - lane.wr * 10) / 10}% of the time`, answer: `${op} armor`, has: stat(op === 'physical' ? 'physical_armor' : 'magical_armor') });
    }
    const base = baselines[p.heroSlug]?.[p.role]?.all;
    const prior = base && base.n ? base.w / base.n : 0.5;
    const rows = (cores[p.heroSlug]?.[p.role] ?? []).filter((c) => c.n >= 40);
    const best = rows.sort((a, b) => (b.w + 50 * prior) / (b.n + 50) - (a.w + 50 * prior) / (a.n + 50))[0];
    const core = best ? { items: best.coreSlugs.map((slug) => ({ slug, name: items.get(slug)?.name ?? slug, has: mine.has(slug) })), wr: Math.round((1000 * best.w) / best.n) / 10, n: best.n } : null;
    const mc = opp ? matchupCores[`${p.heroSlug}|${p.role}|${opp.heroSlug}`] : undefined;
    const pairPrior = mc && mc.n ? mc.w / mc.n : 0.5;
    // Recommendation policy: only cores with enough games to lead (10% of the pair's games,
    // 20..300) can be named; with one such core it is the most played, not a proven best.
    const leadN = mc ? Math.min(300, Math.max(20, Math.round(mc.n * 0.1))) : 0;
    const eligible = mc ? mc.cores.filter((c) => c.n >= leadN) : [];
    const bestVs = eligible.sort((a, b) => (b.w + 50 * pairPrior) / (b.n + 50) - (a.w + 50 * pairPrior) / (a.n + 50))[0];
    const coreVs = mc && bestVs && opp ? { vs: opp.heroName, items: bestVs.coreSlugs.map((slug) => ({ slug, name: items.get(slug)?.name ?? slug, has: mine.has(slug) })), wr: Math.round((1000 * bestVs.w) / bestVs.n) / 10, n: bestVs.n, pairN: mc.n, pairWr: Math.round((1000 * mc.w) / mc.n) / 10, basis: (eligible.length > 1 ? 'best' : 'most played') as 'best' | 'most played' } : null;
    const built = [...mine].filter((s) => { const it = items.get(s) as any; return it && (it.rarity === 'Epic' || it.rarity === 'Legendary'); }).map((slug) => ({ slug, name: items.get(slug)!.name }));
    out.push({ pid: p.pid, hero: p.heroName, role: p.role, lane, adapt, needs, core, coreVs, built });
  }
  return out;
}
