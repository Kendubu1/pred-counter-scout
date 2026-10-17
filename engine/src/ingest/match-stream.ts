// Shared access to pred.gg's PUBLIC match stream
// (https://pred.gg/api/public/get-matches-since/<unix>/) and the perk catalog
// that decodes its per-player loadouts. Two consumers:
//   - perk-stream.ts counts augments / Eternals / minors / crests / cores across
//     every ranked match (npm run perks);
//   - postgame-loadout.ts looks up ONE coached match and records what each of
//     our players actually ran (npm run postgame:loadout).
//
// Stream semantics (probed 2026-10-14): each call returns the next 20 matches
// whose endTime >= <unix seconds>, oldest first, every game mode mixed. The
// stream's matchId and playerId are the same UUIDs pred.gg GraphQL uses, so a
// coached match and its players can be found in it directly.

import { gql, hasCredentials } from './predgg.js';

export const UA = { 'User-Agent': 'pred-counter-scout (github.com/Kendubu1/pred-counter-scout)' };
export const STREAM = (since: number) => `https://pred.gg/api/public/get-matches-since/${since}/`;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// "2026-10-14 20:04:52" is UTC.
export const epoch = (s: string) => Math.floor(Date.parse(`${s.replace(' ', 'T')}Z`) / 1000);

// null = the stream is refusing us right now (HTTP 403/429 that outlasts the
// backoff). Seen 2026-10-14 after ~800 back-to-back pages at a 1s delay: a
// temporary 403 that cleared within minutes. The caller saves and stops; the
// next run resumes.
export async function fetchPage(since: number): Promise<any[] | null> {
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

export type PerkInfo = { id: string; displayName: string; slot: string; description: string; hero: string | null };

/** Perk catalog: internal name (as the stream writes it) -> id / display name / slot. One GraphQL call; needs PREDGG creds. */
export async function loadPerkCatalog(): Promise<Map<string, PerkInfo>> {
  if (!hasCredentials()) throw new Error('needs PREDGG_CLIENT_ID/SECRET for the perk catalog (internal perk name -> display name)');
  const d = await gql<{ perks: { id: string; data: { name: string; displayName: string; slot: string; description: string | null; hero: { slug: string } | null } | null }[] }>(
    '{ perks { id data { name displayName slot description hero { slug } } } }');
  const out = new Map<string, PerkInfo>();
  for (const p of d.perks) {
    if (!p.data) continue;
    out.set(p.data.name, { id: p.id, displayName: p.data.displayName, slot: p.data.slot, description: p.data.description ?? '', hero: p.data.hero?.slug ?? null });
  }
  return out;
}

export type Loadout = {
  augment: { id: string; name: string } | null;
  eternal: string | null;
  minor1: string | null;
  minor2: string | null;
  crest: string | null;
  /** item slug of the crest (its icon is ui/img/crests/<slug>.webp) */
  crestSlug: string | null;
};

/** Decode one stream player row's perks + crest. Unknown perk names are reported, never guessed. */
export function loadoutOf(
  row: { heroPerkData?: { perkName: string }[]; inventoryData?: { itemId?: number }[] },
  perkByName: Map<string, PerkInfo>,
  crestByGameId: Map<number, { name: string; slug: string }>,
  unknownPerks?: Set<string>,
): Loadout {
  const lo: Loadout = { augment: null, eternal: null, minor1: null, minor2: null, crest: null, crestSlug: null };
  for (const { perkName } of row.heroPerkData ?? []) {
    const info = perkByName.get(perkName);
    if (!info) { unknownPerks?.add(perkName); continue; }
    if (info.slot === 'HERO_SPECIFIC_1') lo.augment = { id: info.id, name: info.displayName };
    else if (info.slot === 'ETERNAL_1') lo.eternal = info.displayName;
    else if (info.slot === 'BLESSING_MINOR_1') lo.minor1 = info.displayName;
    else if (info.slot === 'BLESSING_MINOR_2') lo.minor2 = info.displayName;
  }
  for (const it of row.inventoryData ?? []) {
    const crest = it?.itemId != null ? crestByGameId.get(it.itemId) : undefined;
    if (crest) { lo.crest = crest.name; lo.crestSlug = crest.slug; break; }
  }
  return lo;
}

export class StreamThrottled extends Error { constructor() { super('match stream is throttling us (HTTP 403/429 past the backoff)'); } }

/**
 * Find one finished match in the stream. Starts a few minutes before the
 * estimated end (start + duration) and pages forward; ~20 matches finish per
 * minute, so a hit usually takes 1-4 calls. Returns null when it is not there
 * (`slackMin` past the estimate, or `maxCalls` spent); throws StreamThrottled
 * when the stream refuses us, so a miss and a refusal are never confused.
 */
export async function findStreamMatch(matchId: string, startIso: string, durationMin: number, opts: { slackMin?: number; maxCalls?: number } = {}): Promise<any | null> {
  const estEnd = Math.floor(Date.parse(startIso) / 1000 + durationMin * 60);
  const stopAfter = estEnd + (opts.slackMin ?? 15) * 60;
  let since = estEnd - 180;
  for (let calls = 0; calls < (opts.maxCalls ?? 25); calls++) {
    const page = await fetchPage(since);
    if (!page) throw new StreamThrottled(); // the caller stops and retries on a later run
    const hit = page.find((m) => m?.matchId === matchId);
    if (hit) return hit;
    if (!page.length) return null;
    const newest = Math.max(...page.map((m) => epoch(m.endTime)));
    if (newest > stopAfter) return null;
    // Twenty matches can share one second; step past it rather than loop on it.
    since = newest > since ? newest : since + 1;
    await sleep(2000);
  }
  return null;
}
