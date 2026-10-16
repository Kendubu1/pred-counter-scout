/** Diagnostic event replay. Deliberately separate from the production optimizer.
 * Callers supply hit times, raw payloads, cooldowns and crit outcomes. This does
 * not invent cast animations, Purge ticks, attack resets or target movement.
 */
export type ReplayAction =
  | { time: number; kind: 'cast'; ability: string; cooldown: number; channel?: number }
  | { time: number; kind: 'hit'; source: 'basic' | 'mercy' | 'dusk' | 'purge'; raw: number; critical?: boolean; duskPerStack?: number };

export interface ReplayOptions {
  level: number; duration: number; health: number; armor: number; maxMana: number;
  bonusPower: number; flatPen: number; critMultiplier: number; lifesteal: number;
  items: string[]; isolated: boolean;
  disabled?: string[];
}

export const KIRA_REPLAY_LIMITS = [
  'Controlled action replay, not a fight policy or win-probability model. Hit times/raw payloads/crit outcomes are explicit scenario inputs.',
  'Vengeance and shred stacks refresh together; damage uses pre-hit stacks, then applies new stacks. Trigger ordering needs gameplay confirmation.',
  'Secondary item/passive packets do not recursively trigger stack effects. Purge tick count and per-tick triggers are not inferred.',
  'Solaris uses the triggering hit critical outcome. Ashbringer reduces active non-ultimate cooldowns on each basic or Mercy hit. Native EventDataFloat scaling remains assumed to be one; nonbasic critical/Purge triggers remain omitted.',
  'Ruination drains uniformly over four seconds; refresh extends the existing drain rate. Tick cadence and refresh behavior require gameplay confirmation.',
  'Power ratios use the current engine bonus-power basis. Healing is potential output, not effective healing or shield value.',
  'Knell, augments, Dash power/reset stacks, actor mana budgets, projectile travel, attack animations, misses, incoming damage and target healing are excluded.',
  'All Tainted Rounds on-hit damage, anti-heal value, Terminus overheal shields and Manta farming stacks remain omitted.',
];

export function replayKira(actions: ReplayAction[], opts: ReplayOptions) {
  const supported = new Set(['deathstalker', 'viper', 'manta-scythe', 'solaris', 'ashbringer', 'imperator', 'ruination', 'terminus', 'vanquisher', 'tainted-rounds']);
  for (const item of opts.items) if (!supported.has(item)) throw new Error(`Item outside reviewed replay coverage: ${item}`);
  if (!Number.isInteger(opts.level) || opts.level < 1 || opts.level > 18 || opts.duration < 0 || opts.health <= 0 || opts.maxMana < 0) throw new Error('Invalid replay inputs');
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i]!;
    if (!Number.isFinite(a.time) || a.time < 0 || a.time > opts.duration || (i && a.time < actions[i - 1]!.time)) throw new Error('Actions must be ordered within duration');
    if (a.kind === 'hit' && (a.raw < 0 || !Number.isFinite(a.raw))) throw new Error('Invalid damage');
    if (a.kind === 'cast' && (a.cooldown < 0 || !Number.isFinite(a.cooldown) || (a.channel ?? 0) < 0)) throw new Error('Invalid cooldown/channel');
  }
  const enabled = (key: string) => !opts.disabled?.includes(key);
  const owns = (key: string) => opts.items.includes(key) && enabled(key);
  const ready: Record<string, number> = {}, pending = new Set<string>();
  const trace: { time: number; source: string; damage: number; healing: number; detail?: string }[] = [];
  let hp = opts.health, mana = opts.maxMana, healing = 0, now = 0, channelUntil = 0;
  let vengeance = 0, vengeanceUntil = -1, death = 0, deathUntil = -1, viper = 0, viperUntil = -1;
  let ravenReady = 0, spellReady = 0, spellUntil = -1, ruinReady = 0, ruinUntil = -1, ruinRate = 0;
  const expired = (time: number) => {
    if (time >= vengeanceUntil) vengeance = 0;
    if (time >= deathUntil) death = 0;
    if (time >= viperUntil) viper = 0;
  };
  const deal = (time: number, source: string, raw: number, type: 'physical' | 'true', canLeech = false, abilityOrOnHit = false) => {
    if (hp <= 0 || raw <= 0) return 0;
    const armor = Math.max(0, (Math.max(0, opts.armor - death * 3) * (1 - viper * 0.045)) - opts.flatPen);
    const amp = (1 + vengeance * 0.0075) * (owns('manta-scythe') && opts.isolated ? 1.08 : 1)
      * (owns('viper') && viper === 6 && abilityOrOnHit ? 1.1 : 1);
    const damage = Math.min(hp, raw * amp * (type === 'true' ? 1 : 100 / (100 + armor)));
    hp -= damage;
    const healed = canLeech ? damage * opts.lifesteal / 100 : 0;
    healing += healed; trace.push({ time, source, damage, healing: healed });
    if (owns('vanquisher') && hp > 0 && hp < opts.health * 0.05) {
      trace.push({ time, source: 'Vanquisher execute', damage: hp, healing: 0 }); hp = 0;
    }
    return damage;
  };
  const advance = (time: number) => {
    // Split the continuous bleed approximation at stack expiries.
    const boundaries = [...new Set([now, time, ruinUntil, vengeanceUntil, deathUntil, viperUntil])]
      .filter(t => t >= now && t <= time).sort((a, b) => a - b);
    for (let i = 1; i < boundaries.length; i++) {
      const from = boundaries[i - 1]!, to = boundaries[i]!;
      expired(from);
      if (from < ruinUntil && hp > 0) {
        const drain = Math.min(mana, ruinRate * (Math.min(to, ruinUntil) - from));
        mana -= drain; deal(to, 'Ruination bleed', drain * 0.8, 'true', false, true);
      }
    }
    expired(time); now = time;
    if (channelUntil > 0 && time >= channelUntil) { pending.delete('ULTIMATE'); channelUntil = 0; }
  };
  for (const action of actions) {
    advance(action.time);
    if (hp <= 0) break;
    if (action.kind === 'cast') {
      if (action.time < channelUntil || action.time < (ready[action.ability] ?? 0)) {
        trace.push({ time: action.time, source: 'blocked cast', damage: 0, healing: 0, detail: action.ability }); continue;
      }
      ready[action.ability] = action.time + action.cooldown;
      pending.add(action.ability);
      if (action.channel) channelUntil = action.time + action.channel;
      if (owns('solaris') && action.time >= spellReady) {
        spellUntil = action.time + 4;
      }
      trace.push({ time: action.time, source: 'cast', damage: 0, healing: 0, detail: action.ability });
      continue;
    }
    if (action.time < channelUntil && action.source !== 'purge') {
      trace.push({ time: action.time, source: 'blocked hit during channel', damage: 0, healing: 0, detail: action.source }); continue;
    }
    const onHit = action.source === 'basic' || action.source === 'mercy';
    const ability = action.source !== 'basic';
    const key = { mercy: 'ALTERNATE', dusk: 'PRIMARY', purge: 'ULTIMATE', basic: '' }[action.source];
    if (ability && !pending.has(key)) {
      trace.push({ time: action.time, source: 'blocked hit without cast', damage: 0, healing: 0, detail: action.source }); continue;
    }
    if (ability && !(action.source === 'purge' && action.time < channelUntil)) pending.delete(key);
    if (action.source === 'dusk' && vengeance === 0) {
      trace.push({ time: action.time, source: 'Dusk without afflicted target', damage: 0, healing: 0 }); continue;
    }
    const critical = action.critical && action.source !== 'dusk' ? opts.critMultiplier : 1;
    const perStack = enabled('vengeance') ? (action.duskPerStack ?? 0) * vengeance : 0;
    const before = hp;
    const damage = deal(action.time, action.source, (action.raw + perStack) * critical, 'physical', onHit || action.source === 'purge', ability);
    if (onHit && enabled('nevermore') && action.time >= ravenReady && hp > 0) {
      // Captured pre-hit health; sensitivity to ordering is an explicit limitation.
      deal(action.time, 'Nevermore', before * 0.07, 'physical', false, true);
      ravenReady = action.time + (15 - 0.5 * (opts.level - 1));
    }
    if (onHit && owns('solaris') && action.time < spellUntil && action.time >= spellReady && hp > 0) {
      const index = trace.length;
      const dealt = deal(action.time, 'Solaris', (45 + opts.bonusPower * 0.35) * critical, 'physical', false, true);
      healing += dealt * 0.5;
      trace[index]!.healing += dealt * 0.5;
      spellUntil = -1; spellReady = action.time + 1.5;
    }
    if (onHit && owns('ashbringer')) {
      for (const key of Object.keys(ready)) {
        if (key === 'ULTIMATE' || ready[key]! <= action.time) continue;
        ready[key] = action.time + (ready[key]! - action.time) * (1 - (action.critical ? 0.12 : 0.08));
      }
    }
    if (onHit && owns('ruination') && action.time >= ruinReady) {
      ruinRate = (30 + opts.maxMana * 0.08) / 4; ruinUntil = action.time + 4; ruinReady = action.time + 15;
    } else if (ability && owns('ruination') && action.time < ruinUntil) ruinUntil = action.time + 4;
    if (damage > 0) {
      if (enabled('vengeance') && (action.source === 'basic' || ability)) { vengeance += action.source === 'mercy' ? 3 : 1; vengeanceUntil = action.time + 3.5; }
      if (owns('deathstalker') && onHit) { death = Math.min(4, death + 1); deathUntil = action.time + 3; }
      if (owns('viper')) { viper = Math.min(6, viper + 1); viperUntil = action.time + 3; }
    }
  }
  advance(opts.duration);
  return { damage: opts.health - hp, potentialHealing: healing, remainingHealth: hp, remainingMana: mana,
    ready, trace, limitations: KIRA_REPLAY_LIMITS };
}
