// Pure facts/prompt builder for the hero-page Eternal copy pass. The Eternal
// card used to print the raw major text ("fires 4 (+1 per 30% Bonus Attack
// Speed) projectiles that each deal 7 (+1 per level) True Damage…"): a stat
// dump that took half a phone screen and never said what it means for THIS
// hero. The full text is one tap away in the Eternal popup, so the card now
// carries one short line: what the Eternal does for this kit in this role, and
// how it changes the way you play.
//
// Factored out (like hero-coach-copy.ts) so the author pass, the independent
// critic, and the harness all rebuild the SAME facts block: the ground-check
// can never drift from what the author was handed.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clean, kitText, type RawHero } from './hero-coach-copy.js';
import { rankBand, rankByEdge, shownOptions } from './field-pick.js';

export interface Minor { name: string; n: number; w: number }
export interface FieldEternal { name: string; n: number; w: number; minor1?: Minor[]; minor2?: Minor[] }
export interface AugCell { games?: number; wins?: number; augments: { id: string; name: string; n: number; w: number }[]; eternals?: FieldEternal[]; platPlus?: { games?: number; wins?: number; augments?: { id: string; name: string; n: number; w: number }[]; eternals?: FieldEternal[] } }
export interface EternalDef { name: string; major: string; minorSlot1: { name: string; desc: string }[]; minorSlot2: { name: string; desc: string }[] }

/** The Eternals the hero page can show for this hero-role: the top three
 *  (field-pick.ts rankByEdge + under-30 fillers) under All ranks, plus any extra
 *  the Plat+ view shows. Card lines are keyed by hero/role/Eternal, not by rank
 *  band, so one line serves both views. All-ranks rows come first. */
export function topEternals(cell: AugCell): (FieldEternal & { shrunk: number })[] {
  const out: (FieldEternal & { shrunk: number })[] = shownOptions(rankByEdge(cell.eternals ?? [], cell.games || (cell.eternals ?? []).reduce((s, e) => s + e.n, 0)));
  const have = new Set(out.map((e) => e.name));
  for (const e of cell.platPlus?.games ? shownOptions(rankBand(cell, cell.platPlus, 'eternals')) : []) {
    if (have.has(e.name)) continue;
    have.add(e.name);
    // Prefer the all-ranks row: its minors rest on far more games.
    const wide = (cell.eternals ?? []).find((x) => x.name === e.name);
    out.push(wide ? { ...wide, shrunk: e.shrunk } : e);
  }
  return out;
}

/** Words that tie a line to this hero: ability names and the lane augment.
 *  Paired names ("Windsurge/Force Push") count as either half. */
export function kitTerms(hero: RawHero, augName?: string): string[] {
  return [...(hero.abilities ?? []).flatMap((a) => (a.display_name ?? '').split('/')), ...(augName ? [augName] : [])]
    .map(kitNorm).filter((t) => t.length > 2);
}

// Letters, digits and single spaces only, so "Maco Sparkle!" matches "Maco
// Sparkle", "Electrocute's" matches "Electrocute", and a catalog name's
// trailing space doesn't matter.
const kitNorm = (s: string) => s.toLowerCase().replace(/[’']s\b/g, '').replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** A card line must name the hero's kit (an ability or the lane augment):
 *  the maintainer asked how each Eternal works with THIS hero (2026-10-27), and
 *  a line with no kit word is the raw description retold. */
export function namesKit(line: string, terms: string[]): boolean {
  const l = ` ${kitNorm(line)} `;
  return terms.some((t) => l.includes(` ${t} `));
}

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'");
const topMinor = (arr?: Minor[]) => [...(arr ?? [])].sort((a, b) => b.n - a.n)[0];

/** The facts block for one hero/role: kit, lane augment, and each top Eternal's
 *  major + the minors the field actually runs with it. No winrates: the card
 *  already shows them, and a line built around one is not advice. */
export function factsFor(heroName: string, role: string, cell: AugCell, hero: RawHero,
  augCatalog: Record<string, { name: string; description: string }>, eternals: Map<string, EternalDef>): string {
  const aug = [...cell.augments].sort((a, b) => b.n - a.n)[0];
  const augLine = aug ? `"${aug.name}": ${clean(augCatalog[aug.id]?.description)}` : 'no augment evidence in this role';
  const ets = topEternals(cell).map((e) => {
    const def = eternals.get(norm(e.name));
    const minorDesc = (slot: { name: string; desc: string }[] | undefined, m?: Minor) => {
      if (!m) return null;
      const d = (slot ?? []).find((o) => norm(o.name) === norm(m.name));
      return `${m.name}${d ? ` (${d.desc})` : ''}`;
    };
    const minors = [minorDesc(def?.minorSlot1, topMinor(e.minor1)), minorDesc(def?.minorSlot2, topMinor(e.minor2))].filter(Boolean);
    return `- "${e.name}": ${def ? def.major : 'description not in our data'}${minors.length ? `\n    minors most players run with it: ${minors.join('; ')}` : ''}`;
  });
  return `HERO: ${heroName}, playing ${role}
KIT:
${kitText(hero)}
THE AUGMENT MOST ${role.toUpperCase()} PLAYERS TAKE: ${augLine}
ETERNALS SHOWN FOR THIS ROLE:
${ets.join('\n')}`;
}

export function promptFor(heroName: string, role: string, facts: string): string {
  return `You write the Eternal card copy for the Predecessor (MOBA) hero ${heroName} in the ${role} role. Eternals are pre-game blessings: one major effect plus one minor from each of two slots. The facts below are the ONLY source of truth.

${facts}

For EACH Eternal listed, write ONE line (max 30 words, one or two short sentences) that says why this Eternal fits ${heroName.toUpperCase()}'s kit and play style in this role, and how it changes the way they should play. Every line MUST name at least one of ${heroName}'s abilities (exactly as spelled in KIT) or the listed augment, tied to a real interaction: which ability triggers or feeds the Eternal, or which part of how ${heroName} fights (ganking, poking, sustained trades, farming) it rewards. If an Eternal has no direct ability interaction, name the ability that defines the play pattern it rewards. Mention a listed minor only when it changes how you play. Do NOT restate the description or recite its numbers; the full text is one tap away. Prefer no numbers at all; if you must cite one, it has to appear in the facts above. Plain words a new player gets: no "proc", "DPS", "eHP", "CC", "on-hit scaling". Never claim an interaction the facts don't support, and never promise it wins games.

Return strict JSON only, shaped: {"<eternal name>": "<line>", ...}`;
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export interface AugFile { catalog: Record<string, { name: string; description: string }>; heroes: Record<string, Record<string, AugCell>> }

/** Inputs shared by the author pass, the critic and the harness. */
export function loadEternalInputs() {
  const augs = JSON.parse(readFileSync(path.join(ROOT, 'data/aggregates/predgg-augments.json'), 'utf8')) as AugFile;
  const heroesRaw = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/heroes.json'), 'utf8')) as (RawHero & { display_name?: string; name?: string })[] | { heroes: (RawHero & { display_name?: string; name?: string })[] };
  const heroBySlug = new Map((Array.isArray(heroesRaw) ? heroesRaw : heroesRaw.heroes).map((h) => [h.slug, h]));
  const etDoc = JSON.parse(readFileSync(path.join(ROOT, 'data/game-data/eternals.json'), 'utf8')) as { eternals: EternalDef[] };
  const eternals = new Map(etDoc.eternals.map((e) => [e.name.toLowerCase().replace(/[’']/g, "'"), e]));
  return { augs, heroBySlug, eternals };
}
