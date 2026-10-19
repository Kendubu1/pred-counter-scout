import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { selectCoachingPreset, loadCoachingPreset, coachingPresetPrompt } from '../src/coaching-presets.js';
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })));
function setup() {
 const root = mkdtempSync(path.join(tmpdir(), 'coach-presets-')); roots.push(root);
 mkdirSync(path.join(root, 'data/coaching/review-presets'), { recursive: true }); mkdirSync(path.join(root, 'data/postgame'), { recursive: true });
 const put = (f: string, d: unknown) => writeFileSync(path.join(root, f), JSON.stringify(d));
 put('data/coaching/personas.json', { active: 'new', presets: [{ id: 'new', layout: 'concise', instructions: 'Short.' }, { id: 'old', layout: 'classic', instructions: 'Detailed.' }] });
 const old = { headline: 'Old', team: 'Why', perPlayer: { p: 'Advice' } };
 const snapshot = { id: 'old', sourceCommit: 'abc', note: '', reviews: { match: old } };
 put('data/coaching/review-presets/old.json', snapshot);
 const match = { matchId: 'match', players: [{ pid: 'p', kills: 7 }], events: [{ sec: 200 }], futureField: true, coaching: { headline: 'New' } };
 put('data/postgame/match.json', match);
 return { root, put, old, snapshot, match, read: () => JSON.parse(readFileSync(path.join(root, 'data/postgame/match.json'), 'utf8')) };
}
it('selects layout and instructions without replacing review', () => { const s=setup(); expect(selectCoachingPreset(s.root,'old')).toBe(0); expect(loadCoachingPreset(s.root).layout).toBe('classic'); expect(coachingPresetPrompt(s.root)).toContain('Detailed.'); expect(s.read()).toEqual(s.match); });
it('restores only coaching preserving updated facts and unknown fields', () => { const s=setup(); expect(selectCoachingPreset(s.root,'old',true)).toBe(1); expect(s.read()).toEqual({...s.match,coaching:s.old}); });
it('rejects unknown selection without writes', () => { const s=setup(); expect(()=>selectCoachingPreset(s.root,'../escape',true)).toThrow('Unknown'); expect(loadCoachingPreset(s.root).id).toBe('new'); expect(s.read()).toEqual(s.match); });
it('validates all matches before first write', () => { const s=setup(); s.put('data/coaching/review-presets/old.json',{...s.snapshot,reviews:{match:s.old,missing:s.old}}); expect(()=>selectCoachingPreset(s.root,'old',true)).toThrow(); expect(loadCoachingPreset(s.root).id).toBe('new'); expect(s.read()).toEqual(s.match); });
it('rejects mismatched snapshot and player identities', () => { const s=setup(); s.put('data/coaching/review-presets/old.json',{...s.snapshot,id:'new'}); expect(()=>selectCoachingPreset(s.root,'old',true)).toThrow('identity'); s.put('data/coaching/review-presets/old.json',{...s.snapshot,reviews:{match:{...s.old,perPlayer:{stranger:'Bad'}}}}); expect(()=>selectCoachingPreset(s.root,'old',true)).toThrow('Unknown review player'); expect(s.read()).toEqual(s.match); });
