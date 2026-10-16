/** Recovered Malice state transitions, diagnostic only. Callers supply native
 * recharge events and resolved scalars; no timer phase or defaults are guessed.
 * Output is raw set-by-caller magnitude, not mitigated damage or a win estimate.
 */
export type MaliceEvent =
  | { kind: 'activate' | 'recharge' | 'takedown' }
  | { kind: 'damage'; hero: boolean; tags: string[]; magicalPower: number };
export function replayMalice(events: MaliceEvent[], scalars: {
  maxStacks: number; damagePerStack: number; scalingPerStack: number;
}) {
  const { maxStacks, damagePerStack, scalingPerStack } = scalars;
  if (!Number.isInteger(maxStacks) || maxStacks < 0 ||
      ![damagePerStack, scalingPerStack].every(n => Number.isFinite(n) && n >= 0)) {
    throw new Error('Invalid resolved Malice scalars');
  }
  let stacks = 0, active = false;
  const packets: { event: number; stacks: number; rawMagnitude: number }[] = [];
  // Native HasAnyTags(..., false) includes descendants of the queried tag.
  const has = (tags: string[], root: string) => tags.some(t => t === root || t.startsWith(root + '.'));
  for (const [event, e] of events.entries()) {
    if (e.kind === 'activate') { active = true; stacks = maxStacks; continue; }
    if (!active) throw new Error('Malice must be activated before events');
    if (e.kind === 'recharge') { stacks = Math.min(maxStacks, stacks + 1); continue; }
    if (e.kind === 'takedown') { stacks = maxStacks; continue; }
    if (e.kind !== 'damage') continue;
    if (!Number.isFinite(e.magicalPower) || e.magicalPower < 0) throw new Error('Invalid magical power');
    if (!e.hero || has(e.tags, 'GameplayEffect.Item') || has(e.tags, 'GameplayEffect.ProcDamage')) continue;
    if (!['AbilityDamage', 'PhysicalDamage', 'TrueDamage'].some(t => has(e.tags, 'GameplayEffect.' + t))) continue;
    packets.push({ event, stacks, rawMagnitude: stacks * (damagePerStack + scalingPerStack * e.magicalPower) });
    stacks = 0;
  }
  return { stacks, packets };
}
