import { describe, it, expect } from 'vitest';
import { replayMalice, type MaliceEvent } from '../src/malice-replay.js';
const scalars = { maxStacks: 15, damagePerStack: 1.5, scalingPerStack: 0.01 };
const hit = (tags = ['GameplayEffect.AbilityDamage'], hero = true): MaliceEvent => ({ kind: 'damage', tags, hero, magicalPower: 100 });
describe('diagnostic Malice state from recovered client', () => {
  it('starts full, consumes once, and only refills from explicit events', () => {
    const r = replayMalice([{kind:'activate'}, hit(), hit(), {kind:'recharge'}, hit()], scalars);
    expect(r.packets.map(p => p.rawMagnitude)).toEqual([37.5, 0, 2.5]);
    expect(r.stacks).toBe(0);
  });
  it('does not consume on nonhero or item/proc damage, including descendant tags', () => {
    const r = replayMalice([{kind:'activate'}, hit(undefined,false), hit(['GameplayEffect.AbilityDamage','GameplayEffect.Item.Other']), hit(['GameplayEffect.PhysicalDamage','GameplayEffect.ProcDamage']), hit(['GameplayEffect.MagicalDamage']), hit()], scalars);
    expect(r.packets.map(p => p.stacks)).toEqual([15]);
  });
  it('accepts physical/true damage and replenishes on takedown without exceeding cap', () => {
    const r = replayMalice([{kind:'activate'}, {kind:'recharge'}, hit(['GameplayEffect.PhysicalDamage']), {kind:'recharge'}, {kind:'takedown'}, hit(['GameplayEffect.TrueDamage'])], scalars);
    expect(r.packets.map(p => p.stacks)).toEqual([15,15]);
  });
  it('requires activation and rejects unresolved or invalid numeric inputs', () => {
    expect(() => replayMalice([hit()],scalars)).toThrow('activated');
    expect(() => replayMalice([],{...scalars,maxStacks:NaN})).toThrow('scalars');
    expect(() => replayMalice([],{...scalars,scalingPerStack:NaN})).toThrow('scalars');
  });
});
