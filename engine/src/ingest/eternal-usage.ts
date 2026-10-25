// Writes data/aggregates/eternal-usage.json: who runs each Eternal (roles,
// heroes, minor and pair shares) from the committed ranked match counts, plus
// the mechanics each blessing gives, parsed from data/game-data/eternals.json.
// Zero-API. Run after `npm run perks` (it is in the refresh chain).
//
//   npm run eternals:usage

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eternalUsage, type Augs, type Eternal } from '../eternal-usage.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = <T>(p: string): T => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8')) as T;

const augs = read<Augs>('data/aggregates/predgg-augments.json');
const cat = read<{ patch?: string; eternals: Eternal[] }>('data/game-data/eternals.json');
const heroesRaw = read<{ slug: string; name?: string; display_name?: string }[] | { heroes: { slug: string; name?: string; display_name?: string }[] }>('data/catalog/heroes.json');
const names = new Map((Array.isArray(heroesRaw) ? heroesRaw : heroesRaw.heroes).map((h) => [h.slug, h.display_name || h.name || h.slug]));

const eternals = eternalUsage(augs, cat.eternals, (s) => names.get(s) ?? s);
writeFileSync(path.join(ROOT, 'data/aggregates/eternal-usage.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: `${augs.source ?? 'pred.gg ranked match stream'} — summed over every (hero, role) cell; mechanics parsed from data/game-data/eternals.json text`,
  note: 'games/wins = ranked games that ran the Eternal. pickShare = share of all hero-games. roles[].pickRate = share of that role\'s games. heroes[].pickRate = share of that hero-role\'s games. minors[].share = share of the Eternal\'s games that took the minor in its slot. mechanics[].from names the blessing (Major or a minor) whose text gives it.',
  eternals,
}, null, 1));
const n = Object.keys(eternals).length;
console.log(`eternal-usage: ${n} Eternals -> data/aggregates/eternal-usage.json`);
