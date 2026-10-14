// Head-to-head lane records counted from a pred.gg ranked match sample. Every
// ranked match pairs the two teams by role (our carry vs their carry, …), so
// "A beats B in lane" is directly countable.
//
//   npm run matchups:feed                 # extend the current patch family's window
//   PER_HERO=400 npm run matchups:feed    # deeper per-hero sample (default 200)
//   PATCH_START=2026-10-13 npm run matchups:feed
//
// Output: data/aggregates/feed-matchups.json — directed pairs "a|b" = a's
// record into b in the SAME role, { wr, n }, kept at n >= 20. Same shape the
// pred.gg matchup-evidence pass writes, so the UI merges them (that pass needs
// the matchupStatistic scope our pred.gg app lacks, so this is the live source).
// Includes the same sim-vs-field validation block.
//
// History: this walked the open omeda.city ranked feed until it went to HTTP
// 503 (2026-09-21). It now uses the shared sampler (src/ingest/predgg-feed.ts),
// which needs PREDGG creds. The window is the CURRENT patch family (data/catalog/
// META.json patchFamilyReleasedAt, e.g. 1.17 + its hotfixes — the same window
// lanestats/genstats use): a committed file from an older family is replaced,
// not extended; a same-family rerun resumes from window.to and merges counts.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasCredentials } from './predgg.js';
import { sampleMatches } from './predgg-feed.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ROLES = new Set(['carry', 'midlane', 'offlane', 'jungle', 'support']);
const MIN_GAMES = 20;
const PER_HERO = Number(process.env.PER_HERO ?? 200);

const OUT = path.join(ROOT, 'data/aggregates/feed-matchups.json');

async function main() {
  if (!hasCredentials()) { console.error('needs PREDGG_CLIENT_ID/SECRET in env'); process.exit(1); }
  const meta = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/META.json'), 'utf8')) as { patchFamily?: string; patchFamilyReleasedAt?: string };
  const PATCH_START = process.env.PATCH_START || meta.patchFamilyReleasedAt?.slice(0, 10);
  if (!PATCH_START) throw new Error('no patch start: set PATCH_START or run npm run catalog');
  // Incremental within a patch: if the committed file covers this same patch
  // window and carries raw `cells`, resume 1s after its end and merge counts.
  let existing: any = null;
  try { existing = JSON.parse(readFileSync(OUT, 'utf8')); } catch { /* fresh */ }
  const resume = existing?.cells && existing?.window?.to && existing?.window?.from === PATCH_START;
  const windowFrom = PATCH_START;
  const from = resume ? new Date(new Date(existing.window.to).getTime() + 1000) : new Date(`${PATCH_START}T00:00:00Z`);
  const to = new Date();
  if (resume) console.log(`resuming from ${existing.window.to} (window began ${windowFrom})`);
  else if (existing?.window?.from) console.log(`committed window began ${existing.window.from}; patch start is ${PATCH_START} — starting fresh`);

  const { matches: sample, requests } = await sampleMatches({ from, to, gameModes: ['RANKED'], perHero: PER_HERO });
  const cells = new Map<string, { n: number; w: number }>(resume ? Object.entries(existing.cells as Record<string, { n: number; w: number }>) : []);
  let matches = 0, pairsCounted = 0, lastStart = '';
  for (const m of sample) {
    if (!m.winning_team) continue;
    matches++;
    lastStart = m.start_time;
    // index each team's players by role; count one directed pair per lane
    const byTeamRole = new Map<string, Map<string, string>>();
    for (const p of m.players) {
      const role = p.role && ROLES.has(p.role) ? p.role : null;
      if (!role) continue;
      let tr = byTeamRole.get(p.team);
      if (!tr) { tr = new Map(); byTeamRole.set(p.team, tr); }
      if (!tr.has(role)) tr.set(role, p.hero_slug);   // duplicate-role rows: keep first
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

  // The sampler walks each hero newest-first, so the window is closed at the
  // time we asked, not at the last match seen: resuming from lastStart would
  // re-count matches another hero's page had already reached.
  const windowTo = sample.length ? to.toISOString() : (resume ? existing.window.to : PATCH_START);
  const totalMatches = matches + (resume ? (existing.window.matches ?? 0) : 0);
  writeFileSync(OUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: `pred.gg ranked matches (sampled per hero, <= ${PER_HERO}/hero per run; src/ingest/predgg-feed.ts): same-role lane pairs, ${windowFrom} -> ${String(windowTo).slice(0, 10)}; directed "a|b" = a's record into b, n >= ${MIN_GAMES}`,
    note: 'EMPIRICAL head-to-head lane records from a per-hero match sample of the current patch — no rank filter (all ranks). Raw `cells` persist ALL pairs so same-patch reruns resume incrementally from window.to; `pairs` is the n-gated consumable.',
    window: { from: windowFrom, to: windowTo, matches: totalMatches, requests: requests + (resume ? (existing.window.requests ?? 0) : 0), patchFamily: meta.patchFamily ?? null },
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
