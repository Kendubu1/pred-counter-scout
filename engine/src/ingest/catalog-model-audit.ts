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
  scalingCoverage: {
    affectedAbilitySlots: data.unmodeledScalings.length,
    selectedPayloadOmittedRatioCount: data.unmodeledScalings.reduce((n, s) => n + s.omittedTerms.length, 0),
    note: 'Counts selected payload omissions only, not all unsupported mechanics. Source tags and ratios are retained as evidence, not executed. Health/armor stat basis needs verification; conditional riders, charge maxima and multi-hit counts need separate state models. Untagged-base entries can have zero selected-payload ratios while still omitting conditional riders.',
  },
  heroes: [...data.kits.values()].map(k => ({
    slug: k.slug, source: k.abilitySource, passive: k.passive,
    abilities: k.abilities.map(a => ({ key: a.key, damageType: a.damageType,
      powerScaling: a.powerScaling, ignoresArmor: a.ignoresArmor ?? false,
      selfAttackSpeedPctPerRank: a.selfAttackSpeedPctPerRank, buffDurationSecPerRank: a.buffDurationSecPerRank })),
    staleFallbacks: data.staleFallbacks.filter(s => s.slug === k.slug),
    droppedScaling: data.unmodeledScalings.filter(s => s.slug === k.slug),
  })),
  items: items.map(i => ({ slug: i.slug, hasCatalogEffects: i.effects.length > 0, ...coverage(`item:${i.slug}`) })),
  augments: Object.entries(augments).filter(([, a]: [string, any]) => a.hero).map(([id, a]: [string, any]) => ({ id, hero: a.hero, name: a.name, ...coverage(`augment:${a.hero}:${id}`) })),
  attackSpeedLimitations: [
    'Self-buff durations are tied to their own grant clause; no four-second fallback is invented.',
    'Iggy turret attack speed is not hero attack speed. GRIM Sentry stacking and Valmont attack-speed theft need separate state/target models and are excluded from self steroids.',
    'Murdock reactivation stacks and takedown resets, Grux duration extensions, Sparrow delayed activation, and attack-speed ratios with additional stat scaling remain incomplete.',
    'Self attack-speed buffs use finite ready-at-start intervals, recast cooldowns and per-interval caps. Attack counts, item ramps and on-hit ICDs remain rate-based approximations; cast delays and attack animation timing are not simulated.',
  ],
  unresolvedAssets: evidence.unresolved,
  tenacityEvidence: 'Absolution shop 25 confirmed by user 2026-10-15; 11 other complementary values corrected from named client curves, not individually shop tested.',
};
writeFileSync(path.join(root, 'data/aggregates/catalog-model-audit.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`${out.heroes.length} heroes, ${out.items.length} items, ${out.augments.length} hero augments inventoried; ${data.staleFallbacks.length} stale ability fallback(s), ${out.scalingCoverage.affectedAbilitySlots} affected ability slots, ${out.scalingCoverage.selectedPayloadOmittedRatioCount} omitted selected-payload ratios`);
