// Hero-page coach-line copy pass (priorities item 8, REMAINING scope). The
// "How this kit wants to play" line on every hero page is a deterministic
// template built from the objective corner + spike minutes
// (artifacts.ts `coachLine`): "Sim-optimal for heal/shield output: first spike
// lands around minute 15 (Oblivion Crown), third item by minute 27." That is a
// numbers-first sentence in engine vocabulary — exactly what the v6 review
// flagged (C1 raw sim integers on the default view, C2 statistician jargon).
//
// This pass rewrites it, per hero AND per lane, into an action-first line that
// says what to DO with the kit, plus one blunt "when it falls apart" caveat.
// The templated line stays in the artifact and the UI keeps rendering it as the
// timing footnote, so nothing is lost if a line is dropped.
//
// Same bracket as every other pass: the prompt is emitted by code (the pure
// builder in src/hero-coach-copy.ts), the in-session pred-scout-coach agent
// authors, and copy-verify drops any line citing a number absent from it.
//
//   COPY_MODE=prepare npm run review:herocoach   # emit grounded prompts
//   (pred-scout-coach agent fills engine/copy-tasks/herocoach.responses.json)
//   npm run review:herocoach                      # verify + write

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAllowed, verifyLine } from '../copy-verify.js';
import { ask, flushTasks, isPrepare, writeAggregate } from '../copy-session.js';
import { factsFor, isHeroArtifact, promptFor, type Artifact, type RawHero } from '../hero-coach-copy.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(ROOT, 'data/aggregates/hero-coach-lines.json');

const heroesRaw = JSON.parse(readFileSync(path.join(ROOT, 'data/omeda/heroes.json'), 'utf8')) as RawHero[] | { heroes: RawHero[] };
const heroBySlug = new Map((Array.isArray(heroesRaw) ? heroesRaw : heroesRaw.heroes).map((h) => [h.slug, h]));

async function main() {
  const out: Record<string, Record<string, { line: string | null; watchout: string | null }>> = {};
  let written = 0, rejected = 0;
  const artDir = path.join(ROOT, 'data/artifacts');
  const files = readdirSync(artDir).filter(isHeroArtifact);

  for (const f of files) {
    const art = JSON.parse(readFileSync(path.join(artDir, f), 'utf8')) as Artifact;
    const hero = heroBySlug.get(art.slug);
    if (!hero || !art.roles) continue;
    for (const rv of art.roles) {
      const id = `${art.slug}:${rv.role}`;
      const facts = factsFor(art, rv, hero);
      const raw = (await ask('herocoach', id, promptFor(art, rv, hero, facts))).trim().replace(/^```json?\s*|```$/g, '');
      if (isPrepare()) continue;
      try {
        const parsed = JSON.parse(raw) as { line?: string; watchout?: string };
        // Ground-check against the very block the author was handed.
        const allowed = buildAllowed([], [facts]);
        const keep = (s?: string): string | null => { if (!s) return null; if (verifyLine(s, allowed)) { written++; return s; } rejected++; return null; };
        const line = keep(parsed.line), watchout = keep(parsed.watchout);
        if (!line && !watchout) { process.stdout.write('x'); continue; }
        (out[art.slug] ??= {})[rv.role] = { line, watchout };
        process.stdout.write('.');
      } catch { process.stdout.write('x'); }
    }
  }

  flushTasks('herocoach');
  if (isPrepare()) return;
  if (!writeAggregate(OUT, {
    generatedAt: new Date().toISOString(),
    source: 'in-session Claude Code agent (pred-scout-coach) over each artifact role view (kit, build, stages, Eternal, lane augment, matchup verdicts, honesty notes) only; every number ground-checked, failing lines dropped',
    written, rejected, heroes: out,
  })) return;
  console.log(`\n${written} hero coach lines written, ${rejected} rejected -> data/aggregates/hero-coach-lines.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
