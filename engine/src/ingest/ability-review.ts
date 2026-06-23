// Copy pass: one plain-language "how to play this ability" tip per hero
// ability, written by the IN-SESSION agent (no Anthropic API key) from ONLY the
// ability's own text + cooldown/cost, ground-checked by the shared numeric
// verifier. Rendered on the Learn the hero tab.
//
//   COPY_MODE=prepare npm run review:abilities   # emit grounded prompts
//   (pred-scout-coach agent fills engine/copy-tasks/abilities.responses.json)
//   npm run review:abilities                      # verify + write

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAllowed, verifyLine } from '../copy-verify.js';
import { ask, flushTasks, isPrepare } from '../copy-session.js';
import { loadData } from '../data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

interface RawAbility { key: string; display_name: string; cooldown?: number[]; cost?: number[]; menu_description?: string; game_description?: string }
interface RawHero { slug: string; name: string; display_name?: string; abilities?: RawAbility[] }

const raw = JSON.parse(readFileSync(path.join(ROOT, 'data/omeda/heroes.json'), 'utf8')) as RawHero[] | { heroes: RawHero[] };
const heroes = Array.isArray(raw) ? raw : raw.heroes;
const data = loadData();
const KEY_LABEL: Record<string, string> = { LMB: 'left-click', RMB: 'right-click', Q: 'Q', E: 'E', R: 'ultimate (R)' };
const clean = (t?: string) => (t || '').replace(/<br\s*\/?>(\n)?/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

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
      const text = (await ask('abilities', hero.slug, prompt)).trim().replace(/^```json?\s*|```$/g, '');
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
  }
  flushTasks('abilities');
  if (isPrepare()) return;
  writeFileSync(path.join(ROOT, 'data/aggregates/ability-tips.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: 'in-session Claude Code agent (pred-scout-coach) over data/omeda/heroes.json ability text only; every number ground-checked against the ability, failing lines dropped',
    written, rejected, heroes: out,
  }, null, 1));
  console.log(`\n${written} tips written, ${rejected} rejected -> data/aggregates/ability-tips.json`);
}
main().catch((e) => { console.error(e); process.exit(1); });
