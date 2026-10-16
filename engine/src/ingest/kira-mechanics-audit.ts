// Mechanic ablations under explicit action scripts, not winning-build claims.
import { readFileSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { loadData } from '../data.js';
import { loadCalibration, effectiveTotals, basicHit, abilityHit, ranksAtLevel, attacksPerSecond } from '../sim.js';
import { resolveItemEffects } from '../effects.js';
import { replayKira, KIRA_REPLAY_LIMITS, KIRA_REPLAY_ITEMS, type ReplayAction } from '../kira-replay.js';

const read = (rel: string) => JSON.parse(readFileSync(new URL(`../../../${rel}`, import.meta.url), 'utf8'));
const catalog = read('data/catalog/heroes.json'), catalogItems = read('data/catalog/items.json');
const source = read('engine/fixtures/kira-mechanics-sources.json').sources;
if (!isDeepStrictEqual(catalog.find((h: any) => h.slug === 'kira').abilities, source.kira.abilities)) throw new Error('Kira source changed: review replay first');
for (const [slug, expected] of Object.entries(source.items)) {
  const item = catalogItems.find((i: any) => i.slug === slug);
  if (!item || !isDeepStrictEqual({ stats: item.stats, effects: item.effects }, expected)) throw new Error(`${slug} source changed: review replay first`);
}
const data = loadData(), cal = loadCalibration(), kit = data.kits.get('kira')!;
const level = 13, ranks = ranksAtLevel(kit, level);
const evidence = read('data/aggregates/predgg-builds.json');
const artifact = read('data/artifacts/kira.json');
const carry = artifact.roles?.find((v: any) => v.role === 'carry' && v.build) ?? artifact;
const cores = [
  { name: 'Current optimizer opening', slugs: carry.build.items.slice(0, 3).map((i: any) => i.slug), games: null, wins: null },
  ...evidence.heroes.kira.map((r: any) => ({ name: r.core.join(' / '), slugs: r.coreSlugs, games: r.n, wins: r.w })),
];
const scenarios = [
  { name: 'Controlled 10-second single-target contact', duration: 10, attacks: [0.2, 2.2, 4.2, 6.2, 8.2], isolated: true },
  { name: 'Interrupted contact: attacks only early and late', duration: 10, attacks: [0.2, 2.2, 7.2, 9.2], isolated: false },
  { name: 'Attack-rate ceiling: uninterrupted contact, zero cast recovery', duration: 10, attacks: [] as number[], isolated: true },
];
const rows = [], skipped = [];
for (const core of cores) {
  const unsupported = core.slugs.filter((s: string) => !(KIRA_REPLAY_ITEMS as readonly string[]).includes(s));
  if (unsupported.length) {
    const limitations = resolveItemEffects(unsupported.map((s: string) => data.itemsBySlug.get(s)!), { level }).unmodeled;
    skipped.push({...core, unsupported, limitations, reason: 'Outside reviewed diagnostic replay coverage'});
    continue;
  }
  const items = core.slugs.map((s: string) => data.itemsBySlug.get(s)!);
  const effects = resolveItemEffects(items, { level });
  const stats = effectiveTotals(items, effects);
  const critMult = Number(cal.constants.critMultiplier?.value ?? 1.75) * (1 + effects.critDamageAmpPct / 100);
  const mercy = kit.abilities.find(a => a.key === 'ALTERNATE')!, dusk = kit.abilities.find(a => a.key === 'PRIMARY')!;
  const mr = ranks.get('ALTERNATE') ?? 0, dr = ranks.get('PRIMARY') ?? 0;
  const cells = [];
  for (const scenario of scenarios) {
    const actions: ReplayAction[] = [];
    // Attempts are a declared input policy, not inferred player execution.
    // Both builds get the same cast/attack opportunities; AS differences are
    // intentionally not translated into additional attacks in this diagnostic.
    for (let time = 0; time < scenario.duration; time += 0.5) {
      if (scenario.name.startsWith('Interrupted') && time > 2.5 && time < 7) continue;
      actions.push({ time, kind: 'cast', ability: 'ALTERNATE', cooldown: mercy.cooldowns[mr - 1]! / (1 + stats.ability_haste / 100) });
      actions.push({ time: time + 0.01, kind: 'hit', source: 'mercy', raw: abilityHit(mercy, mr, stats) });
      if (time >= 2) {
        actions.push({ time: time + 0.02, kind: 'cast', ability: 'PRIMARY', cooldown: dusk.cooldowns[dr - 1]! / (1 + stats.ability_haste / 100) });
        actions.push({ time: time + 0.03, kind: 'hit', source: 'dusk', raw: [45, 65, 85, 105, 125][dr - 1]!, duskPerStack: [6, 8, 10, 12, 14][dr - 1]! + stats.physical_power * 0.12 });
      }
    }
    const aps = attacksPerSecond(kit, level, stats, 3);
    const attackTimes = scenario.name.startsWith('Attack-rate')
      ? Array.from({ length: Math.ceil((scenario.duration - 0.2) * aps) }, (_, i) => 0.2 + i / aps).filter(t => t < scenario.duration)
      : scenario.attacks;
    for (const time of attackTimes) actions.push({ time, kind: 'hit', source: 'basic', raw: basicHit(kit, level, stats, 1) });
    actions.sort((a, b) => a.time - b.time);
    if (attacksPerSecond(kit, level, stats, 3) < 0.5) throw new Error('Script attacks too quickly for this build');
    const run = (disabled: string[]) => {
      // Stratified crit outcomes, identical roll schedule across builds and
      // ablations. This is sensitivity sampling, not a measured combat average.
      let damage = 0, healing = 0;
      let representative: ReturnType<typeof replayKira> | undefined;
      for (let sample = 0; sample < 100; sample++) {
        const script = actions.map((a, i) => a.kind === 'hit'
          ? { ...a, critical: ((sample + i * 37) % 100) < stats.critical_chance } : a);
        const result = replayKira(script, { level, duration: scenario.duration, health: 10000, armor: 85, maxMana: 1000,
          bonusPower: stats.physical_power, flatPen: stats.physical_penetration, critMultiplier: critMult,
          lifesteal: stats.lifesteal, items: core.slugs, isolated: scenario.isolated, disabled });
        damage += result.damage / 100; healing += result.potentialHealing / 100;
        if (sample === 0) representative = result;
      }
      return { damage, potentialHealing: healing, representative };
    };
    const full = run([]);
    const ablations = ['nevermore', 'vengeance', ...core.slugs.filter((s: string) => ['solaris', 'ashbringer', 'ruination', 'deathstalker', 'viper', 'manta-scythe'].includes(s))]
      .map((effect: string) => { const without = run([effect]); return { effect, damageWithout: without.damage, marginalDamage: full.damage - without.damage,
        healingWithout: without.potentialHealing }; });
    cells.push({ scenario: scenario.name, damage: full.damage, potentialHealing: full.potentialHealing, ablations,
      representativeTrace: full.representative!.trace, finalCooldowns: full.representative!.ready });
  }
  rows.push({ ...core, items: items.map((i: any) => i.name), gold: items.reduce((n: number, i: any) => n + i.totalPrice, 0), cells });
}
const report = { generatedAt: new Date().toISOString(), status: 'diagnostic-only', level,
  evidenceSource: evidence.source, evidenceDate: evidence.generatedAt,
  target: { health: 10000, physicalArmor: 85, maxMana: 1000 },
  method: '100 stratified crit sequences; high-health diagnostic target; three-item cores with actual costs. First two scenarios fix attack opportunities to isolate mechanics. Third uses each build attack rate with zero cast recovery: an optimistic contact ceiling, not a feasible measured combo. No Purge or Dash. Ablations retain item stats and stat conversions; only replay event behavior is disabled. Deltas interact and must not be added together. Removing Vengeance also removes Dusk eligibility.',
  limitations: KIRA_REPLAY_LIMITS, skipped, rows };
writeFileSync(new URL('../../../data/aggregates/kira-mechanics-audit.json', import.meta.url), JSON.stringify(report, null, 1) + '\n');
for (const row of rows) console.log(JSON.stringify({ name: row.name, cells: row.cells.map((c: any) => ({ scenario: c.scenario,
  damage: Math.round(c.damage), healing: Math.round(c.potentialHealing), ablations: c.ablations.map((a: any) => ({ effect: a.effect, damage: Math.round(a.marginalDamage) })) })) }));
