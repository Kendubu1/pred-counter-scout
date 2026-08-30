// Hero augment + Eternal (major AND minors) + crest evidence computed from
// pred.gg's PUBLIC bulk match feed — the dev-sanctioned path after the
// statistics GraphQL scopes were declined (2026-08-29, pred.gg Discord:
// "we dont expose these endpoints ... you can fetch all matches yourself
// and calculate that stuff yourself" -> /api/public/get-matches-since/).
//
// Feed mechanics (probed 2026-08-29):
//   GET https://pred.gg/api/public/get-matches-since/<epoch-seconds>/
//   -> 20 matches ordered by endTime; cursor = last endTime (inclusive, so
//   dedupe by matchId); no page-size parameter. Matches carry per player:
//   heroName, roleName (ESelectedRole::X), heroPerkData (internal perk
//   names: Perk_* augment, Eternal_* major, Blessing_* minors),
//   inventoryData (itemId joins omeda game_id; crests are slot_type Crest),
//   bIsAIPlayer, teamId; match carries gameMode/winningTeam/times.
//
// Output: data/aggregates/predgg-augments.json in the SAME shape the old
// simpleBuild ingest wrote (catalog/eternals/heroes cells) so artifacts,
// UI and review passes work unchanged — plus per-Eternal minor winrates
// (minors on each eternal row), which simpleBuild never exposed.
//
// Resumable: state (cursor + tallies) persists to engine/.cache/ every
// SAVE_EVERY pages; re-running continues the same window. Raw pages are
// never stored (a full patch of raw JSON would be tens of GB).
//
//   PREDGG_CLIENT_ID/SECRET      needed only for the perk CATALOG queries
//   WINDOW_DAYS=3 (default)      crawl window ending now
//   SINCE=<epoch>                overrides the window start
//   MAX_PAGES=<n>                safety stop for a partial run (still saves)
//   RESET=1                      discard saved state and start the window over

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gql, hasCredentials } from './predgg.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CACHE = path.join(ROOT, 'engine/.cache');
const STATE_FILE = path.join(CACHE, 'match-perks-state.json');
const UA = 'pred-counter-scout (github.com/Kendubu1/pred-counter-scout)';
// 2026-08-29: ~2-3 req/s drew a transient HTTP 403 (rate limit / bot guard)
// a few dozen pages in; it clears on its own within seconds. Pace gentler
// and treat 403/429 as a long cool-down, not a failure.
const PAGE_DELAY_MS = 450;
const SAVE_EVERY = 100;
const MIN_DURATION_S = 300;

// pred.gg internal codenames -> in-game display names (same rule as the
// old simpleBuild ingest; verified by identical minor sets).
const ETERNAL_DISPLAY: Record<string, string> = { Knell: 'Rust' };

interface NW { n: number; w: number }
interface CellTally {
  games: number;
  aug: Record<string, NW>;            // Perk_* internal name
  et: Record<string, NW>;             // Eternal_* internal name
  minor: Record<string, NW>;          // `${Eternal_*}|${Blessing_*}`
  crest: Record<string, NW>;          // itemId as string
}
interface State { since: number; cursor: number; pages: number; matches: number; ranked: number; kept: number; seen: string[]; tallies: Record<string, CellTally> }

const ROLE_MAP: Record<string, string> = {
  'ESelectedRole::Carry': 'carry', 'ESelectedRole::Midlane': 'midlane', 'ESelectedRole::Offlane': 'offlane',
  'ESelectedRole::Jungle': 'jungle', 'ESelectedRole::Support': 'support',
};

function bump(rec: Record<string, NW>, key: string, win: boolean) {
  const r = (rec[key] ??= { n: 0, w: 0 });
  r.n++; if (win) r.w++;
}

async function fetchPage(cursor: number): Promise<any[]> {
  let lastErr: unknown;
  let delay = 2000;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const res = await fetch(`https://pred.gg/api/public/get-matches-since/${cursor}/`, { headers: { 'User-Agent': UA } });
      if (res.status === 403 || res.status === 429) { // rate limit: long cool-down, then resume
        console.log(`rate-limited (HTTP ${res.status}); cooling down 90s`);
        await new Promise((r) => setTimeout(r, 90_000));
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} (fatal)`);
      return (await res.json()) as any[];
    } catch (e) {
      lastErr = e;
      if (String(e).includes('(fatal)')) break;
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 60_000);
    }
  }
  throw lastErr;
}

async function main() {
  mkdirSync(CACHE, { recursive: true });

  // hero name -> slug (feed uses display OR internal names; omeda carries both)
  const omedaHeroes = JSON.parse(readFileSync(path.join(ROOT, 'data/omeda/heroes.json'), 'utf8'));
  const heroList: any[] = Array.isArray(omedaHeroes) ? omedaHeroes : omedaHeroes.heroes;
  const heroSlug: Record<string, string> = {};
  for (const h of heroList) {
    const slug = h.slug ?? h.display_name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    heroSlug[h.display_name] = slug;
    heroSlug[h.name] = slug;
  }
  // crest itemId -> display name
  const omedaItems = JSON.parse(readFileSync(path.join(ROOT, 'data/omeda/items.json'), 'utf8'));
  const itemList: any[] = Array.isArray(omedaItems) ? omedaItems : omedaItems.items;
  const crestName: Record<string, string> = {};
  for (const i of itemList) if (i.slot_type === 'Crest') crestName[String(i.game_id)] = i.display_name;

  const windowDays = Number(process.env.WINDOW_DAYS || 3);
  const since = process.env.SINCE ? Number(process.env.SINCE) : Math.floor(Date.now() / 1000) - windowDays * 86400;
  const endEpoch = Math.floor(Date.now() / 1000) - 120;
  const maxPages = Number(process.env.MAX_PAGES || Infinity);

  let st: State = { since, cursor: since, pages: 0, matches: 0, ranked: 0, kept: 0, seen: [], tallies: {} };
  if (!process.env.RESET && existsSync(STATE_FILE)) {
    const prev = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as State;
    if (prev.since === since || process.env.SINCE || !process.env.WINDOW_DAYS) { st = prev; console.log(`resuming: cursor ${new Date(st.cursor * 1000).toISOString()} after ${st.pages} pages`); }
  }
  const seen = new Set(st.seen);

  const ep = (s: string) => Math.floor(Date.parse(s.replace(' ', 'T') + 'Z') / 1000);
  let sessionPages = 0;
  let stalls = 0;
  const saveState = () => { st.seen = [...seen].slice(-2000); writeFileSync(STATE_FILE, JSON.stringify(st)); };
  process.on('uncaughtExceptionMonitor', saveState); // resumable even on a hard failure
  while (st.cursor < endEpoch && sessionPages < maxPages) {
    const page = await fetchPage(st.cursor);
    st.pages++; sessionPages++;
    if (!page.length) break;
    let newest = st.cursor;
    let fresh = 0;
    for (const m of page) {
      const end = ep(m.endTime);
      if (end > newest) newest = end;
      if (seen.has(m.matchId)) continue;
      seen.add(m.matchId); fresh++;
      st.matches++;
      if (m.gameMode !== 'RANKED') continue;
      st.ranked++;
      if (m.gameDuration < MIN_DURATION_S) continue;
      if (m.winningTeam !== 0 && m.winningTeam !== 1) continue;
      const players: any[] = m.playerData ?? [];
      if (players.length !== 10 || players.some((p) => p.bIsAIPlayer)) continue;
      st.kept++;
      for (const p of players) {
        const slug = heroSlug[p.heroName];
        const role = ROLE_MAP[p.roleName];
        if (!slug || !role) continue;
        const win = p.teamId === m.winningTeam;
        const key = `${slug}|${role}`;
        const cell = (st.tallies[key] ??= { games: 0, aug: {}, et: {}, minor: {}, crest: {} });
        cell.games++;
        let eternal: string | null = null;
        const perks: { perkName: string }[] = p.heroPerkData ?? [];
        for (const pk of perks) if (pk.perkName.startsWith('Eternal_')) eternal = pk.perkName;
        for (const pk of perks) {
          if (pk.perkName.startsWith('Perk_')) bump(cell.aug, pk.perkName, win);
          else if (pk.perkName.startsWith('Eternal_')) bump(cell.et, pk.perkName, win);
          else if (pk.perkName.startsWith('Blessing_') && eternal) bump(cell.minor, `${eternal}|${pk.perkName}`, win);
        }
        for (const inv of p.inventoryData ?? []) {
          const cn = crestName[String(inv.itemId)];
          if (cn) { bump(cell.crest, String(inv.itemId), win); break; }
        }
      }
    }
    // cursor is inclusive: advance to newest endTime; if a page is entirely
    // duplicates the feed has more than 20 matches on one second — nudge past.
    st.cursor = fresh === 0 ? newest + 1 : newest;
    stalls = fresh === 0 ? stalls + 1 : 0;
    if (stalls > 5) { console.error('cursor stalled; stopping'); break; }
    if (st.pages % SAVE_EVERY === 0) {
      st.seen = [...seen].slice(-2000);
      writeFileSync(STATE_FILE, JSON.stringify(st));
      const covered = ((st.cursor - st.since) / 86400).toFixed(2);
      console.log(`${st.pages} pages · ${st.matches} matches (${st.ranked} ranked, ${st.kept} kept) · ${covered}d of ${((endEpoch - st.since) / 86400).toFixed(2)}d · cursor ${new Date(st.cursor * 1000).toISOString()}`);
    }
    await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
  }
  st.seen = [...seen].slice(-2000);
  writeFileSync(STATE_FILE, JSON.stringify(st));
  console.log(`crawl done: ${st.pages} pages, ${st.kept} ranked matches kept, window ${new Date(st.since * 1000).toISOString()} -> ${new Date(st.cursor * 1000).toISOString()}`);

  // ---- perk catalog (internal name -> id/display/slot + eternal minors) ----
  if (!hasCredentials()) { console.error('needs PREDGG_CLIENT_ID/SECRET for the perk catalog'); process.exit(1); }
  interface MinorData { id: string; slot: string; displayName: string; description: string; icon: string | null }
  const cat = await gql<{ perks: { id: string; name: string; data: { slot: string; displayName: string; description: string; hero: { slug: string } | null; minorBlessings: MinorData[] | null } | null }[] }>(
    '{ perks { id name data { slot displayName description hero { slug } minorBlessings { id slot displayName description icon } } } }');
  const byInternal: Record<string, { id: string; name: string; slot: string }> = {};
  const catalog: Record<string, { name: string; description: string; hero: string | null }> = {};
  const eternalCatalog: Record<string, { name: string; description: string; minors: { id: string; slot: 1 | 2; name: string; description: string }[] }> = {};
  const minorIdByName: Record<string, string> = {};
  for (const p of cat.perks) {
    if (!p.data) continue;
    const display = p.data.slot === 'ETERNAL_1' ? (ETERNAL_DISPLAY[p.data.displayName] ?? p.data.displayName) : p.data.displayName;
    byInternal[p.name] = { id: p.id, name: display, slot: p.data.slot };
    if (p.data.slot === 'HERO_SPECIFIC_1') catalog[p.id] = { name: display, description: p.data.description, hero: p.data.hero?.slug ?? null };
    if (p.data.slot === 'ETERNAL_1') {
      const minors = (p.data.minorBlessings ?? []).map((m) => ({
        id: m.id, slot: (m.slot === 'BLESSING_MINOR_2' ? 2 : 1) as 1 | 2, name: m.displayName, description: m.description,
      })).sort((a, b) => a.slot - b.slot || a.name.localeCompare(b.name));
      eternalCatalog[p.id] = { name: display, description: p.data.description, minors };
      for (const m of p.data.minorBlessings ?? []) minorIdByName[m.displayName] = m.id;
    }
  }
  // Blessing_* internal names appear as their own perks rows too; index them.
  for (const p of cat.perks) if (p.data && p.data.slot.startsWith('BLESSING_MINOR')) byInternal[p.name] = { id: p.id, name: p.data.displayName, slot: p.data.slot };

  // ---- write the aggregate in the established shape ----
  const rows = (rec: Record<string, NW>, kind: 'aug' | 'et') =>
    Object.entries(rec)
      .map(([internal, s]) => {
        const c = byInternal[internal];
        return { id: c?.id ?? internal, name: c?.name ?? internal.replace(/^(Perk|Eternal)_/, ''), n: s.n, w: s.w };
      })
      .sort((a, b) => b.n - a.n);
  const heroes: Record<string, Record<string, unknown>> = {};
  let cells = 0;
  for (const [key, cell] of Object.entries(st.tallies)) {
    const [slug, role] = key.split('|') as [string, string];
    if (cell.games < 25) continue; // too thin to say anything
    const etRows = rows(cell.et, 'et').slice(0, 5).map((e) => {
      const minors = Object.entries(cell.minor)
        .filter(([k]) => {
          const et = k.split('|')[0]!;
          const c = byInternal[et];
          return (c?.name ?? '') === e.name || et === `Eternal_${e.name}`;
        })
        .map(([k, s]) => {
          const internal = k.split('|')[1]!;
          const c = byInternal[internal];
          return { id: c?.id ?? internal, name: c?.name ?? internal.replace(/^Blessing_\w+?_/, ''), n: s.n, w: s.w };
        })
        .sort((a, b) => b.n - a.n);
      return { ...e, minors };
    });
    (heroes[slug] ??= {})[role] = {
      augments: rows(cell.aug, 'aug'),
      eternals: etRows,
      crests: Object.entries(cell.crest)
        .map(([gid, s]) => ({ name: crestName[gid] ?? gid, n: s.n, w: s.w }))
        .sort((a, b) => b.n - a.n).slice(0, 4),
    };
    cells++;
  }

  const out = {
    generatedAt: new Date().toISOString(),
    source: `computed by our own aggregator from the pred.gg PUBLIC match feed (/api/public/get-matches-since, dev-sanctioned bulk pull), RANKED matches only, ${new Date(st.since * 1000).toISOString().slice(0, 10)} -> ${new Date(st.cursor * 1000).toISOString().slice(0, 10)} (${st.kept.toLocaleString()} matches)`,
    note: 'augment = the hero-specific perk locked in the first ~20s; winrates are observational evidence, not engine math; matches carry no patch field — the window is partitioned by date against patch release days; eternal rows carry per-minor winrates (new: the old simpleBuild source never exposed minors)',
    rankBands: null as null,
    catalog,
    eternals: eternalCatalog,
    heroes,
  };
  writeFileSync(path.join(ROOT, 'data/aggregates/predgg-augments.json'), JSON.stringify(out, null, 1));
  console.log(`${cells} hero-role cells (25+ games) -> data/aggregates/predgg-augments.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
