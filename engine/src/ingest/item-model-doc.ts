// Renders the human-readable item-effect modeling breakdown from the
// committed data: for every completed item, its base stats, each passive
// split out, the effect primitive it maps to, and a plain sentence on how
// that rolls into the simulator. Always in sync because it is generated.
//   npm run item-model  ->  docs/item-effect-model.md

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEffects } from '../effects.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const raw = JSON.parse(readFileSync(path.join(ROOT, 'data/omeda/items.json'), 'utf8'));
const items = (Array.isArray(raw) ? raw : raw.items) as any[];
const reg = loadEffects();
const clean = (s?: string) => (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// per-kind plain-English "how it rolls into the sim"
function explain(fx: any): string {
  const st = (s: string) => (s || '').replace(/_/g, ' ');
  // shared damage descriptor for the proc kinds (omits zero terms)
  const dmg = () => {
    const parts: string[] = [];
    if (fx.flat) parts.push(`${fx.flat}`);
    if (fx.perLevelFlat) parts.push(`(+${fx.perLevelFlat}/lvl)`);
    if (fx.scalingPct) parts.push(`(+${fx.scalingPct}% ${st(fx.scaleStat)})`);
    if (fx.pctTargetHealth) parts.push(`${parts.length ? '+ ' : ''}${fx.pctTargetHealth}% of target ${fx.healthBasis ?? 'max'} HP`);
    return (parts.join(' ') || 'bonus') + ` ${fx.damageType} damage`;
  };
  switch (fx.kind) {
    case 'stat_flat': return `+${fx.base}${fx.perLevel ? ` (+${fx.perLevel}/level)` : ''} ${st(fx.stat)} — straight into the build's stat totals.`;
    case 'stat_multiplier': return `multiplies ${st(fx.stat)} by ${(1 + fx.pct / 100).toFixed(2)}× before the sim runs.`;
    case 'stat_conversion': return `converts ${fx.pct}% of ${st(fx.from)} into ${st(fx.to)}${fx.consumesSource ? ' (consuming the source)' : ''}.`;
    case 'damage_amp': return `+${fx.pct}% to your ${fx.scope === 'all' ? 'damage' : fx.scope === 'abilities' ? 'ability damage' : fx.scope === 'ultimate' ? 'ultimate damage' : fx.scope}${fx.appliesWhen && fx.appliesWhen !== 'always' ? ` (when ${st(fx.appliesWhen)}, credited at partial uptime)` : ''} — applied as an amp on every qualifying hit.`;
    case 'crit_damage_amp': return `crits deal ${fx.pct}% more — boosts the crit multiplier.`;
    case 'on_hit': return `every basic attack adds ${dmg()}${fx.everyN > 1 ? ` (every ${fx.everyN}${fx.everyN === 2 ? 'nd' : fx.everyN === 3 ? 'rd' : 'th'} hit)` : ''}${fx.icdSeconds ? ` (≤ once / ${fx.icdSeconds}s)` : ''} — rate-capped over the attack window.`;
    case 'on_ability_hit': return `each ability adds ${dmg()}${fx.icdSeconds ? ` (≤ once / ${fx.icdSeconds}s per target)` : ''} — credited per ability in a combo.`;
    case 'haste': return `+${fx.amount} ${fx.scope} haste — shortens the relevant cooldowns.`;
    case 'cooldown_rate': return `${fx.bonus}% faster non-ultimate cooldowns — more casts per fight.`;
    case 'percent_pen': return `${fx.pct}% ${fx.damageType} penetration (multiplicative, 1.14 rule).`;
    case 'flat_pen': return `${fx.amount} flat ${fx.damageType} pen${fx.rampSeconds ? ` (ramps over ${fx.rampSeconds}s)` : ''}.`;
    case 'armor_shred': return `strips ${fx.pct ?? fx.flat}${fx.pct ? '%' : ''} of the target's ${fx.damageType} armor${fx.rampSeconds ? ` (ramps over ${fx.rampSeconds}s)` : ''} — so ALL your ${fx.damageType} damage lands harder.`;
    case 'health_multiplier': return `max health ×${(1 + fx.pct / 100).toFixed(2)} — raises effective HP.`;
    case 'armor_multiplier': return `armor ×${(1 + fx.pct / 100).toFixed(2)} — raises effective HP vs that damage type.`;
    case 'shield_per_fight': return `~${fx.base} shield per fight — counted as effective HP.`;
    case 'anti_heal': return `cuts the target's healing by ${fx.pct}% — matters vs sustain.`;
    case 'as_ramp': return `attack speed ramps +${fx.pctPerSecond}%/s in a fight — credited at mean uptime.`;
    case 'ramp_to_stat': return `stacks up to +${fx.perStack * fx.maxStacks} ${st(fx.stat)} over a fight; credited at ${(fx.meanUptime ?? 0.6) * 100}% mean uptime.`;
    case 'execute': return `below ${fx.thresholdPct}% HP the target is a free kill — credited as ${fx.thresholdPct}% of their max HP as bonus burst.`;
    case 'unmodeled': return `**not modeled** — ${fx.note}`;
    default: return JSON.stringify(fx);
  }
}

const completed = items.filter((i) => (i.total_price ?? 0) >= 2400 && i.slot_type !== 'Crest' && (i.effects?.length));
const modeled: string[] = [], flagged: string[] = [], untouched: string[] = [];
for (const it of completed.sort((a, b) => (b.total_price ?? 0) - (a.total_price ?? 0))) {
  const entry = reg.targets[`item:${it.slug}`];
  const stats = Object.entries(it.stats ?? {}).filter(([, v]) => v).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(', ') || '—';
  let block = `### ${it.display_name}  ·  ${it.total_price}g\n**Base stats:** ${stats}\n\n`;
  const passages = (it.effects ?? []).filter((e: any) => e.menu_description || e.game_description);
  passages.forEach((e: any, i: number) => {
    const cond = clean(e.condition);
    block += `**Passive${passages.length > 1 ? ` ${i + 1}` : ''} — ${e.name}:** ${cond ? `*[${cond}]* ` : ''}${clean(e.menu_description || e.game_description)}\n`;
  });
  if (entry) {
    block += `\n**→ Modeled as:**\n`;
    for (const fx of entry.effects) block += `- \`${fx.kind}\` — ${explain(fx)}\n`;
    if (entry.effects.every((f: any) => f.kind === 'unmodeled')) flagged.push(block); else modeled.push(block);
  } else {
    block += `\n**→ Not yet reviewed** — the sim currently sees only the base stats above.\n`;
    untouched.push(block);
  }
}

const out = `# Item-effect model — reasoning breakdown

Generated from \`data/omeda/items.json\` + \`engine/fixtures/effects.json\`
(\`npm run item-model\`). For every completed item: its base stats, each
passive split out (with the trigger condition), the effect primitive it maps
to, and how that rolls into the simulator. Flat stats are always counted;
this doc is about the **passives**. THEORY until in-game calibration.

**Coverage: ${modeled.length} modeled · ${flagged.length} honestly unmodeled (with reasons) · ${untouched.length} not yet reviewed · ${completed.length} total.**

---

## ✅ Modeled (the sim credits the passive)

${modeled.join('\n---\n\n')}

---

## ⚠️ Honestly unmodeled (out of a single-hero damage sim's scope — reason stated)

${flagged.join('\n---\n\n')}

---

## ⏳ Not yet reviewed (flat-stats-only — on the queue)

${untouched.join('\n---\n\n')}
`;
writeFileSync(path.join(ROOT, 'docs/item-effect-model.md'), out);
console.log(`item-effect-model.md: ${modeled.length} modeled, ${flagged.length} flagged, ${untouched.length} untouched`);
