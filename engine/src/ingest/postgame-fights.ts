// Fight-economics enrichment for the post-game reviews, plus the cross-game
// habit aggregate. Everything is arithmetic on facts already committed in each
// film — kills (t/side/pid), skirmish windows, timeline.majors (minute+side),
// the per-event `events` stream when present (newer pulls; carries tower times),
// and itemTimeline (est. item-online minutes).
//
// Writes per file:  fights = {
//   caughtOut   — deaths OUTSIDE any skirmish window (picks / caught rotating),
//                 split by side, ours listed with victim + killer + time
//   deathCosts  — our deaths followed within WINDOW by an enemy major/tower:
//                 what dying actually cost, per event and per player
//   conversion  — won fights cashed into a major/tower within WINDOW vs not,
//                 and the same for the fights we lost (their conversion)
//   itemGap     — per skirmish: participants' items est. online, us vs them
// }
// Writes across files: data/aggregates/fight-habits.json — per squad member:
// games, first-to-fall count, caught-out deaths, fight presence/absence and
// the team's fight record in each.
//
//   npm run postgame:fights            # fill films missing the block
//   npm run postgame:fights -- --all   # recompute everywhere
//
// Pure local — NO API calls. Tower-time linkage only where `events` exists
// (newer pulls); majors-only films say so in their note.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DIR = path.join(ROOT, 'data/postgame');
const WINDOW_S = 90;          // "within 90s" — the cash-in window for a fight/death
const MAJOR = /FANG|PRIME|ORB/i; // the prizes worth attributing (river/seedling too noisy)

interface Kill { t: number; min: number; killedSide: string; killerSlug: string; killedSlug: string; killedPid: string }
interface Skirmish { startSec: number; endSec: number; startMin: number; result: string; ourHeroes: string[]; theirHeroes: string[]; [k: string]: any }

function main() {
  const all = process.argv.includes('--all');
  const files = readdirSync(DIR).filter((f) => f.endsWith('.json') && f !== 'index.json');

  // cross-game tallies per squad member name
  const habits: Record<string, { games: number; deaths: number; firstToFall: number; caughtOut: number; fightsPresent: number; fightsPresentWon: number; fightsAbsent: number; fightsAbsentWon: number }> = {};
  const tally = (name: string) => (habits[name] ??= { games: 0, deaths: 0, firstToFall: 0, caughtOut: 0, fightsPresent: 0, fightsPresentWon: 0, fightsAbsent: 0, fightsAbsentWon: 0 });
  let convWon = 0, convCashed = 0, gamesSeen = 0;

  let updated = 0;
  for (const file of files) {
    const p = path.join(DIR, file);
    const j = JSON.parse(readFileSync(p, 'utf8'));
    const kills: Kill[] = j.kills ?? [];
    const sks: Skirmish[] = j.skirmishes ?? [];
    if (!kills.length) continue;

    const nameOfPid = new Map((j.players ?? []).map((pl: any) => [pl.pid, pl.squadName || pl.name]));
    const heroName = (slug: string) => ((j.players ?? []).find((pl: any) => pl.heroSlug === slug) || {}).heroName || slug;

    // event stream: prefer the persisted per-second events (has towers);
    // degrade to majors (minute-resolution, no towers) on older films.
    const evs: { sec: number; type: string; side: string; kind: string }[] = Array.isArray(j.events) && j.events.length
      ? j.events
      : (j.timeline?.majors ?? []).map((m: any) => ({ sec: m.minute * 60, type: m.type, side: m.side, kind: 'objective' }));
    const hasTowerTimes = Array.isArray(j.events) && j.events.some((e: any) => e.kind === 'tower');
    const prizes = evs.filter((e) => MAJOR.test(e.type) || e.kind === 'tower');

    const inFight = (t: number) => sks.some((s) => t >= s.startSec - 1 && t <= s.endSec + 1);

    // ── caught-out: deaths outside every skirmish window
    const ourCaught = kills.filter((k) => k.killedSide === 'us' && !inFight(k.t))
      .map((k) => ({ t: k.t, min: k.min, hero: heroName(k.killedSlug), pid: k.killedPid, by: heroName(k.killerSlug) }));
    const theirCaught = kills.filter((k) => k.killedSide === 'them' && !inFight(k.t)).length;

    // ── death costs: our deaths (anywhere) with an enemy prize inside the window
    const deathCosts = kills.filter((k) => k.killedSide === 'us').map((k) => {
      const cost = prizes.filter((e) => e.side === 'them' && e.sec >= k.t && e.sec <= k.t + WINDOW_S)
        .map((e) => ({ type: e.type, kind: e.kind, min: Math.round(e.sec / 6) / 10 }));
      return cost.length ? { min: k.min, hero: heroName(k.killedSlug), pid: k.killedPid, cost } : null;
    }).filter(Boolean) as { min: number; hero: string; pid: string; cost: { type: string; kind: string; min: number }[] }[];

    // ── conversion: won fights cashed vs left on the table (and their side)
    const cashOf = (s: Skirmish, side: string) => prizes.filter((e) => e.side === side && e.sec >= s.endSec && e.sec <= s.endSec + WINDOW_S).map((e) => e.type);
    const won = sks.filter((s) => s.result === 'won');
    const lost = sks.filter((s) => s.result === 'lost');
    const conversion = {
      wonFights: won.length,
      cashed: won.filter((s) => cashOf(s, 'us').length).length,
      missed: won.filter((s) => !cashOf(s, 'us').length).map((s) => s.startMin),
      theirWonFights: lost.length,
      theirCashed: lost.filter((s) => cashOf(s, 'them').length).length,
    };

    // ── item gap per skirmish (participants only, est-online at fight start)
    const onlineCount = (slugs: string[], atMin: number) => slugs.reduce((n, slug) => {
      const pl = (j.players ?? []).find((x: any) => x.heroSlug === slug);
      return n + ((pl?.itemTimeline ?? []).filter((i: any) => i.estMin != null && i.estMin <= atMin + 0.5).length);
    }, 0);
    const itemGap = sks.map((s, i) => ({ i, startMin: s.startMin, us: onlineCount(s.ourHeroes, s.startMin), them: onlineCount(s.theirHeroes, s.startMin) }));

    j.fights = {
      note: `caught-out = deaths outside every clustered fight; costs/conversion use a ${WINDOW_S}s window over ${hasTowerTimes ? 'the per-event objective+tower stream' : 'timeline majors (older film — no tower times; Fang/Prime/Orb only)'}; itemGap counts participants' items est. online (median-gold model, THEORY)`,
      caughtOut: { us: ourCaught, themCount: theirCaught },
      deathCosts,
      conversion,
      itemGap,
    };
    writeFileSync(p, JSON.stringify(j, null, 1));
    updated++;

    // ── cross-game habits (squad members only)
    gamesSeen++;
    convWon += conversion.wonFights; convCashed += conversion.cashed;
    const squadPids = new Map((j.players ?? []).filter((pl: any) => pl.us && pl.squadName).map((pl: any) => [pl.pid, pl.squadName]));
    const heroToName = new Map((j.players ?? []).filter((pl: any) => pl.us && pl.squadName).map((pl: any) => [pl.heroSlug, pl.squadName]));
    for (const nm of squadPids.values()) tally(nm as string).games++;
    for (const k of kills.filter((x) => x.killedSide === 'us')) { const nm = squadPids.get(k.killedPid); if (nm) tally(nm as string).deaths++; }
    for (const c of ourCaught) { const nm = squadPids.get(c.pid); if (nm) tally(nm as string).caughtOut++; }
    for (const s of sks) {
      const ks = kills.filter((k) => k.t >= s.startSec - 1 && k.t <= s.endSec + 1);
      const first = ks[0];
      if (first && first.killedSide === 'us') { const nm = squadPids.get(first.killedPid); if (nm) tally(nm as string).firstToFall++; }
      for (const [hero, nm] of heroToName) {
        const present = s.ourHeroes.includes(hero as string);
        const t = tally(nm as string);
        if (present) { t.fightsPresent++; if (s.result === 'won') t.fightsPresentWon++; }
        else { t.fightsAbsent++; if (s.result === 'won') t.fightsAbsentWon++; }
      }
    }
  }

  writeFileSync(path.join(ROOT, 'data/aggregates/fight-habits.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: `derived from data/postgame/*.json (${gamesSeen} films): kill stream + skirmish windows + majors/events; presence = the member's hero listed in the fight`,
    note: 'fight records are the TEAM result in fights the member was present/absent for — association, not causation (THEORY framing applies)',
    films: gamesSeen,
    teamConversion: { wonFights: convWon, cashed: convCashed },
    members: habits,
  }, null, 1));
  console.log(`${updated} film(s) enriched with fights block; habits for ${Object.keys(habits).length} members -> data/aggregates/fight-habits.json`);
}

main();
