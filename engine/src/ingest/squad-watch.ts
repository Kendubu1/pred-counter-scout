// Squad match watcher — the detection half of the "coach kicks off when the
// 5-stack finishes a game" automation.
//
//   npm run squad:watch          # detect; print + record new matches
//   npm run squad:watch -- --dry # detect only; do not update the state file
//
// There is no webhook anywhere in the Predecessor data ecosystem, so
// "event-based" is a polite poll: ONE aliased pred.gg query fetches every squad
// member's latest matches, and anything newer than the committed high-water
// mark in data/postgame/watch-state.json is a new game. The scheduled Routine
// (docs/coach-automation.md) runs this on a cadence; a fire where nothing is
// new costs exactly one API call and exits.
//
// Five-stack dedupe matters: one squad game surfaces once per member, keyed by
// the same match uuid, and must trigger ONE coach run, not five. Matches are
// therefore collected into a uuid-keyed map with every member who played.
//
// Exit code doubles as the signal for the driving session:
//   0 -> nothing new; 3 -> new matches found (details on stdout + state file).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gql, hasCredentials } from './predgg.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const STATE = path.join(ROOT, 'data/postgame/watch-state.json');
const DRY = process.argv.includes('--dry');
const LOOKBACK = 8; // per member; a session of games between polls stays caught

interface WatchState {
  note: string;
  updatedAt: string;
  // per member: the newest match START TIME already handled. Time, not uuid,
  // is the cursor — uuids do not order, and one missed poll must not strand
  // older unseen games behind a newer marker.
  seenThrough: Record<string, string>;
}

interface Row {
  team: string; role: string | null;
  hero: { slug: string } | null;
  match: { uuid: string; duration: number; winningTeam: string; startTime: string; gameMode: string };
}

async function main() {
  if (!hasCredentials()) {
    // The credentials gate, loudly: a watcher that silently no-ops when creds
    // are missing looks identical to "no games played" forever.
    console.error('squad-watch: PREDGG_CLIENT_ID/SECRET missing from env — cannot check for new matches. Add them to the environment this automation runs in.');
    process.exit(2);
  }
  const squad = JSON.parse(readFileSync(path.join(ROOT, 'data/artifacts/squad.json'), 'utf8')) as
    { members: { uuid: string; name: string }[] };
  const members = squad.members;
  const state: WatchState = existsSync(STATE)
    ? JSON.parse(readFileSync(STATE, 'utf8'))
    : { note: '', updatedAt: '', seenThrough: {} };

  // One aliased call for the whole squad (data policy: batch and alias).
  const q = `{ ${members.map((m, i) => `p${i}: player(by: { uuid: "${m.uuid}" }) {
    matchesPaginated(limit: ${LOOKBACK}) { results {
      team role hero { slug }
      match { uuid duration winningTeam startTime gameMode }
    } } }`).join(' ')} }`;
  const d = await gql<Record<string, { matchesPaginated: { results: Row[] } }>>(q);

  // uuid-keyed so a full 5-stack game is one entry with five participants.
  const fresh = new Map<string, { uuid: string; startTime: string; gameMode: string; duration: number;
    participants: { uuid: string; name: string; heroSlug: string | null; role: string | null; won: boolean }[] }>();
  const newestSeen: Record<string, string> = { ...state.seenThrough };

  members.forEach((m, i) => {
    const rows = (d[`p${i}`]?.matchesPaginated.results ?? [])
      .filter((r) => ['RANKED', 'STANDARD'].includes(r.match.gameMode));
    const cursor = state.seenThrough[m.uuid] ?? '';
    for (const r of rows) {
      if (r.match.startTime > (newestSeen[m.uuid] ?? '')) newestSeen[m.uuid] = r.match.startTime;
      if (cursor && r.match.startTime <= cursor) continue;
      if (!cursor) continue; // first ever run: set the mark, do not replay history
      const e = fresh.get(r.match.uuid) ?? {
        uuid: r.match.uuid, startTime: r.match.startTime, gameMode: r.match.gameMode,
        duration: r.match.duration, participants: [],
      };
      e.participants.push({ uuid: m.uuid, name: m.name, heroSlug: r.hero?.slug ?? null, role: r.role?.toLowerCase() ?? null, won: r.team === r.match.winningTeam });
      fresh.set(r.match.uuid, e);
    }
  });

  const matches = [...fresh.values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const firstRun = !Object.keys(state.seenThrough).length;

  if (!DRY) {
    writeFileSync(STATE, JSON.stringify({
      note: 'High-water mark for the squad match watcher (squad-watch.ts). seenThrough = newest match startTime already handled per member; matches at or before it never re-trigger. Committed so the marker survives across fresh automation sessions.',
      updatedAt: new Date().toISOString(),
      seenThrough: newestSeen,
    } as WatchState, null, 1));
  }

  if (firstRun) {
    console.log(`squad-watch: first run — marker initialised for ${members.length} members at their current latest matches; nothing replayed.`);
    return;
  }
  if (!matches.length) { console.log('squad-watch: no new squad matches.'); return; }

  console.log(`squad-watch: ${matches.length} NEW match(es):`);
  for (const m of matches) {
    const names = m.participants.map((p) => `${p.name}${p.heroSlug ? ` (${p.heroSlug}${p.role ? `, ${p.role}` : ''})` : ''}`).join(', ');
    const result = m.participants[0]?.won ? 'WON' : 'LOST';
    console.log(`  ${m.startTime} ${m.gameMode} ${result} · ${m.participants.length}/5 of the squad · match ${m.uuid}`);
    console.log(`    ${names}`);
  }
  console.log('\nnext: for each match uuid ->');
  console.log('  npm run postgame -- <match-uuid>       # pull facts (omeda public API)');
  console.log('  then the coach narrative agent pass + npm run coach:critique loop');
  console.log('  npm run coach -- <lead-uuid> && npm run squad -- <lead-uuid>   # refresh reports');
  process.exit(3);
}

main().catch((e) => { console.error('squad-watch failed:', e.message); process.exit(1); });
