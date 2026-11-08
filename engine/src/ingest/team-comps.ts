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
// Layout: data/aggregates/team-comps/<patch>/<YYYY-MM-DD>.jsonl, one ranked
// match per line, filed by the UTC day the match ENDED. A day file only
// changes while that day is still being read, so the history stays small in
// git. coverage.json in the same folder lists which stretches of the stream
// were read and how (daily = every match; sample = spaced pages), so a reader
// knows whether a day is complete.
//
// Row (TeamCompRow): { id, end, dur, win, teams: [team0, team1] }, with each
// team a list of [heroSlug, role, tierIdx | null, coreItems?] (v2 adds the first
// three completed Epic items by purchase time, so builds can be read against comps) (tier = rank AT MATCH TIME,
// match-rank.ts; null when pred.gg could not resolve it). win = index of the
// winning team in `teams` (the stream's teamId). Rows are deduped by match id
// within a day file, so a re-read page (resume after a crash) never doubles a match.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const TEAM_COMPS_DIR = path.join(ROOT, 'data/aggregates/team-comps');
export const FORMAT = 'team-comps/v2';

/** v2 (2026-11-08) appends the player's first three completed Epic items (purchase order); v1 rows have 3 elements. */
export type Slot = [hero: string, role: string, tier: number | null, core?: string[]];
export interface TeamCompRow { id: string; end: string; dur: number; win: 0 | 1; teams: [Slot[], Slot[]] }
export interface Coverage {
  format: string; patch: string; patchReleasedAt: string; note: string;
  segments: { from: string; to: string; via: 'daily' | 'sample'; matches: number; requests?: number }[];
}

const COVERAGE_NOTE = 'Stretches of the pred.gg public match stream whose ranked matches are in this folder. via "daily" = every ranked match in [from, to] (npm run perks); via "sample" = spaced pages across [from, to], NOT every match. Day files are <YYYY-MM-DD>.jsonl by match end time (UTC); see engine/src/ingest/team-comps.ts for the row format.';

/** Folder name for a patch; "1.18" stays "1.18", anything unsafe becomes "_". */
export const patchDir = (patch: string | null) => path.join(TEAM_COMPS_DIR, (patch ?? 'unknown').replace(/[^0-9A-Za-z._-]/g, '_'));

/**
 * Build one row from a decoded match. Players without a lane role or hero are
 * dropped; a match that does not leave exactly two teams is not a lineup row.
 */
export function toRow(
  m: { id: string; end: string; dur: number; winningTeam: string | number },
  players: { hero: string; role: string; team: string | number; tier: number | null; core?: string[] }[],
): TeamCompRow | null {
  const teams: [Slot[], Slot[]] = [[], []];
  for (const p of players) {
    const t = Number(p.team);
    if (t !== 0 && t !== 1) return null;
    teams[t].push(p.core ? [p.hero, p.role, p.tier ?? null, p.core] : [p.hero, p.role, p.tier ?? null]);
  }
  const win = Number(m.winningTeam);
  if ((win !== 0 && win !== 1) || !teams[0].length || !teams[1].length) return null;
  return { id: m.id, end: m.end, dur: m.dur, win: win as 0 | 1, teams };
}

/** "2026-11-05 14:20:53" (stream, UTC) or ISO -> ISO with Z. */
export const isoEnd = (s: string) => (s.includes('T') ? s : `${s.replace(' ', 'T')}Z`);

/**
 * Appends rows to their day files, skipping ids a day file already holds.
 * Call add() per match and flush() at each checkpoint.
 */
export class TeamCompWriter {
  private seen = new Map<string, Set<string>>();
  private pending = new Map<string, string[]>();
  added = 0;
  constructor(readonly dir: string) {}

  private idsFor(day: string): Set<string> {
    let s = this.seen.get(day);
    if (!s) {
      s = new Set();
      const f = path.join(this.dir, `${day}.jsonl`);
      if (existsSync(f)) for (const line of readFileSync(f, 'utf8').split('\n')) if (line.trim()) s.add((JSON.parse(line) as TeamCompRow).id);
      this.seen.set(day, s);
    }
    return s;
  }

  add(row: TeamCompRow): boolean {
    const day = isoEnd(row.end).slice(0, 10);
    const ids = this.idsFor(day);
    if (ids.has(row.id)) return false;
    ids.add(row.id);
    const p = this.pending.get(day) ?? [];
    p.push(JSON.stringify({ ...row, end: isoEnd(row.end) }));
    this.pending.set(day, p);
    this.added++;
    return true;
  }

  flush() {
    if (!this.pending.size) return;
    mkdirSync(this.dir, { recursive: true });
    for (const [day, lines] of this.pending) appendFileSync(path.join(this.dir, `${day}.jsonl`), lines.join('\n') + '\n');
    this.pending.clear();
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
  for (const f of readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(x)).sort()) {
    for (const line of readFileSync(path.join(dir, f), 'utf8').split('\n')) if (line.trim()) rows.push(JSON.parse(line) as TeamCompRow);
  }
  return rows;
}
