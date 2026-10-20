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

it('groups every recorded pick into one tap target and renders build alongside all perk descriptions',()=>{
 const player={squadName:'Test',loadout:{eternal:'Vesh',minor1:'Lich',minor2:'Mind Rot',augment:{id:11,name:'Deep Freeze'}},items:[{slug:'example',name:'Example Item'}]};
 const html=ui.icons(player.loadout,player);
 expect((html.match(/<button/g)||[])).toHaveLength(1);
 expect((html.match(/<img/g)||[])).toHaveLength(4);
 const detail=ui.renderDetails(player,eternals,augments,[{slug:'example',stats:{health:100},effects:[{name:'Passive',condition:'On taking damage:',cooldown:'10s',menu_description:'Extra protection.'}]}]);
 for(const text of ['Vesh','Lich','Mind Rot','Deep Freeze','Example Item','Extra protection.','On taking damage:','10s cooldown','health: 100','not purchase order']) expect(detail).toContain(text);
});
it('build remains accessible when perk records are missing',()=>{
 expect(ui.icons(null,{items:[{slug:'example'}]})).toContain('view complete loadout');
 expect(ui.renderDetails({items:[{slug:'example',name:'Example Item'}]},null,null,null)).toContain('Example Item');
});
