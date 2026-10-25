// Eternal card copy pass: one short line per hero/role/top Eternal saying what
// the Eternal does for THIS kit and how it changes the way you play, replacing
// the raw major description on the hero page (the full text stays in the
// Eternal popup). Split out of augment-review.ts so it can be re-authored and
// judged on its own without re-running the augment lines.
//
// Same bracket as every other pass: the prompt is emitted by code (the pure
// builder in src/eternal-copy.ts), the in-session pred-scout-coach agent
// authors, copy-verify drops any line citing a number absent from the facts,
// and the independent critic's applied fixes (eternal-card-fixes.json) are
// re-applied and re-verified on every ingest.
//
//   COPY_MODE=prepare npm run review:eternalcards   # emit grounded prompts
//   (pred-scout-coach agent fills engine/copy-tasks/eternalcards.responses.json)
//   npm run review:eternalcards                      # verify + write

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAllowed, verifyLine } from '../copy-verify.js';
import { ask, flushTasks, isPrepare, writeAggregate } from '../copy-session.js';
import { factsFor, loadEternalInputs, promptFor, topEternals } from '../eternal-copy.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(ROOT, 'data/aggregates/eternal-cards.json');
const FIXES = path.join(ROOT, 'data/aggregates/eternal-card-fixes.json');

async function main() {
  const { augs, heroBySlug, eternals } = loadEternalInputs();
  const fixes = existsSync(FIXES) ? (JSON.parse(readFileSync(FIXES, 'utf8')) as { lanes: Record<string, Record<string, string>> }).lanes ?? {} : {};
  const out: Record<string, Record<string, Record<string, string>>> = {};
  let written = 0, rejected = 0, judged = 0;

  for (const [slug, cells] of Object.entries(augs.heroes)) {
    const hero = heroBySlug.get(slug);
    if (!hero) continue;
    const name = hero.display_name ?? hero.name ?? slug;
    for (const [role, cell] of Object.entries(cells)) {
      const ets = topEternals(cell);
      if (!ets.length) continue;
      const id = `${slug}:${role}`;
      const facts = factsFor(name, role, cell, hero, augs.catalog, eternals);
      const raw = (await ask('eternalcards', id, promptFor(name, role, facts))).trim().replace(/^```json?\s*|```$/g, '');
      if (isPrepare()) continue;
      try {
        const parsed = JSON.parse(raw) as Record<string, string>;
        const allowed = buildAllowed([], [facts]);
        const laneFix = fixes[id] ?? {};
        for (const e of ets) {
          let line: string | undefined = parsed[e.name];
          if (!line) continue;
          if (!verifyLine(line, allowed)) { rejected++; continue; }
          written++;
          // A judged fix replaces the authored line ('' = the judge dropped it).
          // Follow the chain: a later round's fix is keyed to the earlier fix.
          for (let hop = 0; line && hop < 10 && laneFix[line] !== undefined; hop++) {
            const fixed: string = laneFix[line]!;
            if (!verifyLine(fixed, allowed)) { rejected++; break; }
            line = fixed; judged++;
          }
          if (line) ((out[slug] ??= {})[role] ??= {})[e.name] = line;
        }
        process.stdout.write('.');
      } catch { process.stdout.write('x'); }
    }
  }

  flushTasks('eternalcards');
  if (isPrepare()) return;
  if (!writeAggregate(OUT, {
    generatedAt: new Date().toISOString(),
    source: 'in-session Claude Code agent (pred-scout-coach) over each hero/role facts block (kit, lane augment, data/game-data/eternals.json majors + field minors) only; every number ground-checked, failing lines dropped; independent-critic fixes re-applied from eternal-card-fixes.json',
    written, rejected, heroes: out,
  })) return;
  console.log(`\n${written} Eternal lines written, ${rejected} rejected, ${judged} judged fixes re-applied -> data/aggregates/eternal-cards.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
