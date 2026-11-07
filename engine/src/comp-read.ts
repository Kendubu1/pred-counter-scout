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
import { shapeKey, teamTraits, type HeroTags, type Rate, type TeamTraits } from './team-comp.js';

export interface CompPlayer { us: boolean; heroSlug: string; heroName: string; role: string }
export interface FieldReport { patch: string; matches: number; byDiff: Record<string, Record<string, Rate>>; shapeGrid: Record<string, Rate> }
export type HeroRoleWr = Record<string, Record<string, { n: number; w: number }>>;

export interface SideRead {
  heroes: { slug: string; name: string; role: string; tank: boolean; diver: boolean }[];
  tanks: number; divers: number; engage: number; mages: number; marksmen: number;
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
const diffKey = (d: number) => { const c = Math.max(-2, Math.min(2, d)); return (c > 0 ? '+' : '') + c; };

function side(ps: CompPlayer[], tags: Map<string, HeroTags>, field: FieldReport): SideRead | null {
  const tr = teamTraits(ps.map((p) => p.heroSlug), tags);
  if (!tr) return null;
  const heroes = [...ps].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)).map((p) => {
    const t = tags.get(p.heroSlug)!;
    return { slug: p.heroSlug, name: p.heroName, role: p.role, tank: t.cls === 'TANK', diver: t.diver };
  });
  const shape = shapeKey(tr);
  return { heroes, tanks: tr.tanks, divers: tr.divers, engage: tr.engage, mages: tr.mages, marksmen: tr.marksmen, style: tr.style, shape, shapeWr: field.shapeGrid[shape] ?? null };
}

export function readTeamComp(
  players: CompPlayer[],
  damage: { physical: number; magical: number },
  tags: Map<string, HeroTags>,
  field: FieldReport,
  heroRoleWr: HeroRoleWr,
  heroRoles: Map<string, string[]>,
  names_: Map<string, string>,
): TeamCompRead | null {
  const usP = players.filter((p) => p.us), themP = players.filter((p) => !p.us);
  if (usP.length !== 5 || themP.length !== 5) return null;
  const us = side(usP, tags, field), them = side(themP, tags, field);
  if (!us || !them) return null;
  const pct = (r: Rate | null | undefined) => (r ? `${r.wr}%` : 'n/a');
  const tankDiff = us.tanks - them.tanks, diveDiff = us.divers - them.divers;
  const tankWr = field.byDiff.tanks?.[diffKey(tankDiff)] ?? null;
  const diveWr = field.byDiff.divers?.[diffKey(diveDiff)] ?? null;
  const p = field.patch;

  const tanks = us.heroes.filter((h) => h.tank), divers = us.heroes.filter((h) => h.diver);
  const support = us.heroes.find((h) => h.role === 'support');
  const supTags = support ? tags.get(support.slug) : undefined;
  const checks: CompCheck[] = [
    tanks.length
      ? { id: 'tank', ok: true, text: `Real tank: ${names(tanks)}.` }
      : { id: 'tank', ok: false, text: 'No real tank: nobody to start fights or take the first hits for the backline.' },
    tankDiff >= 0
      ? { id: 'tank-count', ok: true, text: `Matched or beat their tanks (${us.tanks} v ${them.tanks}).` }
      : { id: 'tank-count', ok: false, text: `Out-tanked ${us.tanks} v ${them.tanks}: teams ${-tankDiff === 1 ? 'one tank' : 'two tanks'} down won ${pct(tankWr)} in ${p}.` },
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

  const summary = `Draft: ${shapeLabel(us)} vs their ${shapeLabel(them)}. In ${p} ranked, our shape won ${pct(us.shapeWr)} and theirs ${pct(them.shapeWr)}.`;
  return {
    field: { patch: field.patch, matches: field.matches },
    us, them,
    tankEdge: { diff: tankDiff, wr: tankWr?.wr ?? null },
    diverEdge: { diff: diveDiff, wr: diveWr?.wr ?? null },
    checks, swap, summary,
  };
}
