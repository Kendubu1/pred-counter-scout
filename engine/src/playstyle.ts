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
import type { ObjKey } from './search.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export type Playstyle = 'on-hit' | 'ability-burst' | 'sustain' | 'tank' | 'poke';

// each playstyle's objective corner (ordered: primary first)
export const PLAYSTYLE_OBJECTIVES: Record<Playstyle, ObjKey[]> = {
  'on-hit': ['autoDps10VsSquishy', 'rot10VsSquishy'],
  'ability-burst': ['burstVsSquishy', 'rot10VsSquishy'],
  sustain: ['healShield10s', 'sustain10s'],
  tank: ['ehpPhysical', 'ehpMagical'],
  poke: ['rot10VsSquishy', 'rot20VsBruiser'],
};

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

/** The augment the field commits to in a given lane: best shrunk winrate among
 *  augments with enough games, tie-broken by play count. Returns null if the
 *  hero/lane has no usable evidence. */
export function laneTopAugment(heroSlug: string, lane: string): LaneAugment | null {
  const data = predggAugments();
  const hero = data.heroes?.[heroSlug];
  const rec = hero?.[lane];
  if (!rec?.augments?.length) return null;
  const scored = rec.augments
    .filter((a: any) => a.n >= LANE_MIN_GAMES)
    .map((a: any) => ({
      id: String(a.id), name: a.name, lane,
      n: a.n, w: a.w, wr: a.w / a.n,
      shrunkWr: (a.w + SHRINK_K * 0.5) / (a.n + SHRINK_K),
    }));
  if (!scored.length) return null;
  scored.sort((a: LaneAugment, b: LaneAugment) => b.shrunkWr - a.shrunkWr || b.n - a.n);
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
