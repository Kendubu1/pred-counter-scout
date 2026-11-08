// Team playbook for one reviewed game (pure): how OUR five kits combine, read
// from the agent-scanned kit index (data/game-data/kit-index.json) and the
// reviewed role tags. Every ability it names exists in the current kit text;
// the sequencing is a rule of thumb (open, chain, pay off, peel), not a replay of
// what happened. Wired by `npm run postgame:comp` as film.playbook and shown as
// "Team playbook" in the Draft, comp & kits card; the coach may quote it.
//
//   Teamfight   opener = an area hard-CC ability (knock-up / stun / pull / suppress /
//               sleep / root / fear), preferring engage / tank heroes and the longest
//               stated duration; chain = up to two more hard-CC abilities from other
//               heroes, area first, timed to land as the previous one ends; payoff =
//               the damage ultimates (or best area damage) of burst / dps / control heroes
//   Pick        single-target hard CC with the longest duration, then a burst hero
//   Protect     our dps carry, with the peel / tank heroes' CC held for their divers
//   Wait out    their three longest hard-CC abilities, and any unstoppable
import type { HardCC } from './kit-index.js';

export interface PbAbility { key: string; name: string; hard: HardCC[]; hardSec: number | null; aoe: boolean; damage: boolean; mobility: string[]; unstoppable: boolean }
export interface PbHero { slug: string; name: string; role: string; tags: string[]; abilities: PbAbility[] }
export interface PbStep { hero: string; slug: string; ability: string; what: string }
export interface Play { name: string; when: string; steps: PbStep[] }
export interface Playbook { plays: Play[]; waitOut: PbStep[]; note: string | null }

const OPEN_CC: HardCC[] = ['knockup', 'stun', 'pull', 'suppress', 'sleep', 'root', 'fear', 'charm'];
const word = (a: PbAbility) => a.hard.filter((h) => OPEN_CC.includes(h) || h === 'silence').map((h) => (h === 'knockup' ? 'knock-up' : h)).join(' + ') || a.hard.join(' + ');
const dur = (a: PbAbility) => (a.hardSec ? ` (${a.hardSec}s)` : '');
const step = (h: PbHero, a: PbAbility, what: string): PbStep => ({ hero: h.name, slug: h.slug, ability: a.name, what });

export function buildPlaybook(us: PbHero[], them: PbHero[]): Playbook {
  const cc = (hs: PbHero[]) => hs.flatMap((h) => h.abilities.filter((a) => a.hard.some((x) => OPEN_CC.includes(x))).map((a) => ({ h, a })));
  const ours = cc(us);
  const plays: Play[] = [];
  const score = (x: { h: PbHero; a: PbAbility }) => (x.a.aoe ? 3 : 0) + (x.h.tags.includes('engage') || x.h.tags.includes('tank') ? 2 : 0) + (x.a.hardSec ?? 0.5) + (x.a.mobility.length || x.a.unstoppable ? 1 : 0) + (x.a.key === 'R' ? 0.5 : 0);

  // Teamfight engage
  // Openers come from tank / engage heroes; a peel hero's save (Muriel's Reversal of Fortune) is
  // never an opener (maintainer ruling 2026-11-08). With none, a control hero opens from range.
  const goesIn = (x: { h: PbHero }) => x.h.tags.includes('engage') || x.h.tags.includes('tank');
  const fromRange = (x: { h: PbHero }) => !goesIn(x) && x.h.tags.includes('control') && !x.h.tags.includes('peel');
  const openers = ours.filter((x) => x.a.aoe && goesIn(x)).sort((p, q) => score(q) - score(p));
  const ranged = ours.filter((x) => x.a.aoe && fromRange(x)).sort((p, q) => score(q) - score(p));
  const opener = openers[0] ?? ranged[0];
  let note: string | null = !openers.length
    ? (opener ? `No tank or engage hero to go in first: ${opener.h.name} opens from range with ${opener.a.name}, so fight near walls and chokes where it is hard to dodge.` : null)
    : null;
  if (opener) {
    const used = new Set([opener.h.slug]);
    const steps: PbStep[] = [step(opener.h, opener.a, `${openers.length ? 'opens' : 'opens from range'}: ${word(opener.a)}${dur(opener.a)}${opener.a.aoe ? ' on the group' : ''}${opener.a.unstoppable ? ', unstoppable on the way in' : ''}`)];
    const chain = ours.filter((x) => !used.has(x.h.slug) && !(x.h.tags.includes('peel') && !x.h.tags.includes('tank') && x.a.key === 'R')).sort((p, q) => (Number(q.a.aoe) - Number(p.a.aoe)) || ((q.a.hardSec ?? 0) - (p.a.hardSec ?? 0)));
    let prev = opener.a;
    for (const x of chain) {
      if (used.has(x.h.slug) || steps.length >= 3) continue;
      used.add(x.h.slug);
      steps.push(step(x.h, x.a, `chains ${word(x.a)}${dur(x.a)} as ${prev.name} ends`));
      prev = x.a;
    }
    const payoff = us.filter((h) => !used.has(h.slug) && h.tags.some((t) => t === 'burst' || t === 'dps' || t === 'control' || t === 'poke'))
      .map((h) => ({ h, a: h.abilities.find((a) => a.key === 'R' && a.damage) ?? h.abilities.filter((a) => a.damage && a.aoe)[0] }))
      .filter((x): x is { h: PbHero; a: PbAbility } => !!x.a).slice(0, 2);
    for (const x of payoff) steps.push(step(x.h, x.a, `pays off inside the lockdown${x.a.aoe ? ' (hits the group)' : ''}`));
    plays.push({ name: 'Teamfight engage', when: 'at an objective, when all five are up and their key CC is down', steps });
  } else {
    note = 'No tank, engage hero or area crowd control to open a fight: play for picks, or let them engage first and counter after their CC is spent.';
  }

  // Pick: single-target lockdown into burst
  const catchers = ours.filter((x) => !x.a.aoe || x.a.hard.includes('pull') || x.a.hard.includes('suppress')).sort((p, q) => (q.a.hardSec ?? 0.5) - (p.a.hardSec ?? 0.5));
  const catcher = catchers.find((x) => x.a !== opener?.a) ?? catchers[0];
  const burster = us.find((h) => h.slug !== catcher?.h.slug && h.tags.includes('burst')) ?? us.find((h) => h.slug !== catcher?.h.slug && (h.tags.includes('dps') || h.tags.includes('diver')));
  if (catcher && burster) {
    const ba = burster.abilities.find((a) => a.key === 'R' && a.damage) ?? burster.abilities.find((a) => a.damage && a.key !== 'LMB');
    const steps = [step(catcher.h, catcher.a, `catches one target: ${word(catcher.a)}${dur(catcher.a)}`)];
    if (ba) steps.push(step(burster, ba, 'follows up for the kill'));
    plays.push({ name: 'Pick', when: 'when one of them is alone or out of position in fog', steps });
  }

  // Protect the carry from their divers
  const carry = us.find((h) => h.role === 'carry' && !h.tags.includes('tank')) ?? us.find((h) => h.tags.includes('dps'));
  const divers = them.filter((h) => h.tags.includes('diver')).length ? them.filter((h) => h.tags.includes('diver')) : them.filter((h) => h.tags.includes('burst') && h.role !== 'midlane');
  if (carry && divers.length) {
    const guards = us.filter((h) => h.slug !== carry.slug && (h.tags.includes('peel') || h.tags.includes('tank')))
      .map((h) => ({ h, a: h.abilities.filter((a) => a.hard.some((x) => OPEN_CC.includes(x))).sort((p, q) => (q.hardSec ?? 0) - (p.hardSec ?? 0))[0] }))
      .filter((x): x is { h: PbHero; a: PbAbility } => !!x.a).slice(0, 2);
    if (guards.length) {
      plays.push({
        name: `Protect ${carry.name}`, when: `when ${divers.map((d) => d.name).join(' or ')} goes in`,
        steps: guards.map((g) => step(g.h, g.a, `holds ${word(g.a)} for the diver on ${carry.name}`)),
      });
    }
  }

  // Their crowd control to bait or wait out before engaging
  const theirs = cc(them).sort((p, q) => (Number(q.a.aoe) - Number(p.a.aoe)) || ((q.a.hardSec ?? 0) - (p.a.hardSec ?? 0))).slice(0, 3);
  const waitOut = theirs.map((x) => step(x.h, x.a, `${word(x.a)}${dur(x.a)}${x.a.aoe ? ', area' : ''}`));
  for (const h of them) for (const a of h.abilities) if (a.unstoppable && waitOut.length < 4) waitOut.push(step(h, a, 'unstoppable: CC will not stop it'));
  return { plays, waitOut, note };
}
