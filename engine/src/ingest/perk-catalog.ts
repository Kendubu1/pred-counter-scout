// npm run perkcatalog (one authenticated pred.gg call): data/aggregates/perk-catalog.json, the
// internal perk name -> id / display name / slot table. The public match stream and the lineups in
// data/aggregates/team-comps/ store a player's loadout as internal names (Perk_<Hero>_<Name>,
// Eternal_<Name>, Blessing_<Eternal>_<Name>); with this file committed, every lineup reader decodes
// them with zero API calls. Rerun with `npm run catalog` when a patch adds a hero or a perk.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPerkCatalog } from './match-stream.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
async function main() {
  const m = await loadPerkCatalog();
  const perks: Record<string, { id: string; name: string; slot: string; hero: string | null }> = {};
  for (const [raw, p] of [...m].sort((a, b) => a[0].localeCompare(b[0]))) perks[raw] = { id: p.id, name: p.displayName, slot: p.slot, hero: p.hero };
  writeFileSync(path.join(ROOT, 'data/aggregates/perk-catalog.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), source: 'pred.gg GraphQL perks { id data { name displayName slot hero } } (one call)',
    note: 'Internal perk name (as the public match stream and the team-comps lineups store it) -> pred.gg perk id, display name and slot (HERO_SPECIFIC_1 = augment, ETERNAL_1 = Eternal, BLESSING_MINOR_* = minors).',
    perks,
  }, null, 1));
  const slots: Record<string, number> = {};
  for (const p of Object.values(perks)) slots[p.slot] = (slots[p.slot] ?? 0) + 1;
  console.log(`${Object.keys(perks).length} perks -> data/aggregates/perk-catalog.json ${JSON.stringify(slots)}`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
