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

  // The extraction is one patch's client. A later digest that changes a stat,
  // or ships a new hero/item, is listed in the fixture and must actually name it.
  const digestText = (patch: string) => readFileSync(path.join(root, `data/patches/${patch}.json`), 'utf8');
  const superseded = new Set((evidence.supersededByPatch ?? []).map((x: any) => `${x.kind}:${x.slug}:${x.stat}`));
  const newer = new Set((evidence.releasedAfterExtraction ?? []).map((x: any) => `${x.kind}:${x.slug}`));
  it('every superseded or newer entry is backed by the digest of the patch that changed it', () => {
    const nameOf = (x: any) => x.kind === 'hero' ? heroes.find((h: any) => h.slug === x.slug)?.display_name : items.find((i: any) => i.slug === x.slug)?.display_name;
    for (const x of [...(evidence.supersededByPatch ?? []), ...(evidence.releasedAfterExtraction ?? [])]) {
      const d = digestText(x.patch);
      expect(d.includes(`"${x.slug}"`) || d.includes(nameOf(x) ?? '\u0000'), `${x.kind}:${x.slug} in ${x.patch}`).toBe(true);
    }
  });

  it('every catalog hero and item has a recorded named asset', () => {
    for (const h of heroes) if (!newer.has(`hero:${h.slug}`)) expect(evidence.heroAssets, h.slug).toContain(h.name);
    for (const i of items) if (!newer.has(`item:${i.slug}`)) expect(evidence.itemAssets, i.slug).toContain(i.name);
  });

  it('hero stats match independently extracted curve checkpoints', () => {
    for (const point of evidence.heroPoints) {
      if (superseded.has(`hero:${point.hero}:${point.stat}`)) continue;
      const h = heroes.find((h: any) => h.slug === point.hero);
      const values = h.base_stats[point.stat];
      expect(values[Math.min(point.level - 1, values.length - 1)],
        `${point.hero} ${point.stat} L${point.level}`).toBeCloseTo(point.value, 2);
    }
  });

  it('confirmed item stat mappings stay aligned with the extracted table', () => {
    for (const point of evidence.itemPoints) {
      if (superseded.has(`item:${point.item}:${point.stat}`)) continue;
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
