// Head-to-head lane records computed from the OPEN omeda.city ranked feed —
// no credentials, no scopes. Every ranked match pairs the two teams by role
// (our carry vs their carry, …), so "A beats B in lane" is directly countable.
//
//   npm run matchups:feed                 # walk the feed from the patch start
//   PATCH_START=2026-06-30 npm run matchups:feed
//
// Output: data/aggregates/feed-matchups.json — directed pairs "a|b" = a's
// record into b in the SAME role, { wr, n }, kept at n >= 20. Same shape the
// pred.gg matchup-evidence pass writes, so the UI merges them (pred.gg pairs
// overlay these when that pass unlocks — bigger patch-wide samples, plus
// firstTowerDiff). Includes the same sim-vs-field validation block.
//
// Politeness: sequential pages, 150ms delay, identified UA. This is the one
// pass that walks a long window (the whole patch) — run it rarely; daily
// updates only extend from the last committed cursor date.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const UA = { 'User-Agent': 'pred-counter-scout (github.com/Kendubu1/pred-counter-scout)' };
const ROLES = new Set(['carry', 'midlane', 'offlane', 'jungle', 'support']);
const MIN_GAMES = 20;
const MAX_PAGES = 1400;                       // hard cap ≈ the whole patch window
const PATCH_START = process.env.PATCH_START || '2026-06-30';
// keep in sync with aggregate.ts FEED_ID_ALIASES (not imported: it runs on import)
const FEED_ID_ALIASES: Record<number, string> = { 75: 'legion', 76: 'ikra' };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function fetchPage(url: string): Promise<any> {
  for (let a = 0; a < 4; a++) {
    try { const res = await fetch(url, { headers: UA }); if (res.ok) return await res.json(); } catch { /* retry */ }
    await sleep(1500 * (a + 1));
  }
  throw new Error(`feed fetch failed: ${url}`);
}

const OUT = path.join(ROOT, 'data/aggregates/feed-matchups.json');

async function main() {
  // Incremental: if a committed file carries raw `cells`, resume 1s after its
  // window end and merge counts; else walk the whole patch from PATCH_START.
  let existing: any = null;
  try { existing = JSON.parse(readFileSync(OUT, 'utf8')); } catch { /* fresh */ }
  const resume = existing?.cells && existing?.window?.to;
  const windowFrom = resume ? existing.window.from : PATCH_START;
  const startTs = resume
    ? Math.floor(new Date(existing.window.to).getTime() / 1000) + 1
    : Math.floor(new Date(`${PATCH_START}T00:00:00Z`).getTime() / 1000);
  if (resume) console.log(`resuming from ${existing.window.to} (window began ${windowFrom})`);
  const omedaHeroes = JSON.parse(readFileSync(path.join(ROOT, 'data/omeda/heroes.json'), 'utf8'));
  const arr = Array.isArray(omedaHeroes) ? omedaHeroes : Object.values(omedaHeroes);
  const idToSlug = new Map<number, string>(arr.map((h: any) => [h.id, h.slug]));
  for (const [id, slug] of Object.entries(FEED_ID_ALIASES)) if (!idToSlug.has(Number(id))) idToSlug.set(Number(id), slug);

  const cells = new Map<string, { n: number; w: number }>(resume ? Object.entries(existing.cells as Record<string, { n: number; w: number }>) : []);
  let url: string | null = `https://omeda.city/matches.json?per_page=100&timestamp=${startTs}`;
  let pages = 0, matches = 0, pairsCounted = 0, lastStart = '';
  while (url && pages < MAX_PAGES) {
    const page = await fetchPage(url);
    pages++;
    for (const m of page.matches ?? []) {
      if (m.game_mode !== 'ranked' || !m.winning_team) continue;
      matches++;
      lastStart = m.start_time;
      // index each team's players by role; count one directed pair per lane
      const byTeamRole = new Map<string, Map<string, string>>();
      for (const p of m.players ?? []) {
        const role = p.role && ROLES.has(p.role) ? p.role : null;
        if (!role || !p.hero_id) continue;
        const slug = idToSlug.get(p.hero_id) ?? null;
        if (!slug) continue;
        let tr = byTeamRole.get(p.team);
        if (!tr) { tr = new Map(); byTeamRole.set(p.team, tr); }
        if (!tr.has(role)) tr.set(role, slug);       // duplicate-role rows: keep first
      }
      const teams = [...byTeamRole.keys()];
      if (teams.length !== 2) continue;
      const [t1, t2] = teams;
      for (const role of ROLES) {
        const a = byTeamRole.get(t1!)!.get(role), b = byTeamRole.get(t2!)!.get(role);
        if (!a || !b || a === b) continue;
        const aWon = t1 === m.winning_team;
        const fwd = cells.get(`${a}|${b}`) ?? { n: 0, w: 0 };
        fwd.n++; if (aWon) fwd.w++; cells.set(`${a}|${b}`, fwd);
        const rev = cells.get(`${b}|${a}`) ?? { n: 0, w: 0 };
        rev.n++; if (!aWon) rev.w++; cells.set(`${b}|${a}`, rev);
        pairsCounted++;
      }
    }
    url = page.cursor ? `https://omeda.city/matches.json?per_page=100&timestamp=${startTs}&cursor=${encodeURIComponent(page.cursor)}` : null;
    if (pages % 50 === 0) console.log(`  page ${pages}: ${matches} ranked matches, ${pairsCounted} lane pairs, at ${lastStart}`);
    await sleep(150);
  }

  const pairs: Record<string, { wr: number; n: number; towerDiff: null }> = {};
  for (const [key, c] of cells) if (c.n >= MIN_GAMES) pairs[key] = { wr: Math.round((c.w / c.n) * 1000) / 10, n: c.n, towerDiff: null };

  // sim-vs-field validation (same method as matchup-evidence.ts)
  let both = 0, agree = 0, simEven = 0, fieldEven = 0;
  try {
    const mx = JSON.parse(readFileSync(path.join(ROOT, 'data/artifacts/matchup-matrix.json'), 'utf8')) as { pairs: Record<string, string> };
    const cps = (a: string, b: string): number | null => {
      const fwd = mx.pairs[`${a}|${b}`];
      if (fwd != null) return [...fwd].reduce((s, c) => s + (c === 'y' ? 1 : c === 'e' ? -1 : 0), 0);
      const rev = mx.pairs[`${b}|${a}`];
      if (rev != null) return -[...rev].reduce((s, c) => s + (c === 'y' ? 1 : c === 'e' ? -1 : 0), 0);
      return null;
    };
    for (const [key, p] of Object.entries(pairs)) {
      const [a, b] = key.split('|');
      const s = cps(a!, b!);
      if (s == null) continue;
      const fieldCall = p.wr >= 52 ? 1 : p.wr <= 48 ? -1 : 0;
      const simCall = s > 0 ? 1 : s < 0 ? -1 : 0;
      if (!fieldCall) { fieldEven++; continue; }
      if (!simCall) { simEven++; continue; }
      both++;
      if (fieldCall === simCall) agree++;
    }
  } catch { /* no matrix */ }

  const windowTo = lastStart || existing?.window?.to || PATCH_START;
  const totalMatches = matches + (resume ? (existing.window.matches ?? 0) : 0);
  writeFileSync(OUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: `omeda.city ranked match feed (official Omeda public API): same-role lane pairs, ${windowFrom} -> ${String(windowTo).slice(0, 10)}; directed "a|b" = a's record into b, n >= ${MIN_GAMES}`,
    note: 'EMPIRICAL head-to-head lane records computed from the open feed — no rank filter (all ranks). Raw `cells` persist ALL pairs so reruns resume incrementally from window.to; `pairs` is the n-gated consumable.',
    window: { from: windowFrom, to: windowTo, matches: totalMatches, pages },
    validation: both
      ? { pairsCompared: both, simAgrees: agree, agreementRate: Math.round((agree / both) * 1000) / 10, simSaidEven: simEven, fieldSaidEven: fieldEven, method: 'sim net kill-window verdict vs field winrate, counted only where both commit (field >=52% or <=48%, sim net != 0)' }
      : null,
    pairs,
    cells: Object.fromEntries([...cells.entries()].sort()),
  }, null, 1));
  console.log(`\n${matches} new ranked matches (${totalMatches} total) -> ${Object.keys(pairs).length} evidenced pairs (n>=${MIN_GAMES}) -> ${OUT}`);
  if (both) console.log(`validation: sim agrees with the field on ${agree}/${both} committed pairs (${Math.round((agree / both) * 1000) / 10}%)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
