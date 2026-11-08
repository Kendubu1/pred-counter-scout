// Loadout enrichment for the post-game reviews: what each player actually RAN —
// augment, Eternal, both minor blessings and crest — for all ten players.
//
// pred.gg GraphQL cannot return perks at our app tier (simpleBuild is gated,
// priorities item 1), which is why the films never carried them. The public
// match stream does: every player row there has heroPerkData, and its matchId /
// playerId are the same UUIDs the films already store. So each film is looked
// up in the stream by its own id (start + duration says where to look; ~3
// calls a film) and the decoded loadout is written onto players[i].loadout.
//
//   npm run postgame:loadout            # fill films missing a loadout block
//   npm run postgame:loadout -- --all   # re-decode every film
//
// Since 2026-11-08 the same lookup also saves the stream's match detail the films never kept
// (players[i].stream, film.streamMatch; src/ingest/stream-detail.ts): levels and level-up times,
// exact purchase times, damage from heroes by type, healing by source, minions, wards with
// positions, every jungle / objective kill. Films that have a loadout but no detail are looked
// up once more.
//
// Needs PREDGG creds for ONE call (the perk catalog that turns internal perk
// names into display names); the stream itself is public. Sequential, 2s
// between calls. A film the stream does not have is marked so it is not
// re-searched every hour; a throttled run saves what it has and stops, and the
// next run picks up the rest.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findStreamMatch, loadPerkCatalog, loadoutOf, sleep, StreamThrottled, type Loadout } from './match-stream.js';
import { streamMatchOf, streamPlayerOf, type StreamMatch, type StreamPlayer } from './stream-detail.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DIR = path.join(ROOT, 'data/postgame');
const ALL = process.argv.includes('--all');

type Film = {
  matchId: string; startTime: string; durationMin: number;
  players: { pid: string; name: string; heroSlug: string; loadout?: Loadout | null; stream?: StreamPlayer | null }[];
  streamMatch?: StreamMatch;
  loadoutSource?: { source: string; fetchedAt: string; found: boolean; note?: string };
};

async function main() {
  const items = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/items.json'), 'utf8')) as { game_id: number | null; display_name: string; slug: string; slot_type: string | null }[];
  const slugByName = new Map((JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/heroes.json'), 'utf8')) as { name: string; slug: string }[]).map((h) => [h.name.toLowerCase(), h.slug]));
  const buildSlug = new Map((items as any[]).filter((i) => (i.rarity === 'Epic' || i.rarity === 'Legendary' || i.slot_type === 'Crest') && i.game_id != null).map((i) => [i.game_id as number, i.slug as string]));
  const crestByGameId = new Map(items.filter((i) => i.slot_type === 'Crest' && i.game_id != null).map((i) => [i.game_id!, { name: i.display_name, slug: i.slug }]));
  // Newest first: the latest games are the ones being read, and a throttled
  // run should leave the backlog at the old end.
  const startOf = (f: string) => (JSON.parse(readFileSync(path.join(DIR, f), 'utf8')) as Film).startTime ?? '';
  const files = readdirSync(DIR).filter((f) => /^[0-9a-f-]{36}\.json$/.test(f))
    .map((f) => [f, startOf(f)] as const).sort((a, b) => b[1].localeCompare(a[1])).map(([f]) => f);
  const todo = files.filter((f) => {
    if (ALL) return true;
    const film = JSON.parse(readFileSync(path.join(DIR, f), 'utf8')) as Film;
    return !film.loadoutSource || (film.loadoutSource.found && !film.streamMatch);
  });
  if (process.env.LIMIT) todo.splice(Number(process.env.LIMIT));
  if (!todo.length) { console.log('every film already has its loadout and stream detail'); return; }

  const perkByName = await loadPerkCatalog();
  const unknownPerks = new Set<string>();
  let filled = 0, missing = 0;
  for (const f of todo) {
    const file = path.join(DIR, f);
    const film = JSON.parse(readFileSync(file, 'utf8')) as Film;
    let hit: any;
    try {
      hit = await findStreamMatch(film.matchId, film.startTime, film.durationMin);
    } catch (e) {
      if (e instanceof StreamThrottled) { console.log(`\nstream throttled after ${filled + missing} film(s); rerun to continue`); break; }
      throw e;
    }
    const fetchedAt = new Date().toISOString();
    if (!hit) {
      film.loadoutSource = { source: 'pred.gg public match stream', fetchedAt, found: false, note: 'match not found in the stream near its end time' };
      missing++;
      process.stdout.write('x');
    } else {
      const rowByPid = new Map<string, any>((hit.playerData ?? []).map((r: any) => [r.playerId, r]));
      let matched = 0;
      for (const p of film.players) {
        const row = rowByPid.get(p.pid);
        p.loadout = row ? loadoutOf(row, perkByName, crestByGameId, unknownPerks) : null;
        p.stream = row ? streamPlayerOf(row, buildSlug) : null;
        if (row) matched++;
      }
      film.streamMatch = streamMatchOf(hit);
      for (const b of film.streamMatch.bans) b.hero = slugByName.get(b.hero.toLowerCase()) ?? b.hero;
      film.loadoutSource = { source: 'pred.gg public match stream (get-matches-since)', fetchedAt, found: true, ...(matched < film.players.length ? { note: `${film.players.length - matched} player(s) absent from the stream row` } : {}) };
      filled++;
      process.stdout.write('.');
    }
    writeFileSync(file, JSON.stringify(film, null, 1));
    await sleep(2000);
  }
  console.log(`\n${filled} film(s) given loadouts, ${missing} not in the stream, ${todo.length - filled - missing} left for the next run`);
  if (unknownPerks.size) console.log(`unknown perk names (not in the pred.gg perk catalog): ${[...unknownPerks].join(', ')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
