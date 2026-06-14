// Augment-as-playstyle classifier + lane resolver.
//
// The sim computes magnitudes; an augment declares INTENT. Even when an
// augment's mechanic is unmodeled, the choice tells us which playstyle (and
// therefore which objective corner) the player committed to. The lane selects
// which augment the field runs, so (hero x lane) -> augment -> playstyle is a
// signal the sim is otherwise blind to. We classify deterministically from the
// SAME curated text a human reads (effects.json sourceText + effect kinds), so
// nothing is invented; low-confidence reads steer nothing (graceful default).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEffects } from './effects.js';
import { kitHeals, type ObjKey } from './search.js';
import type { HeroKit } from './types.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export type Playstyle = 'on-hit' | 'ability-burst' | 'sustain' | 'tank' | 'poke';

/** A hero whose PHYSICAL basic attacks carry the build (mirrors the routing in
 *  search.ts headlineObjective). For these, "on-hit" means stacking basic DPS;
 *  for everyone else (magical/hybrid casters) the on-hit value is woven into
 *  the rotation alongside their magical abilities, not pure auto-attacking. */
export function physicalAutoAttacker(kit: HeroKit): boolean {
  return kit.damageType !== 'magical' && (kit.roles.includes('carry') || kit.basicScalingPct >= 90);
}

/** Where a kit's ABILITY payload lives. Most casters are tagged 'hybrid' (their
 *  basic scales on physical power while abilities deal magical damage, e.g.
 *  Gideon), so kit.damageType alone misclassifies them. We read the majority
 *  damage type of the damaging abilities, which is what an ability-power build
 *  and an ability-power Eternal should align to. */
export function kitPowerType(kit: HeroKit): 'magical' | 'physical' {
  if (kit.damageType === 'magical') return 'magical';
  if (kit.damageType === 'physical') return 'physical';
  const mag = kit.abilities.filter((a) => a.damageType === 'magical' && a.damagePerRank.length).length;
  const phys = kit.abilities.filter((a) => a.damageType === 'physical' && a.damagePerRank.length).length;
  return mag >= phys && mag > 0 ? 'magical' : 'physical';
}

/** A playstyle's objective corner, ROUTED BY THE HERO'S DAMAGE TYPE. The key
 *  fix: an on-hit augment on a magical hero (e.g. Zinx, whose basic is physical
 *  but all four abilities are magical) must NOT be steered into a physical-crit
 *  auto-DPS build — her on-hit power is magical and lives in the rotation. */
export function playstyleObjectives(playstyle: Playstyle, kit: HeroKit): ObjKey[] {
  switch (playstyle) {
    case 'on-hit':
      return physicalAutoAttacker(kit)
        ? ['autoDps10VsSquishy', 'rot10VsSquishy']   // physical AA: basic DPS
        : ['rot10VsSquishy', 'burstVsSquishy'];      // magical/hybrid: weave on-hit into the rotation
    case 'ability-burst': return ['burstVsSquishy', 'rot10VsSquishy'];
    case 'sustain': return ['healShield10s', 'sustain10s'];
    case 'tank': return ['ehpPhysical', 'ehpMagical'];
    case 'poke': return ['rot10VsSquishy', 'rot20VsBruiser'];
  }
}

export interface AugmentClass {
  playstyle: Playstyle | null;
  confidence: number;     // matched-signal count; 0 => no steer
  why: string;            // the cue that classified it
  modeled: boolean;       // does the sim actually compute this augment's effect?
}

// Effect kinds → playstyle (when the augment is modeled, its kinds are decisive).
const KIND_PLAYSTYLE: Record<string, Playstyle> = {
  on_hit: 'on-hit',
  ability_heal: 'sustain',
  shield_on_cast: 'sustain',
  ability_damage_amp: 'ability-burst',
  ability_bonus_damage: 'ability-burst',
  ability_cooldown: 'ability-burst',
  armor_multiplier: 'tank',
  health_multiplier: 'tank',
};

/** Classify one curated augment entry (key augment:<hero>:<id>). Reads the
 *  effect kinds first (decisive when modeled), then keyword-scans the curated
 *  sourceText. */
export function classifyAugment(key: string): AugmentClass {
  const reg = loadEffects();
  const e = reg.targets[key];
  if (!e) return { playstyle: null, confidence: 0, why: 'no curated entry', modeled: false };
  const modeled = e.effects.some((f) => f.kind !== 'unmodeled');

  // 1) modeled kinds are the strongest signal
  for (const fx of e.effects) {
    const ps = KIND_PLAYSTYLE[fx.kind];
    if (ps) return { playstyle: ps, confidence: 3, why: `effect kind ${fx.kind}`, modeled };
  }

  // 2) keyword scan of the curated text (same words a human reads)
  const t = (e.sourceText || '').toLowerCase();
  const cues: [Playstyle, RegExp, string][] = [
    ['on-hit', /on-?hit|basic attack|basic attacks|per basic|auto attack/, 'on-hit / basic-attack text'],
    ['sustain', /\bheal|\bshield|lifesteal|omnivamp|restore .*health|infuse/, 'heal / shield text'],
    ['tank', /armou?r|mitigat|damage taken|tenacity|less damage|resurrect|cc immun/, 'defensive text'],
    ['ability-burst', /ability|abilities|ultimate|cast|cooldown/, 'ability / cast text'],
    ['poke', /range|projectile|missile|slow|movement speed/, 'range / poke text'],
  ];
  for (const [ps, re, why] of cues) {
    if (re.test(t)) return { playstyle: ps, confidence: re.test(t) ? 1 : 0, why, modeled };
  }
  return { playstyle: null, confidence: 0, why: 'no clear cue', modeled };
}

export interface LaneAugment {
  id: string; name: string; lane: string;
  n: number; w: number; wr: number; shrunkWr: number;
}

let augCache: any = null;
function predggAugments() {
  if (!augCache) augCache = JSON.parse(readFileSync(path.join(ROOT, 'data/aggregates/predgg-augments.json'), 'utf8'));
  return augCache;
}

const SHRINK_K = 400;        // empirical-Bayes prior strength (toward 50%)
const LANE_MIN_GAMES = 200;  // ignore tiny samples for the steer

/** The augment the field commits to in a given lane. The playstyle signal is
 *  the augment the lane actually RUNS — i.e. the most-played with enough games
 *  (and not a clear loser) — tie-broken by shrunk winrate. Play count, not
 *  winrate, defines a lane's identity: a support's most-played augment is its
 *  enchanter pick even if an off-meta on-hit augment posts a higher rate on a
 *  thin sample. Returns null if the hero/lane has no usable evidence. */
export function laneTopAugment(heroSlug: string, lane: string): LaneAugment | null {
  const data = predggAugments();
  const hero = data.heroes?.[heroSlug];
  const rec = hero?.[lane];
  if (!rec?.augments?.length) return null;
  const scored = rec.augments
    .map((a: any) => ({
      id: String(a.id), name: a.name, lane,
      n: a.n, w: a.w, wr: a.w / a.n,
      shrunkWr: (a.w + SHRINK_K * 0.5) / (a.n + SHRINK_K),
    }))
    // enough games AND not a clear loser (shrunk wr >= 47%): a dominant augment
    // the field keeps losing on isn't the playstyle to steer toward.
    .filter((a: LaneAugment) => a.n >= LANE_MIN_GAMES && a.shrunkWr >= 0.47);
  if (!scored.length) return null;
  scored.sort((a: LaneAugment, b: LaneAugment) => b.n - a.n || b.shrunkWr - a.shrunkWr);
  return scored[0];
}

/** Available lanes for a hero in the augment evidence (highest-evidence first). */
export function lanesFor(heroSlug: string): string[] {
  const hero = predggAugments().heroes?.[heroSlug];
  if (!hero) return [];
  return Object.keys(hero).sort((a, b) => {
    const na = (hero[a].augments?.[0]?.n ?? 0), nb = (hero[b].augments?.[0]?.n ?? 0);
    return nb - na;
  });
}

// ── Kit-derived playstyle (first-principles, NOT field-derived) ──
//
// The shipped steer above reads INTENT from the augment the field runs — useful,
// but still popularity-anchored. This derives the playstyle from the hero's own
// kit (damage type, basic-attack carry, ability scaling, cooldowns, on-hit/heal
// payloads), so a hero the field hasn't figured out (or a brand-new one) still
// gets a coherent steer. The two are then FUSED: agreement is a confident steer,
// disagreement is itself signal worth surfacing.

export interface KitPlaystyle {
  primary: Playstyle;
  secondary?: Playstyle;
  confidence: number;   // top score minus runner-up; 0 => no clear lean
  evidence: string[];   // the kit cues that drove the classification
}

/** Score each playstyle from kit mechanics and return the lean. Deterministic;
 *  every point is justified by a recorded cue. */
export function kitPlaystyle(kit: HeroKit, role?: string): KitPlaystyle {
  const r = role ?? kit.roles[0] ?? 'midlane';
  const score: Record<Playstyle, number> = { 'on-hit': 0, 'ability-burst': 0, sustain: 0, tank: 0, poke: 0 };
  const evidence: string[] = [];
  const add = (ps: Playstyle, n: number, why: string) => { score[ps] += n; evidence.push(`${ps} +${n}: ${why}`); };

  const power = kitPowerType(kit);
  if (physicalAutoAttacker(kit)) add('on-hit', 3, 'physical basic attacks carry the kit (carry role / high basic scaling)');
  else if (power === 'physical' && kit.basicScalingPct >= 60) add('on-hit', 1, `basic scaling ${kit.basicScalingPct}% on bonus power`);

  const abil = kit.abilities.filter((a) => a.damagePerRank.length);
  const maxScaling = Math.max(0, ...abil.map((a) => a.scalingPct));
  if (power === 'magical' && maxScaling >= 60) add('ability-burst', 2, `ability-power kit with ${maxScaling}% scaling`);
  if (abil.some((a) => a.key === 'ULTIMATE' && (a.scalingPct >= 80 || (a.pctMaxHealth ?? 0) > 0))) add('ability-burst', 1, 'high-scaling or %max-health ultimate');
  if (abil.some((a) => (a.pctMaxHealth ?? 0) > 0)) add('ability-burst', 1, '%max-health ability damage');

  if (kit.attackType === 'ranged') add('poke', 1, 'ranged auto range enables poke');
  const meanCd = abil.length ? abil.reduce((s, a) => s + (a.cooldowns[0] ?? 99), 0) / abil.length : 99;
  if (meanCd <= 9) add('poke', 1, `spammable abilities (mean base cooldown ${meanCd.toFixed(1)}s)`);

  if (kitHeals(kit)) add('sustain', 2, 'kit has heal/shield abilities');
  if (r === 'support') add('sustain', 1, 'support role');

  if (kit.attackType === 'melee' && power === 'physical' && kit.basicScalingPct < 60 && maxScaling < 60) {
    add('tank', 2, 'melee with low basic and ability scaling (durability-leaning bruiser)');
  }

  const ranked = (Object.keys(score) as Playstyle[]).sort((a, b) => score[b] - score[a]);
  const primary = ranked[0]!;
  const secondary = score[ranked[1]!] > 0 ? ranked[1]! : undefined;
  return { primary, secondary, confidence: score[primary]! - score[ranked[1]!]!, evidence };
}

export interface FusedSteer {
  bias: ObjKey[];
  agreement: 'agree' | 'disagree' | 'kit-only' | 'field-only';
  note: string;
}

/** Fuse the kit-derived playstyle with the field's lane augment into one steer.
 *  Kit leads (first principles); the field corroborates or disagrees. Agreement
 *  reinforces the corner; disagreement keeps the kit steer but names the gap. */
export function fuseSteer(kitPs: KitPlaystyle, lane: LaneAugment | null, kit: HeroKit): FusedSteer {
  const fieldPs = lane ? classifyAugment(`augment:${kit.slug}:${lane.id}`).playstyle : null;
  const kitObj = playstyleObjectives(kitPs.primary, kit);
  const dedup = (xs: ObjKey[]) => [...new Set(xs)];
  const ev = lane && lane.n > 0 ? ` (field ${lane.lane} runs "${lane.name}" ${(lane.wr * 100).toFixed(1)}% over ${lane.n.toLocaleString()})` : '';

  if (!fieldPs) {
    if (kitPs.confidence <= 0) return { bias: kitObj, agreement: 'kit-only', note: `kit lean is weak; defaulting to ${kitPs.primary}` };
    return { bias: kitObj, agreement: 'kit-only', note: `kit says ${kitPs.primary}; no usable field augment signal${ev}` };
  }
  if (kitPs.confidence <= 0) {
    return { bias: playstyleObjectives(fieldPs, kit), agreement: 'field-only', note: `kit lean unclear; following the field's ${fieldPs}${ev}` };
  }
  if (fieldPs === kitPs.primary || fieldPs === kitPs.secondary) {
    return { bias: dedup([...kitObj, ...playstyleObjectives(fieldPs, kit)]), agreement: 'agree', note: `kit and field agree on ${fieldPs}${ev}` };
  }
  return {
    bias: kitObj,
    agreement: 'disagree',
    note: `kit says ${kitPs.primary}, field plays ${fieldPs}${ev} — steering by the kit; the disagreement is worth a look`,
  };
}
