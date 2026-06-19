// Kit/ability comp-analysis augment for the post-game reviews. computeMatchFacts
// (the data pull) deliberately leaves `kit` off — it's derived deterministically
// from the committed hero-abilities.json (structured CC/heals/AoE) plus the
// qualitative kit-profiles.json. This pass fills `kit` on any review missing it
// (a fresh pull) and can refresh all with --all. The agent kit-knowledge pass
// authored kit-profiles.json; this just joins it onto each match's two comps.
//
//   npm run postgame:kit            # fill kit on reviews missing it
//   npm run postgame:kit -- --all   # recompute kit on every review
//
// Pure local join — no API calls.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeKitAnalysis, type PostGameFacts, type KitAbility, type HeroProfile } from '../postgame.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT_DIR = path.join(ROOT, 'data/postgame');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/i;

function main() {
  const all = process.argv.includes('--all');
  const abilities = JSON.parse(readFileSync(path.join(ROOT, 'data/game-data/hero-abilities.json'), 'utf8')) as Record<string, { abilities: KitAbility[] }>;
  const profiles = (JSON.parse(readFileSync(path.join(ROOT, 'data/game-data/kit-profiles.json'), 'utf8')).heroes ?? {}) as Record<string, HeroProfile>;

  const files = readdirSync(OUT_DIR).filter((f) => UUID_RE.test(f));
  let touched = 0;
  for (const f of files) {
    const p = path.join(OUT_DIR, f);
    const facts = JSON.parse(readFileSync(p, 'utf8')) as PostGameFacts & { kit?: unknown };
    if (facts.kit && !all) continue;
    facts.kit = computeKitAnalysis(facts, abilities, profiles);
    writeFileSync(p, JSON.stringify(facts, null, 1));
    touched++;
    console.log(`  kit ${all ? 'refreshed' : 'added'} -> ${f}`);
  }
  console.log(`${touched} review(s) updated (${files.length} total).`);
}

main();
