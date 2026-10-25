// Squad ban list: data/artifacts/squad-bans.json, read by ui/v6/bans.html.
// Which enemy heroes beat the 5-stack, from our own reviewed games
// (data/postgame/*.json). Zero-API. squad.ts calls buildSquadBans() after the
// squad report, so the hourly coach job keeps it current; standalone:
//
//   npm run squad-bans
//
// RANKING: each enemy hero's squad record is pulled toward the squad's win
// rate in games WITHOUT that hero, weighted as K games (small samples can't
// top the list), then scored as wins per 100 games a ban would recover:
// presence x (baseline - shrunk). Doubling or halving K left the top four
// unchanged on 2026-10-25 (181 games). The page shows the raw record beside it.
//
// NEMESIS: per hero, ONE squad member it hurts most. A member with a losing
// record laned against it (3+ games) comes first, worst record wins; otherwise
// the member it kills most per game faced (0.5+). Lanes: carry and support
// share the duo lane, so an enemy support counts against our carry and vice
// versa. The chip shows that member's lane record and kills per game together.
// STOMP: the hero's kills on squad members over its deaths to them.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const K = 20;
const MIN_GAMES = 4;
const MIN_LANE_GAMES = 3;
const MIN_HUNT_PER_GAME = 0.5;
const LANE_OF: Record<string, string> = { carry: 'duo', support: 'duo', midlane: 'mid', offlane: 'off', jungle: 'jungle' };

interface PgPlayer { pid: string; team: string; role: string; heroSlug: string; heroName: string; kills: number; deaths: number; assists: number }
interface PgKill { killerPid: string; killedPid: string }
interface PgMatch { matchId: string; startTime: string; mode?: string; ourTeam: string; result: string; players: PgPlayer[]; kills?: PgKill[] }

type Agg = {
  n: number; w: number; name: string; roles: Record<string, number>;
  kills: number; deaths: number; assists: number; killsOnUs: number; deathsToUs: number;
  lane: Record<string, { n: number; w: number }>; killedMember: Record<string, number>;
};

function window(games: PgMatch[], roster: Map<string, string>) {
  const N = games.length;
  const W = games.filter((g) => g.result === 'win').length;
  const by = new Map<string, Agg>();
  for (const g of games) {
    const won = g.result === 'win';
    const ours = g.players.filter((p) => roster.has(p.pid));
    for (const e of g.players.filter((p) => p.team !== g.ourTeam)) {
      const a = by.get(e.heroSlug) ?? { n: 0, w: 0, name: e.heroName, roles: {}, kills: 0, deaths: 0, assists: 0, killsOnUs: 0, deathsToUs: 0, lane: {}, killedMember: {} };
      a.n++; if (won) a.w++;
      a.roles[e.role] = (a.roles[e.role] ?? 0) + 1;
      a.kills += e.kills; a.deaths += e.deaths; a.assists += e.assists;
      for (const k of g.kills ?? []) {
        if (k.killerPid === e.pid && roster.has(k.killedPid)) {
          a.killsOnUs++;
          const who = roster.get(k.killedPid)!;
          a.killedMember[who] = (a.killedMember[who] ?? 0) + 1;
        }
        if (k.killedPid === e.pid && roster.has(k.killerPid)) a.deathsToUs++;
      }
      for (const vs of ours.filter((p) => LANE_OF[p.role] && LANE_OF[p.role] === LANE_OF[e.role])) {
        // keyed per member AND the role they played, so one member's 3-0 as
        // carry can't dilute their 0-5 as support into a harmless 3-5.
        // '*' pools that member's lane games across roles; both compete.
        for (const key of [`${roster.get(vs.pid)!}|${vs.role}`, `${roster.get(vs.pid)!}|*`]) {
          const l = (a.lane[key] ??= { n: 0, w: 0 });
          l.n++; if (won) l.w++;
        }
      }
      by.set(e.heroSlug, a);
    }
  }
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const rows = [...by.entries()].filter(([, a]) => a.n >= MIN_GAMES).map(([slug, a]) => {
    const loo = N > a.n ? (W - a.w) / (N - a.n) : W / N;
    const shrunk = (a.w + K * loo) / (a.n + K);
    const losing = Object.entries(a.lane).filter(([, l]) => l.n >= MIN_LANE_GAMES && l.w < l.n - l.w)
      .sort(([, x], [, y]) => x.w / x.n - y.w / y.n || y.n - x.n);
    const hunted = Object.entries(a.killedMember).sort(([, x], [, y]) => y - x)[0];
    const laneKey = losing[0]?.[0] ?? null;
    const pick = laneKey ? laneKey.split('|')[0] : (hunted && hunted[1] / a.n >= MIN_HUNT_PER_GAME ? hunted[0] : null);
    const lane = laneKey ? a.lane[laneKey] : undefined;
    const nemesis = pick ? {
      name: pick,
      reason: laneKey ? 'lane' : 'kills',
      lane: lane ? { role: laneKey!.split('|')[1], games: lane.n, wins: lane.w } : null,
      killsPerGame: r3((a.killedMember[pick] ?? 0) / a.n),
    } : null;
    return {
      slug, name: a.name, games: a.n, wins: a.w, losses: a.n - a.w,
      winRate: r3(a.w / a.n), baseline: r3(loo), shrunkWinRate: r3(shrunk),
      threat: Math.round(100 * (a.n / N) * (loo - shrunk) * 100) / 100,
      mainRole: Object.entries(a.roles).sort(([, x], [, y]) => y - x)[0]?.[0] ?? '',
      kda: { kills: r3(a.kills / a.n), deaths: r3(a.deaths / a.n), assists: r3(a.assists / a.n) },
      kd: a.deaths ? r3(a.kills / a.deaths) : null,
      killsOnUsPerGame: r3(a.killsOnUs / a.n),
      kdVsUs: a.deathsToUs ? r3(a.killsOnUs / a.deathsToUs) : null,
      nemesis,
    };
  });
  const threats = rows.filter((r) => r.threat > 0).sort((a, b) => b.threat - a.threat);
  const stompers = [...rows].sort((a, b) => b.killsOnUsPerGame - a.killsOnUsPerGame).slice(0, 5)
    .map((r) => ({ slug: r.slug, name: r.name, games: r.games, killsOnUsPerGame: r.killsOnUsPerGame, kdVsUs: r.kdVsUs }));
  return { games: N, wins: W, winRate: N ? r3(W / N) : null, list: threats.slice(0, 10), stompers };
}

export function buildSquadBans(): void {
  const squad = JSON.parse(readFileSync(path.join(ROOT, 'data/artifacts/squad.json'), 'utf8')) as { members: { uuid: string; name: string }[] };
  const roster = new Map(squad.members.map((m) => [m.uuid, m.name]));
  const meta = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/META.json'), 'utf8')) as { patchFamily: string; patchFamilyReleasedAt: string };
  const dir = path.join(ROOT, 'data/postgame');
  const games = readdirSync(dir).filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as PgMatch)
    .filter((g) => g.matchId && Array.isArray(g.players) && g.players.length === 10 && (!g.mode || /ranked/i.test(g.mode)));
  const since = meta.patchFamilyReleasedAt;
  const banRate = existsSync(path.join(ROOT, 'data/artifacts/bans.json'))
    ? new Map((JSON.parse(readFileSync(path.join(ROOT, 'data/artifacts/bans.json'), 'utf8')) as { all: { heroes: { slug: string; banRate: number }[] } }).all.heroes.map((h) => [h.slug, h.banRate]))
    : new Map<string, number>();
  const withBans = (w: ReturnType<typeof window>) => ({ ...w, list: w.list.map((r) => ({ ...r, leagueBanRate: banRate.get(r.slug) ?? null })) });
  writeFileSync(path.join(ROOT, 'data/artifacts/squad-bans.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: `data/postgame reviewed ranked games of the 5-stack (${games.length}); a game counts when at least two members played`,
    method: `Each enemy hero's squad record is pulled toward the squad's win rate in games without it, weighted as ${K} extra games; threat = wins per 100 games a ban would recover (how often it shows up x how much worse the squad does). ${MIN_GAMES}+ games to list; nemesis = the member with the worst losing lane record against it (${MIN_LANE_GAMES}+ games; carry and support share the duo lane), else the member it kills most (${MIN_HUNT_PER_GAME}+ per game).`,
    members: squad.members.map((m) => m.name),
    windows: {
      patch: { label: `Patch ${meta.patchFamily}`, since, ...withBans(window(games.filter((g) => g.startTime >= since), roster)) },
      all: { label: 'All time', since: games.map((g) => g.startTime).sort()[0] ?? null, ...withBans(window(games, roster)) },
    },
  }, null, 1));
  console.log(`squad-bans.json written (${games.length} games)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildSquadBans();
