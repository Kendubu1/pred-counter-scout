// Eternal and augment ranking: marginal simulator gain of each encoded
// blessing on top of a concrete build. Eternals with no tractable math
// are reported as unmodeled, never silently scored (design doc: math, not
// vibes; if the math does not exist, say so).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEffects, mergeEffects, resolveEntries, resolveItemEffects, type ResolvedEffects } from './effects.js';
import { simulate, type Calibration } from './sim.js';
import { headlineObjective } from './search.js';
import { kitPowerType, type KitPlaystyle, type Playstyle } from './playstyle.js';
import type { HeroKit, Item } from './types.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

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

// ── Eternal loadout: major -> minor1, minor2, conditioned on the kit ──
//
// An Eternal is a major blessing plus one pick from each of two minor slots.
// rankBlessings ranks majors only; this picks a coherent triple: the major is
// chosen by kit fit blended with its sim delta, then each minor is scored by its
// MARGINAL sim gain ON TOP OF that major (so the minor's value is conditioned on
// the major actually being equipped) — falling back to the curated recommendation
// when a minor's mechanic isn't modeled.

interface EternalFit {
  attrs?: Record<string, number>;
  traits?: Record<string, number>;
  roles?: Record<string, number>;
  damageType?: Record<string, number>;
}
interface EternalDef {
  id: string; name: string; archetype?: string;
  minorSlot1: { name: string; desc: string }[];
  minorSlot2: { name: string; desc: string }[];
  recommend?: { default?: string[]; note?: string };
  fit?: EternalFit;
}

let eternalDefs: Map<string, EternalDef> | null = null;
function loadEternalDefs(): Map<string, EternalDef> {
  if (!eternalDefs) {
    const raw = JSON.parse(readFileSync(path.join(ROOT, 'data/game-data/eternals.json'), 'utf8'));
    eternalDefs = new Map((raw.eternals as EternalDef[]).map((e) => [e.id, e]));
  }
  return eternalDefs;
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Which fit traits each kit playstyle cares about (durability is an attr, handled
// separately). Mirrors the playstyle ontology; keeps fit scoring interpretable.
const PLAYSTYLE_TRAITS: Record<Playstyle, string[]> = {
  'on-hit': ['on_hit', 'crit', 'lifesteal', 'dueling'],
  'ability-burst': ['burst', 'dot', 'aoe'],
  sustain: ['sustain', 'healing', 'ally_heal', 'shield', 'self_heal', 'self_shield', 'lifesteal'],
  tank: ['cc', 'dive'],
  poke: ['poke', 'aoe', 'scaling'],
};

/** How well an Eternal's fit block matches THIS kit and playstyle. Power-type
 *  alignment + damage-type + the traits the playstyle leans on (secondary at
 *  half weight) + role. Higher is better. */
function fitScore(kit: HeroKit, kitPs: KitPlaystyle, role: string, fit?: EternalFit): number {
  if (!fit) return 0;
  const attrs = fit.attrs ?? {}, traits = fit.traits ?? {};
  const power = kitPowerType(kit);
  let s = power === 'magical' ? (attrs.abilityPower ?? 0) : (attrs.attackPower ?? 0);
  s += fit.damageType?.[power] ?? 0;
  s += fit.roles?.[role] ?? 0;
  const traitSum = (ps: Playstyle) => PLAYSTYLE_TRAITS[ps].reduce((a, t) => a + (traits[t] ?? 0), 0);
  s += traitSum(kitPs.primary);
  if (kitPs.secondary) s += 0.5 * traitSum(kitPs.secondary);
  if (kitPs.primary === 'tank') s += attrs.durability ?? 0;
  return s;
}

export interface MinorPick { slot: 1 | 2; name: string; modeled: boolean; deltaPct?: number; note: string }
export interface EternalLoadout {
  major: { id: string; name: string; modeled: boolean; fitScore: number; headlinePct?: number };
  minor1: MinorPick;
  minor2: MinorPick;
  note: string;
}

const FIT_WEIGHT = 3;  // scales fit (~0–4) into the same points as sim delta-% — kit fit leads, sim refines.

/** Pick the best (major, minor1, minor2) Eternal triple for this kit. */
export function selectEternalLoadout(
  kit: HeroKit, items: Item[], level: number, cal: Calibration, kitPs: KitPlaystyle,
  opts: { minute?: number; role?: string } = {},
): EternalLoadout | null {
  const role = opts.role ?? kit.roles[0] ?? 'midlane';
  const reg = loadEffects();
  const defs = loadEternalDefs();
  const ranked = rankBlessings(kit, items, level, cal, { minute: opts.minute });
  if (!ranked.length) return null;

  // Choose the major: kit fit (dominant) blended with its modeled sim delta.
  const ehpWeight = kit.attackType === 'ranged' ? 0.25 : 0.6;
  const simComponent = (r: EternalRanking) =>
    r.modeled ? Math.max(r.headlinePct ?? 0, (r.deltas?.ehpPct ?? 0) * ehpWeight, r.deltas?.healShieldPct ?? 0) : 0;
  const baseId = (r: EternalRanking) => r.id.split(':')[0]!;
  const scored = ranked
    .map((r) => ({ r, fit: fitScore(kit, kitPs, role, defs.get(baseId(r))?.fit), sim: simComponent(r) }))
    .sort((a, b) => (b.sim + FIT_WEIGHT * b.fit) - (a.sim + FIT_WEIGHT * a.fit));
  const top = scored[0]!;
  const id = baseId(top.r);
  const def = defs.get(id);

  // Headline metric for conditional minor scoring.
  const headline = headlineObjective(kit, role);
  const metric: keyof ReturnType<typeof metrics> =
    headline === 'autoDps10VsSquishy' ? 'autoDps'
    : headline === 'burstVsSquishy' ? 'burst'
    : headline === 'ehpPhysical' ? 'ehp'
    : headline === 'healShield10s' ? 'healShield'
    : headline === 'rot20VsBruiser' ? 'rot20' : 'rot10';

  const itemFx = resolveItemEffects(items, { level, minute: opts.minute });
  const ctx = { level, minute: opts.minute, itemCount: items.length };
  const majorFx = resolveEntries([`eternal:${id}:major`], ctx, reg);
  const withMajor = metrics(kit, items, level, cal, mergeEffects(itemFx, majorFx));
  const recommended = new Set(def?.recommend?.default ?? []);

  const pickMinor = (slot: 1 | 2, candidates: { name: string; desc: string }[]): MinorPick => {
    let best: MinorPick | null = null;
    for (const c of candidates) {
      const key = `eternal:${id}:${slugify(c.name)}`;
      const fx = reg.targets[key] ? resolveEntries([key], ctx, reg) : null;
      if (fx && fx.applied.length) {
        const combo = metrics(kit, items, level, cal, mergeEffects(mergeEffects(itemFx, majorFx), fx));
        const baseVal = withMajor[metric] || 1;
        const deltaPct = ((combo[metric] - withMajor[metric]) / baseVal) * 100;
        const note = `+${deltaPct.toFixed(1)}% ${metric} on top of the major (modeled)`;
        if (!best || (best.modeled && (best.deltaPct ?? 0) < deltaPct) || !best.modeled) best = { slot, name: c.name, modeled: true, deltaPct, note };
      } else if (!best || !best.modeled) {
        // Unmodeled: prefer the curated recommendation; never invent a magnitude.
        const isRec = recommended.has(c.name);
        const note = isRec ? 'curated recommendation (mechanic not in the sim)' : 'mechanic not in the sim';
        if (!best || (isRec && best.note !== 'curated recommendation (mechanic not in the sim)')) best = { slot, name: c.name, modeled: false, note };
      }
    }
    return best ?? { slot, name: candidates[0]?.name ?? '—', modeled: false, note: 'no candidates' };
  };

  return {
    major: { id, name: top.r.name, modeled: top.r.modeled, fitScore: top.fit, headlinePct: top.r.headlinePct },
    minor1: pickMinor(1, def?.minorSlot1 ?? []),
    minor2: pickMinor(2, def?.minorSlot2 ?? []),
    note: def?.archetype ? `${def.archetype} — fit ${top.fit.toFixed(2)}` : `fit ${top.fit.toFixed(2)}`,
  };
}
