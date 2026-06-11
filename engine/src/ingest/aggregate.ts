// Match-feed aggregation: real per-role gold curves and per-hero item play
// rates from the official-API feed (design doc component D inputs, and the
// off-meta play-rate gate). Writes a committed snapshot to
// data/aggregates/<date>.json. Polite sequential fetching, pvp+ranked only.
//
//   npm run aggregate -- [--hours 36] [--max-pages 120]
//
// Patch partitioning: matches carry no patch field; the window is chosen
// to sit entirely inside the current patch and recorded in meta.

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const UA = { 'User-Agent': 'pred-counter-scout (github.com/Kendubu1/pred-counter-scout)' };
const MODES = new Set(['pvp', 'ranked']);
const ROLES = new Set(['carry', 'support', 'midlane', 'offlane', 'jungle']);

interface FeedPlayer {
  team: string; hero_id: number; role: string | null; rank: number | null;
  gold_earned_at_interval: number[] | null; inventory_data: number[] | null;
}
interface FeedMatch {
  id: string; start_time: string; game_mode: string; winning_team: string;
  game_duration: number; players: FeedPlayer[];
}

const args = process.argv.slice(2);
const opt = (name: string, dflt: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : dflt;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(url: string): Promise<{ matches: FeedMatch[]; cursor: string | null }> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (res.ok) return (await res.json()) as { matches: FeedMatch[]; cursor: string | null };
      if (res.status === 429) { await sleep(2000 * (attempt + 1)); continue; }
      throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (attempt === 3) throw e;
      await sleep(1000 * (attempt + 1));
    }
  }
  throw new Error('unreachable');
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

async function main() {
  const hours = opt('hours', 36);
  const maxPages = opt('max-pages', 120);
  const startTs = Math.floor(Date.now() / 1000) - hours * 3600;

  // gold[role][minute] = list of cumulative gold values
  const gold = new Map<string, Map<number, number[]>>();
  // heroes[hero_id] = { games, wins, roles: {}, items: {gameId: {n, w}} }
  // n = appearances in finished inventories, w = of those, games won.
  // Known bias, documented for all consumers: winners finish more items
  // (gold lead), so presence-winrate is inflated for late/expensive items.
  const heroes = new Map<number, { games: number; wins: number; roles: Record<string, number>; items: Record<number, { n: number; w: number }> }>();

  let url: string | null = `https://omeda.city/matches.json?per_page=100&timestamp=${startTs}`;
  let pages = 0, matches = 0, players = 0;
  let firstStart = '', lastStart = '';

  while (url && pages < maxPages) {
    const page = await fetchPage(url);
    pages++;
    for (const m of page.matches ?? []) {
      if (!MODES.has(m.game_mode)) continue;
      matches++;
      if (!firstStart) firstStart = m.start_time;
      lastStart = m.start_time;
      for (const p of m.players ?? []) {
        const role = p.role && ROLES.has(p.role) ? p.role : null;
        if (!role || !p.hero_id) continue;
        players++;
        if (Array.isArray(p.gold_earned_at_interval)) {
          let roleMap = gold.get(role);
          if (!roleMap) { roleMap = new Map(); gold.set(role, roleMap); }
          p.gold_earned_at_interval.forEach((g, minute) => {
            if (minute === 0 || g <= 0) return;
            let arr = roleMap!.get(minute);
            if (!arr) { arr = []; roleMap!.set(minute, arr); }
            arr.push(g);
          });
        }
        let h = heroes.get(p.hero_id);
        if (!h) { h = { games: 0, wins: 0, roles: {}, items: {} }; heroes.set(p.hero_id, h); }
        h.games++;
        const won = p.team === m.winning_team;
        if (won) h.wins++;
        h.roles[role] = (h.roles[role] ?? 0) + 1;
        for (const itemId of new Set(p.inventory_data ?? [])) {
          if (!itemId) continue;
          const cell = (h.items[itemId] ??= { n: 0, w: 0 });
          cell.n++;
          if (won) cell.w++;
        }
      }
    }
    url = page.cursor
      ? `https://omeda.city/matches.json?per_page=100&timestamp=${startTs}&cursor=${encodeURIComponent(page.cursor)}`
      : null;
    if (pages % 20 === 0) console.log(`  page ${pages}: ${matches} matches, ${players} player rows`);
    await sleep(150);
  }

  // hero_id -> slug via the omeda snapshot
  const omedaHeroes = JSON.parse(readFileSync(path.join(ROOT, 'data/omeda/heroes.json'), 'utf8')) as { id: number; slug: string }[];
  const idToSlug = new Map(omedaHeroes.map((h) => [h.id, h.slug]));

  const goldByMinute: Record<string, Record<number, { p25: number; p50: number; p75: number; n: number }>> = {};
  for (const [role, byMin] of gold) {
    goldByMinute[role] = {};
    for (const [minute, vals] of byMin) {
      if (vals.length < 30) continue; // thin tails (long matches) are noise
      vals.sort((a, b) => a - b);
      goldByMinute[role][minute] = {
        p25: percentile(vals, 25), p50: percentile(vals, 50), p75: percentile(vals, 75), n: vals.length,
      };
    }
  }

  const heroStats: Record<string, { games: number; wins: number; roles: Record<string, number>; items: Record<string, { n: number; w: number }> }> = {};
  for (const [id, h] of heroes) {
    const slug = idToSlug.get(id) ?? `hero_id:${id}`;
    heroStats[slug] = { games: h.games, wins: h.wins, roles: h.roles, items: h.items as Record<string, { n: number; w: number }> };
  }

  const out = {
    meta: {
      source: 'omeda.city matches.json (official Omeda public API)',
      generatedAt: new Date().toISOString(),
      windowHours: hours,
      pages, matches, playerRows: players,
      firstMatch: firstStart, lastMatch: lastStart,
      modes: [...MODES],
      patchNote: 'window chosen inside patch 1.14.4 (released 2026-06-09); matches carry no patch field',
    },
    goldByMinute,
    heroes: heroStats,
  };
  const dir = path.join(ROOT, 'data/aggregates');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(file, JSON.stringify(out, null, 1));
  console.log(`\nWrote ${file}: ${matches} matches, ${players} player rows, ${Object.keys(heroStats).length} heroes`);
  for (const role of ['carry', 'midlane', 'offlane', 'jungle', 'support']) {
    const g10 = goldByMinute[role]?.[10];
    console.log(`  ${role.padEnd(8)} gold@10: p50=${g10?.p50 ?? '-'} (n=${g10?.n ?? 0})`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
