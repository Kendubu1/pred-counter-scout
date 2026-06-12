// AI copy pass over the hero augments (priorities item 8, scoped to the
// maintainer's ask): one grounded "when to take it" line per augment per
// role, written by claude-haiku-4-5 from ONLY the catalog mechanics +
// field evidence, then ground-checked — every number in a line must
// appear in the source data for that cell (winrates, game counts,
// description values, or the precomputed per-100 deltas). Lines that
// fail verification are dropped; the page falls back to mechanics-only.
//
//   ANTHROPIC_API_KEY=... npm run review

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData } from '../data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error('needs ANTHROPIC_API_KEY in env'); process.exit(1); }

interface AugCell { augments: { id: string; name: string; n: number; w: number }[] }
interface AugFile { catalog: Record<string, { name: string; description: string }>; heroes: Record<string, Record<string, AugCell>> }

const augs = JSON.parse(readFileSync(path.join(ROOT, 'data/aggregates/predgg-augments.json'), 'utf8')) as AugFile;
const data = loadData();

async function ask(prompt: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2000 * attempt));
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 1200, messages: [{ role: 'user', content: prompt }] }),
    });
    if (res.status === 429 || res.status >= 500) continue;
    if (!res.ok) throw new Error(`anthropic: HTTP ${res.status} ${await res.text()}`);
    const body = await res.json() as { content: { text: string }[] };
    return body.content[0]!.text;
  }
  throw new Error('anthropic: retries exhausted');
}

/** Allowed numeric tokens for a cell: data numbers in every common rendering. */
function allowedNumbers(cell: AugCell, catalog: AugFile['catalog']): Set<string> {
  const out = new Set<string>();
  const add = (x: number) => {
    out.add(String(x));
    out.add(x.toFixed(1));
    out.add(String(Math.round(x)));
    out.add(x.toLocaleString('en-US'));
  };
  const wrs = cell.augments.map((g) => g.w / g.n * 100);
  for (const [i, g] of cell.augments.entries()) {
    add(g.n); add(wrs[i]!);
    for (const m of (catalog[g.id]?.description ?? '').matchAll(/\d+(?:\.\d+)?/g)) add(parseFloat(m[0]));
  }
  for (const a of wrs) for (const b of wrs) if (a !== b) add(Math.abs(a - b));
  add(100); add(5); // "per 100 games", "5v5"
  return out;
}

function verify(line: string, allowed: Set<string>): boolean {
  for (const m of line.matchAll(/\d+(?:,\d{3})*(?:\.\d+)?/g)) {
    const tok = m[0].replace(/,/g, '');
    if (!allowed.has(tok) && !allowed.has(parseFloat(tok).toFixed(1)) && !allowed.has(String(parseFloat(tok)))) return false;
  }
  return true;
}

async function main() {
  const reviews: Record<string, Record<string, Record<string, string>>> = {};
  let written = 0, rejected = 0;
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

For each augment in each role, write ONE sentence (max 26 words) on when/why to take it in that role: tie the mechanics to the role's job, and let the evidence settle disagreements. Plain language; never use the word "points" for winrate; you may only use numbers that appear in the data above. If an augment clearly loses in a role, say what situation would still justify it or advise against it.

Return strict JSON only, shaped: {"<role>": {"<id>": "<sentence>", ...}, ...}`;
    try {
      const raw = (await ask(prompt)).trim().replace(/^```json?\s*|```$/g, '');
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
    await new Promise((r) => setTimeout(r, 200));
  }
  const out = {
    generatedAt: new Date().toISOString(),
    source: 'claude-haiku-4-5 over data/aggregates/predgg-augments.json only; every number ground-checked against the source cell, failing lines dropped',
    written, rejected,
    heroes: reviews,
  };
  writeFileSync(path.join(ROOT, 'data/aggregates/augment-reviews.json'), JSON.stringify(out, null, 1));
  console.log(`\n${written} lines written, ${rejected} rejected by the verifier -> data/aggregates/augment-reviews.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
