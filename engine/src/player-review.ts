// Per-member player review (data/artifacts/player-reviews.json, the "Your
// review" card on ui/v6/coach.html?player=<uuid>).
//
// Same rules for every member, and a tip is emitted only when its evidence
// clears the bar written next to it. Three kinds of baseline, never mixed:
//   - own career      : lane and hero records from the pred.gg profile
//                       (data/artifacts/players/<uuid>.json, already shrunk)
//   - squad           : the five members' rates in the squad films
//                       (fight-habits.json, rotation-habits.json)
//   - lobby           : every NON-squad player in the same role in those same
//                       ranked films, so the comparison is same games, same
//                       ranks, same patch. Gated by a two-standard-error test.
// Pure: no I/O here, so the rules are unit-tested (test/player-review.test.ts).

export type Level = 'strong' | 'solid' | 'association';

export interface Tip {
  kind: 'keep' | 'fix';
  area: 'lanes' | 'heroes' | 'pool' | 'duo' | 'deaths' | 'rotations' | 'fights' | 'lobby';
  title: string;
  finding: string;
  action: string;
  level: Level;
  receipt: string;
  weight: number; // sort key within a level: size of the effect, larger first
}

export interface Review {
  uuid: string;
  name: string;
  headline: string;
  form: string | null;     // recent-form line from the profile, shown under the headline
  extras: string | null;   // the "group chat" receipts (pentakills, sprees), shown as a footnote
  keep: Tip[];
  fix: Tip[];
  films: number;
}

interface Role { role: string; games: number; rawWr: number; shrunkWr: number }
interface Hero { slug: string; name: string; games: number; rawWr: number; shrunkWr: number; edge: number; deathsPerGame: number; primaryRole?: string }
export interface Profile {
  player: { uuid: string; name: string; career: { games: number; winrate: number; deathsPerGame: number }; current: { points: number; rank: string } };
  goal: { tier: string; vp: number; gapVp: number; peakAllTime: number };
  roles: Role[];
  pool: Hero[];
  leanInto: Hero[];
  poolWidth: { heroesPlayed20Plus: number; top3Share: number };
  ledger?: { entries: { change: string; winsPer100: number; receipt: string }[] };
  insights?: { title: string; finding: string; receipt?: string }[];
}
export interface Pair { a: string; b: string; aName: string; bName: string; games: number; winrate: number }
export interface FightMember { games: number; deaths: number; firstToFall: number; caughtOut: number; fightsPresent: number; fightsPresentWon: number; fightsAbsent: number; fightsAbsentWon: number }
export interface RotationMember { games: number; rotationKills: number; rotationDeaths: number; costHome: number }
// One player-game in a film, flattened: role, the per-game stats we compare,
// and squadName (null for lobby players).
export interface FilmRow { squadName: string | null; role: string; durationMin: number; deaths: number; wardsPlaced: number; damageToHeroes: number; goldEarned: number; kp: number | null }

const pct = (x: number, d = 1) => (x * 100).toFixed(d);
const ROLE_LABEL: Record<string, string> = { midlane: 'mid', carry: 'carry', support: 'support', jungle: 'jungle', offlane: 'offlane' };
const roleName = (r: string) => ROLE_LABEL[r] ?? r;

// ---- career: lanes, heroes, pool -------------------------------------------------

// Lanes: compare roles with 100+ games on the shrunk winrate. A 2-point gap
// between the best and worst such lane is a lane tip; inside 2 points the
// player is lane-flexible and the tip says so (hero choice matters more).
function laneTips(p: Profile): Tip[] {
  const solid = p.roles.filter((r) => r.games >= 100).sort((a, b) => b.shrunkWr - a.shrunkWr);
  if (solid.length < 2) return [];
  const best = solid[0], worst = solid[solid.length - 1];
  const gap = best.shrunkWr - worst.shrunkWr;
  const level: Level = best.games >= 150 && worst.games >= 150 ? 'strong' : 'solid';
  if (gap < 0.02) {
    return [{
      kind: 'keep', area: 'lanes', level, weight: 0.02 - gap,
      title: 'Lane barely matters for you',
      finding: `Your ${solid.length} main lanes are within ${pct(gap)} points of each other (${solid.map((r) => `${roleName(r.role)} ${pct(r.shrunkWr)}%`).join(', ')}).`,
      action: 'Being filled costs you little. Spend your effort on hero choice instead.',
      receipt: solid.map((r) => `${roleName(r.role)} ${r.games} games`).join(' · '),
    }];
  }
  return [{
    kind: 'fix', area: 'lanes', level, weight: gap,
    title: `Queue ${roleName(best.role)}, avoid ${roleName(worst.role)}`,
    finding: `${roleName(best.role)[0].toUpperCase() + roleName(best.role).slice(1)} is your best lane at ${pct(best.shrunkWr)}%; ${roleName(worst.role)} is your worst at ${pct(worst.shrunkWr)}%, a ${pct(gap)}-point gap.`,
    action: `Put ${roleName(best.role)} first in queue and leave ${roleName(worst.role)} off. When you are filled there, play your safest comfort hero.`,
    receipt: `${roleName(best.role)} ${best.games} games · ${roleName(worst.role)} ${worst.games} games (raw ${pct(worst.rawWr)}%)${ledgerGain(p, worst.role, best.role)}`,
  }];
}

// The profile's ledger already prices "move the X games to Y" in wins per
// 100 games; quote it on the matching tip instead of repeating it as a card.
function ledgerGain(p: Profile, ...words: string[]): string {
  const e = p.ledger?.entries.find((x) => words.every((w) => x.change.toLowerCase().includes(w.toLowerCase())));
  return e ? ` · worth about +${e.winsPer100} wins per 100 games` : '';
}

// Heroes: "climb heroes" = the profile's own lean-into list (the page's
// "Lean into these" card, so the two never disagree), kept only when the hero
// also beats the player's own career winrate (a hero that beats its field but
// still loses for you is not a climb hero). "Comfort trap" = the most-played hero (100+ games)
// that is not beating that average.
function heroTips(p: Profile): Tip[] {
  const out: Tip[] = [];
  const climb = p.leanInto.filter((h) => h.shrunkWr > p.player.career.winrate).sort((a, b) => b.edge - a.edge).slice(0, 2);
  if (climb.length) {
    out.push({
      kind: 'keep', area: 'heroes', level: climb.every((h) => h.games >= 100) ? 'strong' : 'solid', weight: climb[0].edge,
      title: `Your climb ${climb.length > 1 ? 'heroes' : 'hero'}: ${climb.map((h) => h.name).join(' and ')}`,
      finding: climb.map((h) => `${h.name}: ${pct(h.rawWr)}% over ${h.games} games, about ${pct(h.edge)} more wins per 100 than the average ${h.name} player`).join('. ') + '.',
      action: `Make ${climb.length > 1 ? 'these' : 'this'} your first pick${climb.length > 1 ? 's' : ''} whenever the lane allows.`,
      receipt: `win rates adjusted toward your own average, so short hot streaks do not count${ledgerGain(p, climb[0].name)}`,
    });
  }
  const top = [...p.pool].sort((a, b) => b.games - a.games)[0];
  if (top && top.games >= 100 && top.edge <= 0.005 && !climb.some((h) => h.slug === top.slug)) {
    out.push({
      kind: 'fix', area: 'heroes', level: 'solid', weight: 0.01 - top.edge,
      title: `${top.name} is your most played, but gives you no edge`,
      finding: `${top.games} games at ${pct(top.rawWr)}%, about level with the average ${top.name} player.`,
      action: climb.length ? `Swap some ${top.name} games for ${climb[0].name}.` : `Keep ${top.name} as comfort, but it is not what will climb you.`,
      receipt: `${top.games} games · edge ${top.edge >= 0 ? '+' : ''}${pct(top.edge)} per 100`,
    });
  }
  return out;
}

// Pool: top-three share under 60% of games.
function poolTip(p: Profile): Tip[] {
  const s = p.poolWidth.top3Share;
  if (s >= 0.6) return [];
  return [{
    kind: 'fix', area: 'pool', level: 'solid', weight: 0.6 - s,
    title: 'Narrow your hero pool',
    finding: `You have played ${p.poolWidth.heroesPlayed20Plus} heroes 20+ times, and your top three are only ${pct(s, 0)}% of your games.`,
    action: 'Aim for about 70% of games on your top three. Fewer heroes means more reps on each matchup.',
    receipt: `${p.player.career.games.toLocaleString()} career games`,
  }];
}

// Duo: best ranked pairing with 150+ games together, 2+ points above the
// player's own career winrate.
function duoTip(p: Profile, pairs: Pair[]): Tip[] {
  const mine = pairs.filter((x) => (x.a === p.player.uuid || x.b === p.player.uuid) && x.games >= 150)
    .sort((a, b) => b.winrate - a.winrate)[0];
  if (!mine || mine.winrate - p.player.career.winrate < 0.02) return [];
  const mate = mine.a === p.player.uuid ? mine.bName : mine.aName;
  return [{
    kind: 'keep', area: 'duo', level: mine.games >= 250 ? 'strong' : 'solid', weight: mine.winrate - p.player.career.winrate,
    title: `Duo with ${mate}`,
    finding: `${pct(mine.winrate)}% over ${mine.games} ranked games together, against ${pct(p.player.career.winrate)}% for your career.`,
    action: `When only two of you are on, queue with ${mate}.`,
    receipt: `${mine.games} games together`,
  }];
}

// ---- squad films: deaths, rotations, fights -------------------------------------

// Squad-relative: flag a rate only when it is the highest or lowest of the
// five AND at least 15% from the squad median. With five people "most" alone
// is noise; the 15% margin keeps a near-tie from becoming a tip.
function rank5(me: number, all: number[]) {
  const sorted = [...all].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return { median, highest: me === sorted[sorted.length - 1], lowest: me === sorted[0], rel: median ? (me - median) / median : 0 };
}

function deathTips(name: string, fights: Record<string, FightMember>, profile: Profile): Tip[] {
  const me = fights[name];
  if (!me || me.games < 40) return [];
  const per = (m: FightMember, k: 'caughtOut' | 'firstToFall' | 'deaths') => m[k] / m.games;
  const out: Tip[] = [];
  const all = Object.values(fights);
  const caught = rank5(per(me, 'caughtOut'), all.map((m) => per(m, 'caughtOut')));
  const first = rank5(per(me, 'firstToFall'), all.map((m) => per(m, 'firstToFall')));
  const squadRange = (k: 'caughtOut' | 'firstToFall') => {
    const v = all.map((m) => per(m, k)); return `squad ${Math.min(...v).toFixed(2)}–${Math.max(...v).toFixed(2)}`;
  };
  if (caught.highest && caught.rel >= 0.15) {
    // Point at the pool hero they die least on, if one stands out (50+ games, 0.4 fewer deaths than career).
    const safe = profile.pool.filter((h) => h.games >= 50 && profile.player.career.deathsPerGame - h.deathsPerGame >= 0.4)
      .sort((a, b) => a.deathsPerGame - b.deathsPerGame)[0];
    out.push({
      kind: 'fix', area: 'deaths', level: 'solid', weight: caught.rel,
      title: 'Getting caught alone the most',
      finding: `${per(me, 'caughtOut').toFixed(2)} solo deaths per game, the most in the squad and ${pct(caught.rel, 0)}% above the squad middle.`,
      action: `Ward ahead before you move through the map, and group up before objectives.${safe ? ` You die least on ${safe.name} (${safe.deathsPerGame.toFixed(1)} a game against ${profile.player.career.deathsPerGame.toFixed(1)} overall).` : ''}`,
      receipt: `${me.caughtOut} caught out in ${me.games} squad games · ${squadRange('caughtOut')}`,
    });
  } else if (caught.lowest && caught.rel <= -0.15) {
    out.push({
      kind: 'keep', area: 'deaths', level: 'solid', weight: -caught.rel,
      title: 'Hardest to catch in the squad',
      finding: `${per(me, 'caughtOut').toFixed(2)} solo deaths per game, the fewest of the five.`,
      action: 'Keep it. Your map awareness lets you take the riskier rotations the team needs.',
      receipt: `${me.caughtOut} caught out in ${me.games} squad games · ${squadRange('caughtOut')}`,
    });
  }
  if (first.highest && first.rel >= 0.15) {
    out.push({
      kind: 'fix', area: 'deaths', level: 'solid', weight: first.rel,
      title: 'First to fall in fights',
      finding: `${per(me, 'firstToFall').toFixed(2)} times a game you are the first death in a fight, the most in the squad.`,
      action: 'Let your frontline or engage start the fight, then commit. A team fighting 4v5 from the first second rarely wins it.',
      receipt: `${me.firstToFall} first deaths in ${me.games} squad games · ${squadRange('firstToFall')}`,
    });
  }
  return out;
}

// mainRole: the member's most-played role in the films. Supports and junglers
// are not judged on low roam kills: their job is not leaving a home lane.
function rotationTips(name: string, rot: Record<string, RotationMember>, mainRole: string | null): Tip[] {
  const me = rot[name];
  if (!me || me.games < 40) return [];
  const all = Object.values(rot);
  const kills = rank5(me.rotationKills / me.games, all.map((m) => m.rotationKills / m.games));
  const share = (m: RotationMember) => m.costHome / Math.max(1, m.rotationKills + m.rotationDeaths);
  const cost = rank5(share(me), all.map(share));
  const out: Tip[] = [];
  if (kills.highest && kills.rel >= 0.15) {
    out.push({
      kind: 'keep', area: 'rotations', level: 'solid', weight: kills.rel,
      title: 'Best roamer in the squad',
      finding: `${(me.rotationKills / me.games).toFixed(2)} kills a game on other lanes (${me.rotationKills} kills, ${me.rotationDeaths} deaths), the most of the five.`,
      action: 'Keep roaming. Shove your wave into their tower first so your own lane does not pay for it.',
      receipt: `${me.games} squad games with located kills · assists are not located, so this undercounts`,
    });
  } else if (kills.lowest && kills.rel <= -0.15 && mainRole !== 'support' && mainRole !== 'jungle') {
    out.push({
      kind: 'fix', area: 'rotations', level: 'association', weight: -kills.rel,
      title: 'Fewest kills away from your lane',
      finding: `${(me.rotationKills / me.games).toFixed(2)} kills a game on other lanes, the fewest of the five.`,
      action: 'After you take your lane\'s first tower, look at the minimap for the next fight instead of farming that lane.',
      receipt: `${me.games} squad games · assists are not located, so roams that ended in an assist are invisible here`,
    });
  }
  if (cost.highest && cost.rel >= 0.15 && me.costHome >= 10) {
    out.push({
      kind: 'fix', area: 'rotations', level: 'association', weight: cost.rel,
      title: 'Your lane pays for your roams',
      finding: `After ${pct(share(me), 0)}% of your roams your own lane lost a structure within 90 seconds, the highest share in the squad.`,
      action: 'Push the wave into their tower before you leave, and do not roam while your tower is low.',
      receipt: `${me.costHome} structures lost after roams in ${me.games} squad games`,
    });
  }
  return out;
}

// Fights: team result with vs without the member present. Association only,
// and only when 300+ fights on each side and a 4-point gap.
function fightTip(name: string, fights: Record<string, FightMember>): Tip[] {
  const me = fights[name];
  if (!me || me.fightsPresent < 300 || me.fightsAbsent < 300) return [];
  const w = me.fightsPresentWon / me.fightsPresent, wo = me.fightsAbsentWon / me.fightsAbsent;
  const d = w - wo;
  if (Math.abs(d) < 0.04) return [];
  return [d < 0 ? {
    kind: 'fix', area: 'fights', level: 'association', weight: -d,
    title: 'The team wins fewer fights with you in them',
    finding: `The squad wins ${pct(w)}% of fights you are in and ${pct(wo)}% of the ones you are not.`,
    action: 'This is a pattern, not proof. Check your positioning on replays: are you arriving after the fight has already turned, or starting fights alone?',
    receipt: `${me.fightsPresent} fights in, ${me.fightsAbsent} fights out`,
  } : {
    kind: 'keep', area: 'fights', level: 'association', weight: d,
    title: 'Fights go better with you there',
    finding: `The squad wins ${pct(w)}% of fights you are in and ${pct(wo)}% of the ones you are not.`,
    action: 'Show up to the big fights. Your presence moves the result.',
    receipt: `${me.fightsPresent} fights in, ${me.fightsAbsent} fights out`,
  }];
}

// ---- lobby: same role, same games -----------------------------------------------

interface Metric { key: string; label: string; unit: string; get: (r: FilmRow) => number | null; higherIsBetter: boolean; fix: string; keep: string; digits: number }
export const LOBBY_METRICS: Metric[] = [
  { key: 'deaths', label: 'deaths a game', unit: '', get: (r) => r.deaths, higherIsBetter: false, digits: 1,
    fix: 'Play one step further back until your team is in range, and back off when your ultimate is down.', keep: 'Staying alive is a real strength. It keeps your damage in every fight.' },
  { key: 'wards', label: 'wards a game', unit: '', get: (r) => r.wardsPlaced, higherIsBetter: true, digits: 1,
    fix: 'Buy and place wards on every back. Vision is the cheapest upgrade in the game.', keep: 'Your vision is above your lobbies. Keep it up.' },
  { key: 'dmg', label: 'hero damage a minute', unit: '', get: (r) => r.damageToHeroes / Math.max(1, r.durationMin), higherIsBetter: true, digits: 0,
    fix: 'Look for more damage: trade when your abilities are up and get into fights earlier. Hero choice moves this number too, so compare like for like.', keep: 'Your damage output is above the same role in your games.' },
  { key: 'gold', label: 'gold a minute', unit: '', get: (r) => r.goldEarned / Math.max(1, r.durationMin), higherIsBetter: true, digits: 0,
    fix: 'Farm side waves and camps between fights. You are earning less than the same role in your games.', keep: 'You out-earn the same role in your games.' },
  { key: 'kp', label: 'kill participation', unit: '%', get: (r) => r.kp, higherIsBetter: true, digits: 0,
    fix: 'Join more of your team\'s kills. Track where fights are breaking out.', keep: 'You are part of more of your team\'s kills than your lobbies.' },
];

function meanSd(v: number[]) {
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, v.length - 1));
  return { m, sd };
}

// For each role the member played 12+ films in: compare each metric to the
// lobby players in that role. Emit only when the member's mean is 2+ standard
// errors from the lobby mean and 10%+ different, then keep the biggest per kind.
export function lobbyTips(name: string, rows: FilmRow[]): Tip[] {
  const out: Tip[] = [];
  const roles = [...new Set(rows.filter((r) => r.squadName === name).map((r) => r.role))];
  for (const role of roles) {
    const mine = rows.filter((r) => r.squadName === name && r.role === role);
    const lobby = rows.filter((r) => r.squadName === null && r.role === role);
    if (mine.length < 12 || lobby.length < 60) continue;
    for (const mt of LOBBY_METRICS) {
      const a = mine.map(mt.get).filter((x): x is number => x != null);
      const b = lobby.map(mt.get).filter((x): x is number => x != null);
      if (a.length < 12 || b.length < 60) continue;
      const A = meanSd(a), B = meanSd(b);
      const se = A.sd / Math.sqrt(a.length);
      if (!se || !B.m) continue;
      const z = (A.m - B.m) / se, rel = (A.m - B.m) / B.m;
      if (Math.abs(z) < 2 || Math.abs(rel) < 0.1) continue;
      const better = mt.higherIsBetter ? A.m > B.m : A.m < B.m;
      const f = (x: number) => mt.unit === '%' ? `${(x * 100).toFixed(0)}%` : x.toFixed(mt.digits);
      out.push({
        kind: better ? 'keep' : 'fix', area: 'lobby', level: Math.abs(z) >= 3 && a.length >= 25 ? 'strong' : 'solid', weight: Math.abs(rel),
        title: `${roleName(role)[0].toUpperCase() + roleName(role).slice(1)}: ${mt.label} ${better ? 'above' : 'below'} your lobbies`.replace('deaths a game above', 'fewer deaths than').replace('deaths a game below', 'more deaths than'),
        finding: `As ${roleName(role)} you average ${f(A.m)} ${mt.label}; other ${roleName(role)} players in the same games average ${f(B.m)} (${rel > 0 ? '+' : ''}${(rel * 100).toFixed(0)}%).`,
        action: better ? mt.keep : mt.fix,
        receipt: `you: ${a.length} games · lobby: ${b.length} ${roleName(role)} players in the same ranked games`,
      });
    }
  }
  // One tip per metric: keep the strongest role for each.
  const best = new Map<string, Tip>();
  for (const t of out) { const k = t.kind + t.title.split(': ')[1]; const cur = best.get(k); if (!cur || LEVEL_ORDER[t.level] < LEVEL_ORDER[cur.level] || (t.level === cur.level && t.weight > cur.weight)) best.set(k, t); }
  out.splice(0, out.length, ...best.values());
  // Fix the title wording for deaths, which reads backwards with above/below.
  for (const t of out) if (t.title.includes('deaths a game')) t.title = t.title.replace(/deaths a game (above|below) your lobbies/, (_m, d) => d === 'above' ? 'more deaths than your lobbies' : 'fewer deaths than your lobbies');
  return out;
}

// ---- profile insights ---------------------------------------------------------
// The profile (playerProfile.ts) also writes short "film room" insights. Those
// already covered above (duo partner, long-term hero, career vision) are
// dropped; the rest fold in here. Streak splits are under 50 games, so they
// carry the "pattern, not proof" level.
function insightTips(p: Profile): { tips: Tip[]; form: string | null; extras: string | null } {
  const tips: Tip[] = [];
  let form: string | null = null, extras: string | null = null;
  for (const i of p.insights ?? []) {
    if (/running hotter|running colder|cooler than/i.test(i.title)) form = `${i.finding.split('. ')[0]}.${i.receipt ? ` (${i.receipt})` : ''}`;
    else if (/group chat/i.test(i.title)) extras = i.finding;
    else if (/tilt/i.test(i.title)) tips.push({ kind: 'fix', area: 'fights', level: 'association', weight: 0.05, title: 'Losses carry into the next game', finding: i.finding.replace(/ One cooldown break.*$/, ''), action: 'Take a short break after a loss before you queue again.', receipt: i.receipt ?? '' });
    else if (/punches back/i.test(i.title)) tips.push({ kind: 'keep', area: 'fights', level: 'association', weight: 0.05, title: 'You bounce back after losses', finding: i.finding.replace(/ Tilt is not.*$/, ''), action: 'Losses do not tilt you. Watch for coasting after wins instead.', receipt: i.receipt ?? '' });
    else if (/lean, relative to the squad/i.test(i.title)) tips.push({ kind: 'keep', area: 'fights', level: 'solid', weight: 0.03, title: i.title.replace(/^.*?: /, 'Your squad role: ').replace(/^./, (c) => c.toUpperCase()), finding: i.finding.replace(/ Steady is a style.*$/, ''), action: 'Lean into it: be the one who converts fights into towers and objectives.', receipt: i.receipt ?? '' });
  }
  return { tips, form, extras };
}

// ---- assemble --------------------------------------------------------------------

const LEVEL_ORDER: Record<Level, number> = { strong: 0, solid: 1, association: 2 };
const order = (a: Tip, b: Tip) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || b.weight - a.weight;

export function buildReview(profile: Profile, pairs: Pair[], fights: Record<string, FightMember>, rot: Record<string, RotationMember>, rows: FilmRow[]): Review {
  const name = profile.player.name;
  const roleCount = new Map<string, number>();
  for (const r of rows) if (r.squadName === name) roleCount.set(r.role, (roleCount.get(r.role) ?? 0) + 1);
  const mainRole = [...roleCount].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const tips = [
    ...laneTips(profile), ...heroTips(profile), ...poolTip(profile), ...duoTip(profile, pairs),
    ...deathTips(name, fights, profile), ...rotationTips(name, rot, mainRole), ...fightTip(name, fights),
    ...lobbyTips(name, rows),
  ];
  const ins = insightTips(profile);
  tips.push(...ins.tips);
  // Lobby tips can repeat across roles; keep at most two of each kind so the card stays short.
  const cap = (list: Tip[]) => {
    let lobby = 0;
    const sorted = list.sort(order).filter((t) => t.area !== 'lobby' || ++lobby <= 2);
    const top = sorted.slice(0, 6);
    // "Pattern, not proof" tips sort last; keep the strongest one rather than cut it.
    const pattern = sorted.find((t) => t.level === 'association');
    if (pattern && !top.includes(pattern)) top.splice(top.length - 1, 1, pattern);
    return top;
  };
  const keep = cap(tips.filter((t) => t.kind === 'keep'));
  const fix = cap(tips.filter((t) => t.kind === 'fix'));
  const g = profile.goal;
  const headline = g.gapVp <= 0
    ? `${profile.player.current.rank} at ${profile.player.current.points} VP: the Platinum goal is met, so the job now is holding it.`
    : `${profile.player.current.rank} at ${profile.player.current.points} VP, ${g.gapVp} VP from ${g.tier}.${g.peakAllTime >= g.vp ? ` You have reached ${g.peakAllTime} VP before, so this is about consistency, not a ceiling.` : ` Your best so far is ${g.peakAllTime} VP.`}`;
  return { uuid: profile.player.uuid, name, headline, form: ins.form, extras: ins.extras, keep, fix, films: fights[name]?.games ?? 0 };
}
