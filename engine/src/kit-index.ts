// Kit index (pure): each hero's crowd control, mobility, sustain and
// protection read from the CURRENT catalog ability text (data/catalog,
// pred.gg). The catalog marks every crowd-control effect with <CC_Text>; this
// parses those spans into normalized effects, so the review's "who has the
// CC" read tracks the live game instead of the pre-1.14 hero-abilities.json.
//
// Classification:
//   hard CC   stun, root, knockup, knockback, pull, suppress, silence, fear,
//             charm, sleep (mesmerize), blind, banish, ground (stops dashes),
//             disable: the target loses control or movement
//   soft CC   slow, tether (leash that breaks by walking away)
//   self      unstoppable (immune to CC), stealth, dash / blink / leap /
//             teleport, heal, shield, cleanse: read from the plain text
// Durations are taken from the menu text when the number is literal; a value
// that scales by rank is kept as its top-rank number. Unknown or ambiguous
// spans are reported, never guessed; the agent scan (kit-index-review.json)
// confirms or corrects each hero.

export type HardCC = 'stun' | 'root' | 'knockup' | 'knockback' | 'pull' | 'suppress' | 'silence' | 'fear' | 'charm' | 'sleep' | 'blind' | 'banish' | 'ground' | 'disable';
export type SoftCC = 'slow' | 'tether';
export type Mobility = 'dash' | 'blink' | 'leap' | 'teleport';
export interface AbilityKit {
  key: string; name: string;
  hard: HardCC[]; soft: SoftCC[]; mobility: Mobility[];
  unstoppable: boolean; stealth: boolean; heal: boolean; shield: boolean; cleanse: boolean;
  /** longest hard-CC duration at top rank, seconds, when the text states one */
  hardSec: number | null;
}
export interface HeroKit {
  name: string; abilities: AbilityKit[];
  hardCount: number; hardTypes: HardCC[]; mobilityCount: number;
  unstoppable: boolean; stealth: boolean; sustain: boolean; cleanse: boolean;
  /** CC spans the parser could not classify, for the scan to settle */
  unknownSpans: string[];
}

const HARD_WORDS: [RegExp, HardCC][] = [
  [/stun/, 'stun'], [/root|restrain|immobiliz|\bhalt/, 'root'], [/knock(s|ed)? ?up|launch|airborne|suspend/, 'knockup'],
  [/knock(s|ed)? ?back|push(es|ed|e)?( ?back)?|pushback/, 'knockback'], [/pull|drag|grab/, 'pull'],
  [/suppress|supress/, 'suppress'], [/silence/, 'silence'], [/fear/, 'fear'], [/charm/, 'charm'],
  [/mesmeri[sz]/, 'sleep'], [/blind/, 'blind'], [/banish/, 'banish'], [/\bground/, 'ground'], [/disable|interrupt/, 'disable'],
];
const SOFT_WORDS: [RegExp, SoftCC][] = [[/slow/, 'slow'], [/tether/, 'tether']];
// Spans that are CC-styled but are not an effect on an enemy (or are covered by the self reads).
const IGNORE = /^(|marked|debuff|cooldown progression|enemy tower|unstoppable|stealth)$/;

const strip = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** Normalize one <CC_Text> span to an effect; null for a duration/number span or an ignored word. */
export function classifySpan(span: string): { hard?: HardCC; soft?: SoftCC } | null | 'unknown' {
  const w = span.toLowerCase().replace(/\{[^}]*\}/g, '').replace(/[\d.%s\-]+$/, '').replace(/[\d.%]+/g, '').trim();
  if (!w || IGNORE.test(w) || /^(s|% slow|-)$/.test(w)) return null;
  for (const [re, t] of HARD_WORDS) if (re.test(w)) return { hard: t };
  for (const [re, t] of SOFT_WORDS) if (re.test(w)) return { soft: t };
  return 'unknown';
}

/** Top-rank seconds from text like "Stunning them for 0.5s" or "for 0.6/0.8/1s". */
function hardSeconds(menu: string): number | null {
  const m = [...strip(menu).matchAll(/(?:stun\w*|root\w*|knock\w*|suppress\w*|silenc\w*|fear\w*|charm\w*|mesmeri\w*|immobiliz\w*|restrain\w*|blind\w*)[^.]{0,60}?for ([\d.]+(?:\/[\d.]+)*)\s*s/gi)];
  const vals = m.map((x) => Number(x[1]!.split('/').pop())).filter((n) => Number.isFinite(n) && n > 0 && n < 10);
  return vals.length ? Math.max(...vals) : null;
}

export function kitOfAbility(a: { key?: string; display_name: string; game_description?: string | null; menu_description?: string | null }, unknown: Set<string>): AbilityKit {
  const g = a.game_description ?? '', menu = a.menu_description ?? '';
  const hard = new Set<HardCC>(), soft = new Set<SoftCC>();
  for (const [, span] of g.matchAll(/<CC_Text>(.*?)<\/CC_Text>/g)) {
    const c = classifySpan(span!);
    if (c === 'unknown') unknown.add(span!.trim());
    else if (c?.hard) hard.add(c.hard);
    else if (c?.soft) soft.add(c.soft);
  }
  const text = `${strip(g)} ${strip(menu)}`.toLowerCase();
  const mobility = new Set<Mobility>();
  if (/\bdash|\blunge|\bcharge forward|\bcharges|\bsurge forward|\bslide/.test(text)) mobility.add('dash');
  if (/\bblink|\bteleport(s)? a short/.test(text)) mobility.add('blink');
  if (/\bleap|\bjump|\bvault|\bpounce/.test(text)) mobility.add('leap');
  if (/\bteleport(?! a short)/.test(text)) mobility.add('teleport');
  return {
    key: a.key ?? '', name: a.display_name,
    hard: [...hard], soft: [...soft], mobility: [...mobility],
    unstoppable: /unstoppable/.test(text), stealth: /\bstealth|\binvisib|\bcamouflag/.test(text),
    heal: /\bheal(s|ing)?\b|\bomnivamp|\blifesteal|\brestor(e|es) .{0,20}health/.test(text) && !/reduc\w* heal|healing reduction|anti-heal/.test(text),
    shield: /\bshield/.test(text), cleanse: /\bcleans/.test(text),
    hardSec: hard.size ? hardSeconds(menu) : null,
  };
}

export function heroKit(h: { display_name: string; abilities: Parameters<typeof kitOfAbility>[0][] }): HeroKit {
  const unknown = new Set<string>();
  const abilities = h.abilities.map((a) => kitOfAbility(a, unknown));
  const hardTypes = [...new Set(abilities.flatMap((a) => a.hard))];
  return {
    name: h.display_name, abilities,
    hardCount: abilities.filter((a) => a.hard.length).length, hardTypes,
    mobilityCount: abilities.filter((a) => a.mobility.length).length,
    unstoppable: abilities.some((a) => a.unstoppable), stealth: abilities.some((a) => a.stealth),
    sustain: abilities.some((a) => a.heal || a.shield), cleanse: abilities.some((a) => a.cleanse),
    unknownSpans: [...unknown],
  };
}
