/** Single-source, single-target Noxia event state recovered from GA_Item_Noxia.
 * Events are already filtered eligible damage, with explicit activation identity.
 * This does not infer ability ticks, misses, targets, source ownership or hit delay.
 */
export interface MarkHit { time: number; activationId: string }

export function markedTargetProcCount(
  hits: readonly MarkHit[], markDuration: number, cooldown: number,
): number {
  if (!Number.isFinite(markDuration) || markDuration <= 0
      || !Number.isFinite(cooldown) || cooldown < 0
      || hits.some(h => !Number.isFinite(h.time) || h.time < 0)) {
    throw new Error('Invalid marked-target timeline');
  }
  let markUntil = -Infinity, readyAt = -Infinity, procs = 0;
  const identities = new Set<string>();
  // Stable input order breaks ties. Expiry precedes damage at the same timestamp;
  // native same-frame scheduler ordering still requires game validation.
  for (const hit of [...hits].sort((a, b) => a.time - b.time)) {
    // The Blueprint checks cooldown before adding an identity or applying a mark.
    if (hit.time < readyAt) continue;
    const fresh = !identities.has(hit.activationId);
    identities.add(hit.activationId);
    if (hit.time < markUntil && fresh) {
      procs++;
      readyAt = hit.time + cooldown;
      identities.clear();
      // No mark removal is present in the recovered damage branch.
    } else {
      // Both an unmarked target and a repeated identity take the stack branch.
      markUntil = hit.time + markDuration;
    }
  }
  return procs;
}
