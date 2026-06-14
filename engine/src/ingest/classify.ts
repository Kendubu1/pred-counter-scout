// Roster re-tagging: for every hero, classify each lane they're played in from
// the FIELD's behaviour (the augment that lane runs) fused with the kit. The omeda
// damage tag is too coarse ('hybrid' for nearly every caster), so the authoritative
// tag is (real power type) x (playstyle from the lane augment + kit). Emits a
// reviewable table + data/aggregates/classifications.json. Zero external calls —
// reads committed augment evidence and kit data only.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData } from '../data.js';
import {
  classifyAugment, fuseSteer, kitPlaystyle, kitPowerType, lanesFor, laneTopAugment,
} from '../playstyle.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// pred.gg's curated build-tab NAME per hero-lane (frozen 1.11.2 snapshot). We use
// it only as an independent label to CROSS-CHECK our tag — never the item list.
// Archetype names are far more patch-stable than the builds themselves.
function loadPredggNames(slug: string): Record<string, string> {
  try {
    const d = JSON.parse(readFileSync(path.join(ROOT, `data/2026-02-08/${slug}.json`), 'utf8'));
    const out: Record<string, string> = {};
    for (const [lane, rv] of Object.entries((d.roles ?? {}) as Record<string, any>)) {
      const name = rv?.buildTabs?.find((t: any) => t?.name)?.name;
      if (name) out[lane] = name;
    }
    return out;
  } catch { return {}; }
}

// Does our playstyle tag align with pred.gg's archetype name (where the taxonomies
// overlap: on-hit / sustain / burst / tank)? '~' = no overlapping term to compare.
function crossCheck(playstyle: string, predgg: string | null): 'agree' | 'differ' | '~' {
  if (!predgg) return '~';
  const p = predgg.toLowerCase();
  const map: Record<string, RegExp> = {
    'on-hit': /on-?hit/, sustain: /sustain/, 'ability-burst': /burst/, tank: /tank/, poke: /poke/,
  };
  const re = map[playstyle];
  const overlapping = /on-?hit|sustain|burst|tank|poke/.test(p);
  if (!re || !overlapping) return '~';
  return re.test(p) ? 'agree' : 'differ';
}

interface LaneTag {
  lane: string;
  topAugment: string | null;
  augmentPlaystyle: string | null;
  kitPlaystyle: string;
  tag: string;            // the fused playstyle we'd steer by
  agreement: string;      // agree | disagree | kit-only | field-only
  predggName: string | null;   // pred.gg's build-tab label (cross-check only)
  predggCheck: string;         // agree | differ | ~
  fieldGames: number;
}
interface HeroTag { hero: string; name: string; powerType: 'magical' | 'physical'; lanes: LaneTag[] }

const data = loadData();
const out: HeroTag[] = [];

for (const kit of [...data.kits.values()].sort((a, b) => a.slug.localeCompare(b.slug))) {
  // Lanes the field actually plays this hero (augment evidence), falling back to
  // the kit's listed roles when there is none.
  const lanes = lanesFor(kit.slug);
  const laneList = lanes.length ? lanes : kit.roles.slice(0, 1);
  const predgg = loadPredggNames(kit.slug);
  const laneTags: LaneTag[] = laneList.map((lane) => {
    const aug = laneTopAugment(kit.slug, lane);
    const augPs = aug ? classifyAugment(`augment:${kit.slug}:${aug.id}`).playstyle : null;
    const kp = kitPlaystyle(kit, lane);
    const fused = fuseSteer(kp, aug, kit);
    const ourPlaystyle = augPs ?? kp.primary;
    return {
      lane,
      topAugment: aug?.name ?? null,
      augmentPlaystyle: augPs,
      kitPlaystyle: `${kp.primary}${kp.secondary ? `/${kp.secondary}` : ''}`,
      tag: fused.bias[0] ?? kp.primary,
      agreement: fused.agreement,
      predggName: predgg[lane] ?? null,
      predggCheck: crossCheck(ourPlaystyle, predgg[lane] ?? null),
      fieldGames: aug?.n ?? 0,
    };
  });
  out.push({ hero: kit.slug, name: kit.name, powerType: kitPowerType(kit), lanes: laneTags });
}

// Summary
const agreeCounts: Record<string, number> = {};
const xCheck: Record<string, number> = {};
for (const h of out) for (const l of h.lanes) {
  agreeCounts[l.agreement] = (agreeCounts[l.agreement] ?? 0) + 1;
  xCheck[l.predggCheck] = (xCheck[l.predggCheck] ?? 0) + 1;
}

console.log(`Re-tagged ${out.length} heroes (${out.reduce((s, h) => s + h.lanes.length, 0)} hero-lanes)\n`);
for (const h of out) {
  console.log(`${h.name} (${h.powerType})`);
  for (const l of h.lanes) {
    const aug = l.topAugment ? `${l.topAugment} -> ${l.augmentPlaystyle ?? '?'}` : 'no field augment';
    const pg = l.predggName ? `pred.gg "${l.predggName}" [${l.predggCheck}]` : '';
    console.log(`  ${l.lane.padEnd(8)} tag=${l.tag.padEnd(18)} [${l.agreement}]  kit=${l.kitPlaystyle.padEnd(14)} field=${aug}${l.fieldGames ? ` (n=${l.fieldGames.toLocaleString()})` : ''}  ${pg}`);
  }
}
console.log('\nkit/field agreement:', Object.entries(agreeCounts).map(([k, v]) => `${k} ${v}`).join('  '));
console.log('vs pred.gg build name:', Object.entries(xCheck).map(([k, v]) => `${k} ${v}`).join('  '), '(~ = no overlapping taxonomy term)');

writeFileSync(
  path.join(ROOT, 'data/aggregates/classifications.json'),
  JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), note: 'Per-hero-lane playstyle tags fused from the lane augment (field behaviour) + kit; powerType from ability damage type. See engine/src/ingest/classify.ts.', heroes: out }, null, 2),
);
console.log('\n-> data/aggregates/classifications.json');
