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
import { buildPlaybook, type PbHero } from '../playbook.js';
import { threatBuild, takedownTimes } from '../threat-build.js';
import { powerProfile, powerLines, powerLesson } from '../build-power.js';
import { buildStory } from '../build-story.js';
import { buildWhy } from '../build-why.js';
import { damageMix } from '../damage-mix.js';
import { levelAtMinute } from '../matchup.js';
import { metricsOf, scoreRows, type Row } from '../standouts.js';
// "Above the norm" for the build read: +0.5 role SD on the standouts composite (about the top
// 20% of hero-games in our films; the standouts report's own bar is 1.0, about the top 8%).
const BUILD_READ_Z = 0.5;

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
  let reviewedTags: Record<string, { tags: string[] }> = {};
  try { reviewedTags = read('data/game-data/role-tags.json').heroes ?? {}; } catch { /* no review yet: keyword rules */ }
  const rt = new Map(heroes.map((h) => { const k = (kitIdx as any)[h.slug]; return [h.slug, roleTags(h, profiles[h.slug], k ? { hardCount: k.hardCount, selfHeal: k.abilities.some((a: any) => a.heal) } : undefined, reviewedTags[h.slug]?.tags)]; }));
  const predBuilds = read('data/aggregates/predgg-builds.json');
  let matchupCores: Record<string, any> = {};
  try { matchupCores = read('data/aggregates/matchup-cores.json').pairs ?? {}; } catch { /* npm run matchups:cores not run yet */ }
  const heroCat = new Map((read('data/catalog/heroes.json') as any[]).map((h) => [h.slug, h]));
  const itemCat = new Map((read('data/catalog/items.json') as any[]).map((i) => [i.slug, i]));
  const eternalsCat = read('data/game-data/eternals.json').eternals;
  const augCat = read('data/aggregates/predgg-augments.json').catalog ?? {};
  const calibration = JSON.parse(readFileSync(path.join(ROOT, 'engine/fixtures/calibration.json'), 'utf8'));
  const augField = read('data/aggregates/predgg-augments.json').heroes ?? {};
  const corePiece = new Set((read('data/catalog/items.json') as any[]).filter((i) => i.rarity === 'Epic' && i.slot_type === 'Passive').map((i) => i.slug));
  let norms: Record<string, any> = {};
  let teamMix: any = null;
  try { teamMix = read('data/aggregates/hero-role-norms.json').teamMix ?? null; } catch { /* npm run norms */ }
  const abilitiesBySlug = new Map((read('data/catalog/heroes.json') as any[]).map((h) => [h.slug, h.abilities ?? []]));
  try { norms = read('data/aggregates/hero-role-norms.json').heroes ?? {}; } catch { /* npm run norms not run yet */ }
  const heroStats = new Map((read('data/catalog/heroes.json') as any[]).map((h) => [h.slug, h.base_stats ?? {}]));
  const heroMeta = new Map<string, HeroMeta>(heroes.map((h) => [h.slug, { power: power.get(h.slug) ?? null, cls: heroClass(h.classes) }]));

  const files = readdirSync(OUT_DIR).filter((f) => UUID_RE.test(f));
  // Who played well above their hero-role norm, on either team (the standouts scoring:
  // role-weighted z of per-minute output vs the shrunk hero-role mean across our films).
  const allFilms = files.map((f) => JSON.parse(readFileSync(path.join(OUT_DIR, f), 'utf8'))).filter((f) => Array.isArray(f.players) && f.players.length === 10);
  const sRows: Row[] = allFilms.flatMap((film) => film.players.map((p: any) => ({ film, p, m: metricsOf(p, film) })));
  const sScores = scoreRows(sRows);
  const standout = new Map<string, number>();
  sRows.forEach((r, i) => { if (sScores[i]!.score >= BUILD_READ_Z) standout.set(`${r.film.matchId}|${r.p.pid}`, sScores[i]!.score); });
  let touched = 0, skipped = 0;
  for (const f of files) {
    const p = path.join(OUT_DIR, f);
    const film = JSON.parse(readFileSync(p, 'utf8'));
    if (film.teamComp && film.kitRead && film.buildNotes && film.playbook && film.threatBuilds && 'damageMix' in film && !all) continue;
    const players: CompPlayer[] = film.players.map((x: CompPlayer) => ({ us: x.us, heroSlug: x.heroSlug, heroName: x.heroName, role: x.role }));
    const tc = readTeamComp(players, film.comp?.ourDamage ?? { physical: 0, magical: 0 }, tags, field, wr, heroRoles, displayNames, (s) => rt.get(s) ?? []);
    if (!tc) { skipped++; continue; }
    film.teamComp = tc;
    film.kitRead = readKit(film.players, film.kills ?? [], kitIdx, profiles as Record<string, { playAgainst?: string }>, heroMeta);
    const pb = (us: boolean): PbHero[] => film.players.filter((x: any) => x.us === us).map((x: any) => ({ slug: x.heroSlug, name: x.heroName, role: x.role, tags: rt.get(x.heroSlug) ?? [], abilities: ((kitIdx as any)[x.heroSlug]?.abilities ?? []) }));
    film.playbook = buildPlaybook(pb(true), pb(false));
    // How the enemy threat's and each nemesis killer's build worked (src/threat-build.ts).
    // ... plus anyone, on either team, who played above their hero-role norm (BUILD_READ_Z).
    const why = new Map<string, Set<string>>();
    const add = (pid: string, w: string) => (why.get(pid) ?? why.set(pid, new Set()).get(pid)!).add(w);
    const enemyPid = (slug: string) => film.players.find((x: any) => !x.us && x.heroSlug === slug)?.pid;
    if (film.kitRead?.threat?.slug && enemyPid(film.kitRead.threat.slug)) add(enemyPid(film.kitRead.threat.slug)!, 'threat');
    for (const n of film.kitRead?.nemeses ?? []) if (enemyPid(n.bySlug)) add(enemyPid(n.bySlug)!, 'nemesis');
    for (const x of film.players) if (standout.has(`${film.matchId}|${x.pid}`)) add(x.pid, 'standout');
    film.threatBuilds = Object.fromEntries([...why].map(([pid, ws]) => {
      const ep = film.players.find((x: any) => x.pid === pid);
      const tb = threatBuild(ep, { hero: heroCat.get(ep.heroSlug), items: itemCat, eternals: eternalsCat, augments: augCat, durationMin: film.durationMin, takedownTimes: takedownTimes(ep.heroSlug, ep.assists ?? 0, film.kills ?? [], ep.us ? 'us' : 'them') });
      // Beyond cooldowns: damage (power, penetration vs the other team's armor, amplifiers),
      // sustain and toughness (src/build-power.ts). Levels are provisional, so armor is an estimate.
      const mates = film.players.filter((x: any) => x.us === ep.us), foes = film.players.filter((x: any) => x.us !== ep.us);
      const pp = powerProfile(ep, {
        items: itemCat, durationMin: film.durationMin ?? 30, level: levelAtMinute(film.durationMin ?? 30, calibration),
        teamDamage: mates.reduce((a: number, x: any) => a + (x.damageToHeroes ?? 0), 0), powerType: power.get(ep.heroSlug) ?? null,
        heroStats, eternals: eternalsCat, augments: augCat,
        targets: foes.map((x: any) => ({ name: x.squadName || x.name, heroSlug: x.heroSlug, heroName: x.heroName, items: x.items, diedTo: (film.kills ?? []).filter((k: any) => k.killerPid === ep.pid && k.killedPid === x.pid).length, level: x.stream?.level ?? null, takenFromHeroes: x.stream?.takenFromHeroes ?? null })),
      });
      const pl = powerLesson(pp, ep.heroName);
      const lines = [...tb.lines, ...powerLines(pp, ep.heroName), ...(pl ? [`Lesson: ${pl}`] : [])];
      // One lead story from the data (src/build-story.ts): this game on the patch's norms for the hero-role.
      const fedSrc = tb.haste.sources.find((x: any) => /takedown/.test(`${x.note ?? ''} ${x.how ?? ''}`));
      const topPen = pp.vs.filter((v: any) => v.diedTo > 0).sort((a: any, b: any) => b.diedTo - a.diedTo)[0] ?? pp.vs[0];
      const story = buildStory(ep, { kills: mates.reduce((a: number, x: any) => a + x.kills, 0), damage: mates.reduce((a: number, x: any) => a + (x.damageToHeroes ?? 0), 0) }, film.durationMin ?? 30, norms[`${ep.heroSlug}|${ep.role}`], {
        ult: tb.ult, fed: fedSrc ? { name: fedSrc.what.replace(/ \(minor\)$/, ''), takedowns: tb.takedowns } : null,
        pen: topPen ? { hero: topPen.hero, more: topPen.more, type: pp.type } : null, amps: [...new Set(pp.amps.map((a: any) => a.name))] as string[],
        sustain: !!pp.sustain, tough: !!pp.tough,
      });
      if (story.lead) lines.unshift(`Lead story: ${story.lead.title}. ${story.lead.text}`);
      // Why it worked: what stacked, did we counter it, can we copy it (src/build-why.ts).
      const fh = augField[ep.heroSlug]?.[ep.role];
      const fe = fh?.eternals?.find((e: any) => e.name === ep.loadout?.eternal);
      const fpair = fe?.pairs?.find((x: any) => x.minor1 === ep.loadout?.minor1 && x.minor2 === ep.loadout?.minor2);
      const order = (ep.stream?.purchases?.map((x: any) => x.slug) ?? [...(ep.itemTimeline ?? [])].sort((a: any, b: any) => a.estMin - b.estMin).map((x: any) => x.slug)).filter((sl: string) => corePiece.has(sl)).slice(0, 3);
      const fcore = order.length === 3 ? (predBuilds.byRole?.[ep.heroSlug]?.[ep.role] ?? []).filter((r: any) => [...r.coreSlugs].sort().join() === [...order].sort().join()).reduce((a: any, r: any) => ({ n: a.n + r.n, w: a.w + r.w }), { n: 0, w: 0 }) : null;
      const why = buildWhy(ep, {
        items: itemCat, eternals: eternalsCat, augments: augCat, kit: (kitIdx as any)[ep.heroSlug]?.abilities ?? [], haste: tb.haste.total, damageType: pp.type,
        foes: foes.map((x: any) => ({ hero: x.heroName, items: x.items ?? [], diedTo: (film.kills ?? []).filter((k: any) => k.killerPid === ep.pid && k.killedPid === x.pid).length })),
        healingPct: story.vsNorm?.hpm.pct ?? null,
        field: fh ? { games: fh.games, wins: fh.wins, eternal: fe ? { name: fe.name, n: fe.n, w: fe.w, pair: fpair ? { n: fpair.n, w: fpair.w } : undefined } : null, core: fcore && fcore.n ? fcore : null, coreBase: (predBuilds.byRole?.[ep.heroSlug]?.[ep.role] ?? []).reduce((a: any, r: any) => ({ n: a.n + r.n, w: a.w + r.w }), { n: 0, w: 0 }) } : null,
      });
      lines.push(...why.stacks.map((st) => `Stack (${st.title}): ${st.text}`), ...(why.eternalPart ? [why.eternalPart] : []), `Countered? ${why.countered.map((c) => c.text).join(' ')}`, ...(why.copy ? [`Copy it? ${why.copy.text}`] : []));
      return [ep.heroSlug, { ...tb, lines, power: pp, story, worked: why, card: { ...tb.card, power: pp, powerLesson: pl, story, worked: why }, us: !!ep.us, why: [...ws], score: standout.get(`${film.matchId}|${pid}`) ?? null }];
    }));
    film.damageMix = damageMix(film.players, { items: itemCat, eternals: eternalsCat, augments: augCat, abilities: abilitiesBySlug, teamMix });
    film.buildNotes = buildNotes(film.players, film.kitRead, kitIdx, itemInfo, heroMeta, pairs, bm, links, predBuilds.byRole, predBuilds.baselineByRole, matchupCores);
    writeFileSync(p, JSON.stringify(film, null, 1));
    touched++;
  }
  console.log(`teamComp ${all ? 'refreshed' : 'added'} on ${touched} review(s); ${skipped} skipped (incomplete lineup or unknown hero); ${files.length} total.`);
}

main();
