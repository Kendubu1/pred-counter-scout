// Pure prompt/facts builder for the hero-page coach-line pass. Factored out of
// the ingest script (the same way copy-verify.ts was) so the harness can check,
// with no API and no agent, that every shipped line is grounded in the exact
// block the author was handed — the test rebuilds the facts from the committed
// artifacts and re-runs the verifier over data/aggregates/hero-coach-lines.json.

export interface RawAbility { key: string; display_name: string; cooldown?: number[]; menu_description?: string; game_description?: string }
export interface RawHero { slug: string; abilities?: RawAbility[] }

export interface RoleV {
  role: string;
  coachLine: string;
  build: { title: string; archetypes: string[]; items: { name: string; spikeMinute: number | null }[] };
  stages: { label: string; minute: number | null; level: number; headline: string; core: { name: string }[] }[];
  eternals: { top: { name: string; headlinePct: number; burstPct: number; rot20Pct: number; ehpPct: number }[] };
  laneSteer: { augment: { name: string }; playstyle: string; modeled: boolean; wr: number | null; n: number | null } | null;
  matchups: { enemy: string; checkpoints: { minute: number; verdict: string }[] }[];
  confidence: { notes: string[] };
}
export interface Artifact { slug: string; name: string; damageType: string; attackType: string; roles: RoleV[] }

export const clean = (t?: string) => (t || '').replace(/<br\s*\/?>(\n)?/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

// The stage `headline` is an internal objective key (`rot10VsSquishy`). Never
// hand engine vocabulary to the author — it reads it back out as jargon, which
// is the exact defect (v6 review C2) this pass exists to fix.
const OBJECTIVE_WORDS: Record<string, string> = {
  burstVsSquishy: 'one-combo burst against a squishy target',
  rot10VsSquishy: 'a 10-second rotation against a squishy target',
  rot20VsBruiser: 'a 20-second fight against a bruiser',
  autoDps10VsSquishy: 'sustained basic-attack damage',
  ehpPhysical: 'surviving physical damage',
  ehpMagical: 'surviving magical damage',
  sustain10s: 'healing itself back up through lifesteal',
  healShield10s: 'healing and shielding an ally',
  allyUtility10s: 'buffing and protecting allies',
};
export const objectiveWords = (k: string): string => OBJECTIVE_WORDS[k] ?? k;

export const kitText = (hero: RawHero): string =>
  (hero.abilities || []).filter((a) => a.menu_description || a.game_description)
    .map((a) => `- ${a.key} "${a.display_name}": ${clean(a.menu_description || a.game_description)}`).join('\n');

/** The block of facts the author may draw numbers from — also the ground-check
 *  source, so prompt and verifier can never drift apart. */
export function factsFor(art: Artifact, rv: RoleV, hero: RawHero): string {
  const items = rv.build.items.map((i) => `${i.name}${i.spikeMinute != null ? ` (done ~minute ${i.spikeMinute})` : ''}`).join(' -> ');
  const stages = rv.stages.map((s) => `${s.label}: ${s.core.map((c) => c.name).join(' + ')}${s.minute != null ? ` by minute ${s.minute}` : ''} (level ${s.level}), best at ${objectiveWords(s.headline)}`).join('\n  ');
  const e0 = rv.eternals.top[0];
  const eternal = e0
    ? `${e0.name} — sim deltas at minute 15: headline output ${e0.headlinePct}%, burst ${e0.burstPct}%, 20-second fights ${e0.rot20Pct}%, tankiness ${e0.ehpPct}%`
    : 'no modeled Eternal moves this kit much';
  const steer = rv.laneSteer
    ? `the field's ${rv.role} augment is "${rv.laneSteer.augment.name}" — a ${rv.laneSteer.playstyle} playstyle${rv.laneSteer.wr != null && rv.laneSteer.n != null ? ` (${rv.laneSteer.wr}% over ${rv.laneSteer.n} games)` : ''}; the sim ${rv.laneSteer.modeled ? 'models this augment' : "cannot model this augment, so the build is steered by the declared playstyle, not by simulated magnitude"}`
    : 'no augment evidence in this lane';
  // Matchups as verdict shape, not raw dots: which enemies the checkpoints say
  // this kit beats / loses, so the line can coach the lane instead of listing.
  const shape = rv.matchups.map((m) => {
    const v = m.checkpoints.map((c) => c.verdict);
    const you = v.filter((x) => x === 'you').length, en = v.filter((x) => x === 'enemy').length;
    return `${m.enemy}: ${you > en ? 'ours' : en > you ? 'theirs' : 'even'}`;
  }).join(' · ');

  return `HERO: ${art.name} — ${art.damageType}, ${art.attackType}, played ${rv.role}
ABILITIES:
${kitText(hero)}
OUR BUILD ("${rv.build.title}"): ${items}
  archetype corner(s) the sim optimized: ${rv.build.archetypes.join(', ') || 'none stated'}
STAGE TIMELINE:
  ${stages}
BEST ETERNAL: ${eternal}
LANE AUGMENT: ${steer}
LANE MATCHUPS (our checkpoint verdicts): ${shape || 'none computed'}
HONESTY NOTES (things that are NOT proven): ${rv.confidence.notes.join(' | ')}
CURRENT TEMPLATED LINE (this is what you are replacing): ${rv.coachLine}`;
}

/** The full authored task for one hero+lane. Deterministic: the plan step of the
 *  loop is code, so the author can only be grounded in what we handed it. */
export function promptFor(art: Artifact, rv: RoleV, hero: RawHero, facts = factsFor(art, rv, hero)): string {
  return `You coach a brand-new Predecessor (a MOBA) player on how to actually PLAY ${art.name} in the ${rv.role} lane. The data below is the ONLY source of truth; use ONLY numbers that appear in it.

${facts}

Return strict JSON only:
{"line":"<2 sentences, max 45 words total: how to play this kit in this lane — the pattern to repeat in a fight (which ability opens, what follows), and what changes once the build comes online>",
 "watchout":"<1 sentence, max 25 words: the blunt situation where this plan falls apart and what to do instead>"}

Rules:
- Action first, mechanism second, numbers last and sparingly. Lead with a verb the player can act on ("Open with ${(hero.abilities || [])[1]?.key ?? 'your dash'}…"), never with a statistic. A bare winrate is not advice.
- Name real abilities from the ABILITIES block by their in-game name; do not invent mechanics or cooldowns.
- Plain language, no jargon: say "tankiness" not "eHP", "stuns and roots" not "CC", "the minutes your combo can actually kill them" not "kill window", "adjusted for sample size" not "shrunk".
- Do NOT claim the sim proved anything the HONESTY NOTES contradict. If the augment is unmodeled, coach the playstyle, not a magnitude.
- Use ONLY numbers that appear above; when unsure, use none. Second person is fine here (this is a single reader on their own hero page).`;
}

/** The artifact files that carry hero role views (skips index/meta/coach/squad/matrix). */
export const isHeroArtifact = (f: string): boolean =>
  f.endsWith('.json') && !['index.json', 'meta.json', 'coach.json', 'squad.json'].includes(f) && !f.includes('matrix');
