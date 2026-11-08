import { describe, it, expect } from 'vitest';
import { buildStory, placeOn } from '../src/build-story.js';

const q = (lo: number, hi: number) => Array.from({ length: 19 }, (_, i) => lo + ((hi - lo) * i) / 18);
const norms = { n: 484, q: { dpm: q(500, 1400), share: q(0.15, 0.32), kp: q(0.25, 0.6), dp10: q(0.3, 2.5), gpm: q(350, 600), hpm: q(200, 1000), mpm: q(600, 2000) } };
const base = { ult: { name: 'Eclipse', base: 115, endGame: 65 }, fed: null, pen: null, amps: ['Megacosm', 'Entropy'], sustain: true, tough: true };

describe('build story', () => {
  it('places a value on 19 cut points', () => {
    expect(placeOn(q(0, 18), -1)).toBe(2);
    expect(placeOn(q(0, 18), 9)).toBe(50);
    expect(placeOn(q(0, 18), 99)).toBe(98);
  });
  it('picks the glass-cannon story for top damage with low mitigation, with its own lesson', () => {
    const st = buildStory({ heroName: 'Mourn', role: 'offlane', kills: 5, deaths: 1, assists: 11, damageToHeroes: 38487, goldEarned: 13937, healingDone: 18387, mitigated: 13558 }, { kills: 29, damage: 113000 }, 26, norms, base);
    expect(st.lead?.id).toBe('glass');
    expect(st.lead?.text).toMatch(/more than \d+% of Mourn offlane players this patch/);
    expect(st.lead?.lesson).toMatch(/focus Mourn first/);
    expect(st.tabs[0]).toBe('damage');
  });
  it('picks the snowball story when takedowns fed the cooldowns and kill participation is high', () => {
    const st = buildStory({ heroName: 'The Fey', role: 'midlane', kills: 11, deaths: 2, assists: 11, damageToHeroes: 20000, goldEarned: 13000, healingDone: 2000, mitigated: 30000 }, { kills: 38, damage: 100000 }, 30, norms, { ...base, fed: { name: 'Tithe of Death', takedowns: 22 } });
    expect(st.lead?.id).toBe('snowball');
    expect(st.tabs[0]).toBe('cooldowns');
  });
  it('has no lead without norms', () => {
    expect(buildStory({ heroName: 'X', role: 'carry', kills: 0, deaths: 0, assists: 0, damageToHeroes: 0, goldEarned: 0, healingDone: 0, mitigated: 0 }, { kills: 0, damage: 0 }, 20, undefined, base).lead).toBeNull();
  });
});
