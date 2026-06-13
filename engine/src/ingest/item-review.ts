// AI copy pass over completed items + crests (priorities item 8 family):
// one plain-language "why you'd lean into this" line per item, written by
// claude-haiku-4-5 from ONLY the item's own stats and effect text, then
// ground-checked — any line citing a number absent from the item's data
// is dropped. Rendered in the build lab's item quick-view popup.
//
//   ANTHROPIC_API_KEY=... npm run review:items

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAllowed, verifyLine } from '../copy-verify.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error('needs ANTHROPIC_API_KEY in env'); process.exit(1); }

interface RawItem {
  slug: string; display_name: string; total_price: number; slot_type: string; rarity?: string;
  stats: Record<string, number>;
  effects?: { name?: string; cooldown?: string | null; menu_description?: string; game_description?: string }[];
}

const raw = JSON.parse(readFileSync(path.join(ROOT, 'data/omeda/items.json'), 'utf8')) as RawItem[];
const items = (Array.isArray(raw) ? raw : (raw as { items: RawItem[] }).items)
  .filter((i) => i.slot_type === 'Crest' || (i.total_price ?? 0) >= 1800); // completed items + crests

const clean = (t?: string) => (t || '').replace(/<br\s*\/?>(\n)?/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function ask(prompt: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2000 * attempt));
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 1600, messages: [{ role: 'user', content: prompt }] }),
    });
    if (res.status === 429 || res.status >= 500) continue;
    if (!res.ok) throw new Error(`anthropic: HTTP ${res.status} ${await res.text()}`);
    return ((await res.json()) as { content: { text: string }[] }).content[0]!.text;
  }
  throw new Error('anthropic: retries exhausted');
}

function itemBlock(i: RawItem): string {
  const stats = Object.entries(i.stats || {}).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(', ');
  const fx = (i.effects || []).map((e) => `${e.name ?? 'effect'}${e.cooldown ? ` (cooldown ${e.cooldown})` : ''}: ${clean(e.menu_description || e.game_description)}`).join(' | ');
  return `- slug=${i.slug} "${i.display_name}" (${i.total_price} gold): stats: ${stats || 'none'}. effects: ${fx || 'none'}`;
}

async function main() {
  const out: Record<string, string> = {};
  let written = 0, rejected = 0;
  for (let b = 0; b < items.length; b += 10) {
    const batch = items.slice(b, b + 10);
    const prompt = `You write one-line item guidance for Predecessor (a MOBA). The data below is the ONLY source of truth.

${batch.map(itemBlock).join('\n')}

For each item, write ONE sentence (max 24 words) in plain language: who leans into it and why, tying its stats and effects to a job in a real game (e.g. "for fights that go long", "when the enemy stacks armor"). Never invent numbers — only use numbers from the item's own line. No jargon: say "tankiness" not "eHP", spell things out.

Return strict JSON only: {"<slug>": "<sentence>", ...}`;
    try {
      const text = (await ask(prompt)).trim().replace(/^```json?\s*|```$/g, '');
      const parsed = JSON.parse(text) as Record<string, string>;
      for (const i of batch) {
        const line = parsed[i.slug];
        if (!line) continue;
        const allowed = buildAllowed([i.total_price], [
          Object.entries(i.stats || {}).filter(([, v]) => v).map(([, v]) => String(v)).join(' '),
          ...(i.effects || []).map((e) => clean(e.menu_description || e.game_description)),
          (i.effects || []).map((e) => e.cooldown ?? '').join(' '),
        ]);
        if (verifyLine(line, allowed)) { out[i.slug] = line; written++; } else rejected++;
      }
      process.stdout.write('.');
    } catch { process.stdout.write('x'); }
    await new Promise((r) => setTimeout(r, 250));
  }
  writeFileSync(path.join(ROOT, 'data/aggregates/item-reviews.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: 'claude-haiku-4-5 over data/omeda/items.json only; every number ground-checked against the item, failing lines dropped',
    written, rejected,
    items: out,
  }, null, 1));
  console.log(`\n${written} lines written, ${rejected} rejected -> data/aggregates/item-reviews.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
