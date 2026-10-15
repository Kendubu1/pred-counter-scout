import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { catalogBaseStat, catalogItemStat } from '../src/catalog-stats.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p: string) => JSON.parse(readFileSync(path.join(root, p), 'utf8'));

describe('installed-client catalog cross-check (2026-10-15)', () => {
  const evidence = read('engine/fixtures/catalog-asset-audit.json');
  const heroes = read('data/catalog/heroes.json');
  const items = read('data/catalog/items.json');
  it('converts retained CC duration into reduction (shop confirmed Absolution 25)', () => {
    expect(catalogItemStat('tenacity', 75)).toBe(25);
    expect(catalogItemStat('tenacity', 100)).toBe(0);
    expect(catalogItemStat('physical_power', 75)).toBe(75);
    expect(() => catalogItemStat('tenacity', 101)).toThrow(/verify/);
  });

  it('every catalog hero and item has a recorded named asset', () => {
    for (const h of heroes) expect(evidence.heroAssets, h.slug).toContain(h.name);
    for (const i of items) expect(evidence.itemAssets, i.slug).toContain(i.name);
  });

  it('hero stats match independently extracted curve checkpoints', () => {
    for (const point of evidence.heroPoints) {
      const h = heroes.find((h: any) => h.slug === point.hero);
      const values = h.base_stats[point.stat];
      expect(values[Math.min(point.level - 1, values.length - 1)],
        `${point.hero} ${point.stat} L${point.level}`).toBeCloseTo(point.value, 2);
    }
  });

  it('confirmed item stat mappings stay aligned with the extracted table', () => {
    for (const point of evidence.itemPoints) {
      const item = items.find((i: any) => i.slug === point.item);
      expect(item.stats[point.stat], `${point.item} ${point.stat}`).toBeCloseTo(point.value, 2);
    }
    // Unresolved mappings are deliberately not certified by this test.
  });

  it('does not accumulate repeated absolute range or zero level-up entries', () => {
    expect(catalogBaseStat('attack_range', Array(18).fill(1500))).toEqual([1500]);
    expect(catalogBaseStat('attack_range', [300, 0, 0])).toEqual([300]);
    expect(() => catalogBaseStat('attack_range', [300, 25, 25])).toThrow(/verify/);
  });

  it('preserves genuine level-up gains and attack-speed units', () => {
    expect(catalogBaseStat('physical_power', [57, 2.8, 2.95])).toEqual([57, 59.8, 62.75]);
    expect(catalogBaseStat('attack_speed', [120, 1.12, 1.18])).toEqual([1.2, 1.2112, 1.223]);
  });
});
