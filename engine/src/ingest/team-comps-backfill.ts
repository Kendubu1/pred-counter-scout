// npm run comps:backfill — one-off re-read of the public match stream to fill
// lineup rows (with full builds and rank at match time) for a stretch the
// daily perks pull already counted before it kept lineups. Default stretch:
// patchReleasedAt -> perk-stream.json's cursor, so it meets the daily pull
// exactly and never touches perk-stream / build counts (no double counting).
// Resumable: progress in data/aggregates/team-comps/<patch>/backfill-state.json.
// Politeness: sequential, 2s between stream calls, project User-Agent,
// fetchPage's 403/429 back-off ladder; ranks via one aliased GraphQL call a page.
//
//   npm run comps:backfill                     # resume or start
//   MAX_REQUESTS=500 npm run comps:backfill    # cap one run
//   MAX_REQUESTS=400 npm run comps:backfill -- --resume-only
//                                              # daily job: only finish one already started
// The state file is COMMITTED while a backfill is open, so the daily job (a fresh
// checkout) resumes it in slices; coverage.json carries the stretch done so far as
// a 'backfill' segment (to = the cursor) and the sample segment until it completes.
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { epoch, fetchPage, sleep } from './match-stream.js';
import { matchTimeRanks } from './match-rank.js';
import { TeamCompWriter, addCoverage, decodeLineup, itemMaps, loadCoverage, patchDir, saveCoverage } from './team-comps.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p: string) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const MAX = Number(process.env.MAX_REQUESTS ?? 10000);

async function main() {
  const meta = read('data/catalog/META.json');
  const ps = read('data/aggregates/perk-stream.json');
  const dir = patchDir(meta.patch);
  const STATE = path.join(dir, 'backfill-state.json');
  if (process.argv.includes('--resume-only') && !existsSync(STATE)) { console.log('no open lineup backfill; nothing to do'); return; }
  const st = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8'))
    : { from: meta.patchReleasedAt, to: new Date(ps.cursor * 1000).toISOString(), cursor: epoch(meta.patchReleasedAt.replace('T', ' ').replace('Z', '')), boundaryIds: [] as string[], requests: 0, matches: 0, upgraded: 0 };
  const stopAt = epoch(st.to.replace('T', ' ').replace(/\.\d+Z$|Z$/, ''));
  const heroes = read('data/catalog/heroes.json') as { slug: string; name: string }[];
  const slugByName = new Map(heroes.map((h) => [h.name.toLowerCase(), h.slug]));
  const maps = itemMaps(read('data/catalog/items.json'));
  const w = new TeamCompWriter(dir);
  const covSeg = (to: string, done: boolean) => {
    const cov = loadCoverage(dir, meta.patch, meta.patchReleasedAt);
    cov.segments = cov.segments.filter((s) => !(s.via === 'backfill' && s.from === st.from) && !(done && s.via === 'sample'));
    addCoverage(cov, { from: st.from, to, via: 'backfill', matches: st.matches + st.upgraded, requests: st.requests, upgraded: st.upgraded });
    cov.segments.sort((a, b) => a.from.localeCompare(b.from));
    saveCoverage(dir, cov);
  };
  const save = () => {
    w.flush(); st.matches += w.added; st.upgraded += w.upgraded; w.added = 0; w.upgraded = 0;
    writeFileSync(STATE, JSON.stringify(st, null, 1));
    covSeg(new Date(Math.min(st.cursor, stopAt) * 1000).toISOString(), false);
  };
  console.log(`backfill ${st.from} -> ${st.to}, resuming at ${new Date(st.cursor * 1000).toISOString()}`);
  let req = 0;
  while (req < MAX && st.cursor < stopAt) {
    const page = await fetchPage(st.cursor);
    if (!page) { console.log('stream refusing after back-off; saved, rerun to resume'); break; }
    req++; st.requests++;
    const boundary = new Set(st.boundaryIds);
    const fresh = page.filter((m) => m?.matchId && !boundary.has(m.matchId) && epoch(m.endTime) >= st.cursor && epoch(m.endTime) < stopAt);
    const ranked = fresh.filter((m) => m.gameMode === 'RANKED');
    const ranks = ranked.length ? await matchTimeRanks(ranked.map((m) => String(m.matchId))) : new Map();
    for (const m of ranked) { const row = decodeLineup(m, slugByName, maps, ranks.get(String(m.matchId))); if (row) w.add(row); }
    if (!page.length) break;
    const newest = Math.max(...page.map((m) => epoch(m.endTime)));
    const atNewest = page.filter((m) => epoch(m.endTime) === newest).map((m) => m.matchId);
    if (newest === st.cursor && !fresh.length) { st.cursor = newest + 1; st.boundaryIds = []; }
    else { st.boundaryIds = newest === st.cursor ? [...new Set([...st.boundaryIds, ...atNewest])] : atNewest; st.cursor = newest; }
    if (req % 25 === 0) save();
    if (req % 100 === 0) console.log(`  ${req} requests · at ${new Date(st.cursor * 1000).toISOString()} · ${st.matches + w.added} new, ${st.upgraded + w.upgraded} upgraded`);
    if (page.length < 20) break;
    await sleep(2000);
  }
  save();
  if (st.cursor >= stopAt) {
    covSeg(st.to, true);
    unlinkSync(STATE);
    console.log(`backfill complete: ${st.matches} new + ${st.upgraded} upgraded sample rows, ${st.requests} requests`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
