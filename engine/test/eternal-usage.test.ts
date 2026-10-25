import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { mechanicsOf, eternalUsage } from '../src/eternal-usage.js';

const read = (p: string) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));
const cat = read('data/game-data/eternals.json');
const byName = (n: string) => cat.eternals.find((e: { name: string }) => e.name === n);
const tagsOf = (n: string) => Object.fromEntries(mechanicsOf(byName(n)).map((m) => [m.id, m.from]));

it('tags what a blessing gives, not what it reacts to', () => {
  const aion = tagsOf('Aion');
  expect(aion.gold).toEqual(['Major', 'Philosopher']);
  expect(aion.heal).toBeUndefined(); // "above 85% Health" is a condition, not healing
  expect(tagsOf('Idrisil').gold).toBeUndefined(); // "per 300 total gold earned" is not income
  expect(tagsOf('Vesh').heal).toEqual(['Lich']); // Mind Rot's "current health as damage" is not a heal
  expect(tagsOf('Marrow').antiheal).toEqual(['Leech']);
  expect(tagsOf('Marrow').heal).not.toContain('Leech');
  expect(tagsOf('Krix').heal).toEqual(expect.arrayContaining(['Regenerative Tissue', 'Voracity'])); // decimals in "0.2/0.4%" stay in-sentence
  expect(tagsOf('Idrisil').execute).toBeUndefined(); // "falling below 30% Health" is its own shield trigger
});

it('counts every ranked game once and keeps slot shares summing to one', () => {
  const augs = read('data/aggregates/predgg-augments.json');
  const u = eternalUsage(augs, cat.eternals, (s) => s);
  let all = 0, games = 0;
  for (const roles of Object.values(augs.heroes) as Record<string, { games: number }>[]) for (const c of Object.values(roles)) all += c.games;
  for (const e of Object.values(u)) {
    games += e.games;
    for (const slot of [1, 2]) {
      const shares = Object.values(e.minors).filter((m) => m.slot === slot).map((m) => m.share);
      if (shares.length) expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 1);
    }
  }
  expect(games).toBe(all);
});

it('ships verified why-copy for every Eternal, under real minors, naming gold where it is given', () => {
  const why = read('data/aggregates/eternal-why.json').eternals;
  for (const e of cat.eternals) {
    const c = why[e.id];
    expect(c?.why, e.name).toBeTruthy();
    const names = new Set([...e.minorSlot1, ...e.minorSlot2].map((m: { name: string }) => m.name));
    for (const n of Object.keys(c.minors)) expect(names.has(n), `${e.name}: ${n}`).toBe(true);
    if (mechanicsOf(e).some((m) => m.id === 'gold')) expect(c.why, e.name).toMatch(/gold/i);
  }
});
