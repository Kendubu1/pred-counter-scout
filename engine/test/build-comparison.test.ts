import {describe,expect,it} from 'vitest';
import {affordablePrefix,compareBuilds} from '../src/build-comparison.js';
import {loadData} from '../src/data.js';
import {loadCalibration} from '../src/sim.js';
const data=loadData(),cal=loadCalibration(),kit=data.kits.get('murdock')!;
const a=data.itemsBySlug.get('sky-splitter')!,b=data.itemsBySlug.get('timewarp')!;
describe('controlled build comparisons',()=>{
  it('keeps purchase order, exact affordability and residual gold',()=>{
    expect(affordablePrefix([a,b],a.totalPrice)).toEqual([a]);
    expect(affordablePrefix([{...a,totalPrice:5000},{...b,totalPrice:1000}],2000)).toEqual([]);
    const r=compareBuilds(kit,[a],[b],13,a.totalPrice+b.totalPrice,cal);
    expect(r.field.remainingGold).toBe(b.totalPrice);
    expect(r.candidate.remainingGold).toBe(a.totalPrice);
  });
  it('the same build under the same conditions produces no artificial advantage',()=>{
    const r=compareBuilds(kit,[a,b],[a,b],13,9000,cal);
    expect(r.sameSpend).toBe(true);
    for(const delta of Object.values(r.deltas))expect(delta.difference).toBe(0);
  });
  it('rejects invalid scenarios instead of inventing values',()=>{
    expect(()=>affordablePrefix([a],-1)).toThrow();
    expect(()=>compareBuilds(kit,[a],[b],0,9000,cal)).toThrow();
    expect(()=>affordablePrefix([{...a,totalPrice:NaN}],9000)).toThrow();
  });
});
