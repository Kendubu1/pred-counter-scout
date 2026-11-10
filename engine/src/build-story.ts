// One lead story per build read (pure), with the rest as supporting tabs. The game is placed on
// this patch's norms for that hero in that role (hero-role-norms.json, from the ranked lineups),
// then the strongest story wins by a fixed rule, so the narrative follows the data:
//
//   snowball      a takedown-fed cooldown source AND kill participation in the top 25%
//   glass cannon  damage in the top 20% while mitigating less than 75% of that hero-role (built to
//                 deal damage, not to soak)
//   damage        damage per minute in the top 25%; the build reason is penetration (when it added
//                 25%+ against the player they killed most) or the damage boosts
//   survival      deaths per minute lower than 80% of that hero-role
//   cooldowns     the ultimate 35%+ shorter than base
//   sustain       healing per minute in the top 15%
//   toughness     damage mitigated per minute in the top 15%
// Score = the deciding percentile (+10 for the two combined stories, +5 for damage on a carry or
// mid, whose job it is); highest wins. Every number
// in the text comes from the film or the norms; nothing is inferred about positioning or intent.

export type StoryId = 'snowball' | 'glass' | 'damage' | 'survival' | 'cooldowns' | 'sustain' | 'tough';
export interface Norms { n: number; q: Record<string, number[]> }
export interface Placed { value: number; pct: number }
export interface Story {
  lead: { id: StoryId; title: string; text: string; lesson?: string } | null;
  tabs: ('damage' | 'cooldowns' | 'alive')[];
  vsNorm: { dpm: Placed; share: Placed; kp: Placed; dp10: Placed; gpm: Placed; hpm: Placed; mpm: Placed } | null;
  normN: number;
}

/** Percentile of v on 19 cut points (5th..95th), linear between them; 2 and 98 at the ends. */
export function placeOn(q: number[] | undefined, v: number): number {
  if (!q?.length) return 50;
  if (v < q[0]!) return 2;
  if (v >= q[q.length - 1]!) return 98;
  for (let i = 0; i < q.length - 1; i++) {
    if (v >= q[i]! && v < q[i + 1]!) { const span = q[i + 1]! - q[i]!; return Math.round(5 * (i + 1) + (span ? (5 * (v - q[i]!)) / span : 0)); }
  }
  return 50;
}

export function buildStory(
  p: { heroName: string; role: string; kills: number; deaths: number; assists: number; damageToHeroes: number; goldEarned: number; healingDone: number; mitigated: number },
  team: { kills: number; damage: number }, durationMin: number, norms: Norms | undefined,
  build: {
    ult: { name: string; base: number; endGame: number } | null; fed: { name: string; takedowns: number } | null;
    pen: { hero: string; more: number; type: string } | null; amps: string[]; sustain: boolean; tough: boolean;
  },
): Story {
  const tabs: Story['tabs'] = ['damage', 'cooldowns', 'alive'];
  if (!norms) return { lead: null, tabs, vsNorm: null, normN: 0 };
  const min = Math.max(durationMin, 1);
  const raw = { dpm: p.damageToHeroes / min, share: team.damage ? p.damageToHeroes / team.damage : 0, kp: team.kills ? (p.kills + p.assists) / team.kills : 0, dp10: (p.deaths / min) * 10, gpm: p.goldEarned / min, hpm: p.healingDone / min, mpm: p.mitigated / min };
  const v = Object.fromEntries(Object.entries(raw).map(([k, x]) => [k, { value: Math.round(x * 100) / 100, pct: placeOn(norms.q[k], x) }])) as NonNullable<Story['vsNorm']>;
  const alive = 100 - v.dp10.pct; // higher = died less than more of that hero-role
  const who = `${p.heroName} ${p.role === 'midlane' ? 'mid' : p.role} players this patch`;
  const cut = build.ult ? Math.round((1 - build.ult.endGame / build.ult.base) * 100) : 0;
  // The build behind the damage (maintainer, 2026-11-09: the items and their synergy, not who took it).
  const dmgWhy = build.amps.length ? `The damage came from ${build.amps.slice(0, 3).join(', ')}.` : '';
  const cands: { id: StoryId; score: number; title: string; text: string; tab: Story['tabs'][number] }[] = [];
  if (build.fed && build.ult && v.kp.pct >= 75) cands.push({ id: 'snowball', tab: 'cooldowns', score: v.kp.pct + 10, title: 'Stayed alive, joined every fight, and each takedown sped up the ultimate',
    text: `In ${Math.round(v.kp.value * 100)}% of the team's kills (more than ${v.kp.pct}% of ${who}) and died ${p.deaths} time${p.deaths === 1 ? '' : 's'} (fewer than about ${alive}% of them). ${build.fed.name} turned ${build.fed.takedowns} takedowns into ability haste, so ${build.ult.name} came back every ~${Math.round(build.ult.endGame)}s instead of ${build.ult.base}s.` });
  if (v.dpm.pct >= 80 && v.mpm.pct <= 25) cands.push({ id: 'glass', tab: 'damage', score: v.dpm.pct + 10, title: 'Built to deal damage, not to soak it',
    text: `${Math.round(v.dpm.value).toLocaleString('en-US')} hero damage a minute, more than ${v.dpm.pct}% of ${who} (${Math.round(v.share.value * 100)}% of the team's), while mitigating less than ${100 - v.mpm.pct}% of them. ${dmgWhy} Died ${p.deaths} time${p.deaths === 1 ? '' : 's'}.` });
  if (v.dpm.pct >= 75) cands.push({ id: 'damage', tab: 'damage', score: v.dpm.pct + (p.role === 'carry' || p.role === 'midlane' ? 5 : 0), title: 'Damage well above normal',
    text: `${Math.round(v.dpm.value).toLocaleString('en-US')} hero damage a minute, more than ${v.dpm.pct}% of ${who} (${Math.round(v.share.value * 100)}% of the team's). ${dmgWhy}` });
  if (alive >= 80) cands.push({ id: 'survival', tab: 'alive', score: alive, title: 'Hard to kill',
    text: `${p.deaths ? `Died ${p.deaths} time${p.deaths === 1 ? "" : "s"} in ${Math.round(min)} minutes` : `Never died in ${Math.round(min)} minutes`}, fewer deaths than about ${alive}% of ${who}.${build.tough || build.sustain ? ` The build added ${[build.tough ? 'health and armor' : '', build.sustain ? 'healing off damage' : ''].filter(Boolean).join(' and ')}.` : ''}` });
  if (build.ult && cut >= 35) cands.push({ id: 'cooldowns', tab: 'cooldowns', score: 60 + cut / 2, title: `${build.ult.name} on a short timer`,
    text: `${build.ult.name} came back every ~${Math.round(build.ult.endGame)}s instead of ${build.ult.base}s, ${cut}% faster.` });
  if (v.hpm.pct >= 85 && build.sustain) cands.push({ id: 'sustain', tab: 'alive', score: v.hpm.pct, title: 'Healed through fights',
    text: `${Math.round(v.hpm.value).toLocaleString('en-US')} healing a minute, more than ${v.hpm.pct}% of ${who}.` });
  if (v.mpm.pct >= 85) cands.push({ id: 'tough', tab: 'alive', score: v.mpm.pct, title: 'Soaked the fights',
    text: `${Math.round(v.mpm.value).toLocaleString('en-US')} damage mitigated a minute, more than ${v.mpm.pct}% of ${who}.` });
  cands.sort((a, b) => b.score - a.score);
  const lead = cands[0] ?? null;
  const order = lead ? [lead.tab, ...tabs.filter((t) => t !== lead.tab)] : tabs;
  // The glass-cannon story's own lesson (the others take theirs from the build read's tabs).
  const glassLesson = `${p.heroName} built for damage with little to soak it: focus ${p.heroName} first in fights and the damage leaves with them (a plan, not something the data shows happened).`;
  return { lead: lead ? { id: lead.id, title: lead.title, text: lead.text.replace(/\s+/g, ' ').trim(), ...(lead.id === 'glass' ? { lesson: glassLesson } : {}) } : null, tabs: order, vsNorm: v, normN: norms.n };
}
