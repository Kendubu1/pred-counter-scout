// Patch-currency verifier (zero-API).
//
// WHY THIS EXISTS: the omeda catalog lags the live game by days-to-weeks, so a
// snapshot's `fetchedAt` is NOT its patch identity. On 2026-08-11 a snapshot was
// taken hours after 1.16 shipped and the catalog it returned was still pre-1.15.3
// — the engine then ran the whole 1.16 era on two-patch-old hero and item numbers
// with nothing in the pipeline able to notice.
//
// This reads the hand-captured patch digests in data/patches/*.json and checks the
// CURRENT snapshot against the values those notes state. Each parsed change lands
// in one of three buckets: APPLIED (snapshot matches the post-patch value), STALE
// (snapshot still matches the pre-patch value — the patch is not in our data), or
// UNKNOWN (matches neither; the note may describe something we do not model).
//
// Coverage is deliberately partial and says so: only machine-checkable base stats,
// ability damage arrays and item costs are parsed. An unparsed line is reported as
// unparsed, never silently counted as passing.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData } from '../data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

type Verdict = 'applied' | 'stale' | 'unknown';
interface Check {
  patch: string; target: string; field: string;
  stated: { from: string; to: string }; observed: string; verdict: Verdict;
}

// "60 -> 57", "85-225->95-235", "135/185/235 -> 135/215/285", "3 -> 3.5"
const ARROW = /([\d]+(?:\.[\d]+)?(?:[/-][\d]+(?:\.[\d]+)?)*)\s*(?:->|→|to)\s*([\d]+(?:\.[\d]+)?(?:[/-][\d]+(?:\.[\d]+)?)*)/;

const nums = (s: string): number[] => s.split(/[/-]/).map(Number).filter((n) => !Number.isNaN(n));
const near = (a: number, b: number) => Math.abs(a - b) < 0.051;
// A range form ("85-225") states only the endpoints of a 5-rank array.
const matches = (obs: number[], stated: number[], isRange: boolean): boolean => {
  if (!obs.length || !stated.length) return false;
  if (isRange && stated.length === 2) return near(obs[0]!, stated[0]!) && near(obs[obs.length - 1]!, stated[1]!);
  if (stated.length === 1) return near(obs[0]!, stated[0]!);
  return stated.length === obs.length && stated.every((v, i) => near(obs[i]!, v));
};

// Digest phrasing -> snapshot base_stats key. Growth is checked as the per-level
// step of the array, which is how the notes phrase it ("growth 3.6 -> 3.8").
const STAT_PATTERNS: { re: RegExp; field: string; growth?: boolean }[] = [
  { re: /physical power growth|physical power[^;]*?,\s*growth/i, field: 'physical_power', growth: true },
  { re: /health growth/i, field: 'max_health', growth: true },
  { re: /mana growth/i, field: 'max_mana', growth: true },
  { re: /physical power/i, field: 'physical_power' },
  { re: /max health|^health\b/i, field: 'max_health' },
  { re: /health regen/i, field: 'base_health_regeneration' },
  { re: /mana regen/i, field: 'base_mana_regeneration' },
  { re: /max mana|^mana\b/i, field: 'max_mana' },
  { re: /physical armor/i, field: 'physical_armor' },
  { re: /magical armor/i, field: 'magical_armor' },
  { re: /attack speed/i, field: 'attack_speed' },
  { re: /movement speed/i, field: 'base_movement_speed' },
];

function main() {
  const data = loadData();
  const heroes = JSON.parse(readFileSync(path.join(ROOT, 'data/omeda/heroes.json'), 'utf8')) as
    { slug: string; base_stats: Record<string, number[]> }[];
  const statsBySlug = new Map(heroes.map((h) => [h.slug, h.base_stats]));

  const checks: Check[] = [];
  let unparsed = 0;
  // Version order, not filename order: readdir's alphabetical sort puts 1.15.3
  // before 1.15, which would let an older digest overrule a newer one below.
  const vkey = (f: string) => f.replace('.json', '').split('.').map(Number);
  const files = readdirSync(path.join(ROOT, 'data/patches')).filter((f) => f.endsWith('.json'))
    .sort((a, b) => {
      const [x, y] = [vkey(a), vkey(b)];
      for (let i = 0; i < Math.max(x.length, y.length); i++) {
        if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
      }
      return 0;
    });

  for (const file of files) {
    const digest = JSON.parse(readFileSync(path.join(ROOT, 'data/patches', file), 'utf8'));
    const patch: string = digest.patch ?? file.replace('.json', '');

    for (const hero of (digest.heroes ?? []) as { slug: string; changes?: string[] }[]) {
      const kit = data.kits.get(hero.slug);
      const base = statsBySlug.get(hero.slug);
      for (const line of hero.changes ?? []) {
        // One note line can carry several changes, separated by ; or ,
        for (const clause of line.split(/[;]/)) {
          const m = clause.match(ARROW);
          if (!m) { if (/\d/.test(clause)) unparsed++; continue; }
          const from = nums(m[1]!), to = nums(m[2]!);
          const isRange = /\d-\d/.test(m[1]!);
          const push = (field: string, observed: number[]) => {
            const verdict: Verdict = matches(observed, to, isRange) ? 'applied'
              : matches(observed, from, isRange) ? 'stale' : 'unknown';
            checks.push({ patch, target: hero.slug, field, stated: { from: m[1]!, to: m[2]! }, observed: observed.join('/'), verdict });
          };

          // Ability damage: the clause names an ability the kit carries.
          const ability = kit?.abilities.find((a) => clause.toLowerCase().includes(a.name.toLowerCase()));
          if (ability && /damage/i.test(clause)) { push(`${ability.name} damage`, ability.damagePerRank); continue; }

          const sp = base ? STAT_PATTERNS.find((p) => p.re.test(clause)) : undefined;
          if (sp && base?.[sp.field]) {
            const arr = base[sp.field]!;
            push(sp.growth ? `${sp.field} growth` : sp.field, sp.growth ? [arr[1]! - arr[0]!] : [arr[0]!]);
            continue;
          }
          unparsed++;
        }
      }
    }

    for (const it of (digest.itemChanges ?? []) as { slug: string; change?: string }[]) {
      const item = data.itemsBySlug.get(it.slug);
      const m = (it.change ?? '').match(/cost\s*([\d]+)\s*(?:->|→|to)\s*([\d]+)/i);
      if (!item || !m) { if (/\d/.test(it.change ?? '')) unparsed++; continue; }
      const to = Number(m[2]!), from = Number(m[1]!);
      const verdict: Verdict = near(item.totalPrice, to) ? 'applied' : near(item.totalPrice, from) ? 'stale' : 'unknown';
      checks.push({ patch, target: it.slug, field: 'total_price', stated: { from: m[1]!, to: m[2]! }, observed: String(item.totalPrice), verdict });
    }
  }

  // Supersession: when several patches touch the same (target, field), only the
  // NEWEST statement describes what the live game should hold. Without this a
  // stat buffed in 1.15 and reverted in 1.16 reads as "stale" against 1.15
  // forever. Files are in version order, so the last write wins.
  const newest = new Map<string, Check>();
  for (const c of checks) newest.set(`${c.target}|${c.field}`, c);
  const live = new Set(newest.values());
  const superseded = checks.filter((c) => !live.has(c));
  for (const c of superseded) c.verdict = 'unknown';

  const byPatch = new Map<string, Check[]>();
  for (const c of checks) (byPatch.get(c.patch) ?? byPatch.set(c.patch, []).get(c.patch)!).push(c);

  console.log('Patch currency of data/omeda against the committed patch digests\n');
  let newestStale: string | null = null;
  for (const [patch, cs] of byPatch) {
    const a = cs.filter((c) => c.verdict === 'applied').length;
    const s = cs.filter((c) => c.verdict === 'stale').length;
    const u = cs.filter((c) => c.verdict === 'unknown').length;
    const flag = s > 0 ? '  <-- STALE VALUES PRESENT' : '';
    console.log(`${patch.padEnd(8)} applied ${String(a).padStart(3)} · stale ${String(s).padStart(3)} · unknown ${String(u).padStart(3)}${flag}`);
    for (const c of cs.filter((x) => x.verdict === 'stale' && live.has(x))) {
      console.log(`    STALE ${c.target}/${c.field}: notes say ${c.stated.from} -> ${c.stated.to}, snapshot has ${c.observed}`);
    }
    if (s > 0) newestStale = patch;
  }

  const total = checks.length;
  const applied = checks.filter((c) => c.verdict === 'applied').length;
  const stale = checks.filter((c) => c.verdict === 'stale').length;
  console.log(`\n${applied}/${total} stated changes present in the snapshot; ${stale} still at pre-patch values; ${unparsed} note lines not machine-checkable.`);
  if (newestStale) console.log(`VERDICT: the catalog is BEHIND — ${newestStale} changes are missing. Re-run npm run snapshot; if it stays stale, omeda has not published the patch yet.`);
  else console.log('VERDICT: no stated change is still at its pre-patch value.');

  const out = {
    source: 'data/patches/*.json digests checked against data/omeda',
    note: 'Coverage is partial by design: only base stats, ability damage arrays and item costs are machine-checkable. unparsedNoteLines counts stated changes this tool cannot verify — they are NOT counted as passing. Where several patches touch the same field only the newest statement is graded; earlier ones are marked superseded.',
    supersededChecks: superseded.length,
    generatedAt: new Date().toISOString(),
    snapshotFetchedAt: JSON.parse(readFileSync(path.join(ROOT, 'data/omeda/META.json'), 'utf8')).fetchedAt,
    totals: { checks: total, applied, stale, unknown: total - applied - stale, unparsedNoteLines: unparsed },
    staleAgainstPatch: newestStale,
    perPatch: Object.fromEntries([...byPatch].map(([p, cs]) => [p, {
      applied: cs.filter((c) => c.verdict === 'applied').length,
      stale: cs.filter((c) => c.verdict === 'stale').length,
      unknown: cs.filter((c) => c.verdict === 'unknown').length,
    }])),
    checks,
  };
  writeFileSync(path.join(ROOT, 'data/aggregates/patch-currency.json'), JSON.stringify(out, null, 1));
  console.log('\n-> data/aggregates/patch-currency.json');
}

main();
