// Counter reactions: do players buy the counter item when the game calls for
// it, and at which item? Every counter the guides name that the catalog can
// express, measured on the Fork PoC extract, with match-bootstrap error bars.
// Evidence for the Climb page (ui/v6/climb.html section 5). Zero-API.
//
//   npx tsx src/ingest/counter-reactions.ts      -> data/aggregates/counter-reactions.json
//
// Each check compares the SAME hero-role at the SAME item slot (and, for
// scoreboard checks, the same 5-minute window) between games where the counter
// is called for (A) and games where it is not (B): per 100 buys, how many
// are the counter. Group rates are weighted by the smaller side. This measures
// what players DO, not whether it wins (docs/fork-in-the-road.md section 14).
//
// Contexts are knowable when the item is bought: lane opponent / enemy team
// typical damage, healing and CC (draft), enemy items already completed
// (scoreboard), own team gold at the decision (state). Never what the team
// realized in the match (that leaks the result).
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bucketOf, goldAt, learnLabels, quantileCuts, rng, SLOT1_DECISION_S, type ForkMatch } from '../forks.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DIR = path.join(ROOT, 'engine/copy-tasks/fork-poc');
const OUT = path.join(ROOT, 'data/aggregates/counter-reactions.json');
const BOOT = Number(process.env.BOOT ?? 100);
const PLAT_TIER = 3;
// Hard CC as tagged in the ability text (<CC_Text>). Slows are excluded.
const HARD_CC = /^(Stuns?|Stunned|Roots?|Rooted|Knocks? Up|Knocked Up|Knocks? Back|Pushes( Back)?|Pulls?|Pulling|Suppress(es)?|Taunts?|Fears?|Mesmerizes?|Silences?|Interrupts|Immobiliz(ing|es|ed))$/;

interface Row { m: number; plat: boolean; slot: number; group: string; side: 'A' | 'B'; bought: boolean; min: number }
interface Check { id: string; label: string; counter: string; whenA: string; whenB: string; rows: Row[] }

function main() {
  const matches = readFileSync(path.join(DIR, 'rows.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as ForkMatch);
  const tiers = JSON.parse(readFileSync(path.join(DIR, 'ladder.json'), 'utf8')) as Record<string, number>;
  const items = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/items.json'), 'utf8')) as { slug: string; display_name: string; rarity: string | null; slot_type: string | null; stats: Record<string, number>; effects: { menu_description?: string }[] }[];
  const heroes = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/heroes.json'), 'utf8')) as { slug: string; abilities: { game_description?: string }[] }[];
  const epic = items.filter((i) => i.rarity === 'Epic' && i.slot_type === 'Passive');
  const text = (i: (typeof epic)[number]) => i.effects.map((e) => (e.menu_description ?? '').replace(/<[^>]+>/g, '')).join(' ');
  const set = (f: (i: (typeof epic)[number]) => boolean) => new Set(epic.filter(f).map((i) => i.slug));
  const MR = set((i) => !!i.stats.magical_armor && !i.stats.physical_armor);
  const PA = set((i) => !!i.stats.physical_armor && !i.stats.magical_armor);
  const ANY_ARMOR = set((i) => !!i.stats.physical_armor || !!i.stats.magical_armor);
  const ANTI_HEAL = set((i) => /Reduce (the|their)[^.]*Healing/i.test(text(i)));
  const ARMOR_SHRED = set((i) => /(Reduce|Shred)[^.]*Physical Armor|Ignore \d+% of (Bonus )?Physical Armor/i.test(text(i)));
  const MAGIC_SHRED = set((i) => /(Reduce|Shred)[^.]*Magical Armor|Ignore \d+% of Magical Armor/i.test(text(i)));
  const PCT_HP = set((i) => /% of (their|the target's|target's) (max(imum)?|current|bonus) health/i.test(text(i).replace(/\(\+[^)]*\)/g, '')) || /\d+%? ?of their Max Health/i.test(text(i)));
  const ANTI_CC = set((i) => !!i.stats.tenacity || /Cleanse/i.test(text(i)));
  const hardCc = new Map(heroes.map((h) => [h.slug, h.abilities.filter((a) => [...(a.game_description ?? '').matchAll(/<CC_Text>([^<]+)<\/CC_Text>/g)].some((x) => HARD_CC.test(x[1]!.trim()))).length]));

  const labels = learnLabels(matches);
  const typeOf = (p: { hero: string; role: string }) => labels.type.get(`${p.hero}|${p.role}`) ?? 'mixed';
  const share = (p: { hero: string; role: string }) => labels.magicShare.get(`${p.hero}|${p.role}`) ?? 0.5;
  // draft-time team contexts, terciles over all team-sides in the sample
  const teamStat = (f: (p: ForkMatch['players'][number]) => number, avg: boolean) => (ps: ForkMatch['players']) => ps.reduce((s, p) => s + f(p), 0) / (avg ? Math.max(1, ps.length) : 1);
  const teamHeal = teamStat((p) => labels.healRate.get(`${p.hero}|${p.role}`) ?? 0, false);
  const teamMagic = teamStat((p) => share(p), true);
  const teamCc = teamStat((p) => hardCc.get(p.hero) ?? 0, false);
  const sides = matches.flatMap((m) => [0, 1].map((t) => m.players.filter((p) => p.team === t)));
  const terc = (f: (ps: ForkMatch['players']) => number) => { const c = quantileCuts(sides.map(f), 3); return (ps: ForkMatch['players']) => bucketOf(f(ps), c); };
  const healT = terc(teamHeal), magicT = terc(teamMagic), ccT = terc(teamCc);

  // own-team gold diff at the decision, quintiles per slot (computed below)
  const teamDiffAt = (m: ForkMatch, team: number, t: number) => m.players.reduce((s, p) => s + (p.team === team ? 1 : -1) * goldAt(p, t), 0);

  const checks: Check[] = [
    { id: 'magic-armor-vs-magic-laner', label: 'Magic armor into a magic-damage laner', counter: 'magic armor', whenA: 'lane opponent deals mostly magic damage', whenB: 'lane opponent deals mostly physical damage', rows: [] },
    { id: 'physical-armor-vs-physical-laner', label: 'Physical armor into a physical-damage laner', counter: 'physical armor', whenA: 'lane opponent deals mostly physical damage', whenB: 'lane opponent deals mostly magic damage', rows: [] },
    { id: 'anti-heal-vs-healing-team', label: 'Anti-heal into a healing team', counter: 'anti-heal', whenA: 'enemy team in the top third for typical healing', whenB: 'bottom third', rows: [] },
    { id: 'magic-armor-vs-magic-team', label: 'Magic armor into a magic-heavy team', counter: 'magic armor', whenA: 'enemy team in the top third for typical magic damage share', whenB: 'bottom third', rows: [] },
    { id: 'anti-cc-vs-cc-team', label: 'Tenacity or cleanse into a CC-heavy team', counter: 'tenacity / cleanse', whenA: 'enemy team in the top third for hard-CC abilities (ability text)', whenB: 'bottom third', rows: [] },
    { id: 'armor-shred-vs-visible-armor', label: 'Armor shred into visible armor (physical heroes)', counter: 'armor shred / ignore', whenA: 'enemies already completed 3+ physical armor items', whenB: 'enemies completed none', rows: [] },
    { id: 'magic-shred-vs-visible-armor', label: 'Magic armor shred into visible magic armor (magic heroes)', counter: 'magic armor shred / ignore', whenA: 'enemies already completed 2+ magic armor items', whenB: 'enemies completed none', rows: [] },
    { id: 'pct-health-vs-visible-tanks', label: 'Percent-health damage into visible tank items', counter: 'percent-health damage', whenA: 'enemies already completed 5+ armor items', whenB: '1 or fewer', rows: [] },
    { id: 'defense-when-behind', label: 'Defense when your team is behind', counter: 'any armor item', whenA: 'own team in the bottom fifth for gold lead at the decision', whenB: 'top fifth', rows: [] },
  ];
  const C = new Map(checks.map((c) => [c.id, c]));
  const behindRaw: { m: number; plat: boolean; slot: number; group: string; diff: number; bought: boolean; min: number }[] = [];

  matches.forEach((m, mi) => {
    for (const p of m.players) {
      const opp = m.players.filter((o) => o.team !== p.team && o.role === p.role);
      const enemies = m.players.filter((e) => e.team !== p.team);
      const plat = (tiers[p.pid] ?? -1) >= PLAT_TIER;
      const hr = `${p.hero}|${p.role}`;
      const oppType = opp.length === 1 ? typeOf(opp[0]!) : null;
      const h = healT(enemies), mg = magicT(enemies), cc = ccT(enemies);
      p.cores.forEach(([item, t], i) => {
        const slot = i + 1;
        if (slot > 4) return;
        const g = `${hr}|${slot}`;
        const push = (id: string, side: 'A' | 'B' | null, bought: boolean, group = g) => { if (side) C.get(id)!.rows.push({ m: mi, plat, slot, group, side, bought, min: t / 60 }); };
        push('magic-armor-vs-magic-laner', oppType === 'magical' ? 'A' : oppType === 'physical' ? 'B' : null, MR.has(item));
        push('physical-armor-vs-physical-laner', oppType === 'physical' ? 'A' : oppType === 'magical' ? 'B' : null, PA.has(item));
        push('anti-heal-vs-healing-team', h === 2 ? 'A' : h === 0 ? 'B' : null, ANTI_HEAL.has(item));
        push('magic-armor-vs-magic-team', mg === 2 ? 'A' : mg === 0 ? 'B' : null, MR.has(item));
        push('anti-cc-vs-cc-team', cc === 2 ? 'A' : cc === 0 ? 'B' : null, ANTI_CC.has(item));
        if (slot >= 2) { // a scoreboard to read
          const done = (f: (s: string) => boolean) => enemies.reduce((s, e) => s + e.cores.filter(([it, et]) => et < t && f(it)).length, 0);
          const gw = `${g}|${Math.floor(t / 300)}`;
          if (share(p) <= 0.4) { const n = done((s) => PA.has(s)); push('armor-shred-vs-visible-armor', n >= 3 ? 'A' : n === 0 ? 'B' : null, ARMOR_SHRED.has(item), gw); }
          if (share(p) >= 0.6) { const n = done((s) => MR.has(s)); push('magic-shred-vs-visible-armor', n >= 2 ? 'A' : n === 0 ? 'B' : null, MAGIC_SHRED.has(item), gw); }
          const n = done((s) => ANY_ARMOR.has(s)); push('pct-health-vs-visible-tanks', n >= 5 ? 'A' : n <= 1 ? 'B' : null, PCT_HP.has(item), gw);
        }
        const tDec = slot === 1 ? SLOT1_DECISION_S : p.cores[i - 1]![1];
        behindRaw.push({ m: mi, plat, slot, group: g, diff: teamDiffAt(m, p.team, tDec), bought: ANY_ARMOR.has(item), min: t / 60 });
      });
    }
  });
  for (let slot = 1; slot <= 4; slot++) {
    const rs = behindRaw.filter((r) => r.slot === slot);
    const cuts = quantileCuts(rs.map((r) => r.diff), 5);
    for (const r of rs) { const b = bucketOf(r.diff, cuts); if (b === 0 || b === 4) C.get('defense-when-behind')!.rows.push({ m: r.m, plat: r.plat, slot, group: r.group, side: b === 0 ? 'A' : 'B', bought: r.bought, min: r.min }); }
  }

  // per 100 buys, A vs B, within groups weighted by the smaller side; optional per-match weights (bootstrap)
  const rate = (rows: Row[], w?: Float64Array) => {
    const g = new Map<string, [number, number, number, number]>(); // nA, bA, nB, bB
    for (const r of rows) {
      const x = w ? w[r.m]! : 1; if (!x) continue;
      const a = g.get(r.group) ?? [0, 0, 0, 0];
      if (r.side === 'A') { a[0] += x; if (r.bought) a[1] += x; } else { a[2] += x; if (r.bought) a[3] += x; }
      g.set(r.group, a);
    }
    let ra = 0, rb = 0, wt = 0;
    for (const [nA, bA, nB, bB] of g.values()) { if (nA < 5 || nB < 5) continue; const k = Math.min(nA, nB); ra += (k * bA) / nA; rb += (k * bB) / nB; wt += k; }
    return wt ? { a: (100 * ra) / wt, b: (100 * rb) / wt } : null;
  };
  const rand = rng(2026);
  const weights = Array.from({ length: BOOT }, () => { const w = new Float64Array(matches.length); for (let i = 0; i < matches.length; i++) { const j = Math.floor(rand() * matches.length); w[j]! += 1; } return w; });
  const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]!; };

  const out = checks.map((c) => {
    const bands: Record<string, unknown> = {};
    for (const band of ['all', 'plat'] as const) {
      const rows = band === 'plat' ? c.rows.filter((r) => r.plat) : c.rows;
      const pt = rate(rows);
      if (!pt) continue;
      const gaps = weights.map((w) => { const r = rate(rows, w); return r ? r.a - r.b : 0; });
      const bySlot: Record<string, { a: number; b: number }> = {};
      for (let s = 1; s <= 4; s++) { const r = rate(rows.filter((x) => x.slot === s)); if (r) bySlot[s] = { a: +r.a.toFixed(1), b: +r.b.toFixed(1) }; }
      const extra = Object.entries(bySlot).map(([s, r]) => [s, Math.max(0, r.a - r.b)] as const);
      const tot = extra.reduce((s, [, x]) => s + x, 0);
      bands[band] = {
        whenCalledFor: +pt.a.toFixed(1), otherwise: +pt.b.toFixed(1), gap: +(pt.a - pt.b).toFixed(1),
        gap90: [+q(gaps, 0.05).toFixed(1), +q(gaps, 0.95).toFixed(1)],
        buysA: rows.filter((r) => r.side === 'A').length, buysB: rows.filter((r) => r.side === 'B').length,
        // median completion minute of the counter, in games that called for it
        medianMinute: +q(rows.filter((r) => r.side === 'A' && r.bought).map((r) => r.min), 0.5).toFixed(1),
        bySlot, extraShareBySlot: tot > 0 ? Object.fromEntries(extra.map(([s, x]) => [s, Math.round((100 * x) / tot)])) : null,
      };
    }
    const { rows: _rows, ...meta } = c;
    void _rows;
    return { ...meta, bands };
  });
  const pull = JSON.parse(readFileSync(path.join(DIR, 'state.json'), 'utf8')) as { from: number; cursor: number };
  const name = (s: Set<string>) => [...s].map((x) => items.find((i) => i.slug === x)?.display_name ?? x).sort();
  writeFileSync(OUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: `pred.gg public match stream, RANKED, ${matches.length} matches ${new Date(pull.from * 1000).toISOString().slice(0, 16)} -> ${new Date(pull.cursor * 1000).toISOString().slice(0, 16)} UTC (Fork PoC extract)`,
    method: 'per 100 buys at items 1-4 (scoreboard checks: items 2-4, same 5-minute window), same hero-role and item slot, A = counter called for vs B = not; gap90 = 90% match-bootstrap range of the gap; plat = current ladder tier >= 3. What players do, not whether it wins.',
    itemSets: { magicArmor: name(MR), physicalArmor: name(PA), antiHeal: name(ANTI_HEAL), armorShred: name(ARMOR_SHRED), magicShred: name(MAGIC_SHRED), pctHealth: name(PCT_HP), antiCc: name(ANTI_CC) },
    hardCcAbilities: Object.fromEntries([...hardCc].sort()),
    checks: out,
  }, null, 1));
  for (const c of out) {
    const b = c.bands as Record<string, { whenCalledFor: number; otherwise: number; gap90: number[]; extraShareBySlot: Record<string, number> | null }>;
    const f = (k: string) => (b[k] ? `${b[k].whenCalledFor} vs ${b[k].otherwise} [gap ${b[k].gap90[0]}..${b[k].gap90[1]}]` : 'n/a');
    console.log(`${c.label.padEnd(56)} all ${f('all').padEnd(28)} plat ${f('plat').padEnd(28)} plat by slot ${JSON.stringify(b.plat?.extraShareBySlot)}`);
  }
  console.log(`-> ${path.relative(ROOT, OUT)}`);
}

main();
