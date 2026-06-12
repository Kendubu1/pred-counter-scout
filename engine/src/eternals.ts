// Eternal and augment ranking: marginal simulator gain of each encoded
// blessing on top of a concrete build. Eternals with no tractable math
// are reported as unmodeled, never silently scored (design doc: math, not
// vibes; if the math does not exist, say so).

import { loadEffects, mergeEffects, resolveEntries, resolveItemEffects, type ResolvedEffects } from './effects.js';
import { simulate, type Calibration } from './sim.js';
import { headlineObjective } from './search.js';
import type { HeroKit, Item } from './types.js';

export interface EternalRanking {
  id: string;
  name: string;
  modeled: boolean;
  provisional: boolean;
  // healShieldAbs carries the absolute HP/10s gain because a kit with no
  // baseline heal output (Dekker + Polarity Strike) has no percent to give.
  deltas?: { burstPct: number; rot10Pct: number; rot20Pct: number; autoDpsPct: number; ehpPct: number; healShieldPct: number; healShieldAbs: number };
  headlinePct?: number;
  unmodeledNotes: string[];
}

function metrics(kit: HeroKit, items: Item[], level: number, cal: Calibration, effects: ReturnType<typeof resolveItemEffects>) {
  const squishy = cal.referenceProfiles.squishy!;
  const r = simulate(kit, items, { level, profile: squishy, effects }, cal);
  return { burst: r.burstCombo, rot10: r.rotation[10] ?? 0, rot20: r.rotation[20] ?? 0, autoDps: r.autoDps, ehp: r.ehpPhysical, healShield: r.healShield10s };
}

export function rankBlessings(
  kit: HeroKit, items: Item[], level: number, cal: Calibration,
  opts: { minute?: number; prefix?: string; extraEffects?: ResolvedEffects } = {},
): EternalRanking[] {
  const reg = loadEffects();
  const prefix = opts.prefix ?? 'eternal:';
  const majorKeys = Object.keys(reg.targets).filter((k) =>
    prefix === 'eternal:' ? /^eternal:[^:]+:major$/.test(k) : k.startsWith(prefix));

  // extraEffects: a modeled hero augment, so Eternal deltas are computed
  // on the kit the player actually locked in (no longer augment-blind).
  let itemFx = resolveItemEffects(items, { level, minute: opts.minute });
  if (opts.extraEffects) itemFx = mergeEffects(itemFx, opts.extraEffects);
  const base = metrics(kit, items, level, cal, itemFx);
  const pct = (now: number, was: number) => (was > 0 ? ((now - was) / was) * 100 : 0);

  const headline = headlineObjective(kit);
  const headlineMetric: 'autoDps' | 'rot10' = headline === 'autoDps10VsSquishy' ? 'autoDps' : 'rot10';

  const out: EternalRanking[] = [];
  for (const key of majorKeys) {
    const entry = reg.targets[key]!;
    const id = key.split(':').slice(1).join(':');
    const fx = resolveEntries([key], { level, minute: opts.minute, itemCount: items.length }, reg);
    if (!fx.applied.length) {
      out.push({ id, name: entry.name, modeled: false, provisional: entry.provisional ?? false, unmodeledNotes: fx.unmodeled });
      continue;
    }
    const withFx = metrics(kit, items, level, cal, mergeEffects(itemFx, fx));
    const deltas = {
      burstPct: pct(withFx.burst, base.burst),
      rot10Pct: pct(withFx.rot10, base.rot10),
      rot20Pct: pct(withFx.rot20, base.rot20),
      autoDpsPct: pct(withFx.autoDps, base.autoDps),
      ehpPct: pct(withFx.ehp, base.ehp),
      healShieldPct: pct(withFx.healShield, base.healShield),
      healShieldAbs: withFx.healShield - base.healShield,
    };
    out.push({
      id, name: entry.name, modeled: true, provisional: entry.provisional ?? false,
      deltas,
      headlinePct: deltas[`${headlineMetric}Pct`],
      unmodeledNotes: fx.unmodeled,
    });
  }
  // Survivability is discounted for backline kits: a ranged mage rarely
  // trades a double-digit damage amp for raw HP, while a melee bruiser
  // genuinely might. Heuristic, documented; revisit with evidence data.
  const ehpWeight = kit.attackType === 'ranged' ? 0.25 : 0.6;
  return out.sort((a, b) => {
    if (a.modeled !== b.modeled) return a.modeled ? -1 : 1;
    const score = (r: EternalRanking) =>
      Math.max(r.headlinePct ?? 0, (r.deltas?.ehpPct ?? 0) * ehpWeight, r.deltas?.healShieldPct ?? 0);
    return score(b) - score(a);
  });
}

/** Hero-augment rankings: same marginal math, over augment:<slug>: keys. */
export function rankAugments(
  kit: HeroKit, items: Item[], level: number, cal: Calibration,
  opts: { minute?: number } = {},
): EternalRanking[] {
  return rankBlessings(kit, items, level, cal, { ...opts, prefix: `augment:${kit.slug}:` });
}
