// Loader for the committed match-feed aggregate snapshot: per-role gold
// curves and per-hero item play rates. Feeds the off-meta play-rate gate
// (design doc, off-meta discovery criterion b) and checkpoint budgets.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export interface AggregateSnapshot {
  meta: { generatedAt: string; matches: number; playerRows: number; patchNote: string };
  goldByMinute: Record<string, Record<string, { p25: number; p50: number; p75: number; n: number }>>;
  heroes: Record<string, { games: number; wins: number; byRole: Record<string, { n: number; w: number }>; items: Record<string, { n: number; w: number }> }>;
}

let cached: AggregateSnapshot | null | undefined;

export function loadAggregates(): AggregateSnapshot | null {
  if (cached !== undefined) return cached;
  try {
    const dir = path.join(ROOT, 'data/aggregates');
    const files = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    const latest = files[files.length - 1];
    cached = latest ? (JSON.parse(readFileSync(path.join(dir, latest), 'utf8')) as AggregateSnapshot) : null;
  } catch {
    cached = null;
  }
  return cached;
}

/** Median gold for a role at a minute, or null when unobserved. */
export function goldAt(role: string, minute: number, agg = loadAggregates()): number | null {
  return agg?.goldByMinute[role]?.[String(minute)]?.p50 ?? null;
}

/**
 * Share of a hero's games in which a finished build contained the item
 * (by game id). Null when the hero has too few games to say.
 */
export function itemPlayRate(heroSlug: string, itemGameId: number | null, agg = loadAggregates()): number | null {
  if (!agg || itemGameId == null) return null;
  const h = agg.heroes[heroSlug];
  if (!h || h.games < 30) return null;
  return (h.items[String(itemGameId)]?.n ?? 0) / h.games;
}

export function heroGames(heroSlug: string, agg = loadAggregates()): number {
  return agg?.heroes[heroSlug]?.games ?? 0;
}
