// Match detail from the pred.gg public match stream that the films did not keep (found
// 2026-11-08 by a one-page probe). Saved by `npm run postgame:loadout` in the same lookup that
// reads loadouts, so it costs no extra calls:
//
//   players[i].stream   level (final), levelUps (seconds of every level-up and which ability it
//                       went into: P/S/A/U), purchases ({ slug, sec } for every completed Epic /
//                       Legendary item and crest, exact times), goldAt (goldEarnedAtInterval as
//                       given), damage dealt / taken FROM HEROES split physical / magical / true,
//                       healing by source (item, crest, utility), shields received, minions (lane,
//                       jungle, enemy jungle), largest killing spree / multikill / crit, wards
//                       (placements with time, type and map position; destroyed)
//   film.streamMatch    every jungle / river / objective kill (type, killer, time, position),
//                       structure kills, bans, how the match ended
// pred.gg's hero kill list has no assisters, so assist times stay unknown.

export interface StreamPlayer {
  level: number | null;
  levelUps: { sec: number; ab: 'P' | 'S' | 'A' | 'U' | '?' }[];
  purchases: { slug: string; sec: number }[];
  goldAt: number[];
  dealtToHeroes: { physical: number; magical: number; true: number };
  takenFromHeroes: { total: number; physical: number; magical: number; true: number };
  healing: { total: number; item: number; crest: number; utility: number }; shieldsReceived: number;
  minions: { total: number; lane: number; jungle: number; enemyJungle: number };
  spree: number; multikill: number; largestCrit: number;
  wards: { placed: { sec: number; type: number; x: number; y: number }[]; destroyed: number };
}
export interface StreamMatch {
  endReason: string | null;
  bans: { hero: string; team: number }[];
  objectives: { type: string; byPid: string | null; sec: number; x: number; y: number }[];
  structures: { type: string; byPid: string | null; team: number; sec: number; x: number; y: number }[];
}

const AB: Record<string, StreamPlayer['levelUps'][number]['ab']> = { Primary: 'P', Secondary: 'S', Alternate: 'A', Ultimate: 'U' };
const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : Number(x) || 0);
const r = (x: unknown) => Math.round(n(x));

export function streamPlayerOf(row: any, buildSlug: Map<number, string>): StreamPlayer {
  const dh = row.damageHealData ?? {}, md = row.minionData ?? {}, cd = row.combatData ?? {}, wd = row.wardsData ?? {};
  const purchases: StreamPlayer['purchases'] = [];
  for (const t of row.incomeData?.transactions ?? []) {
    if (t?.transactionType !== 10 && t?.transactionType !== 11) continue;
    const slug = buildSlug.get(t.itemId);
    if (slug && !purchases.some((p) => p.slug === slug)) purchases.push({ slug, sec: r(t.gameTime) });
  }
  return {
    level: row.heroLevel != null ? n(row.heroLevel) : null,
    levelUps: (row.abilityData ?? []).map((a: any) => ({ sec: r(a.gameTime), ab: AB[String(a.abilityInputTag ?? '').split('.').pop()!] ?? '?' })),
    purchases,
    goldAt: Array.isArray(row.incomeData?.goldEarnedAtInterval) ? row.incomeData.goldEarnedAtInterval.map(r) : [],
    dealtToHeroes: { physical: r(dh.physicalDamageDealtToHeroes), magical: r(dh.magicalDamageDealtToHeroes), true: r(dh.trueDamageDealtToHeroes) },
    takenFromHeroes: { total: r(dh.totalDamageTakenFromHeroes), physical: r(dh.physicalDamageTakenFromHeroes), magical: r(dh.magicalDamageTakenFromHeroes), true: r(dh.trueDamageTakenFromHeroes) },
    healing: { total: r(dh.totalHealingDone), item: r(dh.itemHealingDone), crest: r(dh.crestHealingDone), utility: r(dh.utilityHealingDone) },
    shieldsReceived: r(dh.totalShieldingReceived),
    minions: { total: r(md.minionsKilled), lane: r(md.laneMinionsKilled), jungle: r(md.neutralMinionsKilled), enemyJungle: r(md.neutralMinionsEnemyJungle) },
    spree: r(cd.largestKillingSpree), multikill: r(cd.largestMultiKill), largestCrit: r(dh.largestCriticalStrike),
    wards: { placed: (wd.wardPlacements ?? []).map((w: any) => ({ sec: r(w.gameTime), type: r(w.typeId), x: r(w.location?.x), y: r(w.location?.y) })), destroyed: r(wd.wardsDestroyed) },
  };
}

export function streamMatchOf(m: any): StreamMatch {
  const short = (t: unknown) => String(t ?? '').replace(/^Type\.Entity\.(?:Character\.|Pawn\.)?/, '');
  return {
    endReason: m.matchEndReason ?? null,
    bans: (m.heroBans ?? []).map((b: any) => ({ hero: String(b.heroName), team: n(b.teamId) })),
    objectives: (m.objectiveKills ?? []).map((o: any) => ({ type: short(o.killedEntityType), byPid: o.killerPlayerId || null, sec: r(o.gameTime), x: r(o.location?.x), y: r(o.location?.y) })),
    structures: (m.structureDestructions ?? []).map((s: any) => ({ type: short(s.structureEntityType), byPid: s.destructionPlayerId || null, team: n(s.teamId), sec: r(s.gameTime), x: r(s.location?.x), y: r(s.location?.y) })),
  };
}

/** Level at a game second from the level-up times (level 1 at 0s, one level per entry). */
export function levelAt(levelUps: { sec: number }[], sec: number): number {
  return Math.max(1, levelUps.filter((l) => l.sec <= sec).length);
}
