// npm run playbook -- "<us heroes>" vs "<them heroes>" [--json]
// Zero-API team playbook for ANY two lineups (draft time, not only reviewed games):
// both teams' role tags and balance, the hard-CC count, and how our five kits fit
// together (open, chain, pay off, peel, what to bait out), from the agent-scanned
// kit index and reviewed role tags. Rules: src/playbook.ts.
//   npm run playbook -- "steel aurora khaimera gadget kira" vs "countess scarlett lt-belica sparrow mourn"
// Names or slugs, order = offlane jungle midlane carry support (roles only label the output).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlaybook, type PbHero } from '../playbook.js';
import { roleTags } from '../team-comp.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p: string) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const heroes = read('data/catalog/heroes.json') as { slug: string; name: string; display_name: string; classes: string[] }[];
const kit = read('data/game-data/kit-index.json').heroes;
const profiles = read('data/game-data/kit-profiles.json').heroes;
const reviewed = read('data/game-data/role-tags.json').heroes;
const ROLES = ['offlane', 'jungle', 'midlane', 'carry', 'support'];

const find = (q: string) => {
  const k = q.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return heroes.find((h) => h.slug.replace(/-/g, '') === k || h.display_name.toLowerCase().replace(/[^a-z0-9]+/g, '') === k || h.name.toLowerCase() === k);
};
const args = process.argv.slice(2).filter((a) => a !== '--json');
const vs = args.findIndex((a) => a.toLowerCase() === 'vs');
if (vs < 1) { console.error('usage: npm run playbook -- "<5 heroes>" vs "<5 heroes>"'); process.exit(2); }
const side = (parts: string[]): PbHero[] => parts.join(' ').split(/[,\s]+/).filter(Boolean).map((q, i) => {
  const h = find(q);
  if (!h) { console.error(`unknown hero: ${q}`); process.exit(2); }
  const k = kit[h.slug];
  return { slug: h.slug, name: h.display_name, role: ROLES[i] ?? 'flex', tags: roleTags(h, profiles[h.slug], { hardCount: k.hardCount, selfHeal: k.abilities.some((a: any) => a.heal) }, reviewed[h.slug]?.tags), abilities: k.abilities };
});
const us = side(args.slice(0, vs)), them = side(args.slice(vs + 1));
const pb = buildPlaybook(us, them);
const cc = (t: PbHero[]) => t.reduce((n, h) => n + h.abilities.filter((a) => a.hard.length).length, 0);
if (process.argv.includes('--json')) { console.log(JSON.stringify({ us, them, playbook: pb }, null, 1)); process.exit(0); }
const line = (t: PbHero[]) => t.map((h) => `${h.name} [${h.tags.join(', ')}]`).join(' · ');
console.log(`US:   ${line(us)}\n      hard-CC abilities ${cc(us)}`);
console.log(`THEM: ${line(them)}\n      hard-CC abilities ${cc(them)}`);
if (pb.note) console.log(`\n! ${pb.note}`);
for (const p of pb.plays) { console.log(`\n${p.name} (${p.when})`); p.steps.forEach((s, i) => console.log(`  ${i + 1}. ${s.hero} ${s.ability}: ${s.what}`)); }
if (pb.waitOut.length) { console.log('\nBait or wait out first'); pb.waitOut.forEach((s, i) => console.log(`  ${i + 1}. ${s.hero} ${s.ability}: ${s.what}`)); }
