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
// Needs PREDGG creds for ONE call (the perk catalog that turns internal perk
// names into display names); the stream itself is public. Sequential, 2s
// between calls. A film the stream does not have is marked so it is not
// re-searched every hour; a throttled run saves what it has and stops, and the
// next run picks up the rest.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findStreamMatch, loadPerkCatalog, loadoutOf, sleep, StreamThrottled, type Loadout } from './match-stream.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DIR = path.join(ROOT, 'data/postgame');
const ALL = process.argv.includes('--all');

type Film = {
  matchId: string; startTime: string; durationMin: number;
  players: { pid: string; name: string; heroSlug: string; loadout?: Loadout | null }[];
  loadoutSource?: { source: string; fetchedAt: string; found: boolean; note?: string };
};

async function main() {
  const items = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/items.json'), 'utf8')) as { game_id: number | null; display_name: string; slug: string; slot_type: string | null }[];
  const crestByGameId = new Map(items.filter((i) => i.slot_type === 'Crest' && i.game_id != null).map((i) => [i.game_id!, { name: i.display_name, slug: i.slug }]));
  // Newest first: the latest games are the ones being read, and a throttled
  // run should leave the backlog at the old end.
  const startOf = (f: string) => (JSON.parse(readFileSync(path.join(DIR, f), 'utf8')) as Film).startTime ?? '';
  const files = readdirSync(DIR).filter((f) => /^[0-9a-f-]{36}\.json$/.test(f))
    .map((f) => [f, startOf(f)] as const).sort((a, b) => b[1].localeCompare(a[1])).map(([f]) => f);
  const todo = files.filter((f) => {
    if (ALL) return true;
    const film = JSON.parse(readFileSync(path.join(DIR, f), 'utf8')) as Film;
    return !film.loadoutSource;
  });
  if (!todo.length) { console.log('every film already has its loadout block'); return; }

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
        if (row) matched++;
      }
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
