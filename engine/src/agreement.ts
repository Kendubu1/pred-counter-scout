// Retrodiction validator: does the generated Pareto front REPRODUCE the builds
// the field actually wins with? This complements `npm run explain` (which
// attributes a single given build) by checking the GENERATOR against ground
// truth. It runs AFTER generation and never feeds the objective — popularity
// stays out of the search (design doc, component C/D separation).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GeneratedBuild, ObjKey } from './search.js';
import type { Item } from './types.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export interface FieldCore { items: string[]; n: number; w: number; wr: number; covered: boolean }
export interface AgreementScore {
  hero: string;
  cores: FieldCore[];
  topCore: FieldCore | null;   // highest-n field core
  hitAtK: boolean;             // is the top core covered by some front build's first K items?
  coverage: number;            // n-weighted fraction of field cores the front covers
  rankCorr: number;            // Spearman(field WR, our headline) over covered cores (NaN if <2)
  note: string;
}

let buildCache: any = null;
function loadFieldBuilds(): any {
  if (!buildCache) buildCache = JSON.parse(readFileSync(path.join(ROOT, 'data/aggregates/predgg-builds.json'), 'utf8'));
  return buildCache;
}

function spearman(pairs: [number, number][]): number {
  const n = pairs.length;
  if (n < 2) return NaN;
  const ranks = (vals: number[]) => {
    const order = vals.map((v, i) => [v, i] as [number, number]).sort((a, b) => a[0] - b[0]);
    const r = new Array<number>(n);
    order.forEach(([, i], idx) => { r[i] = idx + 1; });
    return r;
  };
  const xr = ranks(pairs.map((p) => p[0]));
  const yr = ranks(pairs.map((p) => p[1]));
  const d2 = xr.reduce((s, _, i) => s + (xr[i]! - yr[i]!) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
}

export function agreeWithField(
  front: GeneratedBuild[], slug: string, itemsBySlug: Map<string, Item>, headline: ObjKey,
  opts: { k?: number; minGames?: number } = {},
): AgreementScore | null {
  const k = opts.k ?? 6;
  const minGames = opts.minGames ?? 20;
  const heroes = loadFieldBuilds().heroes ?? {};
  const raw = heroes[slug];
  if (!raw?.length) return null;

  // A front build "covers" a core if the core's items are all within its first-k.
  const coverer = (items: string[]) =>
    front.find((b) => items.every((it) => b.items.slice(0, k).includes(it)));

  const cores: (FieldCore & { headlineVal?: number })[] = raw
    .filter((c: any) => c.n >= minGames)
    .map((c: any) => {
      const items = (c.coreSlugs as string[]).map((s) => itemsBySlug.get(s)?.name).filter(Boolean) as string[];
      const hit = items.length === c.coreSlugs.length ? coverer(items) : undefined;
      return { items, n: c.n, w: c.w, wr: c.w / c.n, covered: !!hit, headlineVal: hit?.objectives[headline] };
    });
  if (!cores.length) return null;

  const byN = [...cores].sort((a, b) => b.n - a.n);
  const topCore = byN[0] ?? null;
  const totalN = cores.reduce((s, c) => s + c.n, 0);
  const coverage = totalN ? cores.filter((c) => c.covered).reduce((s, c) => s + c.n, 0) / totalN : 0;

  const matched = cores.filter((c) => c.covered && c.headlineVal != null);
  const rankCorr = spearman(matched.map((c) => [c.wr, c.headlineVal!] as [number, number]));

  const note = topCore?.covered
    ? `front reproduces the field's top core (${topCore.items.join(' + ')}, ${(topCore.wr * 100).toFixed(1)}% over ${topCore.n}); coverage ${(coverage * 100).toFixed(0)}%`
    : `front does NOT cover the field's top core (${topCore?.items.join(' + ')}) — generator/field disagreement worth investigating`;

  return {
    hero: slug,
    cores: cores.map(({ headlineVal, ...c }) => c),
    topCore: topCore ? { items: topCore.items, n: topCore.n, w: topCore.w, wr: topCore.wr, covered: topCore.covered } : null,
    hitAtK: topCore?.covered ?? false,
    coverage,
    rankCorr,
    note,
  };
}
