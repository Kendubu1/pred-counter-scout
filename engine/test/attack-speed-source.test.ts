import { expect, it } from 'vitest';
import { loadData, parseSelfAttackSpeed } from '../src/data.js';
import { loadCalibration, simulate } from '../src/sim.js';
import type { HeroKit } from '../src/types.js';
const data = loadData();
const ability = (slug: string, key: string) => data.kits.get(slug)!.abilities.find(a => a.key === key)!;
it('uses Sparrow attack-speed duration, not the preceding stealth timer', () => {
  expect(ability('sparrow', 'SECONDARY').buffDurationSecPerRank).toEqual([6]);
});
it('preserves ranked Grux duration and the explicit Serath/Phase/Murdock windows', () => {
  expect(ability('grux', 'ULTIMATE').buffDurationSecPerRank).toEqual([8, 10, 12]);
  expect(ability('serath', 'ULTIMATE').buffDurationSecPerRank).toEqual([7]);
  expect(ability('phase', 'ULTIMATE').buffDurationSecPerRank).toEqual([8]);
  expect(ability('murdock', 'SECONDARY').buffDurationSecPerRank).toEqual([4]);
});
it('does not turn turret buffs, icon tags, or stacked mode mechanics into self steroids', () => {
  expect(ability('iggy-scorch', 'PRIMARY').selfAttackSpeedPctPerRank).toBeUndefined();
  expect(ability('grim-exe', 'SECONDARY')?.selfAttackSpeedPctPerRank).toBeUndefined();
  expect(data.kits.get('revenant')!.abilities.every(a => !a.selfAttackSpeedPctPerRank)).toBe(true);
});
it('requires a stated timer attached to the attack-speed grant', () => {
  expect(parseSelfAttackSpeed('Gain 30% Attack Speed.')).toBeNull();
  expect(parseSelfAttackSpeed('Stun for 2s. Gain 30% Attack Speed.')).toBeNull();
  expect(parseSelfAttackSpeed('Gain 30% <AttackSpeedText>Attack Speed</AttackSpeedText> for 6s.')).toEqual({perRank: [30], durations: [6]});
});


it('uses the duration at the selected rank in sustained attack-speed math', () => {
  const kit: HeroKit = {...data.kits.get('murdock')!, abilities: [{
    key: 'PRIMARY', name: 'Synthetic buff', damagePerRank: [], scalingPct: 0,
    damageType: 'physical', cooldowns: [20, 20], costs: [0, 0], maxRank: 2,
    selfAttackSpeedPctPerRank: [100, 100], buffDurationSec: 2,
    buffDurationSecPerRank: [2, 6],
  }]};
  const run = (rank: number) => simulate(kit, [], {level: 1, profile: null,
    ranks: new Map([['PRIMARY', rank]])}, loadCalibration()).autoDps;
  // In a 10s ready-at-start fight: 2/10 versus 6/10 uptime, not duration/cooldown.
  expect(run(2) / run(1)).toBeCloseTo(1.6 / 1.2, 8);
});
