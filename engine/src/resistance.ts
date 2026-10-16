/** Static shared-damage trace: negative captured resistance bypasses the
 * reduction/penetration path. Positive resistance reduced below zero is capped.
 * This does not assert that a particular live effect can create negative armor.
 */
export function resistanceMultiplier(captured: number, afterPenetration: number, k = 100): number {
  if (captured < 0) return 2 - k / (k - captured);
  if (captured === 0) return 1;
  return k / (k + Math.max(0, afterPenetration));
}
