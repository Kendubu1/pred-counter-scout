import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOES, ROLE_LANGUAGE, roleLine, tagItem, tagItems, type CatalogItem } from '../src/item-tags.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const catalog = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/items.json'), 'utf8')) as CatalogItem[];
const tags = tagItems(catalog);

describe('item tag sheet', () => {
  it('tags an item from its stats and the game text only', () => {
    const r = tagItem({
      slug: 'x', display_name: 'X', rarity: 'Epic', slot_type: 'Passive', aggression_type: 'AntiTank',
      stats: { attack_speed: 30, physical_power: 35, lifesteal: 7 },
      effects: [
        { name: 'Rend', active: false, condition: '<Condition>On Successful Basic Attacks:</Condition>', menu_description: '• Deal <HealthText>5%</HealthText> of <HealthText>Target\'s Current Health</HealthText> as <AttackDamageText>Damage</AttackDamageText> <EffectText>On-Hit</EffectText>.<br>• Reduced to 3.5% for Ranged Heroes.' },
        { name: '', menu_description: 'Damage Dealt: <EffectText>{DamageDealt}</EffectText>' },
      ],
    });
    expect(r.gives.map((g) => `${g.v}${g.pct ? '%' : ''} ${g.label}`)).toEqual(['35 Physical power', '30% Attack speed', '7% Lifesteal']);
    expect(r.does).toEqual(['% health damage', 'On-hit']);
    expect(r.answers).toEqual(['tanks']);
    expect(r.unique).toEqual(["Rend: On Successful Basic Attacks: Deal 5% of Target's Current Health as Damage On-Hit; Reduced to 3.5% for Ranged Heroes"]);
    expect(roleLine(r, 'carry')).toBe(ROLE_LANGUAGE.tanks.carry);
  });
  it('covers every completed item in the catalog with one vocabulary', () => {
    const done = catalog.filter((i) => i.rarity === 'Epic' || i.rarity === 'Legendary');
    expect(Object.keys(tags).length).toBe(done.length);
    for (const [slug, r] of Object.entries(tags)) {
      expect(r.unique.length, `${slug} statements`).toBeLessThanOrEqual(2);
      for (const d of r.does) expect(DOES).toContain(d);
      // a build item says something: a stat chip, a mechanic tag or its own statement
      if (r.kind === 'item') expect(r.gives.length + r.does.length + r.unique.length, slug).toBeGreaterThan(0);
      // every number in a statement is in the game's own text for that item (no invented figures)
      const src = JSON.stringify(catalog.find((i) => i.slug === slug)!.effects).replace(/<[^>]+>/g, '');
      for (const u of r.unique) for (const num of u.match(/\d+(\.\d+)?/g) ?? []) expect(src.includes(num), `${slug}: ${num}`).toBe(true);
    }
  });
  it('reads the known answers right', () => {
    const a = (s: string) => tags[s]!.answers;
    for (const s of Object.keys(tags).filter((k) => k.startsWith('tainted-'))) expect(a(s), s).toContain('healing');
    expect(a('sky-splitter')).toContain('tanks');
    expect(a('demolisher')).toContain('tanks');
    expect(a('stonewall')).toContain('physical');
    expect(a('spellbreaker')).toContain('magic');
    expect(a('legacy')).toEqual(expect.arrayContaining(['magic', 'cc', 'burst']));
    expect(a('demon-edge')).toContain('shields');
    expect(a('rebirth')).toContain('burst');
    expect(tags['nightfall']!.does).not.toContain('Anti-heal');
  });
  it('has a line for every answer in every lane', () => {
    for (const lines of Object.values(ROLE_LANGUAGE)) {
      expect(Object.keys(lines).sort()).toEqual(['carry', 'jungle', 'midlane', 'offlane', 'support']);
      for (const l of Object.values(lines)) expect(l.length).toBeLessThanOrEqual(60);
    }
  });
});
