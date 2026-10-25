// Standout performances: which hero, on either team, played far above the norm
// for that hero in that role in our squad's reviewed games, and what the
// build / Eternal / augment / matchup / team context says about why.
//
// pred.gg's performanceScore is 0 on every film row, so the score here is our
// own: role-weighted z-scores of per-minute output against a hero-role baseline
// (leave-one-out mean, shrunk toward the role mean so a 3-game hero does not set
// its own bar) with role-wide spread. Pure functions; the CLI
// (src/ingest/standout-builds.ts) reads the films and writes the report.

export type Role = 'carry' | 'midlane' | 'offlane' | 'jungle' | 'support';

export interface StandoutPlayer {
  pid: string; name: string; team: string; us: boolean; role: Role; heroSlug: string; heroName: string;
  kills: number; deaths: number; assists: number;
  goldEarned: number; damageToHeroes: number; damageToObjectives: number; damageTaken: number;
  mitigated: number; healingDone: number; wardsPlaced: number;
  items: { slug: string; name: string }[];
  itemTimeline?: { slug: string; name: string; estMin: number }[];
  loadout?: { augment?: { id: string; name: string } | null; eternal?: string | null; minor1?: string | null; minor2?: string | null; crest?: string | null } | null;
  experience?: { games: number; winrate: number; avgPerf?: number } | null;
}

export interface StandoutFilm {
  matchId: string; startTime: string; durationMin: number; ourTeam: string; result: string;
  players: StandoutPlayer[];
  lanes?: { role: string; ourSlug: string; theirSlug: string; edge?: string; predggMatchup?: { winrate: number; matchesPlayed: number } | null }[];
  squad?: { stackSize: number } | null;
}

export const METRICS = ['dpm', 'dmgShare', 'kp', 'deathsPer10', 'gpm', 'objpm', 'tankpm', 'healpm', 'wardsPer10'] as const;
export type Metric = typeof METRICS[number];
const LOWER_BETTER: Partial<Record<Metric, true>> = { deathsPer10: true };

/** What "played well" means per role. Weights are judgement, not measured:
 *  output + staying alive for cores, presence + objectives for jungle, soaking
 *  for offlane, presence + sustain + vision for support. */
export const ROLE_WEIGHTS: Record<Role, Partial<Record<Metric, number>>> = {
  carry: { dpm: 1, dmgShare: 1, kp: 0.75, deathsPer10: 1, gpm: 0.75, objpm: 0.5 },
  midlane: { dpm: 1, dmgShare: 1, kp: 0.75, deathsPer10: 1, gpm: 0.5 },
  jungle: { dpm: 0.75, kp: 1, deathsPer10: 1, objpm: 0.75, gpm: 0.5 },
  offlane: { dpm: 0.75, dmgShare: 0.5, kp: 0.75, deathsPer10: 1, tankpm: 1 },
  support: { kp: 1, deathsPer10: 1, tankpm: 0.5, healpm: 0.5, wardsPer10: 0.5 },
};

/** Prior strength (in games) pulling a hero-role mean toward the role mean. */
export const SHRINK_K = 10;
/** Standout bar on the composite score (in role standard deviations). */
export const STANDOUT_Z = 1.0;

export function metricsOf(p: StandoutPlayer, film: StandoutFilm): Record<Metric, number> {
  const min = Math.max(film.durationMin, 1);
  const mates = film.players.filter((q) => q.team === p.team);
  const teamKills = mates.reduce((s, q) => s + q.kills, 0);
  const teamDmg = mates.reduce((s, q) => s + q.damageToHeroes, 0);
  return {
    dpm: p.damageToHeroes / min,
    dmgShare: teamDmg > 0 ? p.damageToHeroes / teamDmg : 0,
    kp: teamKills > 0 ? (p.kills + p.assists) / teamKills : 0,
    deathsPer10: (p.deaths / min) * 10,
    gpm: p.goldEarned / min,
    objpm: p.damageToObjectives / min,
    tankpm: (p.damageTaken + p.mitigated) / min,
    healpm: p.healingDone / min,
    wardsPer10: (p.wardsPlaced / min) * 10,
  };
}

export interface Row { film: StandoutFilm; p: StandoutPlayer; m: Record<Metric, number> }

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(xs.length, 1);
const sd = (xs: number[]) => { const mu = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - mu) ** 2))); };

/** Composite score per row: weighted mean of capped z-scores against the
 *  leave-one-out, shrunk hero-role mean. Also returns each metric's z. */
export function scoreRows(rows: Row[]): { score: number; z: Partial<Record<Metric, number>>; heroGames: number }[] {
  const byRole = new Map<string, Row[]>();
  const byHeroRole = new Map<string, Row[]>();
  for (const r of rows) {
    (byRole.get(r.p.role) ?? byRole.set(r.p.role, []).get(r.p.role)!).push(r);
    const k = `${r.p.heroSlug}|${r.p.role}`;
    (byHeroRole.get(k) ?? byHeroRole.set(k, []).get(k)!).push(r);
  }
  const roleStats = new Map<string, Record<Metric, { mu: number; sd: number }>>();
  for (const [role, rs] of byRole) {
    const o = {} as Record<Metric, { mu: number; sd: number }>;
    for (const m of METRICS) { const xs = rs.map((r) => r.m[m]); o[m] = { mu: mean(xs), sd: sd(xs) }; }
    roleStats.set(role, o);
  }
  const heroSums = new Map<string, Record<Metric, number>>();
  for (const [k, rs] of byHeroRole) {
    const o = {} as Record<Metric, number>;
    for (const m of METRICS) o[m] = rs.reduce((s, r) => s + r.m[m], 0);
    heroSums.set(k, o);
  }
  return rows.map((r) => {
    const k = `${r.p.heroSlug}|${r.p.role}`;
    const n = byHeroRole.get(k)!.length - 1;          // leave this game out
    const rs = roleStats.get(r.p.role)!;
    const w = ROLE_WEIGHTS[r.p.role];
    const z: Partial<Record<Metric, number>> = {};
    let num = 0, den = 0;
    for (const m of Object.keys(w) as Metric[]) {
      const { mu, sd: s } = rs[m];
      if (!(s > 0)) continue;
      const heroMu = (heroSums.get(k)![m] - r.m[m] + SHRINK_K * mu) / (n + SHRINK_K);
      let zi = (r.m[m] - heroMu) / s;
      if (LOWER_BETTER[m]) zi = -zi;
      zi = Math.max(-3, Math.min(3, zi));
      z[m] = Math.round(zi * 100) / 100;
      num += w[m]! * zi; den += w[m]!;
    }
    return { score: den ? Math.round((num / den) * 100) / 100 : 0, z, heroGames: n + 1 };
  });
}

/** First three completed items by purchase time (the build's core). */
export const coreOf = (p: StandoutPlayer) =>
  (p.itemTimeline?.length ? [...p.itemTimeline].sort((a, b) => a.estMin - b.estMin) : p.items).slice(0, 3).map((i) => i.slug);
