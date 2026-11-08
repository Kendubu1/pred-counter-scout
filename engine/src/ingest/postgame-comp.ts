// Draft & team-comp read (film.teamComp) and kit read (film.kitRead: CC balance,
// the enemy who ran the game, lane nemeses; src/kit-read.ts) on every reviewed game, from the
// committed team-comp report (npm run comps), the hero tags (src/team-comp.ts)
// and the current patch's hero-role win rates (perk-stream.json). Rules in
// src/comp-read.ts. Zero-API; part of the coach job's deterministic enrichment.
//
//   npm run postgame:comp            # fill teamComp on films missing it
//   npm run postgame:comp -- --all   # recompute every film (after npm run comps)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tagHero, type HeroTags, type KitProfile } from '../team-comp.js';
import { readTeamComp, type CompPlayer, type FieldReport, type HeroRoleWr } from '../comp-read.js';
import { heroClass, roleTags } from '../team-comp.js';
import { readKit, type HeroMeta, type KitHeroLite } from '../kit-read.js';
import { buildNotes, type ItemInfo } from '../build-notes.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT_DIR = path.join(ROOT, 'data/postgame');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/i;
const read = (p: string) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));

function main() {
  const all = process.argv.includes('--all');
  const report = read('data/aggregates/team-comp-report.json') as { patch: string; all: Omit<FieldReport, 'patch'> };
  const field: FieldReport = { patch: report.patch, matches: report.all.matches, byDiff: report.all.byDiff, shapeGrid: report.all.shapeGrid };
  const heroes = read('data/catalog/heroes.json') as { slug: string; display_name: string; classes: string[]; roles: string[] }[];
  const profiles = (read('data/game-data/kit-profiles.json').heroes ?? {}) as Record<string, KitProfile>;
  const tags = new Map<string, HeroTags>(heroes.map((h) => [h.slug, tagHero(h, profiles[h.slug])]));
  const heroRoles = new Map(heroes.map((h) => [h.slug, h.roles.map((r) => r.toLowerCase())]));
  const displayNames = new Map(heroes.map((h) => [h.slug, h.display_name]));
  const wr = read('data/aggregates/perk-stream.json').heroes as HeroRoleWr;
  // Kit read inputs: the agent-scanned kit index and profiles, each hero's damage type.
  const kitIdx = read('data/game-data/kit-index.json').heroes as Record<string, KitHeroLite>;
  const power = new Map<string, 'physical' | 'magical'>(((read('data/aggregates/classifications.json').heroes ?? []) as { hero: string; powerType?: string }[])
    .filter((c) => c.powerType === 'physical' || c.powerType === 'magical').map((c) => [c.hero, c.powerType as 'physical' | 'magical']));
  const itemInfo = new Map<string, ItemInfo>((read('data/catalog/items.json') as any[]).map((i) => [i.slug, { slug: i.slug, name: i.display_name ?? i.name, stats: i.stats ?? {}, rarity: i.rarity }]));
  const pairs = read('data/aggregates/feed-matchups.json').pairs;
  const bm = read('data/aggregates/build-matchups.json').heroes;
  const links = read('data/aggregates/build-links.json').heroes;
  const rt = new Map(heroes.map((h) => { const k = (kitIdx as any)[h.slug]; return [h.slug, roleTags(h, profiles[h.slug], k ? { hardCount: k.hardCount, selfHeal: k.abilities.some((a: any) => a.heal) } : undefined)]; }));
  const predBuilds = read('data/aggregates/predgg-builds.json');
  const heroMeta = new Map<string, HeroMeta>(heroes.map((h) => [h.slug, { power: power.get(h.slug) ?? null, cls: heroClass(h.classes) }]));

  const files = readdirSync(OUT_DIR).filter((f) => UUID_RE.test(f));
  let touched = 0, skipped = 0;
  for (const f of files) {
    const p = path.join(OUT_DIR, f);
    const film = JSON.parse(readFileSync(p, 'utf8'));
    if (film.teamComp && film.kitRead && film.buildNotes && !all) continue;
    const players: CompPlayer[] = film.players.map((x: CompPlayer) => ({ us: x.us, heroSlug: x.heroSlug, heroName: x.heroName, role: x.role }));
    const tc = readTeamComp(players, film.comp?.ourDamage ?? { physical: 0, magical: 0 }, tags, field, wr, heroRoles, displayNames, (s) => rt.get(s) ?? []);
    if (!tc) { skipped++; continue; }
    film.teamComp = tc;
    film.kitRead = readKit(film.players, film.kills ?? [], kitIdx, profiles as Record<string, { playAgainst?: string }>, heroMeta);
    film.buildNotes = buildNotes(film.players, film.kitRead, kitIdx, itemInfo, heroMeta, pairs, bm, links, predBuilds.byRole, predBuilds.baselineByRole);
    writeFileSync(p, JSON.stringify(film, null, 1));
    touched++;
  }
  console.log(`teamComp ${all ? 'refreshed' : 'added'} on ${touched} review(s); ${skipped} skipped (incomplete lineup or unknown hero); ${files.length} total.`);
}

main();
