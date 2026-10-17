import { describe, expect, it } from 'vitest';
import { markedTargetProcCount, type MarkHit } from '../src/marked-target.js';
const hit = (time:number, activationId:string):MarkHit => ({time,activationId});
describe('Noxia eligible-hit timeline', () => {
  it('requires a mark and a new activation identity, not another tick', () => {
    expect(markedTargetProcCount([hit(0,'a'),hit(.2,'a')],3,8)).toBe(0);
    expect(markedTargetProcCount([hit(0,'a'),hit(.2,'a'),hit(1,'b')],3,8)).toBe(1);
  });
  it('does not turn sparse casts into procs after the mark expires', () => {
    expect(markedTargetProcCount([hit(0,'a'),hit(4,'b'),hit(8,'c')],3,8)).toBe(0);
    expect(markedTargetProcCount([hit(0,'a'),hit(4,'b'),hit(5,'c')],3,8)).toBe(1);
  });
  it('ignores cooldown hits for both marking and identity recording', () => {
    expect(markedTargetProcCount([hit(0,'a'),hit(1,'b'),hit(8,'c'),hit(9,'d')],3,8)).toBe(1);
    expect(markedTargetProcCount([hit(0,'a'),hit(1,'b'),hit(2,'c'),hit(9,'d'),hit(9.1,'c')],3,8)).toBe(2);
  });
  it('keeps recorded identities when a mark expires, but clears them after a proc', () => {
    expect(markedTargetProcCount([hit(0,'a'),hit(4,'b'),hit(4.5,'a')],3,8)).toBe(0);
    expect(markedTargetProcCount([hit(0,'a'),hit(1,'b'),hit(9,'a'),hit(10,'b')],3,8)).toBe(2);
  });
  it('refreshes a successfully reapplied mark on the non-proc branch', () => {
    expect(markedTargetProcCount([hit(0,'a'),hit(2,'a'),hit(4,'b')],3,8)).toBe(1);
  });
  it('uses stable hit ordering and expiry-before-hit at a boundary', () => {
    expect(markedTargetProcCount([hit(0,'a'),hit(0,'b')],3,8)).toBe(1);
    expect(markedTargetProcCount([hit(0,'a'),hit(3,'b')],3,8)).toBe(0);
    expect(markedTargetProcCount([hit(2,'b'),hit(0,'a')],3,8)).toBe(1);
    expect(markedTargetProcCount([],3,8)).toBe(0);
    expect(() => markedTargetProcCount([hit(NaN,'a')],3,8)).toThrow();
  });
});
