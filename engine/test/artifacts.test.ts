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

  it('the committed artifact set covers the full roster and parses', () => {
    const dir = path.join(ROOT, 'data/artifacts');
    const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json' && f !== 'meta.json');
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
      // sorted by play, the meta-pick criterion
      for (let i = 1; i < lane.length; i++) expect(lane[i].games).toBeLessThanOrEqual(lane[i - 1].games);
    }
  });
});
