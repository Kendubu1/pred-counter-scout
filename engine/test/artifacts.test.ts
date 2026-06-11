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
    const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json');
    expect(files.length).toBe(52);
    for (const f of files.slice(0, 8)) {
      const parsed = HeroArtifact.safeParse(JSON.parse(readFileSync(path.join(dir, f), 'utf8')));
      expect(parsed.success, f).toBe(true);
    }
    const index = JSON.parse(readFileSync(path.join(dir, 'index.json'), 'utf8'));
    expect(index.heroes.length).toBe(52);
    expect(index.patch).toBe(cal.patch);
  });
});
