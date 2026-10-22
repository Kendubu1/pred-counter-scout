import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { pendingCoachMatches } from '../src/coach-pending.js';

describe('unfinished coach recovery', () => {
  it('retries imported and partially authored matches regardless of detection cursor', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'coach-pending-'));
    const dir = path.join(root, 'data/postgame'); mkdirSync(dir, { recursive:true });
    const id = '0b5db31c-78f7-4194-814c-824348b60836';
    const save = (name: string, data: unknown) => writeFileSync(path.join(dir,name), JSON.stringify(data));
    try {
      save('index.json', { matches:[{matchId:id,stackSize:3,hasCoaching:false}] });
      save('watch-state.json', {seenThrough:{p:'2099-01-01'}});
      save(id+'.json', {players:[{pid:'p',us:true}],coaching:null});
      expect(pendingCoachMatches(root)).toEqual([id]);
      save('index.json', {matches:[{matchId:id,stackSize:3,hasCoaching:true}]});
      save(id+'.json', {players:[{pid:'p',us:true}],coaching:{personaId:'blunt-paragraph-v7',headline:'Draft',perPlayer:{}}});
      expect(pendingCoachMatches(root)).toEqual([id]);
      save(id+'.json', {players:[{pid:'p',us:true}],coaching:{personaId:'blunt-paragraph-v7',headline:'Done',perPlayer:{p:'Advice'}}});
      expect(pendingCoachMatches(root)).toEqual([]);
      save(id+'.json', {coaching:{headline:'Published classic',microReads:{}}});
      expect(pendingCoachMatches(root)).toEqual([]);
    } finally { rmSync(root, {recursive:true,force:true}); }
  });
});
