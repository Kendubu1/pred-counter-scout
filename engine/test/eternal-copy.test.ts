// Eternal card lines — the shipped aggregate is re-verified here from scratch:
// the test rebuilds each hero/role facts block with the SAME pure builder the
// pass and the critic use, and re-runs copy-verify over every line. A
// hand-edited or stale line citing a number its facts don't contain fails the
// harness, not just the ingest run.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAllowed, verifyLine } from '../src/copy-verify.js';
import { factsFor, loadEternalInputs, topEternals } from '../src/eternal-copy.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LINES = path.join(ROOT, 'data/aggregates/eternal-reviews.json');
const load = () => (existsSync(LINES) ? (JSON.parse(readFileSync(LINES, 'utf8')) as { heroes: Record<string, Record<string, Record<string, string>>> }) : null);

describe('Eternal card lines (copy pass)', () => {
  const { augs, heroBySlug, eternals } = loadEternalInputs();

  it('facts carry the kit, the lane augment and each shown Eternal with its field minors', () => {
    const cell = augs.heroes.yin?.jungle;
    const hero = heroBySlug.get('yin');
    if (!cell || !hero) return;
    const facts = factsFor('Yin', 'jungle', cell, hero, augs.catalog, eternals);
    expect(facts).toContain('Windburn');
    expect(facts).toContain('Storm of Salvation');
    for (const e of topEternals(cell)) expect(facts).toContain(`"${e.name}"`);
    expect(facts).toMatch(/minors most players run with it: Forage/);
  });

  it('every shipped line only cites numbers from its own hero/role facts', () => {
    const data = load();
    if (!data) return;
    let checked = 0;
    for (const [slug, roles] of Object.entries(data.heroes)) {
      const hero = heroBySlug.get(slug);
      for (const [role, lines] of Object.entries(roles)) {
        const cell = augs.heroes[slug]?.[role];
        expect(hero && cell, `${slug}/${role}: no source cell`).toBeTruthy();
        const allowed = buildAllowed([], [factsFor(hero!.display_name ?? slug, role, cell!, hero!, augs.catalog, eternals)]);
        for (const [et, line] of Object.entries(lines)) {
          checked++;
          expect(verifyLine(line, allowed), `${slug}/${role}/${et}: ungrounded number in "${line}"`).toBe(true);
          expect(line.split(/\s+/).length, `${slug}/${role}/${et}: over the card's word budget`).toBeLessThanOrEqual(36);
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  // After a data refresh reshuffles a role's top-3, old lines go stale silently
  // (they never render). Fail so the pass is re-run rather than left half-current.
  it('only ships lines for Eternals the hero page actually shows', () => {
    const data = load();
    if (!data) return;
    for (const [slug, roles] of Object.entries(data.heroes)) {
      for (const [role, lines] of Object.entries(roles)) {
        const shown = new Set(topEternals(augs.heroes[slug]![role]!).map((e) => e.name));
        for (const et of Object.keys(lines)) expect(shown.has(et), `${slug}/${role}: line for ${et}, which the page no longer shows`).toBe(true);
      }
    }
  });
});
