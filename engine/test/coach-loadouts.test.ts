import { expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const context:any={window:{},document:{addEventListener:()=>{}}};
runInNewContext(readFileSync(new URL('../../ui/v6/coach-loadouts.js',import.meta.url),'utf8'),context);
const ui=context.window.CoachLoadouts;
const eternals=JSON.parse(readFileSync(new URL('../../data/game-data/eternals.json',import.meta.url),'utf8'));
const augments=JSON.parse(readFileSync(new URL('../../data/aggregates/predgg-augments.json',import.meta.url),'utf8'));
it('shows only recorded choices, preserves slot order, and does not invent missing picks',()=>{
 expect(ui.choices(null)).toEqual([]);
 expect(ui.choices({eternal:'Vesh',minor1:'Lich',minor2:'Hex',augment:{id:69,name:'Thonk'}}).map((c:any)=>c.kind)).toEqual(['eternal','minor','minor','augment']);
 expect(ui.choices({minor1:'Lich'})).toHaveLength(1);
 expect(ui.icons(null)).toBe('');
});
it('resolves actual match icons and descriptions from committed catalogs',()=>{
 for(const id of ['e89f68db-2b84-4433-b02c-2ffbf6cb43f4','768794a7-cdc9-4365-b767-4c70fefc3fb2']) {
 const match=JSON.parse(readFileSync(new URL(`../../data/postgame/${id}.json`,import.meta.url),'utf8'));
 for(const p of match.players.filter((p:any)=>p.us))for(const c of ui.choices(p.loadout)) {
 expect(existsSync(new URL(`../../ui/img/${c.image}.webp`,import.meta.url)),c.name).toBe(true);
 expect(ui.detail(c.kind,c.key,c.parent,eternals,augments),c.name).toBeTruthy();
 }
 }
});
it('does not borrow another Eternal minor or substitute an unknown augment',()=>{
 expect(ui.detail('minor','Lich','unknown',eternals,augments)).toBeNull();
 expect(ui.detail('augment','unknown','',eternals,augments)).toBeNull();
});
it('escapes recorded labels and exposes keyboard buttons with accessible names',()=>{
 const html=ui.icons({eternal:'<img " onerror="alert(1)>'});
 expect(html).not.toContain('<img "');expect(html).toContain('&lt;img');expect(html).toContain('type="button"');expect(html).toContain('aria-label=');
});
