// npm run review:killers — zero-API. Repeat killers for every squad member across
// the reviewed films (src/repeat-killers.ts) -> data/artifacts/repeat-killers.json,
// the "Heroes that keep killing you" card on the coach page. Kit lines come from
// data/game-data/kit-index.json, counterplay from kit-profiles.json, item answers
// from src/kit-read.ts itemAnswer. Rerun after new films or a kit scan.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repeatKillers, type RkFilm, type RkKit } from '../repeat-killers.js';
import { itemAnswer, type HeroMeta } from '../kit-read.js';
import { heroClass } from '../team-comp.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p: string) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/i;

const kit = read('data/game-data/kit-index.json').heroes as Record<string, any>;
const profiles = read('data/game-data/kit-profiles.json').heroes as Record<string, { playAgainst?: string }>;
const heroes = read('data/catalog/heroes.json') as { slug: string; classes: string[] }[];
const power = new Map<string, string>((read('data/aggregates/classifications.json').heroes ?? []).map((c: any) => [c.hero, c.powerType]));
const meta = new Map<string, HeroMeta>(heroes.map((h) => [h.slug, { power: (power.get(h.slug) as any) ?? null, cls: heroClass(h.classes) }]));
const members = Object.entries(read('data/artifacts/player-reviews.json').members as Record<string, { name: string }>).map(([uuid, m]) => ({ uuid, name: m.name }));

const films: RkFilm[] = readdirSync(path.join(ROOT, 'data/postgame')).filter((f) => UUID_RE.test(f))
  .map((f) => read(`data/postgame/${f}`)).filter((f) => f.players?.length === 10 && f.kills);

const kitOf = (slug: string): RkKit | null => {
  const k = kit[slug];
  if (!k) return null;
  return {
    hardCc: k.abilities.filter((a: any) => a.hard.length).map((a: any) => `${a.name} (${a.hard.join(' + ')})`),
    escapes: k.abilities.filter((a: any) => a.mobility.length).map((a: any) => a.name),
    stealth: k.stealth, heals: k.abilities.some((a: any) => a.heal),
    unstoppable: k.abilities.filter((a: any) => a.unstoppable).map((a: any) => a.name),
  };
};
const answerFor = (killer: string, mine: string): string | null => {
  const me = meta.get(mine) ?? { power: null, cls: 'BRUISER' as const };
  const k = kit[killer];
  const parts: string[] = [];
  const kp = meta.get(killer)?.power;
  if (kp) parts.push(`${kp} armor`);
  if (k?.abilities.some((a: any) => a.heal) && meta.get(killer)?.cls !== 'SUPPORT') parts.push(`anti-heal (${itemAnswer('antiheal', me)})`);
  if ((k?.abilities.filter((a: any) => a.hard.length).length ?? 0) >= 2) parts.push(`tenacity (${itemAnswer('tenacity', me)})`);
  return parts.length ? parts.join(', ') : null;
};

const out = Object.fromEntries(members.map((m) => [m.uuid, repeatKillers(m, films, kitOf, (s) => profiles[s]?.playAgainst ?? null, answerFor)]));
writeFileSync(path.join(ROOT, 'data/artifacts/repeat-killers.json'), JSON.stringify({
  generatedAt: new Date().toISOString().slice(0, 10),
  source: `${films.length} reviewed squad films (data/postgame), kit from data/game-data/kit-index.json + kit-profiles.json; rules in engine/src/repeat-killers.ts`,
  method: 'An enemy hero is listed when you faced it in 3+ games, it killed you 5+ times, and it killed you at least 1.5x as often per game as your average enemy hero does. The counterplay is from that hero\'s current kit; the item answer is for the hero you died on most.',
  members: out,
}, null, 1) + '\n');
for (const m of Object.values(out)) console.log(`${m.name}: ${m.films} films, ${m.killers.length} repeat killers${m.killers.length ? ': ' + m.killers.map((k) => `${k.hero} ${k.deaths} deaths in ${k.games} games (${k.ratio}x)`).join(', ') : ''}`);
