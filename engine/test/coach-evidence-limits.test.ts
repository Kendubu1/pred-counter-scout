import { describe, expect, it } from 'vitest';
import { fightEconLines } from '../src/ingest/coach-critique.js';

describe('coach evidence preserves uncertainty', () => {
  it('keeps death/prize chronology without converting an unclustered death into isolation or blame', () => {
    const source = fightEconLines({
      fights: {
        caughtOut: { us: [{ hero: 'Phase', min: 8, by: 'Kwang' }], themCount: 0 },
        deathCosts: [{ hero: 'Phase', min: 8, solo: true, cost: [{ type: 'FANGTOOTH', min: 9 }] }],
      },
    } as any).join('\n');
    expect(source).toContain('Phase 8m by Kwang');
    expect(source).toContain('FANGTOOTH@9m');
    expect(source).toContain('not proof of being alone or caught');
    expect(source).toContain('Neither category proves isolation');
    expect(source).not.toContain("player's own receipt");
    expect(source).not.toContain('CAUGHT OUT (');
  });
});
