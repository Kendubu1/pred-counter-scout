// pred.gg core-build evidence: top core item orders per hero, pulled BOTH
// hero-wide AND per-role, so a flex hero's build page shows the build for the
// lane it's actually being viewed in (e.g. support Argus gets tank-support
// cores, not his midlane mage cores). Written to data/aggregates/predgg-builds.json
// and consumed by artifacts.ts to explain WHY meta builds win.
//
//   npm run buildstats
//
// Shape: { heroes: { <slug>: Core[] },            // hero-wide (all roles) — fallback + agreement audit
//          byRole: { <slug>: { <role>: Core[] } } // per-role, FLEX heroes only (2+ roles)
//        }
// Single-role heroes are omitted from byRole on purpose: their hero-wide cores
// ARE their role's cores, so artifacts.ts's hero-wide fallback already serves them
// — and pred.gg's role-filtered coreBuild is slow (~15s each), so we only spend
// those queries where flex actually matters.

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gql, hasCredentials, currentVersion } from './predgg.js';
import { loadData } from '../data.js';
import { loadAggregates } from '../aggregates.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const BATCH = 6;          // heroes per hero-wide request
const ROLE_CONCURRENCY = 4; // parallel role-filtered queries (each ~10-23s server-side)

const norm = (s: string) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// RANKED_ONLY=1 pins all core-build evidence to ranked games on the CURRENT
// patch (pred.gg default pool spans modes and versions). Set in main().
let MODE_FILTER = "";       // e.g. `gameModes: [RANKED], versions: ["152"]`
let SCOPE_NOTE = "pred.gg default pool (all modes, all versions)";

// lowercase aggregate role -> pred.gg role enum
const ROLE_ENUM: Record<string, string> = {
  carry: 'CARRY', midlane: 'MIDLANE', offlane: 'OFFLANE', jungle: 'JUNGLE', support: 'SUPPORT',
};

// pred.gg internal spellings that differ from display names.
const ALIASES: Record<string, string> = {
  fistofjazuul: 'fist-of-razuul',
  enmasblessing: 'enras-blessing',
};

interface Core { core: string[]; coreSlugs: (string | null)[]; n: number; w: number }
interface CoreRow { core1Item: { name: string } | null; core2Item: { name: string } | null; core3Item: { name: string } | null; matchesPlayedBuildOrder: number; matchesWonBuildOrder: number }
const CB_FIELDS = `results { core1Item { name } core2Item { name } core3Item { name } matchesPlayedBuildOrder matchesWonBuildOrder }`;

/** Run tasks with a fixed concurrency cap. */
async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>): Promise<void> {
  const q = [...items];
  await Promise.all(Array.from({ length: Math.min(n, q.length) }, async () => {
    for (let it = q.shift(); it !== undefined; it = q.shift()) await fn(it);
  }));
}

async function main() {
  if (!hasCredentials()) { console.error("needs PREDGG_CLIENT_ID/SECRET in env"); process.exit(1); }
  if (process.env.RANKED_ONLY) {
    const v = await currentVersion();
    MODE_FILTER = `gameModes: [RANKED], versions: [${v.ids.map((i) => `"${i}"`).join(', ')}]`;
    SCOPE_NOTE = `RANKED only, patch ${v.name} (pred.gg version ids ${v.ids.join('+')})`;
    console.log(`scope: ${SCOPE_NOTE}`);
  }
  const data = loadData();
  const agg = loadAggregates();
  const slugs = [...data.kits.keys()].sort();
  const nameToSlug = new Map<string, string>();
  for (const i of data.items.values()) nameToSlug.set(norm(i.name), i.slug);

  const unmapped = new Set<string>();
  const parseRows = (rows: CoreRow[]): Core[] => rows
    .filter((r) => r.core1Item && r.core2Item && r.core3Item && r.matchesPlayedBuildOrder >= 20)
    .map((r) => {
      const core = [r.core1Item!.name, r.core2Item!.name, r.core3Item!.name];
      const coreSlugs = core.map((n) => {
        const s = nameToSlug.get(norm(n)) ?? ALIASES[norm(n)] ?? null;
        if (!s) unmapped.add(n);
        return s;
      });
      return { core, coreSlugs, n: r.matchesPlayedBuildOrder, w: r.matchesWonBuildOrder };
    });

  // ── Phase 1: hero-wide cores for every hero (fast, batched) ──
  const heroes: Record<string, Core[]> = {};
  for (let b = 0; b < slugs.length; b += BATCH) {
    const batch = slugs.slice(b, b + BATCH);
    const q = `{ ${batch.map((s, i) => `h${i}: hero(by: { slug: "${s}" }) { coreBuild(limit: 6${MODE_FILTER ? `, filter: { ${MODE_FILTER} }` : ""}) { ${CB_FIELDS} } }`).join(' ')} }`;
    try {
      const d = await gql<Record<string, { coreBuild: { results: CoreRow[] } } | null>>(q);
      batch.forEach((slug, i) => { heroes[slug] = parseRows(d[`h${i}`]?.coreBuild?.results ?? []); });
    } catch (e) { console.error(`\nhero-wide batch ${b}: ${(e as Error).message}`); }
    process.stdout.write('.');
    await sleep(200);
  }
  console.log(` hero-wide done (${Object.keys(heroes).length})`);

  // ── Phase 2: per-role cores, FLEX heroes only (2+ aggregate roles, n>=30) ──
  const roleTasks: { slug: string; role: string }[] = [];
  for (const slug of slugs) {
    const roles = Object.entries((agg?.heroes?.[slug] as { byRole?: Record<string, { n: number }> })?.byRole ?? {})
      .filter(([r, c]) => c.n >= 30 && ROLE_ENUM[r]).map(([r]) => r);
    if (roles.length >= 2) for (const role of roles) roleTasks.push({ slug, role });
  }
  const byRole: Record<string, Record<string, Core[]>> = {};
  let done = 0;
  await pool(roleTasks, ROLE_CONCURRENCY, async ({ slug, role }) => {
    const q = `{ hero(by: { slug: "${slug}" }) { coreBuild(limit: 6, filter: { roles: [${ROLE_ENUM[role]}]${MODE_FILTER ? `, ${MODE_FILTER}` : ""} }) { ${CB_FIELDS} } } }`;
    try {
      const d = await gql<{ hero: { coreBuild: { results: CoreRow[] } } | null }>(q);
      const cores = parseRows(d.hero?.coreBuild?.results ?? []);
      if (cores.length) (byRole[slug] ??= {})[role] = cores;
    } catch (e) { console.error(`\n${slug}/${role}: ${(e as Error).message}`); }
    if (++done % 10 === 0) console.log(`  per-role ${done}/${roleTasks.length}`);
  });

  const file = path.join(ROOT, 'data/aggregates/predgg-builds.json');
  writeFileSync(file, JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: `pred.gg coreBuild (${SCOPE_NOTE}; ordered 3-item cores, 20+ games each); hero-wide + per-role for flex heroes`,
    heroes,
    byRole,
  }, null, 1));
  const total = Object.values(heroes).reduce((s, v) => s + v.length, 0);
  const roleTotal = Object.values(byRole).reduce((s, m) => s + Object.keys(m).length, 0);
  console.log(`\n${total} hero-wide cores across ${Object.keys(heroes).length} heroes; ${roleTotal} per-role core sets across ${Object.keys(byRole).length} flex heroes -> ${file}`);
  if (unmapped.size) console.log('unmapped item names:', [...unmapped].join(', '));
}

main().catch((e) => { console.error(e); process.exit(1); });
