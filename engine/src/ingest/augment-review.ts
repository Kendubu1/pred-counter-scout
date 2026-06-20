// Copy pass over the hero augments AND Eternals: one grounded "when to take it"
// line per augment per role, and one per top field Eternal per role, written by
// the IN-SESSION agent (no Anthropic API key) from ONLY the catalog/registry
// mechanics + field evidence, then ground-checked — every number in a line must
// appear in the source data for that cell (winrates, game counts, description
// values, or the precomputed per-100 deltas). Lines that fail verification are
// dropped; the page falls back to mechanics-only.
//
//   COPY_MODE=prepare npm run review   # emit grounded prompts
//   (pred-scout-coach agent fills engine/copy-tasks/augments.responses.json)
//   npm run review                      # verify + write

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData } from '../data.js';
import { loadEffects } from '../effects.js';
import { buildAllowed, verifyLine, winrateNumbers } from '../copy-verify.js';
import { ask, flushTasks, isPrepare } from '../copy-session.js';
import { momPriorStrength } from '../evidence.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

interface AugCell { augments: { id: string; name: string; n: number; w: number }[]; eternals?: { name: string; n: number; w: number }[] }
interface AugFile { catalog: Record<string, { name: string; description: string }>; heroes: Record<string, Record<string, AugCell>> }

const ETERNAL_MIN_GAMES = 300; // matches the hero page's display filter

const augs = JSON.parse(readFileSync(path.join(ROOT, 'data/aggregates/predgg-augments.json'), 'utf8')) as AugFile;
const data = loadData();

/** Allowed numeric tokens for an augment cell (shared verifier core). */
function allowedNumbers(cell: AugCell, catalog: AugFile['catalog']): Set<string> {
  return buildAllowed(
    winrateNumbers(cell.augments),
    cell.augments.map((g) => catalog[g.id]?.description ?? ''),
  );
}

const verify = verifyLine;

/** Eternal mechanics live in the curated effect registry (sourceText). */
function eternalMechanics(name: string): string {
  const entry = loadEffects().targets[`eternal:${name.toLowerCase()}:major`];
  if (!entry) return 'mechanics not in the curated registry';
  const unmodeled = entry.effects.filter((fx) => fx.kind === 'unmodeled').map((fx) => (fx as { note: string }).note);
  return entry.sourceText + (unmodeled.length ? ` (not in our sim: ${unmodeled.join('; ')})` : '');
}

/** The same top-3 the hero page shows: n >= floor, by SHRUNK winrate
 *  (Eternal pick shares are asymmetric; raw ordering crowns lucky
 *  minority picks). */
function topEternals(cell: AugCell) {
  const all = cell.eternals ?? [];
  const totN = all.reduce((s, e) => s + e.n, 0);
  const mean = totN ? all.reduce((s, e) => s + e.w, 0) / totN : 0.5;
  const k = momPriorStrength(all, mean);
  return all
    .filter((e) => e.n >= ETERNAL_MIN_GAMES)
    .map((e) => ({ ...e, shrunk: (e.w + k * mean) / (e.n + k) }))
    .sort((x, y) => y.shrunk - x.shrunk)
    .slice(0, 3);
}

async function main() {
  const reviews: Record<string, Record<string, Record<string, string>>> = {};
  const eternalReviews: Record<string, Record<string, Record<string, string>>> = {};
  let written = 0, rejected = 0, etWritten = 0, etRejected = 0;
  for (const [slug, cells] of Object.entries(augs.heroes)) {
    const name = data.kits.get(slug)?.name ?? slug;
    const lines: string[] = [];
    for (const [role, cell] of Object.entries(cells)) {
      lines.push(`ROLE ${role}:`);
      for (const g of cell.augments) {
        const wr = (g.w / g.n * 100).toFixed(1);
        lines.push(`- id=${g.id} "${g.name}": ${wr}% winrate over ${g.n.toLocaleString('en-US')} games. Mechanics: ${(augs.catalog[g.id]?.description ?? '').replace(/<[^>]+>/g, '')}`);
      }
    }
    const prompt = `You write one-line augment guidance for the Predecessor (MOBA) hero ${name}. The data below is the ONLY source of truth.

${lines.join('\n')}

For each augment in each role, write ONE sentence (max 26 words) on when/why to take it in that role. START with the ACTION (take it / skip it / situational) and WHY in plain language tied to the role's job and the mechanics — that imperative is the point of the sentence. Do NOT lead with or build the sentence around a winrate number; a bare winrate is not advice. You may cite a winrate only as light support at the end if it genuinely changes the call, and you may only use numbers that appear in the data above. Never use the word "points" for winrate. If an augment clearly loses in a role, say what situation would still justify it or advise against it.

Return strict JSON only, shaped: {"<role>": {"<id>": "<sentence>", ...}, ...}`;
    try {
      const raw = (await ask('augments', slug, prompt)).trim().replace(/^```json?\s*|```$/g, '');
      const parsed = JSON.parse(raw) as Record<string, Record<string, string>>;
      for (const [role, cell] of Object.entries(cells)) {
        const allowed = allowedNumbers(cell, augs.catalog);
        for (const g of cell.augments) {
          const line = parsed[role]?.[g.id];
          if (!line) continue;
          if (verify(line, allowed)) {
            ((reviews[slug] ??= {})[role] ??= {})[g.id] = line;
            written++;
          } else rejected++;
        }
      }
      process.stdout.write('.');
    } catch (e) {
      process.stdout.write('x');
    }

    // Eternal pass (same hero, second task): when/why for the role's
    // field top-3, grounded in registry mechanics + field evidence only.
    const etPromptLines: string[] = [];
    for (const [role, cell] of Object.entries(cells)) {
      const ets = topEternals(cell);
      if (!ets.length) continue;
      etPromptLines.push(`ROLE ${role}:`);
      for (const e of ets) {
        etPromptLines.push(`- "${e.name}": ${(e.w / e.n * 100).toFixed(1)}% winrate over ${e.n.toLocaleString('en-US')} games. Mechanics: ${eternalMechanics(e.name)}`);
      }
    }
    if (etPromptLines.length) {
      const etPrompt = `You write one-line Eternal guidance for the Predecessor (MOBA) hero ${name}. Eternals are pre-game blessings. The data below is the ONLY source of truth.

${etPromptLines.join('\n')}

For each Eternal in each role, write ONE sentence (max 26 words) on when/why to take it on this hero in that role: tie the mechanics to the role's job, and let the evidence settle disagreements. Plain language; never use the word "points" for winrate; you may only use numbers that appear in the data above. Where mechanics say "not in our sim", do not invent mechanical claims beyond the stated text.

Return strict JSON only, shaped: {"<role>": {"<eternal name>": "<sentence>", ...}, ...}`;
      try {
        const raw = (await ask('augments', `${slug}:eternals`, etPrompt)).trim().replace(/^```json?\s*|```$/g, '');
        const parsed = JSON.parse(raw) as Record<string, Record<string, string>>;
        for (const [role, cell] of Object.entries(cells)) {
          const ets = topEternals(cell);
          if (!ets.length) continue;
          const allowed = buildAllowed(winrateNumbers(ets), ets.map((e) => eternalMechanics(e.name)));
          for (const e of ets) {
            const line = parsed[role]?.[e.name];
            if (!line) continue;
            if (verify(line, allowed)) {
              ((eternalReviews[slug] ??= {})[role] ??= {})[e.name] = line;
              etWritten++;
            } else etRejected++;
          }
        }
        process.stdout.write(':');
      } catch (e) {
        process.stdout.write('x');
      }
    }
  }
  flushTasks('augments');
  if (isPrepare()) return;
  const out = {
    generatedAt: new Date().toISOString(),
    source: 'in-session Claude Code agent (pred-scout-coach) over data/aggregates/predgg-augments.json (+ effect-registry Eternal mechanics) only; every number ground-checked against the source cell, failing lines dropped',
    written, rejected,
    eternalsWritten: etWritten, eternalsRejected: etRejected,
    heroes: reviews,
    eternals: eternalReviews,
  };
  writeFileSync(path.join(ROOT, 'data/aggregates/augment-reviews.json'), JSON.stringify(out, null, 1));
  console.log(`\n${written} augment lines (+${etWritten} Eternal lines) written, ${rejected + etRejected} rejected by the verifier -> data/aggregates/augment-reviews.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
