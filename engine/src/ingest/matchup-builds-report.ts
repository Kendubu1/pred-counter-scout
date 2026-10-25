// How builds change by matchup, both directions, from build-matchups.json. Zero-API.
//
//   npm run matchups:builds -- khaimera            enemies' builds against Khaimera + Khaimera's own shifts
//   npm run matchups:builds -- serath jungle       Serath jungle's shifts into each lane opponent
//   BAND=plat ZMIN=3 npm run matchups:builds -- khaimera
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILD_MATCHUPS, type BuildMatchups } from './build-matchups.js';
import { againstHero, allOpponents, type Band, type Shift } from '../matchup-builds.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const [hero, roleArg] = process.argv.slice(2);
if (!hero) { console.error('usage: npm run matchups:builds -- <hero-slug> [role]'); process.exit(1); }
if (!existsSync(BUILD_MATCHUPS)) { console.error('no data/aggregates/build-matchups.json yet (npm run perks)'); process.exit(1); }
const st = JSON.parse(readFileSync(BUILD_MATCHUPS, 'utf8')) as BuildMatchups;
const items = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/items.json'), 'utf8')) as { slug: string; display_name: string }[];
const name = new Map(items.map((i) => [i.slug, i.display_name]));
const band = (process.env.BAND ?? 'all') as Band, zMin = Number(process.env.ZMIN ?? 3);
const line = (s: Shift, pre = '') => `  ${pre}${(name.get(s.item) ?? s.item).padEnd(22)} ${String(Math.round(s.per100)).padStart(3)} of 100 (usually ${Math.round(s.usual100)})  [${s.has}/${s.n}]`;
const luck = (l: { tested: number; expectedByLuck: number }) => `${l.tested} item rates tested; luck alone would put ~${l.expectedByLuck.toFixed(1)} past this bar`;

console.log(`${st.patch} · ${st.window.matches.toLocaleString()} ranked matches · ${band === 'plat' ? 'Plat+' : 'all ranks'} · bar |z| >= ${zMin}`);
console.log(`segments: ${st.window.segments.map((s) => `${s.via} ${s.from.slice(0, 16)}..${s.to.slice(0, 16)}`).join(' | ')}`);

console.log(`\nWHAT ENEMIES BUILD AGAINST ${hero.toUpperCase()} (anywhere on the other team), by their role:`);
for (const r of againstHero(st, hero, { band, zMin })) {
  if (!r.rises.length && !r.drops.length) continue;
  console.log(` ${r.role} (${r.players} players; ${luck(r)})`);
  for (const s of r.rises.slice(0, 6)) console.log(line(s, '+ '));
  for (const s of r.drops.slice(0, 3)) console.log(line(s, '- '));
}

const roles = roleArg ? [roleArg] : Object.keys(st.heroes).filter((k) => k.startsWith(`${hero}|`)).map((k) => k.split('|')[1]!);
for (const role of roles) {
  const l = allOpponents(st, hero, role, { band, zMin });
  if (!l.tested) continue;
  console.log(`\n${hero.toUpperCase()} ${role.toUpperCase()}: HOW ITS BUILD CHANGES INTO EACH LANE OPPONENT (${luck(l)})`);
  for (const s of l.rises.slice(0, 10)) console.log(line(s, `+ into ${s.opp.padEnd(12)} `));
  for (const s of l.drops.slice(0, 5)) console.log(line(s, `- into ${s.opp.padEnd(12)} `));
}
