// Match-feed aggregation: real per-role gold curves and per-hero item play
// rates from a sample of live matches (design doc component D inputs, and the
// off-meta play-rate gate). Writes a committed snapshot to
// data/aggregates/<date>.json. pvp+ranked by default.
//
//   npm run aggregate -- [--hours 36] [--per-hero 300]    (needs PREDGG creds)
//
// Source: pred.gg via the shared sampler (src/ingest/predgg-feed.ts). This
// walked the omeda.city match feed until that feed went to HTTP 503
// (2026-09-21); the last omeda-built snapshot is data/aggregates/2026-08-14.json.
//
// Patch partitioning: pred.gg matches carry their version, and the window never
// starts before the current patch's release (data/catalog/META.json), so a
// snapshot never mixes patches. The versions seen are recorded in meta.

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { hasCredentials } from './predgg.js';
import { sampleMatches } from './predgg-feed.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
// RANKED_ONLY=1 restricts to ranked matches (default keeps pvp+ranked).
const GAME_MODES = process.env.RANKED_ONLY ? ['RANKED'] : ['STANDARD', 'RANKED'];
const ROLES = new Set(['carry', 'support', 'midlane', 'offlane', 'jungle']);

const args = process.argv.slice(2);
const opt = (name: string, dflt: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : dflt;
};

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

async function main() {
  if (!hasCredentials()) { console.error('needs PREDGG_CLIENT_ID/SECRET in env'); process.exit(1); }
  const hours = opt('hours', 36);
  const perHero = opt('per-hero', 300);
  const meta = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/META.json'), 'utf8')) as { patch?: string; patchReleasedAt?: string };
  const to = new Date();
  const patchStart = meta.patchReleasedAt ? Date.parse(meta.patchReleasedAt) : 0;
  const from = new Date(Math.max(to.getTime() - hours * 3600_000, patchStart));
  console.log(`sampling ${from.toISOString()} -> ${to.toISOString()} (${GAME_MODES.join('+')}, <= ${perHero}/hero)`);
  const { matches: sample, requests } = await sampleMatches({ from, to, gameModes: GAME_MODES, perHero });

  // gold[role][minute] = list of cumulative gold values
  const gold = new Map<string, Map<number, number[]>>();
  // heroes[slug] = { games, wins, byRole: {role: {n, w}}, items: {gameId: {n, w}} }
  // n = appearances, w = wins. Item cells count presence in finished
  // inventories. Known bias, documented for all consumers: winners finish
  // more items (gold lead), so presence-winrate is inflated for
  // late/expensive items.
  const heroes = new Map<string, { games: number; wins: number; byRole: Record<string, { n: number; w: number }>; items: Record<number, { n: number; w: number }> }>();
  const versions = new Map<string, number>();
  let matches = 0, players = 0;

  for (const m of sample) {
    if (!m.winning_team) continue;
    matches++;
    if (m.version) versions.set(m.version, (versions.get(m.version) ?? 0) + 1);
    for (const p of m.players) {
      const role = p.role && ROLES.has(p.role) ? p.role : null;
      if (!role) continue;
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
      let h = heroes.get(p.hero_slug);
      if (!h) { h = { games: 0, wins: 0, byRole: {}, items: {} }; heroes.set(p.hero_slug, h); }
      h.games++;
      const won = p.team === m.winning_team;
      if (won) h.wins++;
      const rc = (h.byRole[role] ??= { n: 0, w: 0 });
      rc.n++;
      if (won) rc.w++;
      for (const itemId of new Set(p.inventory_data)) {
        if (!itemId) continue;
        const cell = (h.items[itemId] ??= { n: 0, w: 0 });
        cell.n++;
        if (won) cell.w++;
      }
    }
  }

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

  const heroStats: Record<string, { games: number; wins: number; byRole: Record<string, { n: number; w: number }>; items: Record<string, { n: number; w: number }> }> = {};
  for (const [slug, h] of [...heroes].sort((a, b) => a[0].localeCompare(b[0]))) {
    heroStats[slug] = { games: h.games, wins: h.wins, byRole: h.byRole, items: h.items as Record<string, { n: number; w: number }> };
  }

  const out = {
    meta: {
      source: 'pred.gg matches (hero.matchesPaginated, sampled per hero; src/ingest/predgg-feed.ts)',
      generatedAt: new Date().toISOString(),
      windowHours: hours,
      window: { from: from.toISOString(), to: to.toISOString() },
      perHero, requests, matches, playerRows: players,
      firstMatch: sample[0]?.start_time ?? '', lastMatch: sample[sample.length - 1]?.start_time ?? '',
      modes: GAME_MODES.map((m) => (m === 'STANDARD' ? 'pvp' : m.toLowerCase())),
      versions: Object.fromEntries(versions),
      patchNote: `window starts no earlier than patch ${meta.patch ?? '?'} release (${meta.patchReleasedAt ?? 'unknown'}); per-match versions above`,
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
