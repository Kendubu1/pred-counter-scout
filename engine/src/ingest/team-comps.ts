// Team lineups: both five-hero teams of every ranked match the daily
// `npm run perks` loop reads, kept so team-comp questions ("do two-frontline
// teams beat dive comps?", "does a team without engage lose more?") can be
// answered later from committed data with zero API calls.
//
// WHY THIS EXISTS (maintainer ask, 2026-11-07): perk-stream.json keeps only
// per-hero-role rollups and drops the match, so the lineup of each team was
// gone once counted and any comp-level question needed the stream re-read.
// These rows are that lineup and nothing more, so the format can stay
// fixed and be read back for any patch.
//
// Layout: data/aggregates/team-comps/<patch>/<YYYY-MM-DD>.jsonl.gz (gzip), one ranked
// match per line, filed by the UTC day the match ENDED. A day file only
// changes while that day is still being read, so the history stays small in
// git. coverage.json in the same folder lists which stretches of the stream
// were read and how (daily = every match; sample = spaced pages), so a reader
// knows whether a day is complete.
//
// Row (TeamCompRow): { id, end, dur, win, teams: [team0, team1] }, with each
// team a list of [heroSlug, role, tierIdx | null, build?, final?, stats?, perks?, level?, buildSecs?, extra?]
// (v3 appends level, purchase seconds and EXTRA_KEYS; v2 adds the whole
// build: completed items in purchase order and the final inventory, so builds can be
// read against comps and matchups) (tier = rank AT MATCH TIME,
// match-rank.ts; null when pred.gg could not resolve it). win = index of the
// winning team in `teams` (the stream's teamId). Rows are deduped by match id
// within a day file, so a re-read page (resume after a crash) never doubles a match.
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync, renameSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const TEAM_COMPS_DIR = path.join(ROOT, 'data/aggregates/team-comps');
export const FORMAT = 'team-comps/v3';

/** v2 (2026-11-08) appends, per player: the whole build (every completed item, Epic passives and actives
 *  and Legendary crests, in purchase order), the final inventory (any rarity), the player's output totals
 *  in STAT_KEYS order, and the raw perk names they ran (augment, Eternal, minors; decode with the perk
 *  catalog, match-stream.ts loadoutOf). v1 rows (the 1.18 seed sample) have 3 elements. */
export type Slot = [hero: string, role: string, tier: number | null, build?: string[], final?: string[], stats?: number[], perks?: string[], level?: number | null, buildSecs?: number[], extra?: number[]];
/** v3 (2026-11-08, appended; v2 rows simply lack them): the final hero level, the game second each
 *  build item was bought (aligned with build), and EXTRA_KEYS totals: hero damage taken by type,
 *  healing by source, lane / jungle / enemy-jungle minions, best killing spree and multikill. */
export const EXTRA_KEYS = ['takenPhysHeroes', 'takenMagHeroes', 'takenTrueHeroes', 'healItem', 'healCrest', 'healUtility', 'laneMinions', 'jungleMinions', 'enemyJungleMinions', 'spree', 'multikill'] as const;
const EXTRA_OF: Record<(typeof EXTRA_KEYS)[number], (p: any) => unknown> = {
  takenPhysHeroes: (p) => p.damageHealData?.physicalDamageTakenFromHeroes, takenMagHeroes: (p) => p.damageHealData?.magicalDamageTakenFromHeroes,
  takenTrueHeroes: (p) => p.damageHealData?.trueDamageTakenFromHeroes, healItem: (p) => p.damageHealData?.itemHealingDone,
  healCrest: (p) => p.damageHealData?.crestHealingDone, healUtility: (p) => p.damageHealData?.utilityHealingDone,
  laneMinions: (p) => p.minionData?.laneMinionsKilled, jungleMinions: (p) => p.minionData?.neutralMinionsKilled,
  enemyJungleMinions: (p) => p.minionData?.neutralMinionsEnemyJungle, spree: (p) => p.combatData?.largestKillingSpree,
  multikill: (p) => p.combatData?.largestMultiKill,
};
export const extraOf = (p: any): number[] => EXTRA_KEYS.map((k) => { const v = Number(EXTRA_OF[k](p)); return Number.isFinite(v) ? Math.round(v) : -1; });

/** Output totals kept per player (whole game; divide by the row's dur / 60 for per-minute). Same set the
 *  2026-10-29 output pull summed (predgg-output.json, never merged): damage by type, taken, mitigation,
 *  healing, shields, K/D/A, farm, gold, wards. */
export const STAT_KEYS = ['dmgHeroes', 'physHeroes', 'magHeroes', 'trueHeroes', 'dmgStructures', 'dmgObjectives', 'taken', 'takenHeroes', 'mitigated', 'healing', 'shieldsReceived', 'kills', 'deaths', 'assists', 'minions', 'gold', 'wardsPlaced', 'wardsDestroyed'] as const;
const STAT_OF: Record<(typeof STAT_KEYS)[number], (p: any) => unknown> = {
  dmgHeroes: (p) => p.damageHealData?.totalDamageDealtToHeroes, physHeroes: (p) => p.damageHealData?.physicalDamageDealtToHeroes,
  magHeroes: (p) => p.damageHealData?.magicalDamageDealtToHeroes, trueHeroes: (p) => p.damageHealData?.trueDamageDealtToHeroes,
  dmgStructures: (p) => p.damageHealData?.totalDamageDealtToStructures, dmgObjectives: (p) => p.damageHealData?.totalDamageDealtToObjectives,
  taken: (p) => p.damageHealData?.totalDamageTaken, takenHeroes: (p) => p.damageHealData?.totalDamageTakenFromHeroes,
  mitigated: (p) => p.damageHealData?.totalDamageMitigated, healing: (p) => p.damageHealData?.totalHealingDone,
  shieldsReceived: (p) => p.damageHealData?.totalShieldingReceived,
  kills: (p) => p.combatData?.kills, deaths: (p) => p.combatData?.deaths, assists: (p) => p.combatData?.assists,
  minions: (p) => p.minionData?.minionsKilled, gold: (p) => p.incomeData?.goldEarned,
  wardsPlaced: (p) => p.wardsData?.wardsPlaced, wardsDestroyed: (p) => p.wardsData?.wardsDestroyed,
};
/** A stream player's output totals in STAT_KEYS order (missing = -1, never guessed). */
export const statsOf = (p: any): number[] => STAT_KEYS.map((k) => { const v = Number(STAT_OF[k](p)); return Number.isFinite(v) ? Math.round(v) : -1; });
export interface TeamCompRow { id: string; end: string; dur: number; win: 0 | 1; teams: [Slot[], Slot[]] }
export interface Coverage {
  format: string; patch: string; patchReleasedAt: string; note: string;
  segments: { from: string; to: string; via: 'daily' | 'sample' | 'backfill'; matches: number; requests?: number; upgraded?: number }[];
}

const COVERAGE_NOTE = 'Stretches of the pred.gg public match stream whose ranked matches are in this folder. via "daily" = every ranked match in [from, to] (npm run perks); via "backfill" = every ranked match in [from, to], read after the fact (npm run comps:backfill); via "sample" = spaced pages across [from, to], NOT every match. Day files are <YYYY-MM-DD>.jsonl.gz (gzip JSON lines; older plain .jsonl is still read) by match end time (UTC); see engine/src/ingest/team-comps.ts for the row format.';

/** Folder name for a patch; "1.18" stays "1.18", anything unsafe becomes "_". */
export const patchDir = (patch: string | null) => path.join(TEAM_COMPS_DIR, (patch ?? 'unknown').replace(/[^0-9A-Za-z._-]/g, '_'));

/**
 * Build one row from a decoded match. Players without a lane role or hero are
 * dropped; a match that does not leave exactly two teams is not a lineup row.
 */
export function toRow(
  m: { id: string; end: string; dur: number; winningTeam: string | number },
  players: { hero: string; role: string; team: string | number; tier: number | null; build?: string[]; final?: string[]; stats?: number[]; perks?: string[]; level?: number | null; buildSecs?: number[]; extra?: number[] }[],
): TeamCompRow | null {
  const teams: [Slot[], Slot[]] = [[], []];
  for (const p of players) {
    const t = Number(p.team);
    if (t !== 0 && t !== 1) return null;
    teams[t].push(p.build ? (p.buildSecs ? [p.hero, p.role, p.tier ?? null, p.build, p.final ?? [], p.stats ?? [], p.perks ?? [], p.level ?? null, p.buildSecs, p.extra ?? []] : [p.hero, p.role, p.tier ?? null, p.build, p.final ?? [], p.stats ?? [], p.perks ?? []]) : [p.hero, p.role, p.tier ?? null]);
  }
  const win = Number(m.winningTeam);
  if ((win !== 0 && win !== 1) || !teams[0].length || !teams[1].length) return null;
  return { id: m.id, end: m.end, dur: m.dur, win: win as 0 | 1, teams };
}

/** "2026-11-05 14:20:53" (stream, UTC) or ISO -> ISO with Z. */
export const isoEnd = (s: string) => (s.includes('T') ? s : `${s.replace(' ', 'T')}Z`);

/** A row carrying v2 builds (its first slot has a build array). */
const hasBuilds = (r: TeamCompRow) => r.teams.some((t) => t.some((s) => Array.isArray(s[3])));

/** Day file paths: gzip since v2 (full builds are ~2 KB a match); plain .jsonl is still read. */
const gzPath = (dir: string, day: string) => path.join(dir, `${day}.jsonl.gz`);
const txtPath = (dir: string, day: string) => path.join(dir, `${day}.jsonl`);

export function readDay(dir: string, day: string): TeamCompRow[] {
  const rows: TeamCompRow[] = [];
  const add = (txt: string) => { for (const line of txt.split('\n')) if (line.trim()) rows.push(JSON.parse(line) as TeamCompRow); };
  if (existsSync(txtPath(dir, day))) add(readFileSync(txtPath(dir, day), 'utf8'));
  if (existsSync(gzPath(dir, day))) add(gunzipSync(readFileSync(gzPath(dir, day))).toString('utf8'));
  return rows;
}

/**
 * Upserts rows into their day files. A match already on file is kept, unless
 * the stored row has no builds (a v1 sample row) and the new one does: then the
 * new row replaces it. flush() rewrites each touched day as one gzip file.
 */
export class TeamCompWriter {
  private days = new Map<string, Map<string, TeamCompRow>>();
  private dirty = new Set<string>();
  added = 0;
  upgraded = 0;
  constructor(readonly dir: string) {}

  private dayRows(day: string): Map<string, TeamCompRow> {
    let m = this.days.get(day);
    if (!m) { m = new Map(readDay(this.dir, day).map((r) => [r.id, r])); this.days.set(day, m); }
    return m;
  }

  add(row: TeamCompRow): boolean {
    const r = { ...row, end: isoEnd(row.end) };
    const day = r.end.slice(0, 10);
    const m = this.dayRows(day);
    const old = m.get(r.id);
    if (old && (hasBuilds(old) || !hasBuilds(r))) return false;
    if (old) this.upgraded++; else this.added++;
    m.set(r.id, r);
    this.dirty.add(day);
    return true;
  }

  flush() {
    if (!this.dirty.size) return;
    mkdirSync(this.dir, { recursive: true });
    for (const day of this.dirty) {
      const rows = [...this.days.get(day)!.values()].sort((a, b) => a.end.localeCompare(b.end) || a.id.localeCompare(b.id));
      // tmp + rename, so a reader (npm run comps) never sees a half-written day file
      const out = gzPath(this.dir, day);
      writeFileSync(`${out}.tmp`, gzipSync(rows.map((r) => JSON.stringify(r)).join('\n') + '\n', { level: 9 }));
      renameSync(`${out}.tmp`, out);
      if (existsSync(txtPath(this.dir, day))) unlinkSync(txtPath(this.dir, day));
    }
    this.dirty.clear();
    // Days not written in the last flush are dropped from memory (a long backfill spans many days).
    for (const day of [...this.days.keys()]) if (this.days.size > 3) this.days.delete(day);
  }
}

export function loadCoverage(dir: string, patch: string, patchReleasedAt: string): Coverage {
  const f = path.join(dir, 'coverage.json');
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8')) as Coverage;
  return { format: FORMAT, patch, patchReleasedAt, note: COVERAGE_NOTE, segments: [] };
}

export function saveCoverage(dir: string, c: Coverage) {
  mkdirSync(dir, { recursive: true });
  c.format = FORMAT; // rows written before v2 have no core items (3-element slots)
  writeFileSync(path.join(dir, 'coverage.json'), JSON.stringify(c, null, 1) + '\n');
}

/** Record a read stretch; a daily stretch that starts where the last daily one ended extends it. */
export function addCoverage(c: Coverage, seg: Coverage['segments'][number]) {
  const last = c.segments[c.segments.length - 1];
  if (last && last.via === seg.via && seg.via === 'daily' && last.to === seg.from) {
    last.to = seg.to; last.matches += seg.matches;
    if (seg.requests != null) last.requests = (last.requests ?? 0) + seg.requests;
  } else c.segments.push(seg);
}

/** Every row of one patch folder, oldest day first. */
export function readRows(dir: string): TeamCompRow[] {
  if (!existsSync(dir)) return [];
  const rows: TeamCompRow[] = [];
  const days = [...new Set(readdirSync(dir).map((x) => /^(\d{4}-\d{2}-\d{2})\.jsonl(\.gz)?$/.exec(x)?.[1]).filter((d): d is string => !!d))].sort();
  for (const d of days) rows.push(...readDay(dir, d));
  return rows;
}

/** Item lookups for decodeLineup, built once from data/catalog/items.json. */
export function itemMaps(items: { game_id: number | null; slug: string; rarity: string | null }[]) {
  return {
    build: new Map(items.filter((i) => (i.rarity === 'Epic' || i.rarity === 'Legendary') && i.game_id != null).map((i) => [i.game_id!, i.slug])),
    any: new Map(items.filter((i) => i.game_id != null).map((i) => [i.game_id!, i.slug])),
  };
}

/** One stream player's build (every completed Epic/Legendary item in purchase order, transaction 10),
 *  final inventory, output totals and raw perk names. */
export function buildOf(p: any, maps: ReturnType<typeof itemMaps>): { build: string[]; final: string[]; stats: number[]; perks: string[]; level: number | null; buildSecs: number[]; extra: number[] } {
  const build: string[] = [], buildSecs: number[] = [];
  for (const t of p.incomeData?.transactions ?? []) {
    // 10 and 11 are both purchases: some players' whole game is logged as 11 (probed 2026-11-08:
    // 138 of 640 transactions on one ranked page, Epic items at minute 9+), not only starting items.
    if (t?.transactionType !== 10 && t?.transactionType !== 11) continue;
    const sl = maps.build.get(t.itemId);
    if (sl && !build.includes(sl)) { build.push(sl); buildSecs.push(Math.round(Number(t.gameTime) || 0)); }
  }
  const final = (p.inventoryData ?? []).map((it: any) => maps.any.get(it?.itemId)).filter((x: string | undefined): x is string => !!x);
  const perks = (p.heroPerkData ?? []).map((x: any) => String(x?.perkName ?? '')).filter(Boolean);
  const level = Number(p.heroLevel);
  return { build, final, stats: statsOf(p), perks, level: Number.isFinite(level) && level > 0 ? level : null, buildSecs, extra: extraOf(p) };
}

/** A whole ranked stream match as a lineup row (same decoding as the daily perks loop). */
export function decodeLineup(m: any, slugByName: Map<string, string>, maps: ReturnType<typeof itemMaps>, ranks?: Map<string, number | null>): TeamCompRow | null {
  const roles = new Set(['carry', 'midlane', 'offlane', 'jungle', 'support']);
  const players: Parameters<typeof toRow>[1] = [];
  for (const p of m.playerData ?? []) {
    if (p.bIsAIPlayer === true || p.bIsAIPlayer === 'True') continue;
    const role = String(p.roleName ?? '').replace('ESelectedRole::', '').toLowerCase();
    if (!roles.has(role)) continue;
    const slug = slugByName.get(String(p.heroName ?? '').toLowerCase());
    if (!slug) continue;
    players.push({ hero: slug, role, team: String(p.teamId), tier: ranks?.get(String(p.playerId)) ?? null, ...buildOf(p, maps) });
  }
  return toRow({ id: String(m.matchId), end: String(m.endTime), dur: Number(m.gameDuration ?? 0), winningTeam: m.winningTeam }, players);
}
