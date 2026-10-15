// Roster-wide agreement audit: for every hero, run the lane-steered optimizer
// (the same augment-as-playstyle steer the CLI uses) and compare its Pareto front
// to the field's observed cores (pred.gg). Surfaces, across all heroes, where the
// sim's optimized build matches the field vs where it disagrees — and tallies the
// field items the sim most often MISSES, which point at the systematic gaps to fix.
// Field cores never feed the objective; this runs after generation (validation only).

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData, completedItems } from '../data.js';
import { loadCalibration } from '../sim.js';
import { generateBuilds, headlineObjective, type ObjKey } from '../search.js';
import { agreeWithField, type EvidenceScope } from '../agreement.js';
import { classifyAugment, laneTopAugment, lanesFor, playstyleObjectives } from '../playstyle.js';
import { loadEffects } from '../effects.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const data = loadData();
const cal = loadCalibration();
const pool = completedItems(data);
const fx = loadEffects();
const nameToSlug = new Map([...data.items.values()].map((i) => [i.name, i.slug]));

// Registry coverage is descriptive, not a diagnosis of why an item is absent.
function missReason(itemName: string): 'modeled-effects-present' | 'unmodeled-only-or-unknown' {
  const slug = nameToSlug.get(itemName);
  const entry = slug ? fx.targets[`item:${slug}`] : undefined;
  if (!entry) return 'unmodeled-only-or-unknown'; // Unknown registry coverage is not proof of a stat-only item.
  return entry.effects.some((e) => e.kind !== 'unmodeled') ? 'modeled-effects-present' : 'unmodeled-only-or-unknown';
}

interface Row {
  evidence: EvidenceScope;
  hero: string; lane: string; augment: string | null; steer: string | null;
  hitAtK: boolean; coverage: number; rankCorr: number;
  topCore: string[]; topCoreN: number; topCoreCovered: boolean;
  coreRecall: number; // fraction of field top-core items we build ANYWHERE in the front
  missed: string[];   // field top-core items we NEVER build (descriptive omissions)
}

const rows: Row[] = [];
const missTally: Record<string, number> = {};

for (const kit of [...data.kits.values()].sort((a, b) => a.slug.localeCompare(b.slug))) {
  const lane = lanesFor(kit.slug)[0] ?? kit.roles[0] ?? 'midlane';
  const aug = laneTopAugment(kit.slug, lane);
  const ps = aug ? classifyAugment(`augment:${kit.slug}:${aug.id}`).playstyle : null;
  const bias = ps ? playstyleObjectives(ps, kit) : undefined;
  const headline: ObjKey = bias?.[0] ?? headlineObjective(kit, lane);
  const front = generateBuilds(kit, pool, cal, { level: 13, role: lane, objectiveBias: bias, headlineOverride: bias?.[0] });
  const a = agreeWithField(front, kit.slug, data.itemsBySlug, headline, { k: 6, role: lane });
  if (!a || !a.topCore) continue;

  // Every item we build anywhere in the front (within each build's purchasable
  // first 6). Item-level recall separates "we build it, just not in the exact
  // trio" (a coverage nuance) from "we NEVER build it" (a diagnostic candidate).
  const frontItems = new Set(front.flatMap((b) => b.items.slice(0, 6)));
  const missed = a.topCore.items.filter((it) => !frontItems.has(it)); // never built
  const coreRecall = a.topCore.items.length
    ? a.topCore.items.filter((it) => frontItems.has(it)).length / a.topCore.items.length
    : 0;
  for (const m of missed) missTally[m] = (missTally[m] ?? 0) + 1;

  rows.push({
    evidence: a.evidence,
    hero: kit.name, lane, augment: aug?.name ?? null, steer: ps,
    hitAtK: a.hitAtK, coverage: Math.round(a.coverage * 100) / 100, rankCorr: a.rankCorr,
    topCore: a.topCore.items, topCoreN: a.topCore.n, topCoreCovered: a.topCore.covered,
    coreRecall: Math.round(coreRecall * 100) / 100, missed,
  });
}

// Rank by item-level recall ascending: heroes whose field cores we build the
// least of are the fix targets (lower recall = more of the observed core missing).
rows.sort((x, y) => x.coreRecall - y.coreRecall || x.coverage - y.coverage);
const hit = rows.filter((r) => r.hitAtK).length;
const avgCov = rows.reduce((s, r) => s + r.coverage, 0) / rows.length;
const avgRecall = rows.reduce((s, r) => s + r.coreRecall, 0) / rows.length;

console.log(`Descriptive overlap audit: ${rows.length} heroes. Current-patch lane-eligible rows: ${rows.filter(r => r.evidence.currentMetaEligible).length}. Historical/mixed rows do NOT validate the current meta.`);
console.log(`  exact-trio hit (all 3 core items in one build): ${hit}/${rows.length} (${Math.round(100 * hit / rows.length)}%)`);
console.log(`  item-level core recall (we build each core item somewhere): ${(avgRecall * 100).toFixed(0)}% avg`);
console.log(`  trio coverage (n-weighted): ${(avgCov * 100).toFixed(0)}% avg\n`);
console.log('Worst 18 by core recall (the fix targets — historical items absent from these fronts):');
for (const r of rows.slice(0, 18)) {
  console.log(`  ${r.hero.padEnd(13)} ${r.lane.padEnd(8)} recall ${(r.coreRecall * 100).toFixed(0).padStart(3)}%  field core: ${r.topCore.join('+')} (n=${r.topCoreN})${r.missed.length ? ` — never build: ${r.missed.join(', ')}` : ''}`);
}
const tally = Object.entries(missTally).map(([item, n]) => ({ item, n, reason: missReason(item) }))
  .sort((a, b) => b.n - a.n);
const blockedN = tally.filter((t) => t.reason === 'unmodeled-only-or-unknown').reduce((s, t) => s + t.n, 0);
const fixableN = tally.filter((t) => t.reason === 'modeled-effects-present').reduce((s, t) => s + t.n, 0);
console.log(`\nMisses by registry coverage: ${fixableN} with some modeled effects (may still be incomplete), ${blockedN} unmodeled-only or unknown.`);
console.log('\nMost-never-built field items (★ = some effects modeled; ⓘ = unmodeled-only or unknown):');
for (const { item, n, reason } of tally.slice(0, 18)) {
  console.log(`  ${reason === 'modeled-effects-present' ? '★' : 'ⓘ'} ${item.padEnd(22)} never built for ${n} heroes' field core`);
}

writeFileSync(path.join(ROOT, 'data/aggregates/agreement-audit.json'),
  JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), status: rows.some(r => r.evidence.currentMetaEligible) ? 'descriptive-overlap-only' : 'current-meta-validation-blocked', currentMeta: rows.some(r => r.evidence.currentMetaEligible) ? { eligibleRows: rows.filter(r => r.evidence.currentMetaEligible).length } : null, note: 'Historical/role-qualified descriptive overlap; NOT proof of current-meta fidelity or winning builds. Rank correlation disabled: a covering six-item build does not score the actual three-item core. Per-hero optimizer-vs-field-core agreement (primary lane, lane-augment steer). coreRecall = fraction of the field top-core items the optimizer builds anywhere in its front; missed = field core items never built. missTally reason describes registry coverage only; modeled-effects-present may include unsupported effects, and neither category establishes a valuation defect. Validation only — popularity never feeds the objective. See engine/src/ingest/agreement-audit.ts.', summary: { heroes: rows.length, exactTrioHit: hit, avgCoreRecall: avgRecall, avgTrioCoverage: avgCov, missesWithModeledEffects: fixableN, missesUnmodeledOrUnknown: blockedN }, missTally: Object.fromEntries(tally.map((t) => [t.item, { n: t.n, reason: t.reason }])), rows }, null, 2));
console.log('\n-> data/aggregates/agreement-audit.json');
