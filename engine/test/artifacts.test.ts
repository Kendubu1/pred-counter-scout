import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData, type LoadedData } from '../src/data.js';
import { buildHeroArtifact, HeroArtifact } from '../src/artifacts.js';
import { loadCalibration, type Calibration } from '../src/sim.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let data: LoadedData;
let cal: Calibration;

beforeAll(() => {
  data = loadData();
  cal = loadCalibration();
});

describe('hero artifacts (Concept A engine stage)', () => {
  it('builds a schema-valid artifact with honesty fields intact', () => {
    const a = buildHeroArtifact(data.kits.get('gideon')!, data, cal, { beamWidth: 8, matchupEnemies: 1 });
    expect(() => HeroArtifact.parse(a)).not.toThrow();
    expect(a.confidence.level).toBe('THEORY');
    expect(a.confidence.unverifiedConstants).toContain('mitigation');
    // off-meta is either a proof-carrying candidate or an explicit absence
    expect(a.offMeta.candidates.length > 0 || a.offMeta.honestAbsence !== null).toBe(true);
    for (const c of a.offMeta.candidates) {
      expect(c.playRatePct).toBeLessThan(2);
      expect(c.edgeVsPopularPct).toBeGreaterThanOrEqual(8);
      expect(c.bestObjective.length).toBeGreaterThan(3);
    }
    // first purchase has a measured spike minute
    expect(a.build.items[0]!.spikeMinute).not.toBeNull();
    expect(a.matchups.length).toBeGreaterThanOrEqual(1);
  });

  it('support-role heroes carry the max-damage-only caveat (no support model yet)', () => {
    const adele = buildHeroArtifact(data.kits.get('adele')!, data, cal, { beamWidth: 6, matchupEnemies: 1 });
    expect(adele.role).toBe('support');
    expect(adele.roleCaveat).toMatch(/maximum-damage build, not a support build/);
    const gideon = buildHeroArtifact(data.kits.get('gideon')!, data, cal, { beamWidth: 6, matchupEnemies: 1 });
    expect(gideon.roleCaveat).toBeNull();
  });

  it('the committed artifact set covers the full roster and parses', () => {
    const dir = path.join(ROOT, 'data/artifacts');
    const files = readdirSync(dir).filter((f) => f.endsWith('.json') && !['index.json', 'meta.json', 'coach.json', 'squad.json', 'matchup-matrix.json'].includes(f));
    expect(files.length).toBe(52);
    for (const f of files.slice(0, 8)) {
      const parsed = HeroArtifact.safeParse(JSON.parse(readFileSync(path.join(dir, f), 'utf8')));
      expect(parsed.success, f).toBe(true);
    }
    const index = JSON.parse(readFileSync(path.join(dir, 'index.json'), 'utf8'));
    expect(index.heroes.length).toBe(52);
    expect(index.patch).toBe(cal.patch);
  });

  it('meta board: five lanes of most-played heroes with sane shrunk winrates', () => {
    const meta = JSON.parse(readFileSync(path.join(ROOT, 'data/artifacts/meta.json'), 'utf8'));
    expect(meta.patch).toBe(cal.patch);
    for (const role of ['carry', 'midlane', 'offlane', 'jungle', 'support']) {
      const lane = meta.roles[role];
      expect(lane.length, role).toBeGreaterThanOrEqual(5);
      expect(lane[0].games, role).toBeGreaterThan(100);
      for (const h of lane) {
        expect(h.shrunkWr, `${role}/${h.slug}`).toBeGreaterThan(0.35);
        expect(h.shrunkWr, `${role}/${h.slug}`).toBeLessThan(0.65);
        expect(data.kits.has(h.slug), `${role}/${h.slug} renders a portrait`).toBe(true);
      }
      // sorted by combined meta score (pick + winrate percentiles)
      for (let i = 1; i < lane.length; i++) expect(lane[i].metaScore).toBeLessThanOrEqual(lane[i - 1].metaScore);
      for (const h of lane) {
        expect(h.metaScore).toBeGreaterThanOrEqual(0);
        expect(h.metaScore).toBeLessThanOrEqual(1);
        expect([null, 'sleeper', 'popular but losing']).toContain(h.badge);
      }
    }
  });

  it('film room: every squad member report carries 3+ receipted insights', () => {
    const dir = path.join(ROOT, 'data/artifacts/players');
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThanOrEqual(5);
    const allTitles: string[][] = [];
    for (const f of files) {
      const p = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
      expect(p.insights.length, f).toBeGreaterThanOrEqual(3);
      for (const i of p.insights) {
        expect(i.title.length, f).toBeGreaterThan(5);
        expect(i.receipt.length, f).toBeGreaterThan(10);
      }
      allTitles.push(p.insights.map((i: { title: string }) => i.title));
    }
    // genuineness gate: no two members share an identical insight list
    for (let i = 0; i < allTitles.length; i++) {
      for (let j = i + 1; j < allTitles.length; j++) {
        expect(allTitles[i]!.join('|'), 'two members got identical insight lists').not.toBe(allTitles[j]!.join('|'));
      }
    }
  });

  it('the all-pairs matchup matrix covers every hero pair with valid verdict codes', () => {
    const mx = JSON.parse(readFileSync(path.join(ROOT, 'data/artifacts/matchup-matrix.json'), 'utf8'));
    const n = 52;
    expect(Object.keys(mx.pairs).length).toBe((n * (n - 1)) / 2);
    expect(mx.minutes.length).toBeGreaterThanOrEqual(4);
    for (const v of Object.values(mx.pairs)) {
      expect(v).toMatch(new RegExp(`^[ye=]{${mx.minutes.length}}$`));
    }
  });

  it('player-facing copy never abbreviates games as "g" (reads as gold)', () => {
    const files = [
      ...readdirSync(path.join(ROOT, 'data/artifacts/players')).map((f) => `data/artifacts/players/${f}`),
      'data/artifacts/squad.json', 'data/artifacts/coach.json',
    ];
    for (const f of files) {
      const hits = readFileSync(path.join(ROOT, f), 'utf8').match(/[0-9]+g[^a-z0-9]/g);
      expect(hits, `${f} contains a Ng abbreviation: ${hits?.join(', ')}`).toBeNull();
    }
  });

  it('archetypes: squad members carry distinct identities with plain-language receipts', () => {
    const squad = JSON.parse(readFileSync(path.join(ROOT, 'data/artifacts/squad.json'), 'utf8'));
    const archetypes = squad.members.map((m: { archetype: { label: string; receipt: string } | null }) => m.archetype);
    for (const a of archetypes) {
      expect(a).not.toBeNull();
      expect(a.receipt.length).toBeGreaterThan(20);
      // jargon gate: receipts speak in wins-per-100, never "points of winrate"
      expect(a.receipt).not.toMatch(/points/i);
    }
    const uniq = new Set(archetypes.map((a: { label: string }) => a.label));
    expect(uniq.size, 'two members got the same archetype label').toBe(archetypes.length);
  });

  it('top pilots per lane ship in meta.json (regenerate with PREDGG_* creds if this fires)', () => {
    const meta = JSON.parse(readFileSync(path.join(ROOT, 'data/artifacts/meta.json'), 'utf8'));
    expect(meta.topPlayers, 'meta.json was generated without pred.gg credentials').not.toBeNull();
    for (const role of ['carry', 'midlane', 'offlane', 'jungle', 'support']) {
      const pilots = meta.topPlayers[role];
      expect(pilots.length, role).toBeGreaterThanOrEqual(3);
      for (const p of pilots) {
        expect(p.name.length).toBeGreaterThan(0);
        expect(p.points).toBeGreaterThan(500);
        expect(p.ranking).toBeGreaterThanOrEqual(1);
      }
    }
  });
});
