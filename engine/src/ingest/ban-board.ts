// Most-banned board: data/artifacts/bans.json, read by the homepage's top-5
// strip and ui/v6/bans.html. Zero-API: ban counts from npm run bans, picks and
// wins from the same lane-stats cells the meta board uses, so every rate shares
// one match count. Runs as part of npm run artifacts (after build-artifacts).
//
//   npm run ban-board
//
// LANES: a ban removes a hero, not a lane, so a hero is listed under the lane
// it is played in MOST at that rank band (lane + laneShare on each row). The
// page's by-lane view is the overall list grouped by that lane.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ROLES = ['carry', 'midlane', 'offlane', 'jungle', 'support'];

type NW = { n: number; w: number };
interface LaneStats {
  patch: string; scopeLabel: string; matchesApprox: number;
  rankBands: { key: string; label: string }[];
  matchesApproxByBand: Record<string, number>;
  heroes: Record<string, { byRole: Record<string, NW & { bands?: Record<string, NW> }> }>;
}
interface BanPull { patch: string; generatedAt: string; heroes: Record<string, { bans: number; bands: Record<string, number> }> }

const bansPath = path.join(ROOT, 'data/aggregates/predgg-bans.json');
if (!existsSync(bansPath)) { console.log('no data/aggregates/predgg-bans.json yet (npm run bans); bans.json not built'); process.exit(0); }
const banSrc = JSON.parse(readFileSync(bansPath, 'utf8')) as BanPull;
const lane = JSON.parse(readFileSync(path.join(ROOT, 'data/aggregates/predgg-lane-stats.json'), 'utf8')) as LaneStats;
const names = new Map((JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/heroes.json'), 'utf8')) as { slug: string; display_name: string }[])
  .map((h) => [h.slug, h.display_name]));
if (banSrc.patch !== lane.patch) console.warn(`bans.json: ban pull is patch ${banSrc.patch}, lane stats ${lane.patch} — run npm run bans`);

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const board = (band: string | null, matches: number) => {
  const rows = Object.entries(banSrc.heroes).filter(([slug]) => names.has(slug)).map(([slug, b]) => {
    const cells = ROLES.map((r) => {
      const c = lane.heroes[slug]?.byRole?.[r];
      return { role: r, cell: band ? c?.bands?.[band] : c };
    }).filter((x): x is { role: string; cell: NW } => !!x.cell && x.cell.n > 0);
    const picks = cells.reduce((s, x) => s + x.cell.n, 0);
    const wins = cells.reduce((s, x) => s + x.cell.w, 0);
    const main = [...cells].sort((a, b2) => b2.cell.n - a.cell.n)[0];
    const bans = band ? (b.bands[band] ?? 0) : b.bans;
    return {
      slug, name: names.get(slug) ?? slug, bans, picks,
      banRate: r3(bans / matches),
      pickRate: r3(picks / matches),
      winRate: picks ? r3(wins / picks) : null,
      lane: main?.role ?? null,
      laneShare: main && picks ? r3(main.cell.n / picks) : null,
    };
  });
  return { matches, heroes: rows.sort((a, b2) => b2.bans - a.bans) };
};

writeFileSync(path.join(ROOT, 'data/artifacts/bans.json'), JSON.stringify({
  patch: banSrc.patch,
  scope: lane.scopeLabel,
  generatedAt: banSrc.generatedAt,
  note: 'ban rate = share of ranked matches the hero was banned in (4-ban draft). Pick rate and win rate are summed over every lane the hero was played in; lane = the lane it is played in most at that rank. Rank bands follow the player\'s rank at the open split; they sum below all ranks because unplaced players only count there.',
  rankBands: lane.rankBands.map((b) => ({ key: b.key, label: b.label })),
  all: board(null, lane.matchesApprox),
  byBand: Object.fromEntries(lane.rankBands.map((b) => [b.key, board(b.key, lane.matchesApproxByBand[b.key] ?? 0)])),
}, null, 1));
console.log('bans.json written');
