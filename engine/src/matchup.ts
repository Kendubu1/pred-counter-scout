// Matchup checkpoint engine (design doc component E): purchase-order
// optimization against measured gold curves, item spike timelines, and
// per-checkpoint kill-window analysis with both sides' real base stats
// and build prefixes. No winrates; no censored counter lists.
//
// Honesty flags carried in every output: levels at checkpoints come from
// the PROVISIONAL level table (the feed has no level timeline), and all
// damage numbers inherit the unverified-constants THEORY label.

import { goldAt, loadAggregates } from './aggregates.js';
import { resolveItemEffects } from './effects.js';
import { combatDamage, evaluateBuild, loadCalibration, effectiveTotals, type Calibration } from './sim.js';
import type { DefenseProfile, HeroKit, Item } from './types.js';

const KILL_WINDOW_SEC = 3;     // a committed all-in: full combo + ~3s of swings
const OPEN_THRESHOLD = 1.0;    // damage(3s) >= their effective pool
const VERDICT_MARGIN = 0.15;   // relative edge before a phase is called

export interface OrderedBuild {
  ordered: Item[];
  // cumulative gold after each purchase, aligned with `ordered`
  cumulativeGold: number[];
}

/**
 * Gold-curve-aware purchase order: greedy on marginal headline gain per
 * gold, evaluated with the actual prefix (so synergies like Demiurge or
 * crit stacking order themselves correctly).
 */
export function orderBuild(kit: HeroKit, items: Item[], level: number, cal: Calibration): OrderedBuild {
  const remaining = [...items];
  const ordered: Item[] = [];
  const cumulativeGold: number[] = [];
  let gold = 0;
  while (remaining.length) {
    let best: Item | null = null;
    let bestScore = -Infinity;
    const base = evaluateBuild(kit, ordered, level, cal);
    for (const cand of remaining) {
      const ev = evaluateBuild(kit, [...ordered, cand], level, cal);
      const gain =
        (ev.objectives.rot10VsSquishy - base.objectives.rot10VsSquishy) +
        (ev.objectives.autoDps10VsSquishy - base.objectives.autoDps10VsSquishy) * 5 +
        (ev.objectives.ehpPhysical - base.objectives.ehpPhysical) * 0.1;
      const score = gain / Math.max(cand.totalPrice, 1);
      if (score > bestScore) { bestScore = score; best = cand; }
    }
    ordered.push(best!);
    gold += best!.totalPrice;
    cumulativeGold.push(gold);
    remaining.splice(remaining.indexOf(best!), 1);
  }
  return { ordered, cumulativeGold };
}

export interface SpikeEntry {
  item: string;
  cumulativeGold: number;
  minute: number | null;  // null = beyond observed gold curves ("very late")
}

/** Item completion minutes for a role, from measured median gold curves. */
export function spikeTimeline(role: string, build: OrderedBuild): SpikeEntry[] {
  const agg = loadAggregates();
  return build.ordered.map((item, i) => {
    const need = build.cumulativeGold[i]!;
    let minute: number | null = null;
    for (let m = 1; m <= 60; m++) {
      const g = goldAt(role, m, agg);
      if (g != null && g >= need) { minute = m; break; }
    }
    return { item: item.name, cumulativeGold: need, minute };
  });
}

/** Provisional level at a checkpoint minute (flagged; feed has no level data). */
export function levelAtMinute(minute: number, cal: Calibration): number {
  const rows = cal.checkpoints.table;
  let lvl = rows[0]?.level ?? 1;
  for (const r of rows) if (r.minute <= minute) lvl = r.level;
  return lvl;
}

function affordablePrefix(build: OrderedBuild, gold: number): Item[] {
  const out: Item[] = [];
  for (let i = 0; i < build.ordered.length; i++) {
    if (build.cumulativeGold[i]! <= gold) out.push(build.ordered[i]!);
    else break;
  }
  return out;
}

function defenseOf(kit: HeroKit, items: Item[], level: number): DefenseProfile {
  const eff = resolveItemEffects(items, { level });
  const t = effectiveTotals(items, eff);
  return {
    health: ((kit.baseStats.max_health[level - 1] ?? 0) + t.health) * eff.healthMultiplier + eff.shieldFlat,
    physicalArmor: ((kit.baseStats.physical_armor[level - 1] ?? 0) + t.physical_armor) * eff.armorMultiplier,
    magicalArmor: ((kit.baseStats.magical_armor[level - 1] ?? 0) + t.magical_armor) * eff.armorMultiplier,
  };
}

export interface CheckpointSide {
  gold: number;
  items: string[];
  hp: number;
  killRatio: number;       // 3s all-in damage vs the other side's HP; >=1 = kill window open
}

export interface CheckpointReport {
  minute: number;
  levelProvisional: number;
  you: CheckpointSide;
  enemy: CheckpointSide;
  verdict: 'you' | 'even' | 'enemy';
  driver: string;
}

export interface MatchupReport {
  checkpoints: CheckpointReport[];
  spikes: { you: SpikeEntry[]; enemy: SpikeEntry[] };
  flags: string[];
  gameplan: string;
}

export function matchupCheckpoints(
  you: { kit: HeroKit; build: Item[]; role: string },
  enemy: { kit: HeroKit; build: Item[]; role: string },
  cal: Calibration = loadCalibration(),
): MatchupReport {
  const minutes = cal.checkpoints.table.map((r) => r.minute);
  const yourOrder = orderBuild(you.kit, you.build, 13, cal);
  const enemyOrder = orderBuild(enemy.kit, enemy.build, 13, cal);

  const checkpoints: CheckpointReport[] = minutes.map((minute) => {
    const level = levelAtMinute(minute, cal);
    const yourGold = goldAt(you.role, minute) ?? 0;
    const enemyGold = goldAt(enemy.role, minute) ?? 0;
    const yourItems = affordablePrefix(yourOrder, yourGold);
    const enemyItems = affordablePrefix(enemyOrder, enemyGold);
    const yourDef = defenseOf(you.kit, yourItems, level);
    const enemyDef = defenseOf(enemy.kit, enemyItems, level);

    const yourFx = resolveItemEffects(yourItems, { level, minute });
    const enemyFx = resolveItemEffects(enemyItems, { level, minute });
    const yourDmg = combatDamage(you.kit, yourItems, { level, profile: enemyDef, effects: yourFx }, cal, KILL_WINDOW_SEC);
    const enemyDmg = combatDamage(enemy.kit, enemyItems, { level, profile: yourDef, effects: enemyFx }, cal, KILL_WINDOW_SEC);

    const yourRatio = yourDmg / enemyDef.health;
    const enemyRatio = enemyDmg / yourDef.health;
    const rel = yourRatio / Math.max(enemyRatio, 1e-9);
    const verdict: CheckpointReport['verdict'] = rel > 1 + VERDICT_MARGIN ? 'you' : rel < 1 / (1 + VERDICT_MARGIN) ? 'enemy' : 'even';

    let driver = 'kill threat roughly even';
    if (verdict === 'you') {
      driver = yourRatio >= OPEN_THRESHOLD
        ? `your ${KILL_WINDOW_SEC}s all-in clears their HP (${Math.round(yourRatio * 100)}%)`
        : `you out-threaten them ${Math.round(yourRatio * 100)}% vs ${Math.round(enemyRatio * 100)}% of HP in ${KILL_WINDOW_SEC}s`;
    } else if (verdict === 'enemy') {
      driver = enemyRatio >= OPEN_THRESHOLD
        ? `their ${KILL_WINDOW_SEC}s all-in clears your HP (${Math.round(enemyRatio * 100)}%)`
        : `they out-threaten you ${Math.round(enemyRatio * 100)}% vs ${Math.round(yourRatio * 100)}% of HP in ${KILL_WINDOW_SEC}s`;
    }

    return {
      minute,
      levelProvisional: level,
      you: { gold: yourGold, items: yourItems.map((i) => i.name), hp: Math.round(yourDef.health), killRatio: yourRatio },
      enemy: { gold: enemyGold, items: enemyItems.map((i) => i.name), hp: Math.round(enemyDef.health), killRatio: enemyRatio },
      verdict,
      driver,
    };
  });

  const verdicts = checkpoints.map((c) => c.verdict);
  const early = verdicts.slice(0, 3), late = verdicts.slice(3);
  const yours = (vs: string[]) => vs.filter((v) => v === 'you').length;
  const theirs = (vs: string[]) => vs.filter((v) => v === 'enemy').length;
  let gameplan = 'Even kill threat throughout: this lane is decided by mechanics and wave control, not scaling.';
  if (yours(early) > 0 && theirs(late) > 0) {
    gameplan = 'Your window is early: force trades before their core completes, and do not coin-flip fights past the crossover.';
  } else if (theirs(early) > 0 && yours(late) > 0) {
    gameplan = 'Survive the early checkpoints, concede even trades, and take over once your spike lands.';
  } else if (yours(early) > 0 && theirs(late) === 0 && yours(late) === 0) {
    gameplan = 'Your kill threat peaks early-to-mid: cash it in before their later items level the exchange.';
  } else if (theirs(early) > 0 && yours(late) === 0 && theirs(late) === 0) {
    gameplan = 'Respect their early kill threat; the exchange levels out later, so trade patiently and scale.';
  } else if (theirs(verdicts) === 0 && yours(verdicts) > 0) {
    gameplan = 'You hold the kill-threat edge wherever one exists: play front-foot, but respect jungle attention.';
  } else if (yours(verdicts) === 0 && theirs(verdicts) > 0) {
    gameplan = 'They out-threaten you whenever the lane is not even: treat this as a farm-and-team lane, not a duel.';
  }

  return {
    checkpoints,
    spikes: { you: spikeTimeline(you.role, yourOrder), enemy: spikeTimeline(enemy.role, enemyOrder) },
    flags: [
      'THEORY: unverified combat constants (see calibration checklist)',
      'levels at checkpoints are provisional (no level timeline in the match feed)',
      'crest and consumable gold not yet modeled in affordability',
    ],
    gameplan,
  };
}
