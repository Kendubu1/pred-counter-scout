// AI copy pass: one plain-language "how to play this ability" tip per
// hero ability (priorities item 8 family), written by claude-haiku-4-5
// from ONLY the ability's own text + cooldown/cost, ground-checked by the
// shared numeric verifier. Rendered on the Learn the hero tab.
//
//   ANTHROPIC_API_KEY=... npm run review:abilities

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAllowed, verifyLine } from '../copy-verify.js';
import { loadData } from '../data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error('needs ANTHROPIC_API_KEY in env'); process.exit(1); }

interface RawAbility { key: string; display_name: string; cooldown?: number[]; cost?: number[]; menu_description?: string; game_description?: string }
interface RawHero { slug: string; name: string; display_name?: string; abilities?: RawAbility[] }

const raw = JSON.parse(readFileSync(path.join(ROOT, 'data/omeda/heroes.json'), 'utf8')) as RawHero[] | { heroes: RawHero[] };
const heroes = Array.isArray(raw) ? raw : raw.heroes;
const data = loadData();
const KEY_LABEL: Record<string, string> = { LMB: 'left-click', RMB: 'right-click', Q: 'Q', E: 'E', R: 'ultimate (R)' };
const clean = (t?: string) => (t || '').replace(/<br\s*\/?>(\n)?/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

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
    return ((await res.json()) as { content: { text: string }[] }).content[0]!.text;
  }
  throw new Error('anthropic: retries exhausted');
}

async function main() {
  let out: Record<string, Record<string, string>> = {};
  try { out = JSON.parse(readFileSync(path.join(ROOT, 'data/aggregates/ability-tips.json'), 'utf8')).heroes ?? {}; } catch { /* fresh */ }
  let written = 0, rejected = 0;
  const only = process.argv.slice(2).filter((x) => !x.startsWith('--'));
  for (const hero of heroes) {
    if (!data.kits.has(hero.slug)) continue;
    if (only.length && !only.includes(hero.slug)) continue;
    const abilities = (hero.abilities || []).filter((a) => a.menu_description || a.game_description);
    if (!abilities.length) continue;
    const lines = abilities.map((a) => `- key=${a.key} "${a.display_name}"${a.cooldown?.length ? ` (cooldown ${a.cooldown.join('/')})` : ''}: ${clean(a.menu_description || a.game_description)}`);
    const prompt = `You write one-line "how to play it" tips for the abilities of ${hero.display_name ?? hero.name}, a hero in Predecessor (a MOBA). The data below is the ONLY source of truth.

${lines.join('\n')}

For each ability, write ONE practical tip (max 22 words): how to use it well in a real game — combos, timing, what to aim for, when to hold it. Plain language, no jargon. Only use numbers that appear in that ability's line.

Return strict JSON only: {"<key>": "<tip>", ...}`;
    try {
      const text = (await ask(prompt)).trim().replace(/^```json?\s*|```$/g, '');
      const parsed = JSON.parse(text) as Record<string, string>;
      // the model sometimes returns keys as 'R' and sometimes 'R "Feast"';
      // normalize to the leading token so lookup by ability key is robust
      const byKey: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) { const lead = k.split(/[\s"]/)[0]; if (lead) byKey[lead] = v; }
      for (const a of abilities) {
        const tip = parsed[a.key] ?? byKey[a.key];
        if (!tip) continue;
        const allowed = buildAllowed([...(a.cooldown ?? []), ...(a.cost ?? [])], [clean(a.menu_description || a.game_description)]);
        if (verifyLine(tip, allowed)) { (out[hero.slug] ??= {})[a.key] = tip; written++; } else rejected++;
      }
      process.stdout.write('.');
    } catch { process.stdout.write('x'); }
    await new Promise((r) => setTimeout(r, 200));
  }
  writeFileSync(path.join(ROOT, 'data/aggregates/ability-tips.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: 'claude-haiku-4-5 over data/omeda/heroes.json ability text only; every number ground-checked against the ability, failing lines dropped',
    written, rejected, heroes: out,
  }, null, 1));
  console.log(`\n${written} tips written, ${rejected} rejected -> data/aggregates/ability-tips.json`);
}
main().catch((e) => { console.error(e); process.exit(1); });
