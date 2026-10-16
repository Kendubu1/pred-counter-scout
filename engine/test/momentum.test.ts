import { describe, it, expect } from 'vitest';
import { momentumMovementGrant as grant } from '../src/momentum.js';
describe('recovered Momentum movement grant', () => {
  it('truncates each sampled displacement at the 50-unit boundary', () => {
    expect(grant([0,0,0],[49.9,0,0])).toBe(0);
    expect(grant([0,0,0],[50,0,0])).toBe(1);
    expect(grant([0,0,0],[149.9,0,0])).toBe(2);
  });
  it('uses three-dimensional endpoint distance, not accumulated travel', () => {
    expect(grant([0,0,0],[30,0,40])).toBe(1);
    expect(grant([0,0,0],[0,0,0])).toBe(0);
  });
  it('does not carry fractional grants across sampling intervals', () => {
    expect(grant([0,0,0],[40,0,0]) + grant([40,0,0],[80,0,0])).toBe(0);
    expect(grant([0,0,0],[80,0,0])).toBe(1);
  });
  it('rejects invalid positions instead of producing invalid stack counts', () => {
    expect(() => grant([0,0],[0,0,0])).toThrow('positions');
    expect(() => grant([0,0,0],[NaN,0,0])).toThrow('positions');
  });
});
