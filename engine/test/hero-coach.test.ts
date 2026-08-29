// Hero-page coach lines (priorities item 8, REMAINING scope) — the shipped
// aggregate is re-verified here from scratch: the test rebuilds each role
// view's facts block with the SAME pure builder the pass used and re-runs
// copy-verify over every line. A hand-edited or stale line that cites a number
// its lane's data doesn't contain fails the harness, not just the ingest run.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAllowed, verifyLine } from '../src/copy-verify.js';
import { factsFor, isHeroArtifact, type Artifact, type RawHero } from '../src/hero-coach-copy.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LINES = path.join(ROOT, 'data/aggregates/hero-coach-lines.json');

interface Lines { written: number; rejected: number; heroes: Record<string, Record<string, { line: string | null; watchout: string | null }>> }

const load = (): Lines | null => (existsSync(LINES) ? (JSON.parse(readFileSync(LINES, 'utf8')) as Lines) : null);

const heroesRaw = JSON.parse(readFileSync(path.join(ROOT, 'data/omeda/heroes.json'), 'utf8')) as RawHero[] | { heroes: RawHero[] };
const heroBySlug = new Map((Array.isArray(heroesRaw) ? heroesRaw : heroesRaw.heroes).map((h) => [h.slug, h]));

const artifacts = (): Artifact[] => readdirSync(path.join(ROOT, 'data/artifacts')).filter(isHeroArtifact)
  .map((f) => JSON.parse(readFileSync(path.join(ROOT, 'data/artifacts', f), 'utf8')) as Artifact)
  .filter((a) => a.slug && Array.isArray(a.roles) && a.roles.length);

describe('hero-page coach lines (copy pass, item 8)', () => {
  it('every shipped line only cites numbers from its own lane’s facts', () => {
    const data = load();
    if (!data) return; // pass not run in this checkout; other tests cover the verifier
    let checked = 0;
    for (const art of artifacts()) {
      const hero = heroBySlug.get(art.slug);
      const cells = data.heroes[art.slug];
      if (!hero || !cells) continue;
      for (const rv of art.roles) {
        const cell = cells[rv.role];
        if (!cell) continue;
        const allowed = buildAllowed([], [factsFor(art, rv, hero)]);
        for (const line of [cell.line, cell.watchout]) {
          if (!line) continue;
          checked++;
          expect(verifyLine(line, allowed), `${art.slug}/${rv.role}: ungrounded number in "${line}"`).toBe(true);
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  // The numeric check above cannot see this: when a catalog refresh changes what
  // the optimizer picks, a line keeps naming the OLD items and every number in it
  // still grounds, so the page coaches a build nobody is buying. The 1.16 refresh
  // left 16 of 83 lanes in exactly that state (the same failure the build-reasoning
  // currency test in copy.test.ts was added for, on a different surface).
  it('never coaches an item the lane no longer builds', () => {
    const data = load();
    if (!data) return;
    const arts = artifacts();
    // Item vocabulary = every item name across every shipped build; a line may
    // only name one that is in ITS lane's build.
    const vocab = new Set<string>();
    for (const a of arts) for (const rv of a.roles) for (const it of rv.build.items) vocab.add(it.name);
    const wrong: string[] = [];
    for (const a of arts) {
      const cells = data.heroes[a.slug];
      if (!cells) continue;
      for (const rv of a.roles) {
        const cell = cells[rv.role];
        if (!cell) continue;
        const build = new Set(rv.build.items.map((i) => i.name));
        const text = [cell.line, cell.watchout].filter(Boolean).join(' ');
        for (const name of vocab) {
          // Short names risk matching ordinary words; the real drift cases are
          // full item names, which are all longer than four characters.
          if (name.length > 4 && text.includes(name) && !build.has(name)) {
            wrong.push(`${a.slug}/${rv.role}: coaches "${name}", which is not in this lane's build`);
          }
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  // The third drift class, and the one with no numbers in it at all: a line
  // names an opponent as a threat ("X beats you early"), then a refresh flips
  // that checkpoint verdict and the warning is simply false. Neither the number
  // check nor the item check can see it. The 1.16 refresh flipped three.
  it('never warns about an opponent this lane now beats', () => {
    const data = load();
    if (!data) return;
    const wrong: string[] = [];
    for (const art of artifacts()) {
      const cells = data.heroes[art.slug];
      if (!cells) continue;
      for (const rv of art.roles) {
        const cell = cells[rv.role];
        if (!cell) continue;
        const text = [cell.line, cell.watchout].filter(Boolean).join(' ');
        for (const m of rv.matchups) {
          if (!text.includes(m.enemy)) continue;
          const v = m.checkpoints.map((c) => c.verdict);
          const you = v.filter((x) => x === 'you').length;
          const enemy = v.filter((x) => x === 'enemy').length;
          // Naming an opponent the sim says this lane beats reads as a warning
          // about someone who is not a threat; re-author rather than reword.
          if (you > enemy) wrong.push(`${art.slug}/${rv.role}: names ${m.enemy}, whose checkpoints now favour this lane`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('covers the lanes the hero pages render, and keeps engine vocabulary out of the copy', () => {
    const data = load();
    if (!data) return;
    const roleViews = artifacts().flatMap((a) => a.roles.map((r) => `${a.slug}:${r.role}`));
    const covered = Object.entries(data.heroes).flatMap(([slug, roles]) => Object.keys(roles).map((r) => `${slug}:${r}`));
    // Coverage is a ratchet: a re-run that silently loses lanes fails here.
    expect(covered.length / roleViews.length).toBeGreaterThanOrEqual(0.9);
    // Every covered lane must be a real role view (no orphaned/renamed lanes).
    for (const key of covered) expect(roleViews, `${key} is not a rendered role view`).toContain(key);

    // The whole point of the pass is that the page stops speaking engine.
    const banned = /\b(eHP|rot10|rot20|autoDps|VsSquishy|VsBruiser|shrunk|out-simmed|kill window|objective corner|headlineValue)\b/i;
    for (const [slug, roles] of Object.entries(data.heroes)) {
      for (const [role, cell] of Object.entries(roles)) {
        for (const line of [cell.line, cell.watchout]) {
          if (line) expect(banned.test(line), `${slug}/${role}: engine jargon in "${line}"`).toBe(false);
        }
      }
    }
  });
});
