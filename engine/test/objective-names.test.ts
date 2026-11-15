import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const context:any={};
runInNewContext(readFileSync(new URL('../../ui/v6/objective-names.js',import.meta.url),'utf8'),context);
const names=context.ScoutObjectiveNames;
it('labels Shaper events and old prose without confusing the base Core or other objectives',()=>{
 expect(names.objective('GENESIS_CORE')).toBe('Shaper');
 expect(names.text('They took Genesis Core, then our Core.')).toBe('They took Shaper, then our Core.');
 expect(names.text('Genesis [Ultimate]')).toBe('Genesis [Ultimate]');
 expect(names.objective('MINI_PRIME')).toBe('mini prime');
 expect(names.objective('ORB_PRIME')).toBe('orb prime');
 expect(names.objective('CORE')).toBe('core');
 const raw={type:'GENESIS_CORE'};names.objective(raw.type);expect(raw.type).toBe('GENESIS_CORE');
});

it('normalizes only cloned coaching prose, retaining raw facts and player identity',()=>{const film={players:[{name:'Genesis Core'}],coaching:{playerBullets:{p:['Contest Genesis Core.']}}};const shown=names.coaching(film.coaching);expect(shown.playerBullets.p[0]).toBe('Contest Shaper.');expect(film.coaching.playerBullets.p[0]).toBe('Contest Genesis Core.');expect(film.players[0].name).toBe('Genesis Core');});
