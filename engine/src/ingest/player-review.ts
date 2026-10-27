// Per-member review for the coach page (src/player-review.ts holds the rules).
//
//   npm run review:players
//
// Pure local, NO API calls. Reads the committed squad profiles
// (data/artifacts/players/*.json, squad.json), the squad film tallies
// (data/aggregates/fight-habits.json, rotation-habits.json) and the films
// themselves (data/postgame/*.json), and writes data/artifacts/player-reviews.json.
// Rerun after `npm run squad` or new films.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReview, type FilmRow, type Profile } from '../player-review.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p: string) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/i;

// Squad members' games since the current patch, for the Reports page's
// "Since patch" view: [date, role, heroSlug, heroName, win].
type RecentGame = [string, string, string, string, boolean];

function filmRows(since: string): { rows: FilmRow[]; films: number; recent: Record<string, RecentGame[]> } {
  const rows: FilmRow[] = [];
  const recent: Record<string, RecentGame[]> = {};
  let films = 0;
  const dir = path.join(ROOT, 'data/postgame');
  for (const fn of readdirSync(dir).filter((f) => UUID_RE.test(f))) {
    const f = JSON.parse(readFileSync(path.join(dir, fn), 'utf8'));
    if (f.mode !== 'ranked' || !f.durationMin) continue;
    films++;
    const teamKills: Record<string, number> = {};
    for (const p of f.players) teamKills[p.team] = (teamKills[p.team] ?? 0) + (p.kills ?? 0);
    for (const p of f.players) {
      const tk = teamKills[p.team];
      rows.push({
        squadName: p.squadName ?? null, role: p.role, durationMin: f.durationMin,
        deaths: p.deaths ?? 0, wardsPlaced: p.wardsPlaced ?? 0, damageToHeroes: p.damageToHeroes ?? 0, goldEarned: p.goldEarned ?? 0,
        kp: tk ? ((p.kills ?? 0) + (p.assists ?? 0)) / tk : null,
        date: (f.startTime ?? '').slice(0, 10) || undefined, win: f.result === 'win', hero: p.heroName,
      });
      if (p.squadName && (f.startTime ?? '') >= since) (recent[p.squadName] ??= []).push([f.startTime.slice(0, 10), p.role, p.heroSlug, p.heroName, f.result === 'win']);
    }
  }
  for (const g of Object.values(recent)) g.sort((a, b) => a[0].localeCompare(b[0]));
  return { rows, films, recent };
}

function main() {
  const squad = read('data/artifacts/squad.json');
  const fights = read('data/aggregates/fight-habits.json').members;
  const rot = read('data/aggregates/rotation-habits.json').members;
  // "Since patch" = the current patch's release, as recorded by npm run perks.
  const patch = read('data/aggregates/perk-stream.json');
  const since: string = (patch.patchReleasedAt ?? '').slice(0, 10);
  const { rows, films, recent } = filmRows(since);
  const members: Record<string, unknown> = {};
  for (const m of squad.members) {
    let profile: Profile;
    try { profile = read(`data/artifacts/players/${m.uuid}.json`); } catch { continue; }
    const r = buildReview(profile, squad.pairs, fights, rot, rows);
    members[m.uuid] = r;
    console.log(`${r.name}: ${r.keep.length} keep, ${r.fix.length} fix`);
  }
  const out = {
    generatedAt: new Date().toISOString(),
    source: `squad profiles (pred.gg, data/artifacts/players) + ${films} ranked squad films (data/postgame) + fight-habits/rotation-habits tallies`,
    method: [
      'Same rules for every member, and a tip only appears when the numbers clear a set bar.',
      'Lanes and heroes compare you with your own career and with the average player on that hero.',
      'Deaths, roams and fights compare the five squad members in the games you played together.',
      'Lobby tips compare you with the other players in your role in those same ranked games, and only show a gap too big to be luck.',
      '"Pattern, not proof" marks a link in the games that may have another cause.',
    ],
    members,
    recent: {
      since, patch: patch.patch ?? null,
      note: 'squad games only (the reviewed films), not solo queue',
      games: Object.fromEntries(squad.members.map((m: { uuid: string; name: string }) => [m.uuid, recent[m.name] ?? []])),
    },
  };
  writeFileSync(path.join(ROOT, 'data/artifacts/player-reviews.json'), JSON.stringify(out, null, 1) + '\n');
  console.log('-> data/artifacts/player-reviews.json');
}

main();
