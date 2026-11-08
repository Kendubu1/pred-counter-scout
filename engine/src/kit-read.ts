// Kit read for one reviewed game (pure): the crowd-control balance, the enemy
// hero who ran the game, and lane "nemeses" (one of our players dying to the
// same enemy again and again), each with counterplay taken from that enemy's
// kit. Grounded in data/game-data/kit-index.json (current catalog CC, mobility,
// sustain; agent-scanned) and kit-profiles.json (playAgainst), plus the game's
// own kill list. Item answers are named from the catalog by the player's own
// damage type and role (anti-heal = the Tainted line; tenacity items shorten CC).
// Wired by `npm run postgame:comp` as film.kitRead; shown in the "Draft & team
// comp" card and cited by the threat / nemesis / cc-gap game flags.
import type { HardCC } from './kit-index.js';

export interface KitAbilityLite { key: string; name: string; hard: HardCC[]; mobility: string[]; unstoppable: boolean; stealth: boolean; heal: boolean; shield: boolean; hardSec: number | null }
export interface KitHeroLite { name: string; abilities: KitAbilityLite[]; hardCount: number; unstoppable: boolean; stealth: boolean; sustain: boolean }
export interface FilmPlayer { pid: string; us: boolean; heroSlug: string; heroName: string; role: string; kills: number; deaths: number; assists: number; damageToHeroes?: number; healingDone?: number; name?: string; squadName?: string | null }
export interface FilmKill { killerPid?: string; killedPid?: string; killerSide?: string }
export interface HeroMeta { power: 'physical' | 'magical' | null; cls: 'TANK' | 'BRUISER' | 'ASSASSIN' | 'MARKSMAN' | 'MAGE' | 'SUPPORT' }

export interface CcAbility { hero: string; slug: string; ability: string; types: HardCC[]; sec: number | null }
export interface ThreatRead {
  pid: string; hero: string; slug: string; role: string; kda: string; kills: number; killShare: number;
  damage: number; topDamage: boolean; victims: { hero: string; count: number }[];
  kit: string[]; playAgainst: string | null; answers: string[];
}
export interface NemesisRead { pid: string; player: string; hero: string; role: string; deaths: number; byHero: string; bySlug: string; byCount: number; enemyCc: string[]; playAgainst: string | null; answer: string | null }
export interface KitRead {
  cc: { us: CcAbility[]; them: CcAbility[]; note: string };
  threat: ThreatRead | null;
  nemeses: NemesisRead[];
}

const TYPE_WORD: Partial<Record<HardCC, string>> = { knockup: 'knock-up', knockback: 'knockback', sleep: 'sleep', suppress: 'suppress' };
const ccLabel = (a: CcAbility) => `${a.hero} ${a.ability} (${a.types.map((t) => TYPE_WORD[t] ?? t).join(' + ')}${a.sec ? ` ${a.sec}s` : ''})`;

/** Item answers by the player's own damage type and role, catalog names. */
export function itemAnswer(kind: 'antiheal' | 'tenacity', me: HeroMeta): string {
  if (kind === 'antiheal') {
    if (me.cls === 'TANK') return 'Tainted Guard or Tainted Bastion';
    if (me.cls === 'SUPPORT') return 'Tainted Charm or Tainted Totem';
    if (me.power === 'magical') return 'Tainted Scepter';
    return me.cls === 'MARKSMAN' ? 'Tainted Rounds' : 'Tainted Blade';
  }
  if (me.cls === 'TANK') return 'Unbroken Will, Forticus or Vanguardian';
  if (me.cls === 'SUPPORT') return 'Tainted Charm';
  if (me.power === 'magical') return 'World Breaker';
  return me.cls === 'MARKSMAN' ? 'Equinox' : 'Salvation';
}

export function readKit(
  players: FilmPlayer[], kills: FilmKill[],
  kit: Record<string, KitHeroLite>, profiles: Record<string, { playAgainst?: string }>, meta: Map<string, HeroMeta>,
): KitRead | null {
  const us = players.filter((p) => p.us), them = players.filter((p) => !p.us);
  if (us.length !== 5 || them.length !== 5 || players.some((p) => !kit[p.heroSlug])) return null;
  const ccOf = (ps: FilmPlayer[]): CcAbility[] => ps.flatMap((p) => kit[p.heroSlug]!.abilities.filter((a) => a.hard.length)
    .map((a) => ({ hero: p.heroName, slug: p.heroSlug, ability: a.name, types: a.hard, sec: a.hardSec })));
  const ccUs = ccOf(us), ccThem = ccOf(them);
  const gap = ccThem.length - ccUs.length;
  const longest = [...ccThem].sort((a, b) => (b.sec ?? 0) - (a.sec ?? 0)).slice(0, 3);
  const ccNote = gap >= 3
    ? `They brought ${ccThem.length} hard-CC abilities to our ${ccUs.length}. Fight after ${longest.map((a) => `${a.hero}'s ${a.ability}`).join(' and ')} ${longest.length > 1 ? 'are' : 'is'} used, spread out instead of grouping in a line, and the front line can buy tenacity.`
    : gap <= -3
      ? `We brought ${ccUs.length} hard-CC abilities to their ${ccThem.length}: chain them on one target instead of spending them separately.`
      : `Crowd control was close: ${ccUs.length} hard-CC abilities for us, ${ccThem.length} for them.`;

  // The enemy who ran the game: most kills, needing 7+ kills, or 5+ with the game's top hero damage.
  const byKills = [...them].sort((a, b) => b.kills - a.kills || (b.damageToHeroes ?? 0) - (a.damageToHeroes ?? 0));
  const topDmg = [...players].sort((a, b) => (b.damageToHeroes ?? 0) - (a.damageToHeroes ?? 0))[0]!;
  const th = byKills[0]!;
  const theirKills = them.reduce((s, p) => s + p.kills, 0);
  let threat: ThreatRead | null = null;
  if (th.kills >= 7 || (th.kills >= 5 && topDmg.pid === th.pid)) {
    const vic = new Map<string, number>();
    for (const k of kills) if (k.killerPid === th.pid) { const v = us.find((p) => p.pid === k.killedPid); if (v) vic.set(v.heroName, (vic.get(v.heroName) ?? 0) + 1); }
    const hk = kit[th.heroSlug]!;
    const kitLines: string[] = [];
    const cc = hk.abilities.filter((a) => a.hard.length);
    if (cc.length) kitLines.push(`Hard CC: ${cc.map((a) => `${a.name} (${a.hard.map((t) => TYPE_WORD[t] ?? t).join(' + ')})`).join(', ')}.`);
    const mob = hk.abilities.filter((a) => a.mobility.length);
    if (mob.length) kitLines.push(`Mobility: ${mob.map((a) => a.name).join(', ')}.`);
    if (hk.unstoppable) kitLines.push(`Unstoppable on ${hk.abilities.filter((a) => a.unstoppable).map((a) => a.name).join(', ')}: CC does not stop it.`);
    if (hk.stealth) kitLines.push(`Stealth on ${hk.abilities.filter((a) => a.stealth).map((a) => a.name).join(', ')}.`);
    const healer = hk.abilities.some((a) => a.heal);
    if (healer) kitLines.push(`Self-healing in the kit (${hk.abilities.filter((a) => a.heal).map((a) => a.name).join(', ')}).`);
    const thMeta = meta.get(th.heroSlug);
    const answers: string[] = [];
    if (thMeta?.power) answers.push(`${thMeta.power === 'physical' ? 'Physical' : 'Magical'} armor on whoever it kept killing.`);
    if (healer) answers.push(`Anti-heal: ${[...new Set(us.map((p) => itemAnswer('antiheal', meta.get(p.heroSlug) ?? { power: null, cls: 'BRUISER' })))].slice(0, 2).join(', or ')}.`);
    if (cc.length >= 2) answers.push(`Tenacity on the players it caught.`);
    threat = {
      pid: th.pid, hero: th.heroName, slug: th.heroSlug, role: th.role, kda: `${th.kills}/${th.deaths}/${th.assists}`, kills: th.kills,
      killShare: theirKills ? Math.round((100 * th.kills) / theirKills) : 0, damage: th.damageToHeroes ?? 0, topDamage: topDmg.pid === th.pid,
      victims: [...vic.entries()].sort((a, b) => b[1] - a[1]).map(([hero, count]) => ({ hero, count })),
      kit: kitLines, playAgainst: profiles[th.heroSlug]?.playAgainst ?? null, answers,
    };
  }

  // Nemesis: 3+ deaths to one enemy that are at least 40% of that player's deaths.
  const nemeses: NemesisRead[] = [];
  for (const p of us) {
    const by = new Map<string, number>();
    for (const k of kills) if (k.killedPid === p.pid && k.killerPid) by.set(k.killerPid, (by.get(k.killerPid) ?? 0) + 1);
    const top = [...by.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!top || top[1] < 3 || top[1] < 0.4 * p.deaths) continue;
    const e = them.find((x) => x.pid === top[0]);
    if (!e) continue;
    const ek = kit[e.heroSlug]!;
    const myMeta = meta.get(p.heroSlug) ?? { power: null, cls: 'BRUISER' as const };
    const eMeta = meta.get(e.heroSlug);
    const eCc = ek.abilities.filter((a) => a.hard.length).map((a) => `${a.name} (${a.hard.map((t) => TYPE_WORD[t] ?? t).join(' + ')})`);
    const answer = ek.abilities.some((a) => a.heal) && eMeta?.cls !== 'SUPPORT' ? `Anti-heal: ${itemAnswer('antiheal', myMeta)}.`
      : eCc.length >= 2 ? `Tenacity: ${itemAnswer('tenacity', myMeta)}.`
        : eMeta?.power ? `${eMeta.power === 'physical' ? 'Physical' : 'Magical'} armor.` : null;
    nemeses.push({ pid: p.pid, player: p.squadName || p.name || p.heroName, hero: p.heroName, role: p.role, deaths: p.deaths, byHero: e.heroName, bySlug: e.heroSlug, byCount: top[1], enemyCc: eCc, playAgainst: profiles[e.heroSlug]?.playAgainst ?? null, answer });
  }
  nemeses.sort((a, b) => b.byCount - a.byCount);

  return { cc: { us: ccUs, them: ccThem, note: ccNote }, threat, nemeses };
}

export const ccSummary = (a: CcAbility[]) => a.map(ccLabel);
