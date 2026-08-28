// The general form of the hand-pinned PATCH GATE tests.
//
// Those gates pin one ability each and are only as current as the last person
// to edit them: the Gideon gate pinned 1.14.4 values and passed for five weeks
// against a snapshot that was two patches behind, because the frozen owned data
// it silently fell back to still held exactly those numbers. This checks EVERY
// machine-checkable change the committed patch digests state, so a stale
// catalog fails the harness instead of quietly shipping old math.
//
// Run `npm run patchcheck` to regenerate the report this reads.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadData } from '../src/data.js';

const report = JSON.parse(
  readFileSync(new URL('../../data/aggregates/patch-currency.json', import.meta.url), 'utf8'),
) as {
  totals: { checks: number; applied: number; stale: number; unparsedNoteLines: number };
  staleAgainstPatch: string | null;
  checks: { patch: string; target: string; field: string; stated: { from: string; to: string }; observed: string; verdict: string }[];
};

describe('patch currency', () => {
  it('no stated patch change is still sitting at its pre-patch value', () => {
    const stale = report.checks.filter((c) => c.verdict === 'stale');
    const detail = stale.map((c) => `${c.patch} ${c.target}/${c.field}: notes ${c.stated.from} -> ${c.stated.to}, snapshot ${c.observed}`);
    expect(detail).toEqual([]);
    expect(report.staleAgainstPatch).toBeNull();
  });

  it('the report actually checked something (a silent zero is not a pass)', () => {
    expect(report.totals.checks).toBeGreaterThan(50);
    expect(report.totals.applied).toBeGreaterThan(40);
  });

  it('reports its own blind spot rather than implying full coverage', () => {
    // Most note lines are prose the parser cannot grade. That is fine — what is
    // not fine is counting them as passing, so the count must be carried.
    expect(report.totals.unparsedNoteLines).toBeGreaterThan(0);
  });
});

describe('ability text parsing keeps up with the live catalog', () => {
  const data = loadData();

  it('almost no ability falls back to the frozen pre-1.14 owned scrape', () => {
    // Was 15 across 10 heroes before the clause-scoped parser landed
    // (2026-08-28). A fallback means the sim is running pre-1.14 numbers for
    // that ability, so this ratchets down and must not climb back.
    expect(data.staleFallbacks.length).toBeLessThanOrEqual(1);
  });

  it('abilities whose scaling the sim cannot model are named, not silently zeroed', () => {
    // Terra scales three abilities off her own armor, Sevarog off his own
    // health. The stated damage is taken from the live text; the ratio is
    // dropped and reported, because a dropped ratio understates the kit.
    const stats = new Set(data.unmodeledScalings.map((u) => u.stat));
    expect(data.unmodeledScalings.length).toBeGreaterThan(0);
    expect([...stats].sort()).toEqual(['Armor', 'Health', 'untagged-base']);
    for (const u of data.unmodeledScalings) {
      expect(u.slug, 'every entry names the hero and ability it affects').toBeTruthy();
      expect(u.key).toBeTruthy();
    }
  });

  it('a heal clause is never read as a damage clause', () => {
    // Muriel's Consecrated Ground restores 60-140 Health in one clause and
    // deals 90-210 magical damage in another; the parser must take the damage.
    const q = data.kits.get('muriel')!.abilities.find((a) => a.key === 'PRIMARY')!;
    expect(q.damagePerRank).toEqual([90, 120, 150, 180, 210]);
  });

  it('a resurrect is not read as a nuke', () => {
    // Zinx's ultimate says "If the Target takes lethal DAMAGE ... they Resurrect
    // with 500/900/1300 Health". The clause mentions damage, so a clause-level
    // keyword test books a 1300-damage ability on a revive — which flipped Zinx
    // from a support enchanter to an ability-burst carry when first written.
    // The payload word after the number decides, not the clause.
    const ult = data.kits.get('zinx')!.abilities.find((a) => a.key === 'ULTIMATE')!;
    expect(ult.damagePerRank).toEqual([]);
    expect(ult.healing?.some((h) => h.kind === 'heal')).toBe(true);
  });

  it('a shield payload is not read as damage', () => {
    // Muriel's ult grants a 280/480/680 Shield and deals 100/160/220 on arrival.
    const ult = data.kits.get('muriel')!.abilities.find((a) => a.key === 'ULTIMATE')!;
    expect(ult.damagePerRank).toEqual([100, 160, 220]);
  });

  it('a conditional maximum is not credited as the ability baseline', () => {
    // Wild Rush deals 27-111 normally and "up to" 81-333 inside a charge window.
    const wr = data.kits.get('terra')!.abilities.find((a) => a.key === 'ALTERNATE')!;
    expect(wr.damagePerRank).toEqual([27, 48, 69, 90, 111]);
  });
});
