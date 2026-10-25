// Fork in the Road PROOF OF CONCEPT, step 1: pull a short window of RANKED
// matches from pred.gg's public stream into a compact local extract.
//
//   DAYS=3 npm run fork:poc:pull     # resumable; re-run to continue
//
// The production design (docs/fork-in-the-road.md section 8) counts forks inside
// the daily `npm run perks` loop with zero extra requests. The PoC cannot wait
// for that window to fill, so it reads a few days once (a new data requirement
// under the data policy) and keeps ONLY the fields the fork analysis needs:
// per player the ordered core purchases with gameTime, the per-minute gold
// curve, and own kill/death times. The extract lives in engine/copy-tasks/
// (gitignored scratch); only the computed result is committed.
//
// Politeness: sequential, 2s between calls, identified UA, the shared
// fetchPage backoff ladder.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { epoch, fetchPage, sleep } from './match-stream.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DIR = path.join(ROOT, 'engine/copy-tasks/fork-poc');
const ROWS = path.join(DIR, 'rows.jsonl');
const STATE = path.join(DIR, 'state.json');
const DAYS = Number(process.env.DAYS ?? 3);
const DELAY_MS = 2000;
const ROLES = new Set(['carry', 'midlane', 'offlane', 'jungle', 'support']);

export interface PocPlayer {
  pid: string; team: number; hero: string; role: string;
  /** cumulative gold earned, one entry per interval (≈ per minute) */
  gold: number[];
  /** distinct core (Epic passive) items in purchase order: [slug, gameTime s] */
  cores: [string, number][];
  kills: number[]; deaths: number[];
  /** damage dealt to heroes: [physical, magical, true] — labels the enemy from what it actually dealt */
  dmg: [number, number, number];
  /** total healing done (labels healers empirically) */
  heal: number;
}
export interface PocMatch { id: string; version: string; dur: number; winner: number; players: PocPlayer[] }

async function main() {
  mkdirSync(DIR, { recursive: true });
  const heroes = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/heroes.json'), 'utf8')) as { slug: string; name: string }[];
  const slugByName = new Map(heroes.map((h) => [h.name.toLowerCase(), h.slug]));
  const items = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/items.json'), 'utf8')) as { game_id: number | null; slug: string; slot_type: string | null; rarity: string | null }[];
  const coreByGameId = new Map(items.filter((i) => i.rarity === 'Epic' && i.slot_type === 'Passive' && i.game_id != null).map((i) => [i.game_id!, i.slug]));

  const now = Math.floor(Date.now() / 1000);
  const st: { from: number; cursor: number; boundary: string[]; matches: number; ranked: number; requests: number; unknownHeroes: string[] } =
    existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : { from: now - DAYS * 86400, cursor: now - DAYS * 86400, boundary: [], matches: 0, ranked: 0, requests: 0, unknownHeroes: [] };
  const unknown = new Set(st.unknownHeroes);
  const stopAt = now - 60;
  console.log(`fork PoC pull: ${new Date(st.from * 1000).toISOString()} -> now, resuming at ${new Date(st.cursor * 1000).toISOString()}`);

  while (st.cursor < stopAt) {
    const page = await fetchPage(st.cursor);
    if (!page) { console.log('  stream refusing after backoff; state saved, re-run to resume'); break; }
    st.requests++;
    const seen = new Set(st.boundary);
    const fresh = page.filter((m) => m?.matchId && !seen.has(m.matchId) && epoch(m.endTime) >= st.cursor);
    let out = '';
    for (const m of fresh) {
      st.matches++;
      if (m.gameMode !== 'RANKED') continue;
      const killsBy = new Map<string, number[]>(), deathsBy = new Map<string, number[]>();
      for (const k of m.heroKills ?? []) {
        if (k.killerPlayerId) (killsBy.get(k.killerPlayerId) ?? killsBy.set(k.killerPlayerId, []).get(k.killerPlayerId)!).push(k.gameTime);
        if (k.killedPlayerId) (deathsBy.get(k.killedPlayerId) ?? deathsBy.set(k.killedPlayerId, []).get(k.killedPlayerId)!).push(k.gameTime);
      }
      const players: PocPlayer[] = [];
      for (const p of m.playerData ?? []) {
        if (p.bIsAIPlayer) continue;
        const role = String(p.roleName ?? '').replace('ESelectedRole::', '').toLowerCase();
        if (!ROLES.has(role)) continue;
        const hero = slugByName.get(String(p.heroName ?? '').toLowerCase());
        if (!hero) { unknown.add(String(p.heroName)); continue; }
        const cores: [string, number][] = [];
        // transactionType 10 = purchase (11 = starting items, others = sells/undos)
        for (const t of p.incomeData?.transactions ?? []) {
          if (t?.transactionType !== 10) continue;
          const slug = coreByGameId.get(t.itemId);
          if (slug && !cores.some((c) => c[0] === slug)) cores.push([slug, t.gameTime]);
          if (cores.length === 4) break;
        }
        players.push({
          pid: String(p.playerId), team: p.teamId, hero, role,
          gold: p.incomeData?.goldEarnedAtInterval ?? [],
          cores, kills: killsBy.get(p.playerId) ?? [], deaths: deathsBy.get(p.playerId) ?? [],
          dmg: [p.damageHealData?.physicalDamageDealtToHeroes ?? 0, p.damageHealData?.magicalDamageDealtToHeroes ?? 0, p.damageHealData?.trueDamageDealtToHeroes ?? 0],
          heal: p.damageHealData?.totalHealingDone ?? 0,
        });
      }
      if (players.length < 10) continue; // need both lanes complete for opponents
      st.ranked++;
      const rec: PocMatch = { id: m.matchId, version: String(m.gameVersion ?? ''), dur: m.gameDuration, winner: m.winningTeam, players };
      out += JSON.stringify(rec) + '\n';
    }
    if (out) appendFileSync(ROWS, out);
    if (!page.length) break;
    const newest = Math.max(...page.map((m) => epoch(m.endTime)));
    const atNewest = page.filter((m) => epoch(m.endTime) === newest).map((m) => m.matchId);
    if (newest === st.cursor && fresh.length === 0) { st.cursor = newest + 1; st.boundary = []; }
    else { st.cursor = newest; st.boundary = atNewest; }
    st.unknownHeroes = [...unknown];
    writeFileSync(STATE, JSON.stringify(st));
    if (st.requests % 50 === 0) console.log(`  ${st.requests} requests, ${st.ranked} ranked matches kept, at ${new Date(st.cursor * 1000).toISOString()}`);
    await sleep(DELAY_MS);
  }
  console.log(`done: ${st.requests} requests, ${st.matches} matches seen, ${st.ranked} ranked kept -> ${path.relative(ROOT, ROWS)}`);
  if (unknown.size) console.log(`  unknown heroes (skipped, not guessed): ${[...unknown].join(', ')}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
