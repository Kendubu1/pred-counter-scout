// Descriptive overlap with observed builds, never an input to generation or
// evidence that a build causes wins. Patch and lane scope travel with the score.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GeneratedBuild, ObjKey } from './search.js';
import type { Item } from './types.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
interface CoreRow { coreSlugs: (string | null)[]; n: number; w: number }
export interface BuildEvidence {
  generatedAt?: string; source?: string; patch?: string;
  heroes: Record<string, CoreRow[]>;
  byRole?: Record<string, Record<string, CoreRow[]>>;
}
export interface EvidenceScope {
  patch: string | null; catalogPatch: string; generatedAt: string | null;
  role: string | null; population: 'role' | 'hero-wide';
  currentMetaEligible: boolean; limitations: string[];
}
export interface FieldCore { items: string[]; n: number; w: number; wr: number; covered: boolean }
export interface AgreementScore {
  hero: string; cores: FieldCore[]; topCore: FieldCore | null;
  hitAtK: boolean; coverage: number;
  // Deprecated: an arbitrary covering six-item build is not the actual core.
  rankCorr: number;
  evidence: EvidenceScope; rejectedRows: number; note: string;
}
export function buildEvidencePatch(evidence: BuildEvidence): string | null {
  return evidence.patch ?? evidence.source?.match(/\bpatch\s+(\d+\.\d+(?:\.\d+)?)(?=\s|\(|;|,|$)/i)?.[1] ?? null;
}
export function agreementFromEvidence(
  front: Pick<GeneratedBuild, 'items'>[], slug: string, itemsBySlug: Map<string, Item>,
  source: BuildEvidence, catalogPatch: string,
  opts: { k?: number; minGames?: number; role?: string } = {},
): AgreementScore | null {
  const roleRows = opts.role ? source.byRole?.[slug]?.[opts.role] : undefined;
  // An explicitly empty lane must remain empty, not borrow another lane's data.
  const raw = roleRows ?? source.heroes[slug];
  if (!raw?.length) return null;
  const population = roleRows !== undefined ? 'role' : 'hero-wide';
  const patch = buildEvidencePatch(source);
  const limitations: string[] = [];
  if (!patch || patch !== catalogPatch) limitations.push(`build evidence patch ${patch ?? 'unknown'} differs from catalog ${catalogPatch}`);
  if (population !== 'role') limitations.push('hero-wide evidence mixes roles; no lane-specific validation');
  limitations.push('observational completed-core winrates are affected by player, opponent, duration and completion selection; overlap does not prove winning performance');
  const evidence: EvidenceScope = {
    patch, catalogPatch, generatedAt: source.generatedAt ?? null,
    role: opts.role ?? null, population,
    currentMetaEligible: patch === catalogPatch && population === 'role', limitations,
  };
  let rejectedRows = 0;
  const cores: FieldCore[] = [];
  for (const row of raw) {
    if (!Number.isInteger(row.n) || !Number.isInteger(row.w) || row.n <= 0 || row.w < 0 || row.w > row.n
      || row.coreSlugs.length !== 3 || new Set(row.coreSlugs).size !== 3
      || row.coreSlugs.some(s => !s || !itemsBySlug.has(s))) { rejectedRows++; continue; }
    if (row.n < (opts.minGames ?? 20)) continue;
    const items = row.coreSlugs.map(s => itemsBySlug.get(s!)!.name);
    const covered = front.some(b => items.every(it => b.items.slice(0, opts.k ?? 6).includes(it)));
    cores.push({items, n: row.n, w: row.w, wr: row.w / row.n, covered});
  }
  if (!cores.length) return null;
  const topCore = [...cores].sort((a, b) => b.n - a.n)[0]!;
  const totalN = cores.reduce((s, c) => s + c.n, 0);
  const coverage = cores.filter(c => c.covered).reduce((s, c) => s + c.n, 0) / totalN;
  const label = evidence.currentMetaEligible ? 'current-patch lane overlap (descriptive only)' : 'historical or mixed-population overlap; NOT current-meta validation';
  return {
    hero: slug, cores, topCore, hitAtK: topCore.covered, coverage,
    rankCorr: NaN, evidence, rejectedRows,
    note: `${label}: most-played core ${topCore.items.join(' + ')} (${topCore.n} games), ${topCore.covered ? 'covered' : 'not covered'}. Purchase order and equal-cost performance are not evaluated here.`,
  };
}
let buildCache: BuildEvidence | null = null;
export function agreeWithField(
  front: GeneratedBuild[], slug: string, itemsBySlug: Map<string, Item>, _headline: ObjKey,
  opts: { k?: number; minGames?: number; role?: string } = {},
): AgreementScore | null {
  buildCache ??= JSON.parse(readFileSync(path.join(ROOT, 'data/aggregates/predgg-builds.json'), 'utf8')) as BuildEvidence;
  const meta = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/META.json'), 'utf8')) as { patch: string };
  return agreementFromEvidence(front, slug, itemsBySlug, buildCache, meta.patch, opts);
}
