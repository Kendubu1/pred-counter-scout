// Standout builds: every hero (ours or the enemy's) that far out-played the norm
// for that hero-role across our reviewed squad games, with the build, Eternal,
// minors, augment and crest they ran, and the context needed to tell a build
// that worked from a matchup, a stomp or just a good player.
//
//   npm run standouts      # zero-API; reads data/postgame, writes data/aggregates/standout-builds.json
//
// Re-run after new films land: the library is recomputed from every film, so it
// grows as the squad plays. Meta comparisons (augment / Eternal / core share)
// use the committed 1.17.2 pred.gg counts and are only made for games on 1.17.2;
// older games are still scored and still feed the within-squad trends.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { coreOf, metricsOf, scoreRows, STANDOUT_Z, SHRINK_K, ROLE_WEIGHTS, type Row, type StandoutFilm, type StandoutPlayer } from '../standouts.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PG = path.join(ROOT, 'data/postgame');
const OUT = path.join(ROOT, 'data/aggregates/standout-builds.json');
const read = (p: string) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));

type NW = { n: number; w: number };
const augData = read('data/aggregates/predgg-augments.json');
const buildData = read('data/aggregates/predgg-builds.json');
const META_PATCH = '1.17.2';
const patches = readdirSync(path.join(ROOT, 'data/patches')).filter((f) => f.endsWith('.json'))
  .map((f) => read(`data/patches/${f}`) as { patch: string; date: string })
  .sort((a, b) => a.date.localeCompare(b.date));
const patchOf = (iso: string) => [...patches].reverse().find((p) => iso.slice(0, 10) >= p.date)?.patch ?? '<' + patches[0]!.patch;

const films: StandoutFilm[] = readdirSync(PG).filter((f) => /^[0-9a-f-]{36}\.json$/.test(f))
  .map((f) => JSON.parse(readFileSync(path.join(PG, f), 'utf8')))
  .filter((f) => Array.isArray(f.players) && f.players.length === 10);

const rows: Row[] = films.flatMap((film) => film.players.map((p) => ({ film, p, m: metricsOf(p, film) })));
const scores = scoreRows(rows);
const scored = rows.map((r, i) => ({ ...r, ...scores[i]! }));
const r2 = (x: number) => Math.round(x * 100) / 100;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);

// ---- within-squad trends: does a loadout piece go with higher scores on that hero-role?
type Feature = { kind: string; value: string };
const featuresOf = (p: StandoutPlayer): Feature[] => {
  const f: Feature[] = [];
  const l = p.loadout;
  if (l?.augment?.name) f.push({ kind: 'augment', value: l.augment.name });
  if (l?.eternal) f.push({ kind: 'eternal', value: l.eternal });
  if (l?.eternal && l.minor1 && l.minor2) f.push({ kind: 'minors', value: `${l.eternal}: ${l.minor1} + ${l.minor2}` });
  if (l?.crest) f.push({ kind: 'crest', value: l.crest });
  for (const s of coreOf(p)) f.push({ kind: 'coreItem', value: s });
  return f;
};
const byHR = new Map<string, typeof scored>();
for (const s of scored) { const k = `${s.p.heroSlug}|${s.p.role}`; (byHR.get(k) ?? byHR.set(k, []).get(k)!).push(s); }

// Welch-style t for a with/without split of scores; guards against the many
// loadout pieces per player lining up with a good game by chance.
const split = (xs: number[], ys: number[]) => {
  const m = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  const v = (a: number[]) => { const mu = m(a); return a.reduce((s, x) => s + (x - mu) ** 2, 0) / Math.max(a.length - 1, 1); };
  const delta = m(xs) - m(ys);
  const se = Math.sqrt(v(xs) / xs.length + v(ys) / ys.length) || 1e-9;
  return { mw: m(xs), mwo: m(ys), delta, t: delta / se };
};
const TREND_DELTA = 0.4, TREND_T = 2;
/** Who ran it: a trend carried by one player is that player, not the build.
 *  Private profiles share a placeholder name, so they count by pid. */
const spread = (rs: { p: StandoutPlayer; film: StandoutFilm }[]) => {
  const by = new Map<string, number>();
  for (const r of rs) by.set(r.p.pid, (by.get(r.p.pid) ?? 0) + 1);
  const top = Math.max(...by.values());
  const patchesSeen = [...new Set(rs.map((r) => patchOf(r.film.startTime)))].sort();
  return { players: by.size, topPlayerShare: Math.round((top / rs.length) * 100), ours: rs.filter((r) => r.p.us).length, patches: patchesSeen };
};
const BUILD_MIN_PLAYERS = 3, BUILD_MAX_TOP_SHARE = 60;

const trends: any[] = [];
for (const [k, rs] of byHR) {
  if (rs.length < 6) continue;
  const [hero, role] = k.split('|');
  const tally = new Map<string, { kind: string; value: string; idx: Set<number> }>();
  rs.forEach((r, i) => { for (const f of featuresOf(r.p)) { const key = f.kind + '|' + f.value; (tally.get(key) ?? tally.set(key, { ...f, idx: new Set() }).get(key)!).idx.add(i); } });
  for (const t of tally.values()) {
    const w = rs.filter((_, i) => t.idx.has(i)), wo = rs.filter((_, i) => !t.idx.has(i));
    if (w.length < 3 || wo.length < 3) continue;
    const { mw, mwo, delta, t: tStat } = split(w.map((r) => r.score), wo.map((r) => r.score));
    if (Math.abs(delta) < TREND_DELTA || Math.abs(tStat) < TREND_T) continue;
    const winsW = w.filter((r) => (r.p.team === r.film.ourTeam) === (r.film.result === 'win')).length;
    const winsWo = wo.filter((r) => (r.p.team === r.film.ourTeam) === (r.film.result === 'win')).length;
    trends.push({
      hero, role, kind: t.kind, value: t.value, games: rs.length,
      with: { n: w.length, ...spread(w), avgScore: r2(mw), standouts: w.filter((r) => r.score >= STANDOUT_Z).length, winrate: pct(winsW, w.length) },
      without: { n: wo.length, avgScore: r2(mwo), standouts: wo.filter((r) => r.score >= STANDOUT_Z).length, winrate: pct(winsWo, wo.length) },
      delta: r2(delta), t: r2(tStat),
    });
  }
}
trends.sort((a, b) => Math.abs(b.delta) * Math.sqrt(b.with.n) - Math.abs(a.delta) * Math.sqrt(a.with.n));

// ---- standouts with context
const share = (x: NW | undefined, total: number) => (x && total ? pct(x.n, total) : 0);
const standouts = scored.filter((s) => s.score >= STANDOUT_Z).sort((a, b) => b.score - a.score).map((s) => {
  const { film, p } = s;
  const won = (p.team === film.ourTeam) === (film.result === 'win');
  const patch = patchOf(film.startTime);
  const mates = scored.filter((o) => o.film === film && o.p.team === p.team && o.p !== p);
  const foes = scored.filter((o) => o.film === film && o.p.team !== p.team);
  const teamKills = film.players.filter((q) => q.team === p.team).reduce((a, q) => a + q.kills, 0);
  const foeKills = film.players.filter((q) => q.team !== p.team).reduce((a, q) => a + q.kills, 0);
  const mateAvg = r2(mates.reduce((a, o) => a + o.score, 0) / mates.length);

  const lane = film.lanes?.find((l) => (p.us ? l.ourSlug : l.theirSlug) === p.heroSlug);
  let laneWr: number | null = null; let opponent: string | null = null; let laneEdge: string | null = null;
  if (lane) {
    opponent = p.us ? lane.theirSlug : lane.ourSlug;
    const flip: Record<string, string> = { favored: 'unfavored', unfavored: 'favored' };
    laneEdge = lane.edge ? (p.us ? lane.edge : flip[lane.edge] ?? lane.edge) : null;
    const wr = lane.predggMatchup?.winrate;
    if (wr != null && (lane.predggMatchup!.matchesPlayed ?? 0) >= 100) laneWr = r2(p.us ? wr : 100 - wr);
  }

  // Meta comparison (current patch only).
  let meta: any = null;
  if (patch === META_PATCH) {
    const cell = augData.heroes?.[p.heroSlug]?.[p.role];
    const l = p.loadout;
    const aug = cell?.augments?.find((a: any) => a.id === l?.augment?.id || a.name === l?.augment?.name);
    const et = cell?.eternals?.find((e: any) => e.name === l?.eternal);
    const pair = et?.pairs?.find((x: any) => x.minor1 === l?.minor1 && x.minor2 === l?.minor2);
    const crest = cell?.crests?.find((c: any) => c.name === l?.crest || c.slug === (l as any)?.crestSlug);
    const cores: { coreSlugs: string[]; n: number; w: number }[] = buildData.byRole?.[p.heroSlug]?.[p.role] ?? [];
    const mine = coreOf(p);
    const coreSet = [...mine].sort().join(',');
    const coreHit = cores.find((c) => [...c.coreSlugs].sort().join(',') === coreSet);
    const metaItems = new Set(cores.flatMap((c) => c.coreSlugs));
    const games = cell?.games ?? 0;
    meta = {
      sampleGames: games,
      augmentSharePct: share(aug, games), augmentWr: aug ? pct(aug.w, aug.n) : null,
      eternalSharePct: share(et, games), eternalWr: et ? pct(et.w, et.n) : null,
      minorPairSharePct: et ? share(pair, et.n) : 0,
      crestSharePct: share(crest, games),
      coreIsMeta: !!coreHit, coreWr: coreHit ? pct(coreHit.w, coreHit.n) : null,
      offMetaCoreItems: mine.length === 3 ? mine.filter((x) => !metaItems.has(x)) : [],
    };
  }

  // Trend support with THIS game left out, so a standout cannot back itself.
  const others = byHR.get(`${p.heroSlug}|${p.role}`)!.filter((o) => o.p !== p);
  const backed = featuresOf(p).flatMap((f) => {
    const has = (o: (typeof others)[number]) => featuresOf(o.p).some((g) => g.kind === f.kind && g.value === f.value);
    const w = others.filter(has), wo = others.filter((o) => !has(o));
    if (w.length < 3 || wo.length < 3) return [];
    const { delta, t } = split(w.map((o) => o.score), wo.map((o) => o.score));
    return delta >= TREND_DELTA && t >= TREND_T ? [{ ...f, delta: r2(delta), n: w.length, ...spread(w) }] : [];
  });

  // Why it worked: ranked reasons, most specific first. Heuristic, not causal.
  const factors: string[] = [];
  const offMeta = meta && ((meta.augmentSharePct ?? 0) < 15 || (meta.eternalSharePct ?? 0) < 15 || !meta.coreIsMeta);
  // A trend spread over several players is the build; one carried by a single
  // player (usually a squad main on their comfort setup) is that player.
  const buildBacked = backed.filter((b) => b.players >= BUILD_MIN_PLAYERS && b.topPlayerShare <= BUILD_MAX_TOP_SHARE);
  if (buildBacked.length) factors.push('build-trend');
  if (backed.length > buildBacked.length) factors.push('one-player-trend');
  if (offMeta) factors.push('off-meta-build');
  if (laneWr != null ? laneWr >= 52.5 : laneEdge === 'favored') factors.push('favored-lane');
  if (laneWr != null ? laneWr <= 47.5 : laneEdge === 'unfavored') factors.push('unfavored-lane');
  if (mateAvg >= 0.5 || teamKills - foeKills >= 15) factors.push('team-stomp');
  if (!won) factors.push('lost-anyway');
  if (p.experience && p.experience.games >= 30) factors.push('practised');
  const verdict = buildBacked.length ? 'build'
    : factors.includes('team-stomp') ? 'team'
    : laneWr != null && laneWr >= 52.5 ? 'matchup'
    : 'player';

  return {
    matchId: film.matchId, date: film.startTime.slice(0, 10), patch, stackSize: film.squad?.stackSize ?? null,
    side: p.us ? 'us' : 'enemy', player: p.name, hero: p.heroSlug, heroName: p.heroName, role: p.role,
    won, durationMin: film.durationMin, kda: `${p.kills}/${p.deaths}/${p.assists}`,
    score: s.score, z: s.z, heroRoleGames: s.heroGames, teammatesAvgScore: mateAvg,
    enemyTopScore: r2(Math.max(...foes.map((o) => o.score))),
    killDiff: teamKills - foeKills, opponent, laneWr, laneEdge,
    build: { core: coreOf(p), items: p.items.map((i) => i.slug), ...(p.loadout ?? {}) },
    meta, experience: p.experience ?? null,
    buildTrends: buildBacked.map((t) => `${t.kind}: ${t.value}`),
    trendSupport: backed.map((t) => `${t.kind}: ${t.value} (+${t.delta} over ${t.n} other games, ${t.players} players, top ${t.topPlayerShare}%)`),
    factors, verdict,
  };
});

// The saved-builds library: standouts whose build is backed by a multi-player
// trend, grouped per hero-role. This is the list worth keeping and re-testing.
const library = new Map<string, any>();
for (const s of standouts.filter((x) => x.verdict === 'build')) {
  const k = `${s.hero}|${s.role}`;
  const e = library.get(k) ?? library.set(k, { hero: s.hero, heroName: s.heroName, role: s.role, games: [] as any[], pieces: new Map<string, string>() }).get(k);
  e.games.push({ matchId: s.matchId, date: s.date, patch: s.patch, side: s.side, player: s.player, kda: s.kda, score: s.score, won: s.won, build: s.build });
  for (const t of s.buildTrends) e.pieces.set(t, t);
}

const report = {
  generatedAt: new Date().toISOString(),
  source: 'data/postgame films (our squad ranked games, both teams), zero-API; meta shares from predgg-augments.json / predgg-builds.json (1.17.2)',
  method: {
    score: `Role-weighted mean of per-metric z-scores (capped ±3). Each metric is compared with the hero-role mean from the other films (leave-one-out), shrunk toward the role mean with k=${SHRINK_K} games, divided by the role-wide spread. pred.gg performanceScore is 0 on every film row, so it is not used.`,
    weights: ROLE_WEIGHTS,
    standoutBar: STANDOUT_Z,
    verdict: "build = a loadout piece this player ran also scores higher on this hero-role in the OTHER films (this game left out; delta >= 0.4 and t >= 2, >=3 games each side) AND that trend spans >= 3 players with none over 60% of its games — otherwise it is one player's comfort setup and counts as player; team = teammates also scored >= 0.5 or the team won kills by 15+; matchup = pred.gg lane winrate >= 52.5% for their side (the engine matrix edge is listed as a factor only); player = none of those. Heuristic: a lead to check in the film, not proof.",
    caveats: 'Baselines come from our own films (182 games) across patches since April, against our squad\'s ranked bracket; most hero-roles have under 20 games. Treat trends with n < 5 as leads.',
  },
  films: films.length, playerRows: rows.length,
  byStack: Object.fromEntries([2, 3, 4, 5].map((k) => [k, films.filter((f) => f.squad?.stackSize === k).length])),
  standoutCount: standouts.length,
  library: [...library.values()].map((e) => ({ ...e, pieces: [...e.pieces.values()] })).sort((a, b) => b.games.length - a.games.length),
  standouts,
  trends: trends.slice(0, 60),
};
writeFileSync(OUT, JSON.stringify(report, null, 1) + '\n');
console.log(`standouts: ${standouts.length} of ${rows.length} player-games (score >= ${STANDOUT_Z}) across ${films.length} films -> ${path.relative(ROOT, OUT)}`);
const tally = (k: string) => standouts.filter((s) => s.verdict === k).length;
console.log(`verdicts: build ${tally('build')}, team ${tally('team')}, matchup ${tally('matchup')}, player ${tally('player')}; trends kept ${trends.length}`);
