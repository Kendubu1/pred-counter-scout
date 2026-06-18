// Post-game review ingest. Pulls ONE ranked match from the omeda public API
// (match detail + each of our players' hero_statistics) and writes the computed
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
// Sanctioned source: official Omeda public API via omeda.city (UA-identified,
// sequential with backoff), per the data policy.

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData } from '../data.js';
import { computeMatchFacts, type OmedaMatch, type HeroStatCell, type PostGameInputs } from '../postgame.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const UA = { 'User-Agent': 'pred-counter-scout (github.com/Kendubu1/pred-counter-scout)' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function get(url: string): Promise<any> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (res.ok) return res.json();
      if (res.status === 429) { await sleep(2000 * (attempt + 1)); continue; }
      if (res.status === 404) return null;
      throw new Error(`${url} -> HTTP ${res.status}`);
    } catch (e) { if (attempt === 3) throw e; await sleep(1000 * (attempt + 1)); }
  }
  return null;
}

const arg = (name: string): string | null => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
};

async function resolveMatch(input: string): Promise<{ match: OmedaMatch; subjectPid: string | null }> {
  const explicitMatch = arg('match');
  if (explicitMatch) {
    const m = await get(`https://omeda.city/matches/${explicitMatch}.json`);
    if (!m) throw new Error(`match ${explicitMatch} not found`);
    return { match: m as OmedaMatch, subjectPid: UUID_RE.test(input) ? input : null };
  }
  // A bare match uuid: try it as a match first.
  if (UUID_RE.test(input)) {
    const asMatch = await get(`https://omeda.city/matches/${input}.json`);
    if (asMatch?.players) return { match: asMatch as OmedaMatch, subjectPid: null };
  }
  // Otherwise treat input as a player (uuid or name) and take their latest ranked match.
  let pid = input;
  if (!UUID_RE.test(input)) {
    const search = await get(`https://omeda.city/players.json?filter%5Bname%5D=${encodeURIComponent(input)}`);
    const found = (search?.players ?? search ?? [])[0];
    if (!found?.id) throw new Error(`no player found for "${input}"`);
    pid = found.id;
    console.log(`resolved player "${input}" -> ${found.display_name} (${pid})`);
  }
  await sleep(150);
  const pm = await get(`https://omeda.city/players/${pid}/matches.json`);
  const matches = (pm?.matches ?? pm ?? []) as { id: string; game_mode: string }[];
  const ranked = matches.find((m) => m.game_mode === 'ranked') ?? matches[0];
  if (!ranked) throw new Error(`no matches for player ${pid}`);
  await sleep(150);
  const full = await get(`https://omeda.city/matches/${ranked.id}.json`);
  if (!full) throw new Error(`match ${ranked.id} not found`);
  return { match: full as OmedaMatch, subjectPid: pid };
}

interface SquadInfo { lead: string; uuids: Set<string>; nameByUuid: Map<string, string>; }
function loadSquad(): SquadInfo | null {
  const p = path.join(ROOT, 'data/artifacts/squad.json');
  if (!existsSync(p)) return null;
  const s = JSON.parse(readFileSync(p, 'utf8'));
  const nameByUuid = new Map<string, string>();
  for (const m of s.members ?? []) nameByUuid.set(m.uuid, m.name);
  return { lead: s.lead, uuids: new Set([...nameByUuid.keys()]), nameByUuid };
}

/** Squad mode: from the committed squad, find the lead's recent ranked games that
 *  are full/near-full stacks (>= minStack members on one team) and review each. */
async function squadMatches(squad: SquadInfo, minStack: number): Promise<{ match: OmedaMatch; ourTeam: string; members: string[] }[]> {
  const pm = await get(`https://omeda.city/players/${squad.lead}/matches.json`);
  const list = (pm?.matches ?? pm ?? []) as { id: string; game_mode: string }[];
  const out: { match: OmedaMatch; ourTeam: string; members: string[] }[] = [];
  for (const m of list.filter((x) => x.game_mode === 'ranked')) {
    await sleep(180);
    const full = await get(`https://omeda.city/matches/${m.id}.json`) as OmedaMatch | null;
    if (!full?.players) continue;
    const leadP = full.players.find((p) => p.id === squad.lead);
    if (!leadP) continue;
    const members = full.players.filter((p) => p.team === leadP.team && squad.uuids.has(p.id)).map((p) => squad.nameByUuid.get(p.id)!);
    if (members.length >= minStack) out.push({ match: full, ourTeam: leadP.team, members });
  }
  return out;
}

async function main() {
  const data = loadData();
  const omedaHeroes = JSON.parse(readFileSync(path.join(ROOT, 'data/omeda/heroes.json'), 'utf8')) as { id: number; slug: string }[];
  const matrix = JSON.parse(readFileSync(path.join(ROOT, 'data/artifacts/matchup-matrix.json'), 'utf8')) as { minutes: number[]; pairs: Record<string, string> };

  // Squad mode: review every recent full/near-full-stack ranked game automatically.
  if (process.argv.includes('--squad')) {
    const squad = loadSquad();
    if (!squad) { console.error('no data/artifacts/squad.json — run `npm run squad -- <lead-uuid>` first'); process.exit(1); }
    const minStack = Number(arg('min-stack') ?? 4);
    console.log(`squad mode: lead ${squad.nameByUuid.get(squad.lead)}, finding ranked games with >= ${minStack} of ${squad.uuids.size} members…`);
    const found = await squadMatches(squad, minStack);
    if (!found.length) { console.log('no qualifying stacked ranked games in the lead\'s recent feed.'); process.exit(0); }
    for (const { match, ourTeam, members } of found) {
      await generateOne(data, omedaHeroes, matrix, match, ourTeam, squad);
      console.log(`  ${match.start_time.slice(0, 10)} ${match.id.slice(0, 8)} · stack ${members.length} [${members.join(', ')}]`);
    }
    writeIndex();
    console.log(`\n${found.length} squad games reviewed -> data/postgame/. Next: agent coaching pass on each.`);
    return;
  }

  const input = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!input) { console.error('usage: npm run postgame -- <player-name | player-uuid | match-uuid> [--match <uuid>] [--team dawn|dusk]  |  npm run postgame -- --squad [--min-stack 4]'); process.exit(1); }

  const { match, subjectPid } = await resolveMatch(input);

  // Our team: --team override, else the subject player's team, else the side that
  // GAINED VP (so a bare match id still picks the "owning" side sensibly).
  let ourTeam = arg('team');
  if (!ourTeam && subjectPid) ourTeam = match.players.find((p) => p.id === subjectPid)?.team ?? null;
  if (!ourTeam) {
    const vpByTeam: Record<string, number> = {};
    for (const p of match.players) vpByTeam[p.team] = (vpByTeam[p.team] ?? 0) + (p.vp_change ?? 0);
    ourTeam = Object.entries(vpByTeam).sort((a, b) => b[1] - a[1])[0]?.[0] ?? match.winning_team;
  }
  const facts = await generateOne(data, omedaHeroes, matrix, match, ourTeam, loadSquad());
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
) {
  const heroStats = new Map<string, HeroStatCell[]>();
  for (const p of match.players.filter((q) => q.team === ourTeam)) {
    const hs = await get(`https://omeda.city/players/${p.id}/hero_statistics.json`);
    heroStats.set(p.id, (hs?.hero_statistics ?? []) as HeroStatCell[]);
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
  const inputs: PostGameInputs = { match, ourTeam, omedaHeroes, heroStats, matrix, artifacts };
  const facts: any = computeMatchFacts(data, inputs);
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
  }
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.join(OUT_DIR, `${match.id}.json`), JSON.stringify(facts, null, 1));
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
