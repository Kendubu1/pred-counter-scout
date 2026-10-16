import { describe, expect, it } from 'vitest';
import { agreementFromEvidence, buildEvidencePatch, type BuildEvidence } from '../src/agreement.js';
import { loadData } from '../src/data.js';
const data = loadData();
const slugs = ['timewarp', 'noxia', 'combustion'];
const core = {coreSlugs: slugs, n: 100, w: 51};
const front = [{items: slugs.map(s => data.itemsBySlug.get(s)!.name)}];
const score = (source: BuildEvidence, role = 'midlane') => agreementFromEvidence(front, 'gideon', data.itemsBySlug, source, '1.17.2', {role});

describe('meta evidence validity', () => {
  it('does not pass historical evidence just because the file was regenerated today', () => {
    const r = score({generatedAt:'2026-10-15', source:'pred.gg coreBuild (RANKED only, patch 1.15 (ids 152+153))', heroes:{gideon:[core]}, byRole:{gideon:{midlane:[core]}}})!;
    expect(r.hitAtK).toBe(true);
    expect(r.evidence.currentMetaEligible).toBe(false);
    expect(r.evidence.patch).toBe('1.15');
    expect(r.note).toContain('NOT current-meta');
  });
  it('uses role-specific observations instead of the more popular other lane', () => {
    const other = {coreSlugs:['dynamo','xenia','vanguardian'],n:1000,w:600};
    const r = score({patch:'1.17.2',heroes:{gideon:[other]},byRole:{gideon:{midlane:[core]}}})!;
    expect(r.topCore?.n).toBe(100);
    expect(r.evidence.currentMetaEligible).toBe(true);
    expect(r.evidence.population).toBe('role');
  });
  it('does not silently call hero-wide or missing-patch evidence current lane validation', () => {
    expect(score({patch:'1.17.2',heroes:{gideon:[core]}})!.evidence.currentMetaEligible).toBe(false);
    expect(score({heroes:{gideon:[core]},byRole:{gideon:{midlane:[core]}}})!.evidence.currentMetaEligible).toBe(false);
    expect(buildEvidencePatch({source:'patch 1.17.20',heroes:{}})).toBe('1.17.20');
  });
  it('keeps an empty lane empty and rejects unknown, duplicate or malformed cores', () => {
    expect(score({patch:'1.17.2',heroes:{gideon:[core]},byRole:{gideon:{midlane:[]}}})).toBeNull();
    const r=score({patch:'1.17.2',heroes:{gideon:[core,{...core,coreSlugs:['timewarp','noxia',null]},{...core,coreSlugs:['timewarp','timewarp','noxia']},{...core,w:101}]}})!;
    expect(r.cores).toHaveLength(1);
    expect(r.rejectedRows).toBe(3);
  });
  it('does not correlate a three-item core with an arbitrary covering six-item build', () => {
    expect(Number.isNaN(score({patch:'1.17.2',heroes:{gideon:[core]}})!.rankCorr)).toBe(true);
  });
});


describe('match-stream evidence compatibility', () => {
  it('recognizes colon-delimited patch metadata without truncating longer versions', () => {
    expect(buildEvidencePatch({source:'RANKED, patch 1.17.2: ordered cores',heroes:{}})).toBe('1.17.2');
    expect(buildEvidencePatch({source:'patch 1.17.20: ordered cores',heroes:{}})).toBe('1.17.20');
  });
  it('preserves pooled order status for order-sensitive consumers', () => {
    const r=score({patch:'1.17.2',heroes:{gideon:[{...core,anyOrder:true}]},byRole:{gideon:{midlane:[{...core,anyOrder:true}]}}})!;
    expect(r.topCore?.anyOrder).toBe(true);
    expect(r.evidence.currentMetaEligible).toBe(true);
  });
});
