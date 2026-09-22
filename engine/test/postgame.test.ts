// Post-game facts engine: from one match's omeda payload, compute lane matchups
// (our kill-window matrix), build-vs-optimal by slug, and experience — the
// deterministic skeleton the coaching pass narrates.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { loadData, type LoadedData } from '../src/data.js';
import { computeMatchFacts, loadoutFromPerks, type OmedaMatch, type PostGameInputs, type HeroStatCell } from '../src/postgame.js';

const ROOT = path.resolve(__dirname, '..', '..');
let data: LoadedData;
let omedaHeroes: { id: number; slug: string }[];
let matrix: { minutes: number[]; pairs: Record<string, string> };
beforeAll(() => {
  data = loadData();
  omedaHeroes = JSON.parse(readFileSync(path.join(ROOT, 'data/omeda/heroes.json'), 'utf8'));
  matrix = JSON.parse(readFileSync(path.join(ROOT, 'data/artifacts/matchup-matrix.json'), 'utf8'));
});

const idOf = (slug: string, heroes: { id: number; slug: string }[]) => heroes.find((h) => h.slug === slug)!.id;

function mkPlayer(over: Partial<any> & { team: string; hero_id: number; role: string; id: string }): any {
  return {
    display_name: over.id, kills: 1, deaths: 1, assists: 1, performance_score: 100, performance_title: '',
    gold_earned: 10000, total_damage_dealt_to_heroes: 10000, physical_damage_dealt_to_heroes: 8000,
    magical_damage_dealt_to_heroes: 2000, total_damage_dealt_to_objectives: 1000, total_damage_taken: 10000,
    total_damage_mitigated: 5000, total_healing_done: 0, total_shielding_received: 0, wards_placed: 1,
    wards_destroyed: 0, objective_kills: 0, inventory_data: [], rank: null, vp_change: 5, ...over,
  };
}

describe('post-game facts engine', () => {
  it('computes lane matchups from the kill-window matrix and resolves heroes', () => {
    const a = idOf('gideon', omedaHeroes), b = idOf('countess', omedaHeroes);
    const match: OmedaMatch = {
      id: 'test-match', start_time: '2026-06-11T00:00:00.000Z', end_time: '', game_duration: 1800,
      game_mode: 'ranked', winning_team: 'dawn',
      players: [
        mkPlayer({ id: 'me', team: 'dawn', hero_id: a, role: 'midlane' }),
        mkPlayer({ id: 'enemy', team: 'dusk', hero_id: b, role: 'midlane' }),
      ],
    };
    const artifacts = new Map<string, any>();
    for (const s of ['gideon', 'countess']) {
      const p = path.join(ROOT, 'data/artifacts', `${s}.json`);
      artifacts.set(s, JSON.parse(readFileSync(p, 'utf8')));
    }
    const inp: PostGameInputs = { match, ourTeam: 'dawn', omedaHeroes, heroStats: new Map<string, HeroStatCell[]>(), matrix, artifacts };
    const facts = computeMatchFacts(data, inp);

    expect(facts.result).toBe('win');
    expect(facts.lanes.length).toBe(1);
    const lane = facts.lanes[0]!;
    expect(lane.ourSlug).toBe('gideon');
    expect(lane.theirSlug).toBe('countess');
    expect(['favored', 'even', 'unfavored']).toContain(lane.edge);
    // The verdict string mirrors the matrix entry length (one char per checkpoint).
    expect(lane.verdict.length).toBe(matrix.minutes.length);
    // The verdict matches the matrix (direct or inverted), never invented.
    const direct = matrix.pairs['gideon|countess'];
    const rev = matrix.pairs['countess|gideon'];
    const expected = direct ?? (rev ? [...rev].map((c) => (c === 'y' ? 'e' : c === 'e' ? 'y' : '=')).join('') : null);
    if (expected) expect(lane.verdict).toBe(expected);
  });

  it('flags field-core items the player never built, matched by slug not name', () => {
    const gideon = idOf('gideon', omedaHeroes);
    const art = JSON.parse(readFileSync(path.join(ROOT, 'data/artifacts/gideon.json'), 'utf8'));
    // Build exactly the optimizer's first three items -> nothing core is "missing".
    const optimalSlugs: string[] = (art.roles?.[0]?.build?.items ?? art.build.items).map((i: any) => i.slug);
    const idToGid = new Map([...data.itemsBySlug.values()].filter((i) => i.gameId != null).map((i) => [i.slug, i.gameId!]));
    const builtGids = optimalSlugs.slice(0, 3).map((s) => idToGid.get(s)!).filter(Boolean);

    const match: OmedaMatch = {
      id: 't2', start_time: '2026-06-11T00:00:00.000Z', end_time: '', game_duration: 2400,
      game_mode: 'ranked', winning_team: 'dawn',
      players: [
        mkPlayer({ id: 'me', team: 'dawn', hero_id: gideon, role: 'midlane', inventory_data: builtGids }),
        mkPlayer({ id: 'enemy', team: 'dusk', hero_id: idOf('countess', omedaHeroes), role: 'midlane' }),
      ],
    };
    const artifacts = new Map<string, any>([['gideon', art]]);
    const facts = computeMatchFacts(data, { match, ourTeam: 'dawn', omedaHeroes, heroStats: new Map(), matrix, artifacts });
    const me = facts.players.find((p) => p.us)!;
    // The three optimal items we "built" must not appear as missing.
    const builtNames = optimalSlugs.slice(0, 3).map((s) => data.itemsBySlug.get(s)!.name);
    for (const n of builtNames) expect(me.missingCore).not.toContain(n);
    expect(me.items.length).toBe(builtGids.length);   // completed items resolved
  });

  it('maps completed items to their modeled spike minutes, ascending and grounded', () => {
    const gideon = idOf('gideon', omedaHeroes);
    const art = JSON.parse(readFileSync(path.join(ROOT, 'data/artifacts/gideon.json'), 'utf8'));
    // Sim-build items that carry a modeled spike minute (the power-timeline source).
    const simItems: { slug: string; spikeMinute: number }[] = (art.roles?.[0]?.build?.items ?? art.build.items)
      .filter((i: any) => i.slug && typeof i.spikeMinute === 'number');
    expect(simItems.length).toBeGreaterThan(1);   // the fixture must exercise the lookup
    const pick = simItems.slice(0, 3);
    const idToGid = new Map([...data.itemsBySlug.values()].filter((i) => i.gameId != null).map((i) => [i.slug, i.gameId!]));
    const builtGids = pick.map((i) => idToGid.get(i.slug)!).filter(Boolean);

    const match: OmedaMatch = {
      id: 't3', start_time: '2026-06-11T00:00:00.000Z', end_time: '', game_duration: 2100,
      game_mode: 'ranked', winning_team: 'dawn',
      players: [
        mkPlayer({ id: 'me', team: 'dawn', hero_id: gideon, role: 'midlane', inventory_data: builtGids }),
        mkPlayer({ id: 'enemy', team: 'dusk', hero_id: idOf('countess', omedaHeroes), role: 'midlane' }),
      ],
    };
    const facts = computeMatchFacts(data, { match, ourTeam: 'dawn', omedaHeroes, heroStats: new Map(), matrix, artifacts: new Map([['gideon', art]]) });
    const me = facts.players.find((p) => p.us)!;

    // Every built sim item appears with its EXACT modeled minute (never invented).
    for (const it of pick) {
      const got = me.spikes.find((s) => s.slug === it.slug);
      expect(got).toBeTruthy();
      expect(got!.spikeMinute).toBe(it.spikeMinute);
    }
    // Ascending by minute — the axis the timeline draws.
    const mins = me.spikes.map((s) => s.spikeMinute);
    expect(mins).toEqual([...mins].sort((a, b) => a - b));
    // The enemy carries no artifact here, so no fabricated spikes leak in.
    const enemy = facts.players.find((p) => !p.us)!;
    expect(enemy.spikes).toEqual([]);
  });

  // 2026-09-21 feedback: a squad member read the lobby's ETERNAL row (the
  // engine's pick) as their own loadout — wrong three games running. What was
  // RUN is a feed fact (pred.gg perks); the engine's pick never masquerades as it.
  it('records the Eternal loadout that was RUN from the feed perks, and never invents one', () => {
    const gideon = idOf('gideon', omedaHeroes);
    const perks = [
      { slot: 'BLESSING_MINOR_2', name: 'Mind Rot' },
      { slot: 'COMMON_1', name: 'Technocrat' },
      { slot: 'ETERNAL_1', name: 'Vesh' },
      { slot: 'HERO_SPECIFIC_1', name: 'Cosmic Cascade' },
      { slot: 'BLESSING_MINOR_1', name: 'The Tenth Seal' },
      { slot: 'COMMON_2', name: 'Farmer' },
      { slot: 'MYSTERY_SLOT', name: 'ignored' },
    ];
    const match: OmedaMatch = {
      id: 't4', start_time: '2026-09-22T00:00:00.000Z', end_time: '', game_duration: 1800,
      game_mode: 'ranked', winning_team: 'dawn',
      players: [
        mkPlayer({ id: 'me', team: 'dawn', hero_id: gideon, role: 'midlane', perks }),
        mkPlayer({ id: 'enemy', team: 'dusk', hero_id: idOf('countess', omedaHeroes), role: 'midlane' }),   // omeda-shaped: no perks
      ],
    };
    const facts = computeMatchFacts(data, { match, ourTeam: 'dawn', omedaHeroes, heroStats: new Map(), matrix, artifacts: new Map() });
    const me = facts.players.find((p) => p.us)!;
    expect(me.loadout).toEqual({ eternal: 'Vesh', minors: ['The Tenth Seal', 'Mind Rot'], augment: 'Cosmic Cascade', commons: ['Technocrat', 'Farmer'], source: 'pred.gg' });
    // No perks in the feed = not recorded. Null, never the engine's pick.
    expect(facts.players.find((p) => !p.us)!.loadout).toBeNull();
    expect(loadoutFromPerks([])).toBeNull();
    expect(loadoutFromPerks(undefined)).toBeNull();
    // A partial record stays partial (a missing minor is not filled in).
    expect(loadoutFromPerks([{ slot: 'ETERNAL_1', name: 'Krix' }])).toEqual({ eternal: 'Krix', minors: [], augment: null, commons: [], source: 'pred.gg' });
  });

  it('committed coaching never states the engine\'s Eternal pick as what a player ran', () => {
    // The author rule (pred-scout-coach.md) and critic flag (h): on a film with
    // no recorded loadout, an Eternal line may only speak of "the engine's pick".
    const dir = path.join(ROOT, 'data/postgame');
    const POSSESSIVE = /\b[\w.&' ]+?'s (loadout|top pick|eternal|blessing) (is|was|runs|ran)\b|\b(ran|took|picked|chose|equipped|brought) (Vesh|Aion|Vermis|Thraex|Marrow|Xyris|Demiurge|Nihil|Exarch|Krix|Idrisil|Lotus|Weald|Knell|Pilow|Satariel)\b|\bthe loadout (he|she|they) (ran|took|picked|chose)\b/i;
    const offenders: string[] = [];
    for (const f of readdirSync(dir).filter((x) => /^[0-9a-f-]{36}\.json$/.test(x))) {
      const j = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
      for (const [pid, br] of Object.entries<any>(j.coaching?.buildReads ?? {})) {
        const pl = (j.players ?? []).find((p: any) => p.pid === pid);
        if (pl?.loadout?.eternal || !br?.eternal) continue;   // recorded loadout: naming it is a fact
        if (POSSESSIVE.test(br.eternal)) offenders.push(`${f.slice(0, 8)} ${pid.slice(0, 8)}: ${br.eternal.slice(0, 90)}`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
