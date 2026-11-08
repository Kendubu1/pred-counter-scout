import { describe, it, expect } from 'vitest';
import { buildPlaybook, type PbHero, type PbAbility } from '../src/playbook.js';

const A = (key: string, name: string, o: Partial<PbAbility> = {}): PbAbility => ({ key, name, hard: [], hardSec: null, aoe: false, damage: true, mobility: [], unstoppable: false, ...o });
const H = (slug: string, role: string, tags: string[], abilities: PbAbility[]): PbHero => ({ slug, name: slug.toUpperCase(), role, tags, abilities });
describe('team playbook', () => {
  const them = [H('div', 'jungle', ['diver', 'burst'], [A('R', 'Dive', { unstoppable: true })]), H('cc', 'support', ['peel'], [A('R', 'Bigstun', { hard: ['stun'], hardSec: 1.5, aoe: true })])];
  it('opens with the tank area CC, chains other CC, pays off with damage ults, peels the carry', () => {
    const us = [
      H('tank', 'support', ['tank', 'engage'], [A('R', 'Slam', { hard: ['knockup', 'stun'], hardSec: 1.5, aoe: true })]),
      H('jg', 'jungle', ['diver'], [A('R', 'Grab', { hard: ['suppress'], hardSec: 1.25 })]),
      H('mage', 'midlane', ['control', 'burst'], [A('R', 'Nuke', { aoe: true })]),
      H('adc', 'carry', ['dps'], [A('R', 'Barrage', { aoe: true })]),
      H('peel', 'offlane', ['peel'], [A('R', 'Save', { hard: ['knockup'], hardSec: 0.5, aoe: true }), A('Q', 'Stun', { hard: ['stun'], hardSec: 1 })]),
    ];
    const pb = buildPlaybook(us, them);
    const tf = pb.plays.find((p) => p.name === 'Teamfight engage')!;
    expect(tf.steps[0]).toMatchObject({ hero: 'TANK', ability: 'Slam' });
    expect(tf.steps.map((s) => s.ability)).toContain('Grab');
    expect(tf.steps.map((s) => s.ability)).not.toContain('Save'); // a peel hero's ult is never part of the engage
    expect(pb.plays.find((p) => p.name === 'Protect ADC')!.steps[0]!.hero).toBe('TANK');
    expect(pb.waitOut.map((s) => s.ability)).toEqual(['Bigstun', 'Dive']);
    expect(pb.note).toBeNull();
  });
  it('says plainly when nobody can open, and never uses a peel save as the opener', () => {
    const us = [H('peel', 'support', ['peel'], [A('R', 'Save', { hard: ['knockup'], hardSec: 0.5, aoe: true })]), H('adc', 'carry', ['dps'], [A('R', 'Barrage', { aoe: true })])];
    const pb = buildPlaybook(us, them);
    expect(pb.plays.find((p) => p.name === 'Teamfight engage')).toBeUndefined();
    expect(pb.note).toContain('No tank, engage hero');
  });
});
