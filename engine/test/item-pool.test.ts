import { describe, expect, it } from 'vitest';
import { itemPool, pickWindows, type CatalogItem } from '../src/item-pool.js';

const cat: CatalogItem[] = [
  { game_id: 1, slug: 'noxia', name: 'Noxia', rarity: 'Epic', slot_type: 'Passive', aggression_type: 'Burst', total_price: 3000 },
  { game_id: 2, slug: 'tainted-scepter', name: 'Tainted Scepter', rarity: 'Epic', slot_type: 'Passive', aggression_type: 'AntiHeal', total_price: 3000 },
  { game_id: 3, slug: 'stealth-ward', name: 'Stealth Ward', rarity: 'Common', slot_type: 'Trinket', total_price: 0 },
  { game_id: 4, slug: 'tempest', name: 'Tempest', rarity: 'Legendary', slot_type: 'Crest', total_price: 0 },
];

describe('item pool', () => {
  it('keeps only non-overlapping windows of the current patch, newest first', () => {
    const w = (file: string, from: string, to: string, v = '1.17.2') => ({ file, from, to, versions: { [v]: 10 } });
    const kept = pickWindows([
      w('a', '2026-10-24T21:00Z', '2026-10-26T09:00Z'),
      w('b', '2026-10-23T22:00Z', '2026-10-25T10:00Z'), // overlaps a
      w('c', '2026-10-22T22:00Z', '2026-10-24T10:00Z'),
      w('d', '2026-10-01T00:00Z', '2026-10-02T00:00Z', '1.17'), // old patch
    ], '1.17.2');
    expect(kept.map((k) => k.file)).toEqual(['a', 'c']);
  });

  it('sums finished Epic items only, adds per-role core shares and threat tags', () => {
    const day = { meta: { window: { from: '', to: '' } }, heroes: { countess: { games: 100, wins: 50, byRole: { midlane: { n: 80, w: 40 }, jungle: { n: 20, w: 10 } }, items: { 1: { n: 60, w: 33 }, 2: { n: 20, w: 11 }, 3: { n: 90, w: 45 }, 4: { n: 50, w: 25 } } } } };
    const pool = itemPool([day, day], { 'countess|midlane': { all: { n: 200, i: { noxia: 100, 'tainted-scepter': 40 }, p: { n: 40, i: { noxia: 30 } } } } }, cat)['countess']!;
    expect(pool.games).toBe(200);
    expect(pool.roleShare).toEqual({ midlane: 0.8, jungle: 0.2 });
    expect(pool.items.map((i) => i.slug)).toEqual(['noxia', 'tainted-scepter']);
    expect(pool.items[0]).toMatchObject({ n: 120, w: 66, share: 0.6, core: { midlane: 0.5 }, corePlat: { midlane: 0.75 }, tag: null });
    expect(pool.items[1]!.tag).toBe('into healing and lifesteal');
  });
});
