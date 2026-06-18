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

async function main() {
  const input = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!input) { console.error('usage: npm run postgame -- <player-name | player-uuid | match-uuid> [--match <uuid>] [--team dawn|dusk]'); process.exit(1); }

  const data = loadData();
  const omedaHeroes = JSON.parse(readFileSync(path.join(ROOT, 'data/omeda/heroes.json'), 'utf8')) as { id: number; slug: string }[];
  const matrix = JSON.parse(readFileSync(path.join(ROOT, 'data/artifacts/matchup-matrix.json'), 'utf8')) as { minutes: number[]; pairs: Record<string, string> };

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
  console.log(`match ${match.id.slice(0, 8)} · ${match.game_mode} · our team = ${ourTeam}`);

  // Per-player hero_statistics for OUR side (the experience comparison).
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
  const facts = computeMatchFacts(data, inputs);

  const outDir = path.join(ROOT, 'data/postgame');
  mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${match.id}.json`);
  writeFileSync(file, JSON.stringify(facts, null, 1));

  // Maintain an index for the UI (latest first).
  const index = readdirSync(outDir).filter((f) => UUID_RE.test(f.replace('.json', '')) && f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(path.join(outDir, f), 'utf8')))
    .map((a) => ({ matchId: a.matchId, startTime: a.startTime, result: a.result, ourTeam: a.ourTeam, durationMin: a.durationMin, hasCoaching: !!a.coaching }))
    .sort((a, b) => (a.startTime < b.startTime ? 1 : -1));
  writeFileSync(path.join(outDir, 'index.json'), JSON.stringify({ generatedAt: new Date().toISOString(), matches: index }, null, 1));

  const us = facts.players.filter((p) => p.us);
  console.log(`\n${facts.result.toUpperCase()} · ${facts.durationMin}m · VP ${facts.vpSwing ?? '?'}`);
  console.log('lanes:', facts.lanes.map((l) => `${l.role}:${l.edge[0]}`).join(' '));
  console.log('comp flags:', facts.comp.flags.length, '| our players with build flags:', us.filter((p) => p.matchupItemFlags.length).length);
  console.log(`\n-> ${file}`);
  console.log('Next: run the agent coaching pass to populate facts.coaching (blunt per-player + team review).');
}

main().catch((e) => { console.error(e); process.exit(1); });
