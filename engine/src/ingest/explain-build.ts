// "Why this build wins" — leave-one-out attribution on a FIXED build (e.g. a
// high-winrate field build), annotated with each item's modeled passive so the
// reasoning is grounded in the effect schema, not hand-waved. Usage:
//   npm run explain -- <hero-slug> --items slug1,slug2,... [--role midlane] [--level 13]
// THEORY: all numbers are simulator output on unverified constants.
import { loadData, completedItems } from '../data.js';
import { loadCalibration, evaluateBuild } from '../sim.js';
import { loadEffects } from '../effects.js';
import type { Item } from '../types.js';

const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith('--'));
const strOpt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const itemSlugs = (strOpt('items') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const role = strOpt('role') ?? 'midlane';
const level = Number(strOpt('level') ?? 13);

if (!slug || itemSlugs.length === 0) {
  console.error('usage: npm run explain -- <hero-slug> --items slug1,slug2,... [--role midlane] [--level 13]');
  process.exit(1);
}

const data = loadData();
const cal = loadCalibration();
const reg = loadEffects();
const kit = data.kits.get(slug);
if (!kit) { console.error(`no kit for ${slug}`); process.exit(1); }

const bySlug = new Map<string, Item>(completedItems(data).map((i) => [i.slug, i]));
const items = itemSlugs.map((s) => { const it = bySlug.get(s); if (!it) { console.error(`unknown item slug: ${s}`); process.exit(1); } return it!; });

// Which objectives matter for this role (mirrors search.ts COMBAT/SUPPORT split).
const COMBAT = ['burstVsSquishy', 'rot10VsSquishy', 'rot20VsBruiser', 'autoDps10VsSquishy', 'ehpPhysical', 'ehpMagical', 'sustain10s'] as const;
const SUPPORT = ['rot10VsSquishy', 'ehpPhysical', 'ehpMagical', 'healShield10s', 'utility'] as const;
const keys = role === 'support' ? SUPPORT : COMBAT;
const LABEL: Record<string, string> = {
  burstVsSquishy: 'burst', rot10VsSquishy: 'skirmish (10s)', rot20VsBruiser: 'extended (20s)',
  autoDps10VsSquishy: 'auto DPS', ehpPhysical: 'phys eHP', ehpMagical: 'magic eHP',
  sustain10s: 'drain sustain', healShield10s: 'heal+shield', utility: 'utility',
};

const base = evaluateBuild(kit, items, level, cal);
// the build's headline objective = the combat objective it scores highest on,
// normalised so eHP (big numbers) doesn't always win — rank by leave-one-out swing instead.
function obj(b: typeof base, k: string): number { return (b.objectives as Record<string, number>)[k] ?? 0; }
const lab = (k: string) => LABEL[k] ?? k;

// passive reasoning for an item, from the effect registry
function passiveOf(itSlug: string): { modeled: boolean; line: string } {
  const e = reg.targets[`item:${itSlug}`];
  if (!e) return { modeled: false, line: 'no effect entry — flat stats only to the sim' };
  const real = e.effects.filter((f) => f.kind !== 'unmodeled');
  const kinds = real.map((f) => f.kind);
  if (real.length === 0) {
    const note = (e.effects[0] as { note?: string }).note ?? '';
    return { modeled: false, line: `passive unmodeled — ${note}` };
  }
  return { modeled: true, line: `${e.name.split(' / ').slice(1).join(' / ') || e.name}: ${e.sourceText}  [${kinds.join(', ')}]` };
}

console.log(`# Why this build wins — ${kit.name} (${role}, level ${level})`);
console.log(`build: ${items.map((i) => i.name).join(' > ')}  ·  ${base.gold}g`);
console.log(`confidence: THEORY (sim-only). objectives scored for ${role}: ${keys.map((k) => lab(k)).join(', ')}`);
console.log(`\nfull-build objectives:`);
for (const k of keys) console.log(`  ${lab(k).padEnd(16)} ${obj(base, k).toFixed(0)}`);

// Leave-one-out: drop each item, measure the objective swing it was responsible for.
console.log(`\nper-item contribution (leave-one-out) + the reasoning from its passive:\n`);
type Row = { name: string; slug: string; gold: number; deltas: Record<string, number>; top: string; topPct: number; reason: { modeled: boolean; line: string } };
const rows: Row[] = [];
for (let i = 0; i < items.length; i++) {
  const it = items[i]!;
  const without = items.filter((_, j) => j !== i);
  const ev = evaluateBuild(kit, without, level, cal);
  const deltas: Record<string, number> = {};
  let top: string = keys[0]!, topPct = -Infinity;
  for (const k of keys) {
    const full = obj(base, k), red = obj(ev, k);
    const pct = full > 0 ? ((full - red) / full) * 100 : 0;
    deltas[k] = pct;
    if (pct > topPct) { topPct = pct; top = k; }
  }
  rows.push({ name: it.name, slug: it.slug, gold: it.totalPrice, deltas, top, topPct, reason: passiveOf(it.slug) });
}
// order by their biggest single-objective swing
rows.sort((a, b) => b.topPct - a.topPct);
for (const r of rows) {
  const flag = r.reason.modeled ? '✅' : '⚠️ ';
  console.log(`${flag} ${r.name}  (${r.gold}g)  — carries ${r.topPct.toFixed(0)}% of ${lab(r.top)}`);
  // show the next two objectives it moves most
  const others = keys.filter((k) => k !== r.top).map((k) => [k, r.deltas[k] ?? 0] as const).sort((a, b) => b[1] - a[1]).slice(0, 2)
    .filter(([, p]) => p >= 1).map(([k, p]) => `${lab(k)} +${p.toFixed(0)}%`);
  if (others.length) console.log(`     also: ${others.join(', ')}`);
  console.log(`     ${r.reason.line}`);
  console.log('');
}

const unmodeled = rows.filter((r) => !r.reason.modeled);
if (unmodeled.length) {
  console.log(`note: ${unmodeled.length}/${rows.length} items in this winning build are NOT modeled on their passive`);
  console.log(`(${unmodeled.map((r) => r.name).join(', ')}) — their contribution above reflects flat stats only, so`);
  console.log(`the sim under-credits them and can't fully justify why the field buys them.`);
}
