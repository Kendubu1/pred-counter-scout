// Draft & team-comp read for one reviewed game (pure). The fundamentals a
// MOBA comp is judged on, checked against both lineups, with the ranked
// field's 1.18+ win rate for each comp shape from team-comp-report.json:
//
//   real tank     someone who starts fights and soaks for the backline
//   tank count    vs the enemy's (the strongest comp signal in the field)
//   divers        at most one high-dive kit; every extra diver is a hero not holding the line
//   damage mix    not four-plus of one damage type
//   no doubles    one main mage, one main marksman
//   peel          the support is a tank or a support, not a diver or a mage
//
// Hero tags come from src/team-comp.ts (catalog class + kit-profiles). A swap
// suggestion names the slot to change and the real tanks that win most in
// that role this patch (hero-role win rate, 300+ ranked games in that role,
// so a tank the field plays there counts even when the catalog omits the role). It is draft advice
// read from the field, not a statistical pick under the recommendation policy.
// Wired by `npm run postgame:comp`; rendered as the "Draft & team comp" card.
//
// Played as a tank (maintainer, 2026-11-12: a Greystone on Nihil and tank items soaking 3,014 a minute
// was counted as "0 tanks"): the draft tags come from the hero's class, so a fighter or support who
// built and played the front line is missed. When the game's numbers are given, a non-tank hero whose
// damage mitigated a minute is 1.5x or more its lane's average (offlane / jungle / support, from
// tank-builds.json laneAverage; about 5% of non-tank games and 23% of real-tank games pass) is tagged
// playedTank, and the tank checks and summary say so. The shape win rates stay on the draft.
import { shapeKey, teamTraits, type HeroTags, type Rate, type TeamTraits } from './team-comp.js';

export interface CompPlayer { us: boolean; heroSlug: string; heroName: string; role: string }
export interface FieldReport { patch: string; matches: number; byDiff: Record<string, Record<string, Rate>>; shapeGrid: Record<string, Rate> }
export type HeroRoleWr = Record<string, Record<string, { n: number; w: number }>>;

export interface SideRead {
  heroes: { slug: string; name: string; role: string; tank: boolean; diver: boolean; tags: string[]; playedTank?: { mpm: number; x: number } }[];
  /** how many heroes carry each role tag (src/team-comp.ts roleTags) */
  balance: Record<string, number>;
  tanks: number; divers: number; engage: number; mages: number; marksmen: number;
  /** real tanks plus heroes that played as one this game (only when the game's soak was given) */
  gameTanks?: number;
  style: TeamTraits['style']; shape: string; shapeWr: Rate | null;
}
export interface CompCheck { id: 'tank' | 'tank-count' | 'divers' | 'damage' | 'doubles' | 'peel'; ok: boolean; text: string }
export interface CompSwap { role: string; out: string; reason: string; options: { slug: string; name: string; wr: number; n: number }[] }
export interface TeamCompRead {
  field: { patch: string; matches: number };
  us: SideRead; them: SideRead;
  tankEdge: { diff: number; wr: number | null };
  diverEdge: { diff: number; wr: number | null };
  checks: CompCheck[];
  swap: CompSwap | null;
  summary: string;
}

const ROLE_ORDER = ['offlane', 'jungle', 'midlane', 'carry', 'support'];
const shapeLabel = (t: { tanks: number; divers: number }) => `${t.tanks} tank${t.tanks === 1 ? '' : 's'}, ${t.divers} diver${t.divers === 1 ? '' : 's'}`;
const names = (xs: { name: string }[]) => xs.map((x) => x.name).join(', ');
export const PLAYED_TANK_X = 1.5;
/** Damage mitigated a minute this game and its lane's average, per hero slug and side. */
export type GameSoak = Map<string, { mpm: number; avg: number }>;
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const laneWord: Record<string, string> = { offlane: 'offlaner', jungle: 'jungler', support: 'support' };
const diffKey = (d: number) => { const c = Math.max(-2, Math.min(2, d)); return (c > 0 ? '+' : '') + c; };

function side(ps: CompPlayer[], tags: Map<string, HeroTags>, field: FieldReport, roleTagsOf: (slug: string) => string[], soak?: GameSoak): SideRead | null {
  const tr = teamTraits(ps.map((p) => p.heroSlug), tags);
  if (!tr) return null;
  const heroes = [...ps].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)).map((p) => {
    const t = tags.get(p.heroSlug)!;
    const g = soak?.get(p.heroSlug);
    const x = g && g.avg ? g.mpm / g.avg : 0;
    return { slug: p.heroSlug, name: p.heroName, role: p.role, tank: t.cls === 'TANK', diver: t.diver, tags: roleTagsOf(p.heroSlug), ...(t.cls !== 'TANK' && x >= PLAYED_TANK_X ? { playedTank: { mpm: Math.round(g!.mpm), x: Math.round(x * 10) / 10 } } : {}) };
  });
  const shape = shapeKey(tr);
  const balance: Record<string, number> = {};
  for (const h of heroes) for (const g of h.tags) balance[g] = (balance[g] ?? 0) + 1;
  return { heroes, balance, tanks: tr.tanks, ...(soak ? { gameTanks: tr.tanks + heroes.filter((h) => h.playedTank).length } : {}), divers: tr.divers, engage: tr.engage, mages: tr.mages, marksmen: tr.marksmen, style: tr.style, shape, shapeWr: field.shapeGrid[shape] ?? null };
}

export function readTeamComp(
  players: CompPlayer[],
  damage: { physical: number; magical: number },
  tags: Map<string, HeroTags>,
  field: FieldReport,
  heroRoleWr: HeroRoleWr,
  heroRoles: Map<string, string[]>,
  names_: Map<string, string>,
  roleTagsOf: (slug: string) => string[] = () => [],
  soakUs?: GameSoak, soakThem?: GameSoak,
): TeamCompRead | null {
  const usP = players.filter((p) => p.us), themP = players.filter((p) => !p.us);
  if (usP.length !== 5 || themP.length !== 5) return null;
  const us = side(usP, tags, field, roleTagsOf, soakUs), them = side(themP, tags, field, roleTagsOf, soakThem);
  if (!us || !them) return null;
  const pct = (r: Rate | null | undefined) => (r ? `${r.wr}%` : 'n/a');
  const tankDiff = us.tanks - them.tanks, diveDiff = us.divers - them.divers;
  const tankWr = field.byDiff.tanks?.[diffKey(tankDiff)] ?? null;
  const diveWr = field.byDiff.divers?.[diffKey(diveDiff)] ?? null;
  const p = field.patch;

  const tanks = us.heroes.filter((h) => h.tank), divers = us.heroes.filter((h) => h.diver);
  const support = us.heroes.find((h) => h.role === 'support');
  const supTags = support ? tags.get(support.slug) : undefined;
  const played = (sd: SideRead) => sd.heroes.filter((h) => h.playedTank);
  const playedLine = (h: SideRead['heroes'][number]) => `${h.name} (${fmt(h.playedTank!.mpm)} mitigated a minute, ${h.playedTank!.x}x an average ${laneWord[h.role] ?? h.role}'s)`;
  const usPlayed = played(us), themPlayed = played(them);
  const anyPlayed = usPlayed.length + themPlayed.length > 0;
  const gameNote = anyPlayed
    ? ` In the game, counting heroes who played as tanks: ${us.gameTanks} v ${them.gameTanks}.${usPlayed.length ? ` Ours: ${usPlayed.map(playedLine).join(', ')}.` : ''}${themPlayed.length ? ` Theirs: ${themPlayed.map(playedLine).join(', ')}.` : ''}`
    : '';
  const gameDiff = anyPlayed ? (us.gameTanks ?? us.tanks) - (them.gameTanks ?? them.tanks) : tankDiff;
  const checks: CompCheck[] = [
    tanks.length
      ? { id: 'tank', ok: true, text: `Real tank: ${names(tanks)}.` }
      : usPlayed.length
        ? { id: 'tank', ok: true, text: `No tank hero, but ${names(usPlayed)} played as one: ${usPlayed.map(playedLine).join(', ')}.` }
        : { id: 'tank', ok: false, text: 'No real tank: nobody to start fights or take the first hits for the backline.' },
    tankDiff >= 0 && gameDiff >= 0
      ? { id: 'tank-count', ok: true, text: `Matched or beat their tank heroes in the draft (${us.tanks} v ${them.tanks}).${gameNote}` }
      : tankDiff >= 0
        ? { id: 'tank-count', ok: false, text: `Matched their tank heroes in the draft (${us.tanks} v ${them.tanks}), but were out-tanked in the game.${gameNote}` }
        : { id: 'tank-count', ok: false, text: `Out-tanked ${us.tanks} v ${them.tanks}: teams ${-tankDiff === 1 ? 'one tank' : 'two tanks'} down won ${pct(tankWr)} in ${p}.${gameNote}` },
    divers.length <= 1
      ? { id: 'divers', ok: true, text: divers.length ? `One diver (${names(divers)}).` : 'No divers.' }
      : { id: 'divers', ok: false, text: `${divers.length} divers (${names(divers)}): each one past the first is a hero not holding the line.` },
    Math.min(damage.physical, damage.magical) >= 2
      ? { id: 'damage', ok: true, text: `Mixed damage (${damage.physical} physical, ${damage.magical} magical).` }
      : { id: 'damage', ok: false, text: `${Math.max(damage.physical, damage.magical)} of 5 deal ${damage.physical > damage.magical ? 'physical' : 'magical'} damage: one ${damage.physical > damage.magical ? 'armor' : 'magic-resist'} item blunts most of it.` },
    us.mages <= 1 && us.marksmen <= 1
      ? { id: 'doubles', ok: true, text: 'One main mage and one main marksman at most.' }
      : { id: 'doubles', ok: false, text: us.marksmen >= 2 ? `Two marksmen (${names(us.heroes.filter((h) => tags.get(h.slug)!.cls === 'MARKSMAN'))}).` : `Two mages (${names(us.heroes.filter((h) => tags.get(h.slug)!.cls === 'MAGE'))}).` },
    !support || !supTags
      ? { id: 'peel', ok: false, text: 'No support in the lineup.' }
      : supTags.cls === 'TANK' || supTags.cls === 'SUPPORT' || supTags.enchanter
        ? { id: 'peel', ok: true, text: `${support.name} can stay with the carry and peel.` }
        : { id: 'peel', ok: false, text: `${support.name} at support is a ${supTags.diver ? 'diver' : supTags.cls === 'MAGE' ? 'mage' : 'damage pick'}: nobody stays with the carry.` },
  ];

  // Swap: the one slot that most fixes the shape. Divers outside the jungle
  // first (the jungler is usually the one diver worth keeping), then a support
  // that cannot peel, then the offlaner.
  let swap: CompSwap | null = null;
  const needsFix = us.tanks === 0 || us.divers >= 2 || tankDiff <= -2;
  if (needsFix) {
    const pick = divers.length >= 2 ? (divers.find((h) => h.role === 'offlane') ?? divers.find((h) => h.role === 'support') ?? divers.find((h) => h.role !== 'jungle'))
      : !checks.find((c) => c.id === 'peel')!.ok ? support
      : us.heroes.find((h) => h.role === 'offlane' && !h.tank) ?? us.heroes.find((h) => h.role === 'support' && !h.tank);
    if (pick) {
      const options = [...tags.entries()]
        .filter(([slug, t]) => t.cls === 'TANK' && ((heroRoleWr[slug]?.[pick.role]?.n ?? 0) >= 300 || (heroRoles.get(slug) ?? []).includes(pick.role)) && (heroRoleWr[slug]?.[pick.role]?.n ?? 0) >= 300)
        .map(([slug]) => { const c = heroRoleWr[slug]![pick.role]!; return { slug, name: names_.get(slug) ?? slug, wr: Math.round((1000 * c.w) / c.n) / 10, n: c.n }; })
        .sort((a, b) => b.wr - a.wr).slice(0, 3);
      const reason = divers.length >= 2 ? `${pick.name} is a second diver` : us.tanks === 0 ? 'the team has no real tank' : `the team is out-tanked ${us.tanks} v ${them.tanks}`;
      if (options.length) swap = { role: pick.role, out: pick.name, reason, options };
    }
  }

  const summary = `Draft: ${shapeLabel(us)} vs their ${shapeLabel(them)}. In ${p} ranked, our shape won ${pct(us.shapeWr)} and theirs ${pct(them.shapeWr)}.${[...usPlayed, ...themPlayed].length ? ` ${names([...usPlayed, ...themPlayed])} ${usPlayed.length + themPlayed.length === 1 ? 'played as a tank without being a tank hero' : 'played as tanks without being tank heroes'}.` : ''}`;
  return {
    field: { patch: field.patch, matches: field.matches },
    us, them,
    tankEdge: { diff: tankDiff, wr: tankWr?.wr ?? null },
    diverEdge: { diff: diveDiff, wr: diveWr?.wr ?? null },
    checks, swap, summary,
  };
}
