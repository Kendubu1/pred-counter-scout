// Copy pass over the hero augments: one grounded "when to take it" line per
// augment per role (Eternal lines moved to eternal-review.ts), written by
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
import { buildAllowed, verifyLine, winrateNumbers } from '../copy-verify.js';
import { ask, flushTasks, isPrepare, writeAggregate } from '../copy-session.js';
import { bestAugment } from '../field-pick.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

interface AugCell { augments: { id: string; name: string; n: number; w: number }[] }
interface AugFile { catalog: Record<string, { name: string; description: string }>; heroes: Record<string, Record<string, AugCell>> }

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

// Only the lane's field pick (field-pick.ts rankByEdge: the page's lead) may be
// called the default. A line that
// crowns any other augment contradicts the page right beside it.
const CROWNS = /\b(default|best|go-to|always take|first choice|core pick|standard pick|main pick)\b/i;

async function main() {
  const reviews: Record<string, Record<string, Record<string, string>>> = {};
  let written = 0, rejected = 0;
  for (const [slug, cells] of Object.entries(augs.heroes)) {
    const name = data.kits.get(slug)?.name ?? slug;
    const lines: string[] = [];
    for (const [role, cell] of Object.entries(cells)) {
      const pick = bestAugment(cell);
      const how = !pick ? '' : pick.confidence === 'clear' ? ' (clear edge over the others)'
        : pick.confidence === 'slight' ? ' (slight edge; could flip)'
        : pick.confidence === 'toss-up' ? ' (TOSS-UP: the others win about as often; this one has the most games)' : ' (too few games to compare)';
      lines.push(`ROLE ${role}:${pick ? ` FIELD PICK = id=${pick.id} "${pick.name}"${how}` : ''}`);
      for (const g of cell.augments) {
        const wr = (g.w / g.n * 100).toFixed(1);
        lines.push(`- id=${g.id} "${g.name}"${pick && pick.id === g.id ? ' [FIELD PICK]' : ''}: ${wr}% winrate over ${g.n.toLocaleString('en-US')} games. Mechanics: ${(augs.catalog[g.id]?.description ?? '').replace(/<[^>]+>/g, '')}`);
      }
    }
    const prompt = `You write one-line augment guidance for the Predecessor (MOBA) hero ${name}. The data below is the ONLY source of truth.

${lines.join('\n')}

For each augment in each role, write ONE sentence (max 26 words) on when/why to take it in that role. START with the ACTION (take it / skip it / situational) and WHY in plain language tied to the role's job and the mechanics — that imperative is the point of the sentence. Do NOT lead with or build the sentence around a winrate number; a bare winrate is not advice. You may cite a winrate only as light support at the end if it genuinely changes the call, and you may only use numbers that appear in the data above. Never use the word "points" for winrate. If an augment clearly loses in a role, say what situation would still justify it or advise against it.
Each role names its FIELD PICK: the augment the site recommends there (highest winrate with enough games). Only the field pick may be called the default, best or go-to. Every other augment is an alternative: say when it is worth taking over the field pick (a matchup, team need or playstyle) or advise skipping it. Never use the words "default", "best", "go-to", "first choice", "core pick", "standard pick" or "main pick" for a non-pick augment. When the field pick is marked TOSS-UP, the alternatives are about as strong: present them as equal options for a specific situation, never as weaker picks.

Return strict JSON only, shaped: {"<role>": {"<id>": "<sentence>", ...}, ...}`;
    try {
      const raw = (await ask('augments', slug, prompt)).trim().replace(/^```json?\s*|```$/g, '');
      const parsed = JSON.parse(raw) as Record<string, Record<string, string>>;
      for (const [role, cell] of Object.entries(cells)) {
        const allowed = allowedNumbers(cell, augs.catalog);
        const pick = bestAugment(cell);
        for (const g of cell.augments) {
          const line = parsed[role]?.[g.id];
          if (!line) continue;
          if (verify(line, allowed) && !(pick && pick.id !== g.id && CROWNS.test(line))) {
            ((reviews[slug] ??= {})[role] ??= {})[g.id] = line;
            written++;
          } else rejected++;
        }
      }
      process.stdout.write('.');
    } catch (e) {
      process.stdout.write('x');
    }

  }
  flushTasks('augments');
  if (isPrepare()) return;
  const out = {
    generatedAt: new Date().toISOString(),
    source: 'in-session Claude Code agent (pred-scout-coach) over data/aggregates/predgg-augments.json only; every number ground-checked against the source cell, failing lines dropped; only the lane field pick (field-pick.ts) may be called the default',
    written, rejected,
    heroes: reviews,
  };
  if (!writeAggregate(path.join(ROOT, 'data/aggregates/augment-reviews.json'), out)) return;
  console.log(`\n${written} augment lines written, ${rejected} rejected by the verifier -> data/aggregates/augment-reviews.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
