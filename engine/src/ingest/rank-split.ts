// Rank-split hero winrates from a pred.gg ranked match sample, PER TIER —
// Bronze / Silver / Gold / Platinum / Diamond+ — how the meta shifts with ELO.
//
//   npm run ranksplit            # 36h window, ranked rows only
//
// Bucketing is PER PLAYER ROW by the row's own `rank` field (two-digit code:
// tens = tier 1 Bronze … 5+ pooled as diamond+, units = division), so a
// mixed-tier match contributes each player to their own tier. Rows with no
// rank (placements/private) are dropped. Same sampler as aggregate.ts
// (src/ingest/predgg-feed.ts; this walked omeda.city's feed until it went to
// 503 in 2026-09). Needs PREDGG creds. PER_HERO=<n> sets the per-hero cap.
//
// Output: data/aggregates/rank-split-<date>.json — per hero slug,
// tiers: { bronze|silver|gold|platinum|diamond+: {n, w} } + byRole per tier.
// Coarser buckets (e.g. Plat+) derive by summing tiers — never re-pull for them.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasCredentials } from './predgg.js';
import { sampleMatches } from './predgg-feed.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ROLES = new Set(['carry', 'midlane', 'offlane', 'jungle', 'support']);
const WINDOW_H = 36, PER_HERO = Number(process.env.PER_HERO ?? 100);
// tens digit of the row's rank code = tier; 5+ pooled as diamond+ (thin)
const TIERS = ['bronze', 'silver', 'gold', 'platinum', 'diamond+'] as const;
const tierOf = (rank: number) => TIERS[Math.min(Math.floor(rank / 10), 5) - 1]!;

interface Cell { n: number; w: number }
type TierCells = Record<string, Cell>;
interface HeroCells { tiers: TierCells; byRole: Record<string, TierCells> }

async function main() {
  if (!hasCredentials()) { console.error('needs PREDGG_CLIENT_ID/SECRET in env'); process.exit(1); }
  const meta = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/META.json'), 'utf8')) as { patchReleasedAt?: string };
  const to = new Date();
  const from = new Date(Math.max(to.getTime() - WINDOW_H * 3600_000, meta.patchReleasedAt ? Date.parse(meta.patchReleasedAt) : 0));
  const { matches: sample, requests } = await sampleMatches({ from, to, gameModes: ['RANKED'], perHero: PER_HERO });

  const heroes = new Map<string, HeroCells>();
  let matches = 0, rows = 0, unranked = 0;
  for (const m of sample) {
    if (!m.winning_team) continue;
    matches++;
    for (const p of m.players) {
      const role = p.role && ROLES.has(p.role) ? p.role : null;
      if (!role) continue;
      if (p.rank == null || p.rank < 10) { unranked++; continue; }
      const slug = p.hero_slug;
      const tier = tierOf(p.rank);
      let h = heroes.get(slug);
      if (!h) { h = { tiers: {}, byRole: {} }; heroes.set(slug, h); }
      const won = p.team === m.winning_team;
      const tc = (h.tiers[tier] ??= { n: 0, w: 0 });
      tc.n++; if (won) tc.w++;
      const rc = ((h.byRole[role] ??= {})[tier] ??= { n: 0, w: 0 });
      rc.n++; if (won) rc.w++;
      rows++;
    }
  }

  const date = new Date().toISOString().slice(0, 10);
  const out = path.join(ROOT, `data/aggregates/rank-split-${date}.json`);
  const tierRows: Record<string, number> = {};
  for (const h of heroes.values()) for (const [t, c] of Object.entries(h.tiers)) tierRows[t] = (tierRows[t] ?? 0) + c.n;
  writeFileSync(out, JSON.stringify({
    meta: {
      source: 'pred.gg matches (hero.matchesPaginated, sampled per hero; src/ingest/predgg-feed.ts), ranked rows only',
      generatedAt: new Date().toISOString(),
      windowHours: WINDOW_H, window: { from: from.toISOString(), to: to.toISOString() }, perHero: PER_HERO, requests, matches,
      tiers: Object.fromEntries(TIERS.map((t) => [t, { playerRows: tierRows[t] ?? 0 }])),
      note: 'per PLAYER ROW by that player’s own rank code (tens digit = tier; 5+ pooled as diamond+); a mixed-tier match feeds each player’s own tier; rows with no rank dropped. Coarser buckets (e.g. Plat+) derive by summing tiers.',
    },
    heroes: Object.fromEntries([...heroes.entries()].sort()),
  }, null, 1));
  console.log(`${matches} ranked matches -> ${rows} rows (${Object.entries(tierRows).map(([t, n]) => `${t} ${n}`).join(', ')}; ${unranked} unranked dropped) -> ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
