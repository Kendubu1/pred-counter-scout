import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAllowed, numbersInText, verifyLine, winrateNumbers } from '../src/copy-verify.js';
import { loadEffects } from '../src/effects.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('copy ground-check (item 8 verifier core)', () => {
  it('accepts only numbers that exist in the source data, in any common rendering', () => {
    const allowed = buildAllowed(winrateNumbers([{ n: 116285, w: 59446 }, { n: 76768, w: 38790 }]));
    // 59446/116285 = 51.122...% -> "51.1"; counts localized with commas
    expect(verifyLine('wins 51.1% of 116,285 games', allowed)).toBe(true);
    expect(verifyLine('about 0.6 more wins per 100 games', allowed)).toBe(true); // pairwise delta 51.1-50.5
    expect(verifyLine('wins 63% of games', allowed)).toBe(false);
    expect(verifyLine('a 12s cooldown', allowed)).toBe(false);
    expect(verifyLine('no numbers at all', allowed)).toBe(true);
  });

  it('mechanics text numbers are quotable', () => {
    const allowed = buildAllowed([], ['Deals 6% (+0.5% per minute) of ability damage as a burn over 3s.']);
    expect(verifyLine('the 6% burn scales by 0.5% per minute', allowed)).toBe(true);
    expect(verifyLine('the 7% burn', allowed)).toBe(false);
  });

  it('numbersInText finds decimals and integers', () => {
    expect(numbersInText('10-34% Attack Speed, 1.5s window')).toEqual([10, 34, 1.5]);
  });

  it('every Eternal in the field evidence joins a curated registry entry', () => {
    const augs = JSON.parse(readFileSync(path.join(ROOT, 'data/aggregates/predgg-augments.json'), 'utf8')) as {
      heroes: Record<string, Record<string, { eternals?: { name: string }[] }>>;
    };
    const reg = loadEffects();
    const names = new Set<string>();
    for (const roles of Object.values(augs.heroes)) {
      for (const cell of Object.values(roles)) {
        for (const e of cell.eternals ?? []) names.add(e.name);
      }
    }
    expect(names.size).toBeGreaterThanOrEqual(10);
    for (const n of names) {
      expect(reg.targets[`eternal:${n.toLowerCase()}:major`], `Eternal "${n}" missing from effects.json`).toBeDefined();
    }
  });
});
