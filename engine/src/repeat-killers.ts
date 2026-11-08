// Repeat killers (pure): for each squad member, the enemy heroes that kill them
// far more often than their own average across the reviewed games, with that
// hero's kit (hard CC, escapes, stealth, self-heal), how to play against it
// (kit-profiles playAgainst) and an item answer for the member's own hero.
// Read by `npm run review:killers` -> data/artifacts/repeat-killers.json, the
// "Heroes that keep killing you" card on ui/v6/coach.html?player=<uuid>.
//
// The bar (same for everyone): 3+ games facing that hero, 5+ deaths to it, and
// deaths to it per game facing it at least 1.5x the member's average deaths
// per game to any single enemy hero. "Faced" = that hero was on the enemy team.

export interface RkPlayer { pid: string; us: boolean; heroSlug: string; heroName: string; deaths: number; role: string }
export interface RkFilm { matchId: string; startTime: string; result: string; players: RkPlayer[]; kills: { killerPid?: string; killedPid?: string }[] }
export interface RkKit { hardCc: string[]; escapes: string[]; stealth: boolean; heals: boolean; unstoppable: string[] }
export interface RepeatKiller {
  slug: string; hero: string; games: number; deaths: number; perGame: number; ratio: number;
  /** the member's own heroes that died to it, most first */
  asHeroes: { hero: string; deaths: number }[];
  lastSeen: string;
  kit: RkKit | null; playAgainst: string | null; answer: string | null;
}
export interface MemberKillers { uuid: string; name: string; films: number; deathsPerGame: number; baselinePerHero: number; killers: RepeatKiller[] }

export function repeatKillers(
  member: { uuid: string; name: string }, films: RkFilm[],
  kitOf: (slug: string) => RkKit | null, playAgainst: (slug: string) => string | null,
  answerFor: (killerSlug: string, myHeroSlug: string) => string | null,
): MemberKillers {
  const mine = films.filter((f) => f.players.some((p) => p.us && p.pid === member.uuid));
  const faced = new Map<string, { hero: string; games: number; deaths: number; as: Map<string, number>; last: string; mySlugs: Map<string, number> }>();
  let totalDeaths = 0, enemySlots = 0;
  for (const f of mine) {
    const me = f.players.find((p) => p.us && p.pid === member.uuid)!;
    totalDeaths += me.deaths;
    for (const e of f.players.filter((p) => !p.us)) {
      enemySlots++;
      const c = faced.get(e.heroSlug) ?? { hero: e.heroName, games: 0, deaths: 0, as: new Map(), last: '', mySlugs: new Map() };
      c.games++;
      const d = f.kills.filter((k) => k.killerPid === e.pid && k.killedPid === me.pid).length;
      if (d) { c.deaths += d; c.as.set(me.heroName, (c.as.get(me.heroName) ?? 0) + d); c.mySlugs.set(me.heroSlug, (c.mySlugs.get(me.heroSlug) ?? 0) + d); }
      if (f.startTime > c.last) c.last = f.startTime;
      faced.set(e.heroSlug, c);
    }
  }
  // Average deaths per game to one enemy hero slot (5 enemies a game).
  const baseline = enemySlots ? totalDeaths / enemySlots : 0;
  const killers: RepeatKiller[] = [];
  for (const [slug, c] of faced) {
    const perGame = c.deaths / c.games;
    if (c.games < 3 || c.deaths < 5 || !baseline || perGame < 1.5 * baseline) continue;
    const topMine = [...c.mySlugs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    killers.push({
      slug, hero: c.hero, games: c.games, deaths: c.deaths, perGame: Math.round(perGame * 10) / 10, ratio: Math.round((perGame / baseline) * 10) / 10,
      asHeroes: [...c.as.entries()].sort((a, b) => b[1] - a[1]).map(([hero, deaths]) => ({ hero, deaths })),
      lastSeen: c.last.slice(0, 10), kit: kitOf(slug), playAgainst: playAgainst(slug), answer: topMine ? answerFor(slug, topMine) : null,
    });
  }
  killers.sort((a, b) => b.deaths * b.ratio - a.deaths * a.ratio);
  return {
    uuid: member.uuid, name: member.name, films: mine.length,
    deathsPerGame: mine.length ? Math.round((totalDeaths / mine.length) * 10) / 10 : 0,
    baselinePerHero: Math.round(baseline * 100) / 100, killers: killers.slice(0, 5),
  };
}
