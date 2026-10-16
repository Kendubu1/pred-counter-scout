/** Diagnostic Momentum movement grant from a single native sampling callback.
 * Caller supplies successive sampled world positions. This does not schedule
 * callbacks, account for hit grants, apply native effects or predict procs.
 * GA_Item_Shared_Energized VM 4331/4377/4423: trunc(distance / 50).
 */
export function momentumMovementGrant(from: readonly number[], to: readonly number[]): number {
  if (from.length !== 3 || to.length !== 3 || ![...from, ...to].every(Number.isFinite)) {
    throw new Error('Momentum requires finite three-dimensional positions');
  }
  const distance = Math.hypot(to[0]! - from[0]!, to[1]! - from[1]!, to[2]! - from[2]!);
  if (!Number.isFinite(distance)) throw new Error('Invalid Momentum displacement');
  return Math.trunc(distance / 50);
}
