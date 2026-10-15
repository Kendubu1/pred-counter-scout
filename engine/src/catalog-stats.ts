/** Normalize the provider's hero attributes into the engine's level totals.
 * Attack range is not a level-up gain: shipped curves either repeat the
 * absolute range or put zero after the initial grant. Reject unfamiliar
 * shapes so a future range mechanic cannot silently become cumulative.
 */
export function catalogBaseStat(key: string, values: number[]): number[] {
  if (key === 'attack_range') {
    if (!values.length) return [];
    const base = values[0]!;
    if (!values.slice(1).every((v) => v === 0 || v === base)) {
      throw new Error('Unrecognized attack-range curve; verify its level semantics before importing');
    }
    return [base];
  }
  const scale = key === 'attack_speed' ? 0.01 : 1;
  let run = 0;
  const out = values.map((v) => {
    run += v;
    return Math.round(run * scale * 1e10) / 1e10;
  });
  return out.length && out.every((v) => v === out[0]) ? [out[0]!] : out;
}

/** pred.gg TENACITY currently reports retained CC duration in percent.
 * Installed-client curves and Absolution's in-game shop (25, user confirmed
 * 2026-10-15) establish reduction = 100 - provider value. */
export function catalogItemStat(key: string, value: number): number {
  if (key !== 'tenacity') return value;
  if (value < 0 || value > 100) throw new Error('Invalid tenacity percentage; verify provider units');
  return 100 - value;
}
