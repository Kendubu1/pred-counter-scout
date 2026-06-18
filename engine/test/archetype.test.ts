// Player archetype titles: a standout role is "Secret" only when it is NOT the
// player's known main. If it IS their main, it's an open specialty (Career X).

import { describe, it, expect } from 'vitest';
import { archetypeCandidates } from '../src/ingest/playerProfile.js';

function player(favRole: string) {
  // Five 100+ game roles; jungle clearly best (spread ~6.5 wins/100).
  const roles = [
    { role: 'jungle', games: 287, rawWr: 0.57, shrunkWr: 0.535 },
    { role: 'offlane', games: 130, rawWr: 0.52, shrunkWr: 0.505 },
    { role: 'carry', games: 150, rawWr: 0.51, shrunkWr: 0.50 },
    { role: 'support', games: 140, rawWr: 0.50, shrunkWr: 0.49 },
    { role: 'midlane', games: 110, rawWr: 0.49, shrunkWr: 0.47 },
  ];
  return { uuid: 'u', name: 'Test', favRole, career: { games: 900, winrate: 0.5 }, roles, pool: [] } as any;
}

describe('archetype titles', () => {
  it('a jungle main with jungle as best role is "The Career Jungler", not "Secret"', () => {
    const c = archetypeCandidates(player('JUNGLE')).find((x) => x.kind === 'secret-role')!;
    expect(c).toBeTruthy();
    expect(c.label).toBe('The Career Jungler');
    expect(c.label).not.toContain('Secret');
  });

  it('a support main whose best role is jungle keeps "The Secret Jungler" (genuinely hidden)', () => {
    const c = archetypeCandidates(player('SUPPORT')).find((x) => x.kind === 'secret-role')!;
    expect(c.label).toBe('The Secret Jungler');
  });
});
