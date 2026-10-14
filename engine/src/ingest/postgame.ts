// Post-game review ingest. Pulls ONE ranked match from pred.gg (match detail
// with its event timeline + each of our players' ranked per-hero record) and writes the computed
// FACTS to data/postgame/<matchId>.json. The blunt coaching narrative is added
// afterward by the agent pass (see docs / the coaching: null slot) — this step is
// purely the targeted, polite data pull + deterministic analysis.
//
//   npm run postgame -- <player-name | player-uuid | match-uuid> [--match <uuid>] [--team dawn|dusk]
//
// Resolution:
//   - a match-uuid arg                 -> that match; our team defaults to the
//                                         higher-VP-swing side unless --team given
//   - a player-uuid / player-name arg  -> that player's latest RANKED match;
//                                         our team = that player's team
//
// Source: pred.gg (needs PREDGG_CLIENT_ID/SECRET), sequential with backoff via
// gql(), per the data policy. This used omeda.city's player/match endpoints
// until they went to 503 (2026-08-28 onward) and omeda stopped publishing.

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData } from '../data.js';
import { computeMatchFacts, type OmedaMatch, type HeroStatCell, type PostGameInputs, type MatchEvent, type KillEvent } from '../postgame.js';
import { hasCredentials } from './predgg.js';
import { predggSquadMatches, fetchLaneMatchups, predggMatch, predggFindPlayer, predggLatestRankedMatchId, predggHeroStats } from './predgg-match.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const arg = (name: string): string | null => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
};

type Resolved = NonNullable<Awaited<ReturnType<typeof predggMatch>>>;

async function resolveMatch(input: string, heroes: { id: number; slug: string }[]): Promise<{ game: Resolved; subjectPid: string | null }> {
  const explicitMatch = arg('match');
  if (explicitMatch) {
    const game = await predggMatch(explicitMatch, heroes);
    if (!game) throw new Error(`match ${explicitMatch} not found`);
    return { game, subjectPid: UUID_RE.test(input) ? input : null };
  }
  // A bare uuid: try it as a match first.
  if (UUID_RE.test(input)) {
    const asMatch = await predggMatch(input, heroes);
    if (asMatch) return { game: asMatch, subjectPid: null };
  }
  // Otherwise treat input as a player (uuid or name) and take their latest ranked match.
  let pid = input;
  if (!UUID_RE.test(input)) {
    const found = await predggFindPlayer(input);
    if (!found) throw new Error(`no player found for "${input}"`);
    pid = found.uuid;
    console.log(`resolved player "${input}" -> ${found.name} (${pid})`);
  }
  await sleep(150);
  const latest = await predggLatestRankedMatchId(pid);
  if (!latest) throw new Error(`no ranked matches for player ${pid}`);
  await sleep(150);
  const game = await predggMatch(latest, heroes);
  if (!game) throw new Error(`match ${latest} not found`);
  return { game, subjectPid: pid };
}

interface SquadInfo { lead: string; uuids: Set<string>; nameByUuid: Map<string, string>; rolesByUuid: Map<string, { role: string; games: number; shrunkWr: number }[]>; }
function loadSquad(): SquadInfo | null {
  const p = path.join(ROOT, 'data/artifacts/squad.json');
  if (!existsSync(p)) return null;
  const s = JSON.parse(readFileSync(p, 'utf8'));
  const nameByUuid = new Map<string, string>();
  const rolesByUuid = new Map<string, { role: string; games: number; shrunkWr: number }[]>();
  for (const m of s.members ?? []) { nameByUuid.set(m.uuid, m.name); rolesByUuid.set(m.uuid, m.roles ?? []); }
  return { lead: s.lead, uuids: new Set([...nameByUuid.keys()]), nameByUuid, rolesByUuid };
}

async function main() {
  if (!hasCredentials()) { console.error('needs PREDGG_CLIENT_ID/SECRET in env (pred.gg is the match source)'); process.exit(1); }
  const data = loadData();
  const omedaHeroes = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/heroes.json'), 'utf8')) as { id: number; slug: string }[];
  const matrix = JSON.parse(readFileSync(path.join(ROOT, 'data/artifacts/matchup-matrix.json'), 'utf8')) as { minutes: number[]; pairs: Record<string, string> };

  // Squad mode: review every recent full/near-full-stack ranked game automatically.
  if (process.argv.includes('--squad')) {
    const squad = loadSquad();
    if (!squad) { console.error('no data/artifacts/squad.json — run `npm run squad -- <lead-uuid>` first'); process.exit(1); }
    const minStack = Number(arg('min-stack') ?? 2);   // duos included per the maintainer (2026-08-07) — any game where squad members queued together gets film
    console.log(`squad mode (pred.gg): lead ${squad.nameByUuid.get(squad.lead)}, ranked games with >= ${minStack} of ${squad.uuids.size} members…`);
    const games = await predggSquadMatches(squad.lead, squad.uuids, squad.nameByUuid, omedaHeroes, minStack);
    if (!games.length) { console.log('no qualifying stacked ranked games on pred.gg.'); process.exit(0); }
    const force = process.argv.includes('--force');
    let added = 0;
    for (const g of games) {
      // Don't clobber an already-reviewed game (preserves the authored coaching
      // and any older omeda perf scores); --force re-pulls everything.
      if (!force && existsSync(path.join(ROOT, 'data/postgame', `${g.match.id}.json`))) {
        console.log(`  ${g.match.start_time.slice(0, 10)} ${g.match.id.slice(0, 8)} · already reviewed, skipping`);
        continue;
      }
      await generateOne(data, omedaHeroes, matrix, g.match, g.ourTeam, squad, { objectiveEvents: g.objectiveEvents, structureEvents: g.structureEvents, killEvents: g.killEvents });
      added++;
      console.log(`  ${g.match.start_time.slice(0, 10)} ${g.match.id.slice(0, 8)} · stack ${g.members.length} [${g.members.join(', ')}] · NEW`);
    }
    console.log(`(${added} new, ${games.length - added} already reviewed)`);
    writeIndex();
    console.log(`\n${games.length} squad games reviewed (pred.gg) -> data/postgame/. Next: agent coaching pass on each.`);
    return;
  }

  const input = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!input) { console.error('usage: npm run postgame -- <player-name | player-uuid | match-uuid> [--match <uuid>] [--team dawn|dusk]  |  npm run postgame -- --squad [--min-stack 4]'); process.exit(1); }

  const { game, subjectPid } = await resolveMatch(input, omedaHeroes);
  const match = game.match;

  // Our team: --team override, else the subject player's team, else the side that
  // GAINED VP (so a bare match id still picks the "owning" side sensibly).
  let ourTeam = arg('team');
  if (!ourTeam && subjectPid) ourTeam = match.players.find((p) => p.id === subjectPid)?.team ?? null;
  if (!ourTeam) {
    const vpByTeam: Record<string, number> = {};
    for (const p of match.players) vpByTeam[p.team] = (vpByTeam[p.team] ?? 0) + (p.vp_change ?? 0);
    ourTeam = Object.entries(vpByTeam).sort((a, b) => b[1] - a[1])[0]?.[0] ?? match.winning_team;
  }
  const facts = await generateOne(data, omedaHeroes, matrix, match, ourTeam, loadSquad(), { objectiveEvents: game.objectiveEvents, structureEvents: game.structureEvents, killEvents: game.killEvents });
  writeIndex();
  const us = facts.players.filter((p: any) => p.us);
  console.log(`\n${facts.result.toUpperCase()} · ${facts.durationMin}m · VP ${facts.vpSwing ?? '?'}`);
  console.log('lanes:', facts.lanes.map((l: any) => `${l.role}:${l.edge[0]}`).join(' '));
  console.log('comp flags:', facts.comp.flags.length, '| our players with build flags:', us.filter((p: any) => p.matchupItemFlags.length).length);
  console.log(`\n-> data/postgame/${match.id}.json`);
  console.log('Next: run the agent coaching pass to populate facts.coaching (blunt per-player + team review).');
}

const OUT_DIR = path.join(ROOT, 'data/postgame');

/** Fetch the experience + artifacts a match needs, compute facts (tagging known
 *  squad members), and write data/postgame/<id>.json. Returns the facts. */
async function generateOne(
  data: ReturnType<typeof loadData>, omedaHeroes: { id: number; slug: string }[],
  matrix: { minutes: number[]; pairs: Record<string, string> }, match: OmedaMatch, ourTeam: string, squad: SquadInfo | null,
  events?: { objectiveEvents: MatchEvent[]; structureEvents: MatchEvent[]; killEvents?: KillEvent[] },
) {
  const heroStats = new Map<string, HeroStatCell[]>();
  for (const p of match.players.filter((q) => q.team === ourTeam)) {
    // Per-hero record is a garnish here — heroPools below (committed) covers
    // the experience read — so a failed pull degrades to an empty cell instead
    // of killing the whole review while the interesting game goes unreviewed.
    // Private profiles carry a placeholder id and are skipped.
    if (!UUID_RE.test(p.id)) { heroStats.set(p.id, []); continue; }
    try {
      heroStats.set(p.id, await predggHeroStats(p.id, omedaHeroes));
    } catch (e) {
      console.error(`  (pred.gg hero statistics unavailable for ${p.id.slice(0, 8)} — ${(e as Error).message.slice(-40)}; continuing without)`);
      heroStats.set(p.id, []);
    }
    await sleep(200);
  }
  const artifacts = new Map<string, any>();
  const adir = path.join(ROOT, 'data/artifacts');
  for (const p of match.players) {
    const slug = (omedaHeroes.find((h) => h.id === p.hero_id)?.slug) ?? '';
    if (slug && !artifacts.has(slug) && existsSync(path.join(adir, `${slug}.json`))) {
      artifacts.set(slug, JSON.parse(readFileSync(path.join(adir, `${slug}.json`), 'utf8')));
    }
  }
  // pred.gg hero pools (committed, current) for the experience read; they take
  // precedence over the live per-hero record above.
  const heroPools = new Map<string, { slug: string; games: number; shrunkWr: number }[]>();
  for (const p of match.players.filter((q) => q.team === ourTeam)) {
    const pf = path.join(ROOT, 'data/artifacts/players', `${p.id}.json`);
    if (existsSync(pf)) { try { heroPools.set(p.id, JSON.parse(readFileSync(pf, 'utf8')).pool ?? []); } catch { /* ignore */ } }
  }
  const inputs: PostGameInputs = { match, ourTeam, omedaHeroes, heroStats, matrix, artifacts, objectiveEvents: events?.objectiveEvents, structureEvents: events?.structureEvents, killEvents: events?.killEvents, roleStats: squad?.rolesByUuid, heroPools };
  const facts: any = computeMatchFacts(data, inputs);
  // Empirical lane-matchup winrate from pred.gg (ground truth beside the sim).
  if (hasCredentials() && facts.lanes?.length) {
    const mu = await fetchLaneMatchups(facts.lanes.map((l: any) => ({ ourSlug: l.ourSlug, theirSlug: l.theirSlug })));
    for (const l of facts.lanes) l.predggMatchup = mu.get(`${l.ourSlug}|${l.theirSlug}`) ?? null;
  }
  // Tag known squad members + who is the lead ("you").
  if (squad) {
    for (const pl of facts.players) {
      pl.squadName = squad.nameByUuid.get(pl.pid) ?? null;
      pl.isLead = pl.pid === squad.lead;
    }
    facts.squad = {
      stackSize: facts.players.filter((p: any) => p.us && p.squadName).length,
      members: facts.players.filter((p: any) => p.us && p.squadName).map((p: any) => p.squadName),
    };
    // Rebuild the draft note with mapped squad names (private omeda profiles show
    // "🎮 private" otherwise).
    const off = facts.players.filter((p: any) => p.us && p.roleFit?.concern)
      .map((p: any) => `${p.squadName ?? p.name} (${p.roleFit.played}→${p.roleFit.bestRole})`);
    facts.draftNote = off.length ? `${off.length} of five queued off a bottom-two lane: ${off.join(', ')}.` : null;
  }
  // Preserve an already-authored coaching narrative across a facts refresh.
  const existing = path.join(OUT_DIR, `${match.id}.json`);
  if (existsSync(existing)) {
    try { const prev = JSON.parse(readFileSync(existing, 'utf8')); if (prev.coaching) facts.coaching = prev.coaching; } catch { /* ignore */ }
  }
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(existing, JSON.stringify(facts, null, 1));
  return facts;
}

/** Rebuild the UI index (latest first). */
function writeIndex() {
  const files = readdirSync(OUT_DIR).filter((f) => UUID_RE.test(f.replace('.json', '')) && f.endsWith('.json'));
  const matches = files.map((f) => JSON.parse(readFileSync(path.join(OUT_DIR, f), 'utf8')))
    .map((a) => ({ matchId: a.matchId, startTime: a.startTime, result: a.result, ourTeam: a.ourTeam, durationMin: a.durationMin, hasCoaching: !!a.coaching, stackSize: a.squad?.stackSize ?? null, members: a.squad?.members ?? null }))
    .sort((a, b) => (a.startTime < b.startTime ? 1 : -1));
  writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify({ generatedAt: new Date().toISOString(), matches }, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
