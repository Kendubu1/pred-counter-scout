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
// Politeness: sequential, 1s between calls, identified UA, retry with backoff.
// The augment catalog (names + descriptions) needs one authenticated pred.gg
// GraphQL call; without creds the previous catalog is kept.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gql, hasCredentials } from './predgg.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const STATE = path.join(ROOT, 'data/aggregates/perk-stream.json');
const AUG_OUT = path.join(ROOT, 'data/aggregates/predgg-augments.json');
const UA = { 'User-Agent': 'pred-counter-scout (github.com/Kendubu1/pred-counter-scout)' };
const STREAM = (since: number) => `https://pred.gg/api/public/get-matches-since/${since}/`;
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
interface RoleCell extends NW { augments: Record<string, NW>; eternals: Record<string, EternalCell>; crests: Record<string, NW>; cores?: Record<string, NW> }
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
  heroes: Record<string, Record<string, RoleCell>>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const bump = (o: Record<string, NW>, k: string, won: boolean) => { const c = (o[k] ??= { n: 0, w: 0 }); c.n++; if (won) c.w++; };
// "2026-10-14 20:04:52" is UTC.
const epoch = (s: string) => Math.floor(Date.parse(`${s.replace(' ', 'T')}Z`) / 1000);

// null = the stream is refusing us right now (HTTP 403/429 that outlasts the
// backoff). Seen 2026-10-14 after ~800 back-to-back pages at a 1s delay: a
// temporary 403 that cleared within minutes. The caller saves and stops; the
// next run resumes from the committed cursor.
async function fetchPage(since: number): Promise<any[] | null> {
  const throttleWaits = [60_000, 120_000, 300_000];
  let throttled = 0;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const res = await fetch(STREAM(since), { headers: UA });
      if (res.ok) return (await res.json()) as any[];
      if (res.status === 403 || res.status === 429) {
        if (throttled >= throttleWaits.length) return null;
        console.log(`  stream returned HTTP ${res.status}; backing off ${throttleWaits[throttled]! / 1000}s`);
        await sleep(throttleWaits[throttled++]!);
        continue;
      }
      if (res.status < 500) throw new Error(`HTTP ${res.status}`);
    } catch (e) { if (attempt >= 4) throw e; }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error('match stream: retries exhausted');
}

type PerkInfo = { id: string; displayName: string; slot: string; description: string; hero: string | null };

async function main() {
  const meta = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/META.json'), 'utf8')) as { patch?: string; patchReleasedAt?: string };
  if (!meta.patchReleasedAt) throw new Error('data/catalog/META.json has no patchReleasedAt — run npm run catalog');
  const heroes = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/heroes.json'), 'utf8')) as { slug: string; name: string }[];
  const slugByName = new Map(heroes.map((h) => [h.name.toLowerCase(), h.slug]));
  const items = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/items.json'), 'utf8')) as { game_id: number | null; name: string; slug: string; display_name: string; slot_type: string | null; rarity: string | null }[];
  const coreItemByGameId = new Map(items.filter((i) => i.rarity === 'Epic' && i.slot_type === 'Passive' && i.game_id != null).map((i) => [i.game_id!, i]));
  const itemBySlug = new Map(items.map((i) => [i.slug, i]));
  const crestByGameId = new Map(items.filter((i) => i.slot_type === 'Crest' && i.game_id != null).map((i) => [i.game_id!, i.display_name]));

  // Perk catalog: internal name -> id / display name / slot (one GraphQL call).
  const prevAug = existsSync(AUG_OUT) ? JSON.parse(readFileSync(AUG_OUT, 'utf8')) : null;
  let perkByName = new Map<string, PerkInfo>();
  let augCatalog: Record<string, { name: string; description: string; hero: string | null }> = prevAug?.catalog ?? {};
  if (hasCredentials()) {
    const d = await gql<{ perks: { id: string; data: { name: string; displayName: string; slot: string; description: string | null; hero: { slug: string } | null } | null }[] }>(
      '{ perks { id data { name displayName slot description hero { slug } } } }');
    for (const p of d.perks) {
      if (!p.data) continue;
      perkByName.set(p.data.name, { id: p.id, displayName: p.data.displayName, slot: p.data.slot, description: p.data.description ?? '', hero: p.data.hero?.slug ?? null });
    }
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
  if (fresh && prev) console.log(`patch changed (${prev.patch} -> ${meta.patch}); starting a fresh window`);
  console.log(`match stream from ${new Date(st.cursor * 1000).toISOString()} (${fresh ? 'fresh' : 'resuming'}), up to ${MAX_REQUESTS} requests`);

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
  };
  const stopAt = Math.floor(Date.now() / 1000) - 60;
  while (requests < MAX_REQUESTS && st.cursor < stopAt) {
    const page = await fetchPage(st.cursor);
    if (!page) { stoppedEarly = true; console.log('  stream still refusing after backoff; saving progress and stopping (the next run resumes)'); break; }
    requests++;
    const boundary = new Set(st.boundaryIds);
    const newMatches = page.filter((m) => m?.matchId && !boundary.has(m.matchId) && epoch(m.endTime) >= st.cursor);
    for (const m of newMatches) {
      seenThisRun++;
      if (m.gameMode !== 'RANKED') continue;
      rankedThisRun++;
      for (const p of m.playerData ?? []) {
        if (p.bIsAIPlayer) continue;
        const role = String(p.roleName ?? '').replace('ESelectedRole::', '').toLowerCase();
        if (!ROLES.has(role)) continue;
        const slug = slugByName.get(String(p.heroName ?? '').toLowerCase());
        if (!slug) { unknownHeroes.add(String(p.heroName)); continue; }
        const won = p.teamId === m.winningTeam;
        const cell = ((st.heroes[slug] ??= {})[role] ??= { n: 0, w: 0, augments: {}, eternals: {}, crests: {} });
        cell.n++; if (won) cell.w++;
        let eternal: string | null = null;
        const minors: Record<'BLESSING_MINOR_1' | 'BLESSING_MINOR_2', string | null> = { BLESSING_MINOR_1: null, BLESSING_MINOR_2: null };
        for (const { perkName } of p.heroPerkData ?? []) {
          const info = perkByName.get(perkName);
          if (!info) { unknownPerks.add(perkName); continue; }
          if (info.slot === 'HERO_SPECIFIC_1') bump(cell.augments, info.id, won);
          else if (info.slot === 'ETERNAL_1') eternal = info.displayName;
          else if (info.slot === 'BLESSING_MINOR_1' || info.slot === 'BLESSING_MINOR_2') minors[info.slot] = info.displayName;
        }
        if (eternal) {
          const e = (cell.eternals[eternal] ??= { n: 0, w: 0, minor1: {}, minor2: {}, pairs: {} });
          e.n++; if (won) e.w++;
          if (minors.BLESSING_MINOR_1) bump(e.minor1, minors.BLESSING_MINOR_1, won);
          if (minors.BLESSING_MINOR_2) bump(e.minor2, minors.BLESSING_MINOR_2, won);
          if (minors.BLESSING_MINOR_1 && minors.BLESSING_MINOR_2) bump(e.pairs, `${minors.BLESSING_MINOR_1}|${minors.BLESSING_MINOR_2}`, won);
        }
        for (const it of p.inventoryData ?? []) {
          const crest = crestByGameId.get(it?.itemId);
          if (crest) { bump(cell.crests, crest, won); break; }
        }
        // transactionType 10 = purchase (11 = starting items, others = sells/undos).
        const core: string[] = [];
        for (const t of p.incomeData?.transactions ?? []) {
          if (t?.transactionType !== 10) continue;
          const it = coreItemByGameId.get(t.itemId);
          if (it && !core.includes(it.slug)) core.push(it.slug);
          if (core.length === 3) break;
        }
        if (core.length === 3) bump((cell.cores ??= {}), core.join('|'), won);
      }
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
  for (const [slug, roles] of Object.entries(st.heroes)) {
    for (const [role, c] of Object.entries(roles)) {
      if (c.n < MIN_ROLE_GAMES) continue;
      (out[slug] ??= {})[role] = {
        games: c.n, wins: c.w,
        augments: sorted(c.augments).map(([id, v]) => ({ id, name: augCatalog[id]?.name ?? id, n: v.n, w: v.w })),
        eternals: sorted(c.eternals).map(([name, e]) => ({
          name, n: e.n, w: e.w,
          minor1: sorted(e.minor1).map(([m, v]) => ({ name: m, n: v.n, w: v.w })),
          minor2: sorted(e.minor2).map(([m, v]) => ({ name: m, n: v.n, w: v.w })),
          pairs: sorted(e.pairs).slice(0, 5).map(([k, v]) => { const [a, b] = k.split('|'); return { minor1: a, minor2: b, n: v.n, w: v.w }; }),
        })),
        crests: sorted(c.crests).map(([name, v]) => ({ name, n: v.n, w: v.w })),
      };
    }
  }
  writeFileSync(AUG_OUT, JSON.stringify({
    generatedAt: st.generatedAt,
    source: `pred.gg public match stream (get-matches-since), RANKED, patch ${meta.patch ?? '?'} window ${st.window.from.slice(0, 16)} -> ${st.window.to.slice(0, 16)}, ${st.window.rankedMatches.toLocaleString()} ranked matches; (hero, role) cells with ${MIN_ROLE_GAMES}+ games. Counted by npm run perks from data/aggregates/perk-stream.json.`,
    note: 'n = games, w = wins. eternals[].minor1/minor2 = minor-slot picks under that Eternal; pairs = the most-played minor combinations.',
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
  const buildHeroes: Record<string, unknown[]> = {};
  const buildByRole: Record<string, Record<string, unknown[]>> = {};
  for (const [slug, roles] of Object.entries(st.heroes)) {
    const all: Record<string, NW> = {};
    for (const [role, c] of Object.entries(roles)) {
      for (const [k, v] of Object.entries(c.cores ?? {})) { const a = (all[k] ??= { n: 0, w: 0 }); a.n += v.n; a.w += v.w; }
      const rows = coreRows(c.cores ?? {});
      if (rows.length) (buildByRole[slug] ??= {})[role] = rows;
    }
    const rows = coreRows(all);
    if (rows.length) buildHeroes[slug] = rows;
  }
  writeFileSync(path.join(ROOT, 'data/aggregates/predgg-builds.json'), JSON.stringify({
    generatedAt: st.generatedAt,
    source: `pred.gg public match stream (get-matches-since), RANKED, patch ${meta.patch ?? '?'}: ordered 3-item cores (first three completed Epic items by purchase time), ${MIN_CORE_GAMES}+ games each, counted ${String(st.coresFrom).slice(0, 16)} -> ${st.window.to.slice(0, 16)}; hero-wide + per-role. Counted by npm run perks.`,
    heroes: buildHeroes,
    byRole: buildByRole,
  }, null, 1));

  const cells = Object.values(out).reduce((t, r) => t + Object.keys(r).length, 0);
  if (stoppedEarly) console.log('\nSTOPPED EARLY (stream throttled) — window is partial; rerun to continue.');
  console.log(`\n${requests} requests, ${seenThisRun} new matches (${rankedThisRun} ranked) -> window ${st.window.from.slice(0, 16)} -> ${st.window.to.slice(0, 16)}, ${st.window.rankedMatches} ranked total`);
  console.log(`-> data/aggregates/perk-stream.json, predgg-augments.json (${Object.keys(out).length} heroes, ${cells} hero-role cells)`);
  if (unknownHeroes.size || unknownPerks.size) console.log(`unmapped: heroes ${[...unknownHeroes].join(', ') || '-'}; perks ${[...unknownPerks].slice(0, 10).join(', ') || '-'}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
