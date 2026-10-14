// pred.gg match sampler: the replacement for the omeda.city match feed.
//
// omeda's public feed (matches.json) ran days behind live, then went to HTTP 503
// (first seen 2026-09-21, still down 2026-10-14), and its catalog froze on
// 2026-08-28. Every script that walked that feed (aggregate, rank-split,
// matchup-feed, calibrate, probe) now samples matches here instead.
//
// pred.gg has no global match list, so the sample is built per hero:
// hero.matchesPaginated(timeframe, gameModes) returns that hero's matches with
// the full 10-player detail, newest first. Heroes are aliased five to a request,
// pages are walked until each hero's cap or the window runs out, and matches
// are deduped by uuid. Each hero contributes up to `perHero` matches, so rare
// heroes are not drowned out by popular ones; a match is selected for the
// presence of one hero, which says nothing about the other nine rows' outcome.
//
// Rows come back in the omeda feed's row shape (snake_case, lowercase enums,
// two-digit rank code) so the consumers' counting code is unchanged; heroes
// are keyed by slug (`hero_slug`), which also retires omeda's feed-vs-catalog
// id aliases.
//
// Needs PREDGG_CLIENT_ID / PREDGG_CLIENT_SECRET. Sequential, delayed, UA via gql().

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gql } from './predgg.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export interface FeedPlayer {
  team: string; hero_slug: string; role: string | null;
  /** omeda's code: tens = tier (1 Bronze .. 5 Diamond, 6 Paragon), units = division. null = unranked. */
  rank: number | null;
  level: number | null;
  largest_critical_strike: number | null;
  total_damage_taken: number | null;
  total_damage_mitigated: number | null;
  gold_earned_at_interval: number[] | null;
  inventory_data: number[];
}
export interface FeedMatch {
  id: string; start_time: string; game_mode: string; winning_team: string;
  game_duration: number; version: string | null; players: FeedPlayer[];
}
export interface SampleOptions {
  from: Date; to: Date;
  /** pred.gg GameMode values, e.g. ['RANKED'] or ['STANDARD', 'RANKED']. */
  gameModes: string[];
  /** Max matches walked per hero (the per-hero page cap). */
  perHero: number;
  heroes?: string[];
}

const PAGE = 20;
const ALIASES_PER_REQUEST = 5;
const DELAY_MS = 300;

const MATCH_FIELDS = `uuid startTime duration gameMode winningTeam version { name }
  matchPlayers { team role level largestCriticalStrike totalDamageTaken totalDamageMitigated
    goldEarnedAtInterval hero { slug } inventoryItemData { gameId } rating { rank { tierIdx divisionIdx } } }`;

const ROLE = (r: string | null | undefined) => (r && r !== 'NONE' && r !== 'FILL' ? r.toLowerCase() : null);

function mapMatch(m: any): FeedMatch {
  return {
    id: m.uuid,
    start_time: m.startTime,
    game_mode: String(m.gameMode).toLowerCase() === 'standard' ? 'pvp' : String(m.gameMode).toLowerCase(),
    winning_team: String(m.winningTeam ?? '').toLowerCase(),
    game_duration: m.duration ?? 0,
    version: m.version?.name ?? null,
    players: (m.matchPlayers ?? []).filter((p: any) => p?.hero?.slug).map((p: any): FeedPlayer => {
      const rk = p.rating?.rank;
      return {
        team: String(p.team).toLowerCase(),
        hero_slug: p.hero.slug,
        role: ROLE(p.role),
        rank: rk && rk.tierIdx != null ? (rk.tierIdx + 1) * 10 + (rk.divisionIdx ?? 0) + 1 : null,
        level: p.level ?? null,
        largest_critical_strike: p.largestCriticalStrike ?? null,
        total_damage_taken: p.totalDamageTaken ?? null,
        total_damage_mitigated: p.totalDamageMitigated ?? null,
        gold_earned_at_interval: Array.isArray(p.goldEarnedAtInterval) ? p.goldEarnedAtInterval : null,
        inventory_data: (p.inventoryItemData ?? []).filter((i: any) => i && i.gameId != null).map((i: any) => i.gameId),
      };
    }),
  };
}

export function catalogHeroSlugs(): string[] {
  const heroes = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/heroes.json'), 'utf8')) as { slug: string }[];
  return heroes.map((h) => h.slug);
}

/** Walk every hero's recent matches inside [from, to) and return the deduped set. */
export async function sampleMatches(opts: SampleOptions): Promise<{ matches: FeedMatch[]; requests: number }> {
  const heroes = opts.heroes ?? catalogHeroSlugs();
  const filter = `{ gameModes: [${opts.gameModes.join(', ')}], timeframe: { startTime: "${opts.from.toISOString()}", endTime: "${opts.to.toISOString()}" } }`;
  const byId = new Map<string, FeedMatch>();
  let requests = 0;
  for (let i = 0; i < heroes.length; i += ALIASES_PER_REQUEST) {
    let active = heroes.slice(i, i + ALIASES_PER_REQUEST);
    for (let offset = 0; active.length && offset < opts.perHero; offset += PAGE) {
      const limit = Math.min(PAGE, opts.perHero - offset);
      const q = `{ ${active.map((slug, k) => `h${k}: hero(by: { slug: "${slug}" }) { matchesPaginated(filter: ${filter}, limit: ${limit}, offset: ${offset}) { results { match { ${MATCH_FIELDS} } } } }`).join('\n')} }`;
      const d = await gql<Record<string, { matchesPaginated: { results: { match: any }[] } } | null>>(q);
      requests++;
      const next: string[] = [];
      active.forEach((slug, k) => {
        const results = d[`h${k}`]?.matchesPaginated?.results ?? [];
        for (const r of results) if (r?.match?.uuid && !byId.has(r.match.uuid)) byId.set(r.match.uuid, mapMatch(r.match));
        if (results.length === limit) next.push(slug); // a short page = this hero's window is exhausted
      });
      active = next;
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
    console.log(`  heroes ${Math.min(i + ALIASES_PER_REQUEST, heroes.length)}/${heroes.length}: ${byId.size} matches, ${requests} requests`);
  }
  const matches = [...byId.values()].sort((a, b) => a.start_time.localeCompare(b.start_time));
  return { matches, requests };
}
