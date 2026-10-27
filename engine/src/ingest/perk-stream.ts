// Augment / Eternal / minor-blessing / crest win evidence per hero per role,
// counted from pred.gg's PUBLIC match stream.
//
//   npm run perks                    # extend the current patch's window to now
//   MAX_REQUESTS=300 npm run perks   # cap one run (default 1500)
//
// WHY THIS EXISTS: the per-role perk statistics (simpleBuild) went behind a
// pred.gg Application scope our app tier cannot get (priorities item 1), so
// data/aggregates/predgg-augments.json froze at patch 1.15 and every hero added
// since (Valmont) had no augment or Eternal evidence at all. The maintainer
// confirmed (2026-10-14) our GraphQL access is the ceiling; the one other
// route is https://pred.gg/api/public/get-matches-since/<unix>/, an open,
// unauthenticated stream of finished matches. Each player row there carries
// the augment (`Perk_<Hero>_<Name>`), the Eternal (`Eternal_<Name>`) and both
// minor blessings (`Blessing_<Eternal>_<Name>`), plus role, team, final
// inventory and the result — so the evidence can be COUNTED rather than read.
//
// Stream semantics (probed 2026-10-14): each call returns the next 20 matches
// whose endTime >= <unix seconds>, oldest first, every game mode mixed. We page
// by the last endTime seen and dedupe by matchId (the boundary match repeats).
// Roughly 13 matches finish per minute; ~1,000 requests cover a day. Only
// RANKED, non-AI rows with a lane role are counted; raw matches are never kept.
//
// The window is the CURRENT patch (data/catalog/META.json patchReleasedAt).
// Counts accumulate in data/aggregates/perk-stream.json with the cursor, so a
// daily run only reads what finished since the last one; a new patch starts a
// fresh window. Each run then rewrites predgg-augments.json in the shape every
// consumer already reads (augments / eternals / crests per hero-role, plus the
// minor-slot and minor-pair counts that file never had).
//
// RANK BAND: each page's ranked matches are looked up in one aliased GraphQL
// call for the rank every player held in that game (match-rank.ts); rows of
// Gold+ players are also counted into a `gold` cell. See goldBasis.
//
// Politeness: sequential, 2s between stream calls, identified UA, retry with backoff.
// The augment catalog (names + descriptions) needs one authenticated pred.gg
// GraphQL call; without creds the previous catalog is kept.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasCredentials } from './predgg.js';
import { isGoldPlus, isPlatPlus, matchTimeRanks } from './match-rank.js';
import { epoch, fetchPage, loadPerkCatalog, loadoutOf, sleep, type PerkInfo } from './match-stream.js';
import { countMatch, migratePlatBasis, loadState as loadBuildMatchups, saveState as saveBuildMatchups, addSegment, type MatchPlayer } from './build-matchups.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const STATE = path.join(ROOT, 'data/aggregates/perk-stream.json');
const AUG_OUT = path.join(ROOT, 'data/aggregates/predgg-augments.json');
const DELAY_MS = 2000;
const CHECKPOINT_EVERY = 25;
const MAX_REQUESTS = Number(process.env.MAX_REQUESTS ?? 1500);
// A (hero, role) cell is written to predgg-augments.json from this many games;
// thinner cells stay in the raw counts and surface once they grow.
const MIN_ROLE_GAMES = 50;
const ROLES = new Set(['carry', 'midlane', 'offlane', 'jungle', 'support']);

type NW = { n: number; w: number };
interface EternalCell extends NW { minor1: Record<string, NW>; minor2: Record<string, NW>; pairs: Record<string, NW> }
// cores: the first three distinct completed items (Epic passives) in PURCHASE
// order, keyed "slug|slug|slug" — the same definition pred.gg's gated coreBuild
// used, rebuilt from each player's incomeData.transactions.
interface CountCell extends NW { augments: Record<string, NW>; eternals: Record<string, EternalCell>; crests: Record<string, NW>; cores?: Record<string, NW> }
// gold: the same counts for rows whose player was Gold or higher IN THAT GAME
// (rank at match time, see match-rank.ts), counted from goldFrom onward.
// plat: the same for Platinum or higher, over the same window (a subset of gold).
// links: per core item (any of the player's first three completed Epic items),
// the augment / Eternal / crest that player ran with it — the build-to-pick link
// pred.gg's per-build panel shows. Counted from linksFrom (2026-10-27) onward,
// all ranks only; data/aggregates/build-links.json is the consumer file.
interface LinkCell extends NW { augments: Record<string, NW>; eternals: Record<string, NW>; crests: Record<string, NW> }
interface RoleCell extends CountCell { gold?: CountCell; plat?: CountCell; links?: Record<string, LinkCell> }
interface State {
  source: string; note: string; generatedAt: string;
  patch: string | null; patchReleasedAt: string;
  window: { from: string; to: string; matches: number; rankedMatches: number; requests: number };
  /** cursor: endTime (unix s) of the newest match counted; boundaryIds = matches ending at that second. */
  cursor: number; boundaryIds: string[];
  unknown: { heroes: string[]; perks: string[] };
  /** Core builds were added on 2026-10-16, after the window opened: they are
   *  counted from this cursor onward, so their sample is smaller than the perks'. */
  coresFrom?: string;
  /** Gold+ and Plat+ sub-counts started here, so their window is shorter. */
  goldFrom?: string;
  /** The build-to-pick links (RoleCell.links) started here: their window is shorter still. */
  linksFrom?: string;
  /** 'match-time': the rank each player held in that game. Counts made on any
   *  other basis (the 2026-10-24 ladder proxy, a player's CURRENT rank) are
   *  dropped and goldFrom restarts when this is missing. */
  goldBasis?: 'match-time';
  /** Ranked matches whose ranks pred.gg could not resolve (rows stay out of Gold+). */
  goldUnresolvedMatches?: number;
  /** Retired ladder-proxy metadata; deleted on migration. */
  ladder?: unknown;
  heroes: Record<string, Record<string, RoleCell>>;
}

const bump = (o: Record<string, NW>, k: string, won: boolean) => { const c = (o[k] ??= { n: 0, w: 0 }); c.n++; if (won) c.w++; };

async function main() {
  const meta = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/META.json'), 'utf8')) as { patch?: string; patchReleasedAt?: string };
  if (!meta.patchReleasedAt) throw new Error('data/catalog/META.json has no patchReleasedAt — run npm run catalog');
  const heroes = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/heroes.json'), 'utf8')) as { slug: string; name: string }[];
  const slugByName = new Map(heroes.map((h) => [h.name.toLowerCase(), h.slug]));
  const items = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/items.json'), 'utf8')) as { game_id: number | null; name: string; slug: string; display_name: string; slot_type: string | null; rarity: string | null }[];
  const coreItemByGameId = new Map(items.filter((i) => i.rarity === 'Epic' && i.slot_type === 'Passive' && i.game_id != null).map((i) => [i.game_id!, i]));
  const itemBySlug = new Map(items.map((i) => [i.slug, i]));
  const crestByGameId = new Map(items.filter((i) => i.slot_type === 'Crest' && i.game_id != null).map((i) => [i.game_id!, { name: i.display_name, slug: i.slug }]));

  // Perk catalog: internal name -> id / display name / slot (one GraphQL call).
  const prevAug = existsSync(AUG_OUT) ? JSON.parse(readFileSync(AUG_OUT, 'utf8')) : null;
  let perkByName = new Map<string, PerkInfo>();
  let augCatalog: Record<string, { name: string; description: string; hero: string | null }> = prevAug?.catalog ?? {};
  if (hasCredentials()) {
    perkByName = await loadPerkCatalog();
    augCatalog = {};
    // pred.gg ships "DNT - Some Title" / "Placeholder - Does nothing" perks; they are
    // not augments anyone can pick, so they stay out of the catalog.
    const placeholder = (p: PerkInfo) => /^DNT\b/.test(p.displayName) || /^Placeholder\b/i.test(p.description);
    for (const p of perkByName.values()) if (p.slot === 'HERO_SPECIFIC_1' && !placeholder(p)) augCatalog[p.id] = { name: p.displayName, description: p.description, hero: p.hero };
  } else {
    console.error('needs PREDGG_CLIENT_ID/SECRET for the perk catalog (internal perk name -> display name)');
    process.exit(1);
  }

  // Resume within the same patch; a new patch starts a fresh window.
  const prev: State | null = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : null;
  const fresh = !prev || prev.patchReleasedAt !== meta.patchReleasedAt;
  const st: State = fresh
    ? {
        source: 'https://pred.gg/api/public/get-matches-since/<unix>/ (public match stream), ranked non-AI rows with a lane role',
        note: 'Counts per hero -> role. n = games, w = wins. Augments keyed by pred.gg perk id; Eternals, minors and crests by display name; pairs keyed "<minor slot 1>|<minor slot 2>". Accumulated across runs inside the current patch (window), resumed from cursor.',
        generatedAt: '', patch: meta.patch ?? null, patchReleasedAt: meta.patchReleasedAt,
        window: { from: meta.patchReleasedAt, to: meta.patchReleasedAt, matches: 0, rankedMatches: 0, requests: 0 },
        cursor: Math.floor(Date.parse(meta.patchReleasedAt) / 1000), boundaryIds: [],
        unknown: { heroes: [], perks: [] }, heroes: {},
      }
    : prev!;
  st.coresFrom ??= new Date(st.cursor * 1000).toISOString();
  // Gold+ is rank AT MATCH TIME. Counts made on the old ladder basis (current
  // rank, which reads high because winners climb) cannot be mixed in: drop
  // them and restart the Gold+ window here.
  if (st.goldBasis !== 'match-time') {
    for (const roles of Object.values(st.heroes)) for (const c of Object.values(roles)) { delete c.gold; delete c.plat; }
    delete st.ladder;
    st.goldFrom = new Date(st.cursor * 1000).toISOString();
    st.goldBasis = 'match-time';
    st.goldUnresolvedMatches = 0;
    if (prev && !fresh) console.log(`Gold+ basis -> rank at match time; Gold+ counts restart at ${st.goldFrom}`);
  }
  st.goldFrom ??= new Date(st.cursor * 1000).toISOString();
  st.linksFrom ??= new Date(st.cursor * 1000).toISOString();
  if (fresh && prev) console.log(`patch changed (${prev.patch} -> ${meta.patch}); starting a fresh window`);
  console.log(`match stream from ${new Date(st.cursor * 1000).toISOString()} (${fresh ? 'fresh' : 'resuming'}), up to ${MAX_REQUESTS} requests`);
  // Matchup build counts ride the same pages (data/aggregates/build-matchups.json).
  const bm = loadBuildMatchups(meta.patch ?? null, meta.patchReleasedAt);
  const runFrom = new Date(st.cursor * 1000).toISOString();
  if (migratePlatBasis(bm, runFrom)) console.log(`build-matchups Plat+ basis -> rank at match time; p counts restart at ${runFrom}`);
  addSegment(bm, runFrom, runFrom, 'daily');
  const bmSegment = bm.window.segments[bm.window.segments.length - 1]!;

  const unknownHeroes = new Set(st.unknown.heroes), unknownPerks = new Set(st.unknown.perks);
  let requests = 0, seenThisRun = 0, rankedThisRun = 0, stoppedEarly = false;
  // Progress is saved as it goes, so an interrupted run loses at most
  // CHECKPOINT_EVERY pages instead of the whole pull.
  let savedRanked = 0, savedRequests = 0;
  const checkpoint = () => {
    st.window.rankedMatches += rankedThisRun - savedRanked; savedRanked = rankedThisRun;
    st.window.requests += requests - savedRequests; savedRequests = requests;
    st.window.to = new Date(st.cursor * 1000).toISOString();
    st.generatedAt = new Date().toISOString();
    st.unknown = { heroes: [...unknownHeroes].sort(), perks: [...unknownPerks].sort() };
    writeFileSync(STATE, JSON.stringify(st, null, 1));
    bmSegment.to = st.window.to;
    saveBuildMatchups(bm);
  };
  const stopAt = Math.floor(Date.now() / 1000) - 60;
  while (requests < MAX_REQUESTS && st.cursor < stopAt) {
    const page = await fetchPage(st.cursor);
    if (!page) { stoppedEarly = true; console.log('  stream still refusing after backoff; saving progress and stopping (the next run resumes)'); break; }
    requests++;
    const boundary = new Set(st.boundaryIds);
    const newMatches = page.filter((m) => m?.matchId && !boundary.has(m.matchId) && epoch(m.endTime) >= st.cursor);
    // ~3 ranked matches a page: one aliased GraphQL call (~0.7s) for the rank
    // each player held in that game.
    const ranks = await matchTimeRanks(newMatches.filter((m) => m.gameMode === 'RANKED').map((m) => String(m.matchId)));
    for (const m of newMatches) {
      seenThisRun++;
      if (m.gameMode !== 'RANKED') continue;
      rankedThisRun++;
      const matchRanks = ranks.get(String(m.matchId));
      if (!matchRanks) st.goldUnresolvedMatches = (st.goldUnresolvedMatches ?? 0) + 1;
      const matchPlayers: MatchPlayer[] = [];
      for (const p of m.playerData ?? []) {
        if (p.bIsAIPlayer) continue;
        const role = String(p.roleName ?? '').replace('ESelectedRole::', '').toLowerCase();
        if (!ROLES.has(role)) continue;
        const slug = slugByName.get(String(p.heroName ?? '').toLowerCase());
        if (!slug) { unknownHeroes.add(String(p.heroName)); continue; }
        const won = p.teamId === m.winningTeam;
        const cell = ((st.heroes[slug] ??= {})[role] ??= { n: 0, w: 0, augments: {}, eternals: {}, crests: {} });
        const lo = loadoutOf(p, perkByName, crestByGameId, unknownPerks);
        // transactionType 10 = purchase (11 = starting items, others = sells/undos).
        const core: string[] = [];
        for (const t of p.incomeData?.transactions ?? []) {
          if (t?.transactionType !== 10) continue;
          const it = coreItemByGameId.get(t.itemId);
          if (it && !core.includes(it.slug)) core.push(it.slug);
          if (core.length === 3) break;
        }
        const count = (c: CountCell) => {
          c.n++; if (won) c.w++;
          if (lo.augment) bump(c.augments, lo.augment.id, won);
          if (lo.eternal) {
            const e = (c.eternals[lo.eternal] ??= { n: 0, w: 0, minor1: {}, minor2: {}, pairs: {} });
            e.n++; if (won) e.w++;
            if (lo.minor1) bump(e.minor1, lo.minor1, won);
            if (lo.minor2) bump(e.minor2, lo.minor2, won);
            if (lo.minor1 && lo.minor2) bump(e.pairs, `${lo.minor1}|${lo.minor2}`, won);
          }
          if (lo.crest) bump(c.crests, lo.crest, won);
          if (core.length === 3) bump((c.cores ??= {}), core.join('|'), won);
        };
        count(cell);
        for (const item of core) {
          const l = ((cell.links ??= {})[item] ??= { n: 0, w: 0, augments: {}, eternals: {}, crests: {} });
          l.n++; if (won) l.w++;
          if (lo.augment) bump(l.augments, lo.augment.id, won);
          if (lo.eternal) bump(l.eternals, lo.eternal, won);
          if (lo.crest) bump(l.crests, lo.crest, won);
        }
        const tier = matchRanks?.get(String(p.playerId));
        if (isGoldPlus(tier)) count((cell.gold ??= { n: 0, w: 0, augments: {}, eternals: {}, crests: {} }));
        if (isPlatPlus(tier)) count((cell.plat ??= { n: 0, w: 0, augments: {}, eternals: {}, crests: {} }));
        matchPlayers.push({ hero: slug, role, team: p.teamId, core, plat: isPlatPlus(tier) });
      }
      countMatch(bm, matchPlayers);
    }
    if (!page.length) break;
    const newest = Math.max(...page.map((m) => epoch(m.endTime)));
    const atNewest = page.filter((m) => epoch(m.endTime) === newest).map((m) => m.matchId);
    // A full page all ending in one second would never advance; step past it.
    if (newest === st.cursor && !newMatches.length) { st.cursor = newest + 1; st.boundaryIds = []; }
    else { st.boundaryIds = newest === st.cursor ? [...new Set([...st.boundaryIds, ...atNewest])] : atNewest; st.cursor = newest; }
    st.window.matches += newMatches.length;
    if (requests % CHECKPOINT_EVERY === 0) checkpoint();
    if (requests % 50 === 0) console.log(`  ${requests} requests · cursor ${new Date(st.cursor * 1000).toISOString()} · ${rankedThisRun} ranked matches this run`);
    if (page.length < 20) break; // reached the live edge
    await sleep(DELAY_MS);
  }
  checkpoint();

  // Consumer file, same shape the simpleBuild pull wrote, now current-patch.
  const sorted = <T extends NW>(o: Record<string, T>) => Object.entries(o).sort((a, b) => b[1].n - a[1].n);
  const out: Record<string, Record<string, unknown>> = {};
  const cellOut = (c: CountCell) => ({
    games: c.n, wins: c.w,
    augments: sorted(c.augments).map(([id, v]) => ({ id, name: augCatalog[id]?.name ?? id, n: v.n, w: v.w })),
    eternals: sorted(c.eternals).map(([name, e]) => ({
      name, n: e.n, w: e.w,
      minor1: sorted(e.minor1).map(([m, v]) => ({ name: m, n: v.n, w: v.w })),
      minor2: sorted(e.minor2).map(([m, v]) => ({ name: m, n: v.n, w: v.w })),
      pairs: sorted(e.pairs).slice(0, 5).map(([k, v]) => { const [a, b] = k.split('|'); return { minor1: a, minor2: b, n: v.n, w: v.w }; }),
    })),
    crests: sorted(c.crests).map(([name, v]) => ({ name, n: v.n, w: v.w })),
  });
  // Gold+ cells ship from this many games; thinner ones stay in state. The page
  // pulls thin Gold+ numbers toward the hero's Gold+ role win rate, so a low
  // floor shows early data without overstating it.
  const MIN_GOLD_GAMES = 20;
  for (const [slug, roles] of Object.entries(st.heroes)) {
    for (const [role, c] of Object.entries(roles)) {
      if (c.n < MIN_ROLE_GAMES) continue;
      (out[slug] ??= {})[role] = {
        ...cellOut(c),
        ...(c.gold && c.gold.n >= MIN_GOLD_GAMES ? { goldPlus: cellOut(c.gold) } : {}),
        ...(c.plat && c.plat.n >= MIN_GOLD_GAMES ? { platPlus: cellOut(c.plat) } : {}),
      };
    }
  }
  writeFileSync(AUG_OUT, JSON.stringify({
    generatedAt: st.generatedAt,
    source: `pred.gg public match stream (get-matches-since), RANKED, patch ${meta.patch ?? '?'} window ${st.window.from.slice(0, 16)} -> ${st.window.to.slice(0, 16)}, ${st.window.rankedMatches.toLocaleString()} ranked matches; (hero, role) cells with ${MIN_ROLE_GAMES}+ games. Counted by npm run perks from data/aggregates/perk-stream.json.`,
    note: 'n = games, w = wins. eternals[].minor1/minor2 = minor-slot picks under that Eternal; pairs = the most-played minor combinations. goldPlus = the same counts for players who were Gold or higher IN THAT GAME (rank at match time, pred.gg match rating), counted from goldFrom, shipped at 20+ games; goldPlus.games/wins is the hero-role Gold+ baseline. platPlus = the same for Platinum or higher.',
    goldFrom: st.goldFrom,
    goldBasis: st.goldBasis,
    goldUnresolvedMatches: st.goldUnresolvedMatches ?? 0,
    catalog: augCatalog,
    heroes: out,
  }, null, 1));

  // Core builds -> predgg-builds.json, the shape the gated coreBuild pull wrote
  // (core = internal item names, coreSlugs, n, w; 20+ games per core).
  const MIN_CORE_GAMES = 20;
  const coreRows = (o: Record<string, NW>) => sorted(o).filter(([, v]) => v.n >= MIN_CORE_GAMES).slice(0, 10).map(([k, v]) => {
    const coreSlugs = k.split('|');
    return { core: coreSlugs.map((sl) => itemBySlug.get(sl)?.name ?? sl), coreSlugs, n: v.n, w: v.w };
  });
  // Some heroes split one core across several purchase orders, so no single
  // order reaches the floor. Fall back to the item SET (any order), shown in
  // its most common order and flagged anyOrder.
  const coreRowsOrSets = (o: Record<string, NW>) => {
    const rows: Array<{ core: string[]; coreSlugs: string[]; n: number; w: number; anyOrder?: true }> = coreRows(o);
    if (rows.length) return rows;
    const sets: Record<string, NW & { top: string; topN: number }> = {};
    for (const [k, v] of Object.entries(o)) {
      const s = (sets[k.split('|').sort().join('|')] ??= { n: 0, w: 0, top: k, topN: 0 });
      s.n += v.n; s.w += v.w;
      if (v.n > s.topN) { s.top = k; s.topN = v.n; }
    }
    return Object.values(sets).filter((s) => s.n >= MIN_CORE_GAMES).sort((a, b) => b.n - a.n).slice(0, 10).map((s) => {
      const coreSlugs = s.top.split('|');
      return { core: coreSlugs.map((sl) => itemBySlug.get(sl)?.name ?? sl), coreSlugs, n: s.n, w: s.w, anyOrder: true as const };
    });
  };
  const buildHeroes: Record<string, unknown[]> = {};
  const buildByRole: Record<string, Record<string, unknown[]>> = {};
  const goldBuildByRole: Record<string, Record<string, unknown[]>> = {};
  // Hero-role win rate in each band: what a build's win rate is read against.
  const platBuildByRole: Record<string, Record<string, unknown[]>> = {};
  const baselineByRole: Record<string, Record<string, { all: NW; gold: NW | null; plat: NW | null }>> = {};
  for (const [slug, roles] of Object.entries(st.heroes)) {
    const all: Record<string, NW> = {};
    for (const [role, c] of Object.entries(roles)) {
      for (const [k, v] of Object.entries(c.cores ?? {})) { const a = (all[k] ??= { n: 0, w: 0 }); a.n += v.n; a.w += v.w; }
      const rows = coreRowsOrSets(c.cores ?? {});
      if (rows.length) (buildByRole[slug] ??= {})[role] = rows;
      const goldRows = coreRowsOrSets(c.gold?.cores ?? {});
      if (goldRows.length) (goldBuildByRole[slug] ??= {})[role] = goldRows;
      const platRows = coreRowsOrSets(c.plat?.cores ?? {});
      if (platRows.length) (platBuildByRole[slug] ??= {})[role] = platRows;
      const band = (x?: CountCell) => (x && x.n >= MIN_GOLD_GAMES ? { n: x.n, w: x.w } : null);
      if (c.n >= MIN_ROLE_GAMES) (baselineByRole[slug] ??= {})[role] = { all: { n: c.n, w: c.w }, gold: band(c.gold), plat: band(c.plat) };
    }
    const rows = coreRowsOrSets(all);
    if (rows.length) buildHeroes[slug] = rows;
  }
  writeFileSync(path.join(ROOT, 'data/aggregates/predgg-builds.json'), JSON.stringify({
    generatedAt: st.generatedAt,
    source: `pred.gg public match stream (get-matches-since), RANKED, patch ${meta.patch ?? '?'}: ordered 3-item cores (first three completed Epic items by purchase time; anyOrder rows group a set whose orders were each under the floor), ${MIN_CORE_GAMES}+ games each, counted ${String(st.coresFrom).slice(0, 16)} -> ${st.window.to.slice(0, 16)}; hero-wide + per-role. Counted by npm run perks.`,
    heroes: buildHeroes,
    byRole: buildByRole,
    goldFrom: st.goldFrom,
    goldBasis: st.goldBasis,
    goldByRole: goldBuildByRole,
    platByRole: platBuildByRole,
    baselineByRole,
  }, null, 1));

  // Build-to-pick links -> build-links.json: per hero-role, per core item with
  // MIN_LINK_GAMES+ games, what those players ran. Read against the hero-role
  // totals in predgg-augments.json to find each pick's signature items.
  const MIN_LINK_GAMES = 20;
  const linkOut: Record<string, Record<string, Record<string, unknown>>> = {};
  for (const [slug, roles] of Object.entries(st.heroes)) {
    for (const [role, c] of Object.entries(roles)) {
      if (c.n < MIN_ROLE_GAMES) continue;
      for (const [item, l] of Object.entries(c.links ?? {})) {
        if (l.n < MIN_LINK_GAMES) continue;
        ((linkOut[slug] ??= {})[role] ??= {})[item] = {
          n: l.n, w: l.w,
          augments: sorted(l.augments).map(([id, v]) => ({ id, name: augCatalog[id]?.name ?? id, n: v.n, w: v.w })),
          eternals: sorted(l.eternals).map(([name, v]) => ({ name, n: v.n, w: v.w })),
          crests: sorted(l.crests).map(([name, v]) => ({ name, n: v.n, w: v.w })),
        };
      }
    }
  }
  writeFileSync(path.join(ROOT, 'data/aggregates/build-links.json'), JSON.stringify({
    generatedAt: st.generatedAt,
    source: `pred.gg public match stream (get-matches-since), RANKED, patch ${meta.patch ?? '?'}, counted ${String(st.linksFrom).slice(0, 16)} -> ${st.window.to.slice(0, 16)}. Counted by npm run perks.`,
    note: 'Per hero -> role -> core item (one of the first three completed Epic items by purchase time): n/w = games with that item, and the augment, Eternal and crest those players ran (n/w each). A player counts once under each of their core items. All ranks only. Window starts at linksFrom, later than the perk window.',
    linksFrom: st.linksFrom,
    minGames: MIN_LINK_GAMES,
    heroes: linkOut,
  }, null, 1));

  const cells = Object.values(out).reduce((t, r) => t + Object.keys(r).length, 0);
  if (stoppedEarly) console.log('\nSTOPPED EARLY (stream throttled) — window is partial; rerun to continue.');
  console.log(`\n${requests} requests, ${seenThisRun} new matches (${rankedThisRun} ranked) -> window ${st.window.from.slice(0, 16)} -> ${st.window.to.slice(0, 16)}, ${st.window.rankedMatches} ranked total`);
  console.log(`-> data/aggregates/perk-stream.json, predgg-augments.json (${Object.keys(out).length} heroes, ${cells} hero-role cells)`);
  if (unknownHeroes.size || unknownPerks.size) console.log(`unmapped: heroes ${[...unknownHeroes].join(', ') || '-'}; perks ${[...unknownPerks].slice(0, 10).join(', ') || '-'}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
