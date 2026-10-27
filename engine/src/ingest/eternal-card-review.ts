// Eternal card copy pass: one short line per hero/role/top Eternal saying what
// the Eternal does for THIS kit and how it changes the way you play, replacing
// the raw major description on the hero page (the full text stays in the
// Eternal popup). Every line must name one of the hero's abilities or the lane
// augment (maintainer 2026-10-27: say how it works with THIS kit), and covers
// every Eternal the page can show, All ranks and Plat+. Split out of augment-review.ts so it can be re-authored and
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
//
// Without fresh responses (the daily refresh: copy-tasks/ is scratch), each lane
// CARRIES its committed line for every Eternal the page still shows, re-verified
// against today's facts, and lines for Eternals that left the lane's top list
// are pruned. So the daily data drift that drops an Eternal from a lane no
// longer leaves a stale card line behind (Steel offlane / Vermis, 2026-10-26).

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAllowed, verifyLine } from '../copy-verify.js';
import { ask, flushTasks, isPrepare, writeAggregate } from '../copy-session.js';
import { factsFor, kitTerms, loadEternalInputs, namesKit, promptFor, topEternals } from '../eternal-copy.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(ROOT, 'data/aggregates/eternal-cards.json');
const FIXES = path.join(ROOT, 'data/aggregates/eternal-card-fixes.json');

async function main() {
  const { augs, heroBySlug, eternals } = loadEternalInputs();
  const fixes = existsSync(FIXES) ? (JSON.parse(readFileSync(FIXES, 'utf8')) as { lanes: Record<string, Record<string, string>> }).lanes ?? {} : {};
  const prev = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, 'utf8')) as { heroes?: Record<string, Record<string, Record<string, string>>> }).heroes ?? {} : {};
  const out: Record<string, Record<string, Record<string, string>>> = {};
  let written = 0, rejected = 0, judged = 0, carried = 0, pruned = 0, kitless = 0;

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
        const terms = kitTerms(hero, [...cell.augments].sort((a, b) => b.n - a.n)[0]?.name);
        // Grounded numbers AND a named ability or the lane augment.
        const ok = (l: string) => {
          if (!verifyLine(l, allowed)) return false;
          if (namesKit(l, terms)) return true;
          kitless++; return false;
        };
        const laneFix = fixes[id] ?? {};
        const shown = new Set(ets.map((e) => e.name));
        for (const et of Object.keys(prev[slug]?.[role] ?? {})) if (!shown.has(et)) pruned++;
        for (const e of ets) {
          let line: string | undefined = parsed[e.name];
          if (!line) {
            // No fresh line: carry the committed one (already judged) if it
            // still checks out against today's numbers.
            const kept = prev[slug]?.[role]?.[e.name];
            if (!kept) continue;
            if (!ok(kept)) { rejected++; continue; }
            ((out[slug] ??= {})[role] ??= {})[e.name] = kept;
            written++; carried++;
            continue;
          }
          if (!ok(line)) { rejected++; continue; }
          written++;
          // A judged fix replaces the authored line ('' = the judge dropped it).
          // Follow the chain: a later round's fix is keyed to the earlier fix.
          for (let hop = 0; line && hop < 10 && laneFix[line] !== undefined; hop++) {
            const fixed: string = laneFix[line]!;
            if (!ok(fixed)) { rejected++; break; }
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
    written, rejected, kitless, carried, pruned, heroes: out,
  })) return;
  console.log(`\n${written} Eternal lines written (${carried} carried from the committed file), ${rejected} rejected (${kitless} named no ability or augment), ${pruned} pruned (Eternal no longer shown), ${judged} judged fixes re-applied -> data/aggregates/eternal-cards.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
