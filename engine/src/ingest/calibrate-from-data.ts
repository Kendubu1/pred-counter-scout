// Calibration from live data: what the match feed can tell us about the
// unverified combat constants, without a practice-mode session.
//
//   npm run calibrate -- [--pages 40]
//
// 1. critMultiplier: each player's largest_critical_strike divided by
//    their predicted maximum non-crit basic hit (final level + final
//    inventory). The upper envelope of that ratio across thousands of
//    players is the crit multiplier (crits against the squishiest,
//    least-mitigated targets approach the pre-mitigation ceiling).
//    Computed under BOTH ability-scaling bases (bonus-only vs total
//    power): whichever base produces the sharper, more consistent
//    envelope is itself evidence for that base.
// 2. mitigation: total_damage_mitigated / (taken + mitigated) per player,
//    bucketed by estimated final armor, fit to share = A / (A + K).
//    K near 100 supports the assumed formula. Shields and damage-
//    reduction effects pollute "mitigated", so this is evidence, not
//    proof; the report says which.

import { loadData } from '../data.js';

const UA = { 'User-Agent': 'pred-counter-scout (github.com/Kendubu1/pred-counter-scout)' };
const MODES = new Set(['pvp', 'ranked']);

interface FeedPlayer {
  team: string; hero_id: number; level: number | null;
  inventory_data: number[] | null;
  largest_critical_strike: number | null;
  total_damage_taken: number | null;
  total_damage_mitigated: number | null;
}

const args = process.argv.slice(2);
const opt = (name: string, dflt: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : dflt;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
}

async function main() {
  const pages = opt('pages', 40);
  const data = loadData();
  const byGameId = new Map<number, ReturnType<typeof data.itemsBySlug.get>>();
  for (const i of data.items.values()) if (i.gameId != null) byGameId.set(i.gameId, i);
  const kitById = new Map<number, NonNullable<ReturnType<typeof data.kits.get>>>();
  {
    // omeda heroes.json ids -> kits
    const omeda = (await import('node:fs')).readFileSync;
    const heroes = JSON.parse(omeda(new URL('../../../data/omeda/heroes.json', import.meta.url), 'utf8')) as { id: number; slug: string }[];
    for (const h of heroes) {
      const kit = data.kits.get(h.slug);
      if (kit) kitById.set(h.id, kit);
    }
  }

  const ts = Math.floor(Date.now() / 1000) - 36 * 3600;
  let url: string | null = `https://omeda.city/matches.json?per_page=100&timestamp=${ts}`;
  const critRatiosBonus: number[] = [];
  const critRatiosTotal: number[] = [];
  const mitBuckets = new Map<number, { share: number[]; armor: number[] }>();
  let page = 0, used = 0;

  while (url && page < pages) {
    const res = await fetch(url, { headers: UA });
    if (!res.ok) { await sleep(2000); continue; }
    const body = (await res.json()) as { matches: { game_mode: string; players: FeedPlayer[] }[]; cursor: string | null };
    page++;
    for (const m of body.matches ?? []) {
      if (!MODES.has(m.game_mode)) continue;
      for (const p of m.players ?? []) {
        const kit = kitById.get(p.hero_id);
        const level = p.level ?? 0;
        if (!kit || level < 10 || !Array.isArray(p.inventory_data)) continue;
        const items = p.inventory_data.map((id) => byGameId.get(id)).filter((x): x is NonNullable<typeof x> => !!x);
        const pp = items.reduce((s, i) => s + i.stats.physical_power, 0);
        const critChance = items.reduce((s, i) => s + i.stats.critical_chance, 0);
        const base = kit.baseStats.physical_power[level - 1] ?? 0;

        // crit envelope: needs real crit chance and a physical hero
        if (critChance >= 20 && p.largest_critical_strike && p.largest_critical_strike > 50) {
          const predBonus = base + (kit.basicScalingPct / 100) * pp;
          const predTotal = (base + pp) * (kit.basicScalingPct / 100) + base; // total-power reading
          if (predBonus > 0) critRatiosBonus.push(p.largest_critical_strike / predBonus);
          if (predTotal > 0) critRatiosTotal.push(p.largest_critical_strike / predTotal);
          used++;
        }

        // mitigation share vs estimated final armor
        if (p.total_damage_taken && p.total_damage_mitigated != null && p.total_damage_taken > 1000) {
          const armor =
            ((kit.baseStats.physical_armor[level - 1] ?? 0) + (kit.baseStats.magical_armor[level - 1] ?? 0)) / 2 +
            items.reduce((s, i) => s + (i.stats.physical_armor + i.stats.magical_armor) / 2, 0);
          const share = p.total_damage_mitigated / (p.total_damage_taken + p.total_damage_mitigated);
          const bucket = Math.round(armor / 20) * 20;
          let b = mitBuckets.get(bucket);
          if (!b) { b = { share: [], armor: [] }; mitBuckets.set(bucket, b); }
          b.share.push(share);
          b.armor.push(armor);
        }
      }
    }
    url = body.cursor ? `https://omeda.city/matches.json?per_page=100&timestamp=${ts}&cursor=${encodeURIComponent(body.cursor)}` : null;
    await sleep(150);
  }

  console.log(`sample: ${page} pages, ${used} crit-capable players\n`);
  for (const [label, arr] of [['bonus-only scaling', critRatiosBonus], ['total-power scaling', critRatiosTotal]] as const) {
    const s = [...arr].sort((a, b) => a - b);
    console.log(`crit ratio (${label}): n=${s.length} p50=${quantile(s, 0.5).toFixed(2)} p90=${quantile(s, 0.9).toFixed(2)} p97=${quantile(s, 0.97).toFixed(2)} p99=${quantile(s, 0.99).toFixed(2)} p99.5=${quantile(s, 0.995).toFixed(2)}`);
    const hist = new Map<string, number>();
    for (const r of s) {
      if (r < 0.8 || r > 3) continue;
      const k = (Math.round(r * 10) / 10).toFixed(1);
      hist.set(k, (hist.get(k) ?? 0) + 1);
    }
    const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    console.log(`  densest ratio bins: ${top.map(([k, n]) => `${k}(${n})`).join(' ')}`);
  }

  console.log('\nmitigation share by estimated final armor (fit: share = A/(A+K)):');
  const rows = [...mitBuckets.entries()].filter(([, b]) => b.share.length >= 50).sort((a, b) => a[0] - b[0]);
  const ks: number[] = [];
  for (const [bucket, b] of rows) {
    const meanShare = b.share.reduce((s, x) => s + x, 0) / b.share.length;
    const meanArmor = b.armor.reduce((s, x) => s + x, 0) / b.armor.length;
    const k = meanShare > 0 && meanShare < 1 ? (meanArmor * (1 - meanShare)) / meanShare : NaN;
    if (Number.isFinite(k)) ks.push(k);
    console.log(`  armor~${String(bucket).padStart(3)}: share=${(meanShare * 100).toFixed(1)}% n=${b.share.length} -> implied K=${k.toFixed(0)}`);
  }
  const ksSorted = ks.sort((a, b) => a - b);
  console.log(`implied K median: ${quantile(ksSorted, 0.5).toFixed(0)} (assumed formula says K=100; shields/DR effects bias K upward)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
