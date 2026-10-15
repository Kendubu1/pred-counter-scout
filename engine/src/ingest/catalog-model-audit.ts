// Zero-network inventory of what is present, corrected, and still unmodeled.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadData } from '../data.js';
import { loadEffects } from '../effects.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p: string) => JSON.parse(readFileSync(path.join(root, p), 'utf8'));
const data = loadData();
const registry = loadEffects();
const evidence = read('engine/fixtures/catalog-asset-audit.json');
const augments = read('data/aggregates/predgg-augments.json').catalog;
const items = read('data/catalog/items.json') as {slug: string; effects: unknown[]}[];
const coverage = (key: string) => {
  const entry = registry.targets[key];
  return {
    modeled: entry?.effects.some(e => e.kind !== 'unmodeled') ?? false,
    limitations: entry?.effects.filter(e => e.kind === 'unmodeled').map(e => e.note) ?? [],
  };
};
const out = {
  generatedAt: new Date().toISOString(),
  source: 'Committed catalog, effect registry, and dated installed-client audit; no network refresh',
  note: 'Presence and source alignment are not gameplay proof. Multi-hit timing, conditional states, and dropped scaling remain incomplete; keep simulation provisional.',
  heroes: [...data.kits.values()].map(k => ({
    slug: k.slug, source: k.abilitySource,
    abilities: k.abilities.map(a => ({ key: a.key, damageType: a.damageType,
      powerScaling: a.powerScaling, ignoresArmor: a.ignoresArmor ?? false })),
    staleFallbacks: data.staleFallbacks.filter(s => s.slug === k.slug),
    droppedScaling: data.unmodeledScalings.filter(s => s.slug === k.slug),
  })),
  items: items.map(i => ({ slug: i.slug, hasCatalogEffects: i.effects.length > 0, ...coverage(`item:${i.slug}`) })),
  augments: Object.entries(augments).filter(([, a]: [string, any]) => a.hero).map(([id, a]: [string, any]) => ({ id, hero: a.hero, name: a.name, ...coverage(`augment:${a.hero}:${id}`) })),
  unresolvedAssets: evidence.unresolved,
  tenacityEvidence: 'Absolution shop 25 confirmed by user 2026-10-15; 11 other complementary values corrected from named client curves, not individually shop tested.',
};
writeFileSync(path.join(root, 'data/aggregates/catalog-model-audit.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`${out.heroes.length} heroes, ${out.items.length} items, ${out.augments.length} hero augments inventoried; ${data.staleFallbacks.length} stale ability fallback(s), ${data.unmodeledScalings.length} dropped scaling terms`);
