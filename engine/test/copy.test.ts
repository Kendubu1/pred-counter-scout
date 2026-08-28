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

describe('committed copy still grounds against the current catalog', () => {
  // The copy passes verify each line WHEN IT IS WRITTEN, but the catalog moves
  // underneath them: a tip written against last patch's ability text can quote a
  // number the ability no longer has. Refreshing to 1.16 surfaced two — Bayle's
  // basic-attack chain was described as "2.5x damage" after it became 2.3x, and
  // Maco's tip described a basic-attack stack mechanic that no longer exists.
  // Both survived because the ingest seeded its output from the committed file
  // and only skipped counting a rejected line instead of removing it.
  const heroes = JSON.parse(readFileSync(new URL('../../data/omeda/heroes.json', import.meta.url), 'utf8')) as {
    slug: string; abilities?: { key: string; cooldown?: number[]; cost?: number[]; menu_description?: string; game_description?: string }[];
  }[];
  const tips = JSON.parse(readFileSync(new URL('../../data/aggregates/ability-tips.json', import.meta.url), 'utf8')).heroes as Record<string, Record<string, string>>;
  const clean = (t?: string) => (t || '').replace(/<br\s*\/?>(\n)?/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

  it('every ability tip grounds in the ability text as it stands today', () => {
    const ungrounded: string[] = [];
    for (const h of heroes) {
      const t = tips[h.slug];
      if (!t) continue;
      for (const a of h.abilities ?? []) {
        const tip = t[a.key];
        if (!tip) continue;
        const allowed = buildAllowed([...(a.cooldown ?? []), ...(a.cost ?? [])], [clean(a.menu_description || a.game_description)]);
        if (!verifyLine(tip, allowed)) ungrounded.push(`${h.slug}/${a.key}: ${tip}`);
      }
    }
    expect(ungrounded).toEqual([]);
  });

  it('every rostered hero has tips, or is declared field-data pending', () => {
    const pending = JSON.parse(readFileSync(new URL('../../data/aggregates/field-data-pending.json', import.meta.url), 'utf8')).heroes as Record<string, { missing: string[] }>;
    for (const h of heroes) {
      if (pending[h.slug]?.missing.includes('ability tips')) continue;
      expect(Object.keys(tips[h.slug] ?? {}).length, `${h.slug} has no ability tips`).toBeGreaterThan(0);
    }
  });
});

describe('build reasoning describes the build we actually ship', () => {
  // The numeric verifier cannot catch this: when a catalog refresh changes what
  // the optimizer picks, the prose keeps explaining the OLD items and every line
  // still grounds, so the page confidently explains items nobody is buying. The
  // 1.16 refresh left 24 of 83 optimizer blocks in that state.
  const reasoning = JSON.parse(readFileSync(new URL('../../data/aggregates/build-reasoning.json', import.meta.url), 'utf8')).heroes as
    Record<string, Record<string, { optimizer?: { items?: Record<string, string> } | null }>>;

  it('every explained optimizer item is in that build, and every build item is explained', () => {
    const wrong: string[] = [];
    for (const [slug, roles] of Object.entries(reasoning)) {
      const art = JSON.parse(readFileSync(new URL(`../../data/artifacts/${slug}.json`, import.meta.url), 'utf8')) as
        { role: string; build: { items: { name: string }[] }; roles?: { role: string; build: { items: { name: string }[] } }[] };
      const views = new Map<string, { build: { items: { name: string }[] } }>((art.roles ?? []).map((v) => [v.role, v]));
      if (!views.has(art.role)) views.set(art.role, art);
      for (const [role, block] of Object.entries(roles)) {
        const named = Object.keys(block.optimizer?.items ?? {});
        const view = views.get(role);
        if (!view || !named.length) continue;
        const build = new Set(view.build.items.map((i) => i.name));
        for (const n of named) if (!build.has(n)) wrong.push(`${slug}/${role}: explains "${n}", not in the build`);
        for (const n of build) if (!named.includes(n)) wrong.push(`${slug}/${role}: build has "${n}" with no explanation`);
      }
    }
    expect(wrong).toEqual([]);
  });
});
