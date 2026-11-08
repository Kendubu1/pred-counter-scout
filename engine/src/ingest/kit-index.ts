// npm run kit:index — zero-API. Builds data/game-data/kit-index.json from the
// current catalog (data/catalog/heroes.json) with src/kit-index.ts, then
// applies the agent-reviewed corrections in data/game-data/kit-index-review.json
// (the multi-agent kit scan: each hero's CC / mobility / protection checked
// against the same catalog text; a correction names the ability key and the
// fields it sets). Rerun after `npm run catalog`; a hero whose catalog text
// changed since its review is listed as needing a re-scan.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { heroKit, type AbilityKit, type HeroKit } from '../kit-index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(ROOT, 'data/game-data/kit-index.json');
const REVIEW = path.join(ROOT, 'data/game-data/kit-index-review.json');

type Correction = Partial<Pick<AbilityKit, 'hard' | 'soft' | 'mobility' | 'unstoppable' | 'stealth' | 'heal' | 'shield' | 'cleanse' | 'hardSec'>>;
interface Review { heroes: Record<string, { textHash: string; reviewedAt: string; abilities?: Record<string, Correction>; note?: string }> }

export const textHash = (h: { abilities: { game_description?: string | null; menu_description?: string | null }[] }) =>
  createHash('sha1').update(h.abilities.map((a) => `${a.game_description ?? ''}|${a.menu_description ?? ''}`).join('\n')).digest('hex').slice(0, 12);

function main() {
  const heroes = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/heroes.json'), 'utf8')) as any[];
  const meta = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/META.json'), 'utf8'));
  const review: Review = existsSync(REVIEW) ? JSON.parse(readFileSync(REVIEW, 'utf8')) : { heroes: {} };
  const out: Record<string, HeroKit & { textHash: string; reviewed: boolean }> = {};
  const stale: string[] = [], unreviewed: string[] = [];
  for (const h of heroes) {
    const hash = textHash(h);
    const r = review.heroes[h.slug];
    let kit = heroKit(h);
    if (r && r.textHash === hash) {
      const abilities = kit.abilities.map((a) => ({ ...a, ...(r.abilities?.[a.key] ?? {}) }));
      kit = heroKit({ display_name: h.display_name, abilities: [] });
      const hardTypes = [...new Set(abilities.flatMap((a) => a.hard))];
      kit = {
        ...kit, abilities, hardTypes,
        hardCount: abilities.filter((a) => a.hard.length).length,
        mobilityCount: abilities.filter((a) => a.mobility.length).length,
        unstoppable: abilities.some((a) => a.unstoppable), stealth: abilities.some((a) => a.stealth),
        sustain: abilities.some((a) => a.heal || a.shield), cleanse: abilities.some((a) => a.cleanse), unknownSpans: [],
      };
    } else (r ? stale : unreviewed).push(h.slug);
    out[h.slug] = { ...kit, textHash: hash, reviewed: !!r && r.textHash === hash };
  }
  writeFileSync(OUT, JSON.stringify({
    generatedAt: new Date().toISOString().slice(0, 10), patch: meta.patch ?? null,
    source: 'data/catalog/heroes.json ability text (pred.gg), parsed by engine/src/kit-index.ts; corrections from data/game-data/kit-index-review.json (agent kit scan, keyed by catalog text hash)',
    note: 'hard = stun/root/knockup/knockback/pull/suppress/silence/fear/charm/sleep/blind/banish/ground/disable; soft = slow/tether. hardSec = longest top-rank hard-CC duration the text states. reviewed=false means the catalog text changed since the scan or was never scanned: re-scan it.',
    heroes: out,
  }, null, 1) + '\n');
  console.log(`kit index: ${heroes.length} heroes; ${heroes.length - stale.length - unreviewed.length} reviewed; stale ${stale.join(', ') || 'none'}; unreviewed ${unreviewed.length}`);
}

main();
