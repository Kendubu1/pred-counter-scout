// Per-hero general statistics from pred.gg's OPEN generalStatistic endpoint
// (discovered 2026-08-07 when the simpleBuild/coreBuild fields went behind the
// operator-managed Application-scope gate — generalStatistic needs no scope).
// Pulls RANKED wins/picks/bans (+ gold@15, first-tower time) per hero, overall
// and per role the hero actually plays in our aggregates, pinned to a version
// set. This is the freshest sanctioned winrate source we have.
//
//   npm run genstats                       # current patch family (e.g. all 1.15.x)
//   VERSIONS=157 npm run genstats          # a specific pred.gg version id set (comma-sep)
//   OUT=data/aggregates/foo.json npm run genstats
//
// Sequential, one request at a time with a delay, per the data policy.

import { writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gql, hasCredentials, currentVersion } from './predgg.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ROLES = ['carry', 'midlane', 'offlane', 'jungle', 'support'];
const ROLE_ENUM: Record<string, string> = {
  carry: 'CARRY', midlane: 'MIDLANE', offlane: 'OFFLANE', jungle: 'JUNGLE', support: 'SUPPORT',
};

interface StatCell {
  matchesPlayed: number; matchesWon: number; matchesBanned: number;
  totalGoldAt15: number; totalFirstTowerTime: number; totalSecondsPlayed: number;
}

const FIELDS = 'matchesPlayed matchesWon matchesBanned totalGoldAt15 totalFirstTowerTime totalSecondsPlayed';

async function pull(slug: string, versions: string[], role?: string): Promise<StatCell | null> {
  const roleFilter = role ? `roles: [${ROLE_ENUM[role]}], ` : '';
  const d = await gql<{ hero: { generalStatistic: { result: StatCell | null } | null } | null }>(
    `{ hero(by: { slug: "${slug}" }) {
      generalStatistic(filter: { ${roleFilter}gameModes: [RANKED], versions: [${versions.map((v) => `"${v}"`).join(', ')}] }) { result { ${FIELDS} } } } }`);
  return d.hero?.generalStatistic?.result ?? null;
}

const wr = (c: StatCell | null) => c && c.matchesPlayed ? +(100 * c.matchesWon / c.matchesPlayed).toFixed(1) : null;

async function main() {
  if (!hasCredentials()) { console.error('needs PREDGG_CLIENT_ID/SECRET in env'); process.exit(1); }
  let versions: string[]; let label: string;
  if (process.env.VERSIONS) {
    versions = process.env.VERSIONS.split(',').map((s) => s.trim());
    label = `version ids ${versions.join('+')}`;
  } else {
    const v = await currentVersion();
    versions = v.ids; label = `patch ${v.name} family (ids ${v.ids.join('+')})`;
  }

  const heroes = JSON.parse(readFileSync(path.join(ROOT, 'data/omeda/heroes.json'), 'utf8')) as { slug: string; name: string }[];
  // Per-role pulls only for roles the hero meaningfully plays in our field
  // aggregates (meta.json) — keeps the request count polite.
  const meta = JSON.parse(readFileSync(path.join(ROOT, 'data/artifacts/meta.json'), 'utf8')) as { roles: Record<string, { slug: string }[]> };
  const rolesOf = new Map<string, string[]>();
  for (const role of ROLES) for (const row of meta.roles[role] ?? []) {
    rolesOf.set(row.slug, [...(rolesOf.get(row.slug) ?? []), role]);
  }

  console.log(`generalStatistic pull: ${heroes.length} heroes, RANKED, ${label}`);
  const out: Record<string, { name: string; overall: (StatCell & { winrate: number | null }) | null; byRole: Record<string, StatCell & { winrate: number | null }> }> = {};
  let totalMatches = 0;
  for (const h of heroes) {
    const overall = await pull(h.slug, versions);
    await sleep(350);
    const byRole: Record<string, StatCell & { winrate: number | null }> = {};
    for (const role of rolesOf.get(h.slug) ?? []) {
      const c = await pull(h.slug, versions, role);
      await sleep(350);
      if (c && c.matchesPlayed) byRole[role] = { ...c, winrate: wr(c) };
    }
    out[h.slug] = { name: h.name, overall: overall ? { ...overall, winrate: wr(overall) } : null, byRole };
    totalMatches = Math.max(totalMatches, 0);
    console.log(`  ${h.slug}: ${overall?.matchesPlayed ?? 0} ranked games, ${wr(overall) ?? '—'}% wr, ${overall?.matchesBanned ?? 0} bans${Object.keys(byRole).length ? ` (${Object.keys(byRole).join(', ')})` : ''}`);
  }

  const file = process.env.OUT ?? 'data/aggregates/predgg-general-stats.json';
  writeFileSync(path.join(ROOT, file), JSON.stringify({
    source: 'pred.gg generalStatistic (open endpoint, RANKED only)',
    fetchedAt: new Date().toISOString(),
    versions, versionLabel: label,
    heroes: out,
  }, null, 1) + '\n');
  console.log(`\nwrote ${file}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
