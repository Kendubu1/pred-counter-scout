/** Count a fixed-cooldown proc on already eligible, successfully delivered events.
 * Readiness alone never generates a proc. Equal-time events share the cooldown.
 * This does not model cooldown reductions, delivery delays or event eligibility.
 */
export function fixedCooldownProcCount(times: readonly number[], cooldown: number): number {
  if (!Number.isFinite(cooldown) || cooldown < 0
      || times.some(time => !Number.isFinite(time) || time < 0)) {
    throw new Error('Invalid fixed-cooldown timeline');
  }
  if (cooldown === 0) return times.length;
  let readyAt = -Infinity, count = 0;
  for (const time of [...times].sort((a, b) => a - b)) {
    if (time < readyAt) continue;
    count++;
    readyAt = time + cooldown;
  }
  return count;
}
