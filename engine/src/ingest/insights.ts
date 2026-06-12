// The film room: per-player insights extracted from career deep stats and
// actual recent matches, framed against squad-relative baselines so every
// member's findings are genuinely theirs. Each insight carries a receipt
// and clears a significance gate before it may appear; insights are ranked
// by salience and capped, so the engine stays quiet rather than generic.

import type { RawProfile, RecentMatch, AnalyzedPlayer } from './playerProfile.js';

export interface Insight {
  title: string;
  finding: string;
  receipt: string;
  salience: number; // effect size for ranking, not displayed
}

export interface DeepMember {
  analyzed: AnalyzedPlayer;
  raw: RawProfile;
  matches: RecentMatch[];
}

interface SquadBaselines {
  wardsPerGame: number;
  objSharePerGame: number;  // structure+objective dmg per game
  dmgPerGame: number;
  takenPerGame: number;
}

export function squadBaselines(members: DeepMember[]): SquadBaselines {
  const per = (f: (m: DeepMember) => number) =>
    members.reduce((s, m) => s + f(m), 0) / Math.max(members.length, 1);
  const g = (m: DeepMember) => Math.max(m.raw.generalStatistic.result.matchesPlayed, 1);
  return {
    wardsPerGame: per((m) => (m.raw.generalStatistic.result.totalWardsPlaced + m.raw.generalStatistic.result.totalWardsDestroyed) / g(m)),
    objSharePerGame: per((m) => (m.raw.generalStatistic.result.structureDamage + m.raw.generalStatistic.result.objectiveDamage) / g(m)),
    dmgPerGame: per((m) => m.raw.generalStatistic.result.totalHeroDamage / g(m)),
    takenPerGame: per((m) => m.raw.generalStatistic.result.totalHeroDamageTaken / g(m)),
  };
}

const pct = (x: number, d = 0) => (x * 100).toFixed(d);

export interface BestPair { partner: string; games: number; winrate: number }

export function computeInsights(m: DeepMember, base: SquadBaselines, bestPair?: BestPair | null): Insight[] {
  const out: Insight[] = [];
  const g = m.raw.generalStatistic.result;
  const games = Math.max(g.matchesPlayed, 1);
  const careerWr = g.matchesWon / games;
  const first = m.analyzed.name.split(' ')[0]!;

  // ── temporal, from their actual recent matches ──
  const ms = m.matches;
  if (ms.length >= 20) {
    const recent = ms.slice(-20);
    const recentWr = recent.filter((x) => x.won).length / recent.length;
    const delta = recentWr - careerWr;
    if (Math.abs(delta) >= 0.08) {
      out.push({
        title: delta > 0 ? 'You are hotter than your career says' : 'Recent form is below your career line',
        finding: delta > 0
          ? `The last 20 games are ${pct(recentWr)}% against a ${pct(careerWr)}% career. Whatever changed recently, keep it.`
          : `The last 20 games are ${pct(recentWr)}% against a ${pct(careerWr)}% career. Worth asking what changed before grinding more.`,
        receipt: `${recent.filter((x) => x.won).length}/${recent.length} recent wins vs ${pct(careerWr, 1)}% over ${games} career games`,
        salience: Math.abs(delta) * 1.2,
      });
    }

    // tilt: result immediately after a loss vs after a win
    let afterLossW = 0, afterLossN = 0, afterWinW = 0, afterWinN = 0;
    for (let i = 1; i < ms.length; i++) {
      if (ms[i - 1]!.won) { afterWinN++; if (ms[i]!.won) afterWinW++; }
      else { afterLossN++; if (ms[i]!.won) afterLossW++; }
    }
    if (afterLossN >= 8 && afterWinN >= 8) {
      const wrAL = afterLossW / afterLossN;
      const wrAW = afterWinW / afterWinN;
      const gap = wrAW - wrAL;
      if (gap >= 0.12) {
        out.push({
          title: 'The tilt tax is real for you',
          finding: `Right after a loss you win ${pct(wrAL)}%; right after a win, ${pct(wrAW)}%. One cooldown break after losses is free VP.`,
          receipt: `${afterLossW}/${afterLossN} after losses vs ${afterWinW}/${afterWinN} after wins, last ${ms.length} games`,
          salience: gap,
        });
      } else if (gap <= -0.1) {
        out.push({
          title: 'You punch back after losses',
          finding: `You win MORE right after a loss (${pct(wrAL)}%) than after a win (${pct(wrAW)}%). Tilt is not your problem; complacency might be.`,
          receipt: `${afterLossW}/${afterLossN} after losses vs ${afterWinW}/${afterWinN} after wins, last ${ms.length} games`,
          salience: -0,
        });
      }
    }

    // game length identity
    const short = ms.filter((x) => x.duration <= 28 * 60);
    const long = ms.filter((x) => x.duration >= 32 * 60);
    if (short.length >= 8 && long.length >= 8) {
      const wrS = short.filter((x) => x.won).length / short.length;
      const wrL = long.filter((x) => x.won).length / long.length;
      const gap = wrS - wrL;
      if (Math.abs(gap) >= 0.12) {
        out.push({
          title: gap > 0 ? 'You are a closer, not a marathoner' : 'You win the long game',
          finding: gap > 0
            ? `Games under 28 minutes: ${pct(wrS)}%. Past 32: ${pct(wrL)}%. Press early leads and call objectives; do not let games drift.`
            : `Past 32 minutes you win ${pct(wrL)}% vs ${pct(wrS)}% in short games. Scaling comps and patience suit you; avoid coin-flip early all-ins.`,
          receipt: `${short.filter((x) => x.won).length}/${short.length} short vs ${long.filter((x) => x.won).length}/${long.length} long, recent games`,
          salience: Math.abs(gap),
        });
      }
    }

    // deaths trend, recent vs career
    const dRecent = recent.reduce((s, x) => s + x.deaths, 0) / recent.length;
    const dCareer = g.totalDeaths / games;
    if (dRecent - dCareer >= 1.2) {
      out.push({
        title: 'Deaths are creeping up',
        finding: `${dRecent.toFixed(1)} deaths/game in the last 20 vs ${dCareer.toFixed(1)} career. Every extra death is ~25s+ of enemy free time.`,
        receipt: `last 20 games vs ${games}-game career average`,
        salience: (dRecent - dCareer) / 10,
      });
    }
  }

  // ── identity, squad-relative ──
  const wardsPg = (g.totalWardsPlaced + g.totalWardsDestroyed) / games;
  const wardRatio = wardsPg / Math.max(base.wardsPerGame, 0.01);
  if (wardRatio >= 1.5) {
    out.push({
      title: 'The squad sees the map through your wards',
      finding: `${wardsPg.toFixed(1)} wards placed+cleared per game, ${wardRatio.toFixed(1)}x the squad average. That is a real, unsung win condition.`,
      receipt: `${g.totalWardsPlaced.toLocaleString()} placed + ${g.totalWardsDestroyed.toLocaleString()} cleared over ${games} games; squad average ${base.wardsPerGame.toFixed(1)}/game`,
      salience: (wardRatio - 1) * 0.18,
    });
  } else if (wardRatio <= 0.6) {
    out.push({
      title: 'Vision is your cheapest upgrade',
      finding: `${wardsPg.toFixed(1)} wards per game, ${pct(wardRatio)}% of the squad average. Wards cost nothing and you are leaving them in the shop.`,
      receipt: `${g.totalWardsPlaced.toLocaleString()} placed + ${g.totalWardsDestroyed.toLocaleString()} cleared over ${games} games; squad average ${base.wardsPerGame.toFixed(1)}/game`,
      salience: (1 - wardRatio) * 0.18,
    });
  }

  const objPg = (g.structureDamage + g.objectiveDamage) / games;
  const objRatio = objPg / Math.max(base.objSharePerGame, 1);
  if (objRatio >= 1.4) {
    out.push({
      title: 'You end games, not just fights',
      finding: `${Math.round(objPg).toLocaleString()} structure+objective damage per game, ${objRatio.toFixed(1)}x the squad average. When the team needs a closer, it is you.`,
      receipt: `vs squad average ${Math.round(base.objSharePerGame).toLocaleString()}/game`,
      salience: (objRatio - 1) * 0.15,
    });
  }

  const takenPg = g.totalHeroDamageTaken / games;
  const dealtPg = g.totalHeroDamage / games;
  const frontline = takenPg / Math.max(base.takenPerGame, 1);
  if (frontline >= 1.35) {
    out.push({
      title: 'You are the shield this team stands behind',
      finding: `${Math.round(takenPg).toLocaleString()} damage soaked per game, ${frontline.toFixed(1)}x the squad average. Your deaths are often the team's purchase price; judge them by what they bought.`,
      receipt: `damage taken/game vs squad average ${Math.round(base.takenPerGame).toLocaleString()}`,
      salience: (frontline - 1) * 0.14,
    });
  }
  if (dealtPg / Math.max(base.dmgPerGame, 1) >= 1.35) {
    out.push({
      title: 'The damage actually runs through you',
      finding: `${Math.round(dealtPg).toLocaleString()} hero damage per game, ${(dealtPg / base.dmgPerGame).toFixed(1)}x the squad average. Build the comp so this keeps being true.`,
      receipt: `vs squad average ${Math.round(base.dmgPerGame).toLocaleString()}/game`,
      salience: (dealtPg / base.dmgPerGame - 1) * 0.14,
    });
  }

  // ── signature hero discipline ──
  const sig = m.analyzed.pool.filter((h) => h.games >= 75 && (h.edge ?? 0) > 0).sort((a, b) => (b.edge ?? 0) - (a.edge ?? 0))[0];
  if (sig) {
    const dAvg = g.totalDeaths / games;
    if (sig.deathsPerGame <= dAvg - 0.7) {
      out.push({
        title: `${sig.name} is not just your best hero, it is your most disciplined`,
        finding: `On ${sig.name} you die ${sig.deathsPerGame.toFixed(1)}/game vs your ${dAvg.toFixed(1)} average. The winrate edge is partly a discipline edge; that habit can travel to other picks.`,
        receipt: `${sig.games} games on ${sig.name}, ${pct(sig.shrunkWr, 1)}% shrunk vs field ${pct(sig.fieldWr ?? 0.5, 1)}%`,
        salience: (dAvg - sig.deathsPerGame) / 8,
      });
    }
  }

  // ── KDA composition: playmaker vs finisher ──
  const kills = g.totalKills / games;
  const assists = g.totalAssists / games;
  if (kills + assists >= 5) {
    const assistShare = assists / (kills + assists);
    if (assistShare >= 0.68) {
      out.push({
        title: 'You set the table; others eat',
        finding: `${pct(assistShare)}% of your takedowns are assists (${assists.toFixed(1)}A vs ${kills.toFixed(1)}K per game). You create the kills this team gets credit for; pick engage tools and play around your finishers.`,
        receipt: `${g.totalAssists.toLocaleString()} assists vs ${g.totalKills.toLocaleString()} kills over ${games} games`,
        salience: (assistShare - 0.5) * 0.3,
      });
    } else if (assistShare <= 0.45) {
      out.push({
        title: 'You finish what the team starts',
        finding: `${kills.toFixed(1)} kills vs ${assists.toFixed(1)} assists per game — a finisher's split. Your gold conversion matters more than most; protect your farm and take the last hits.`,
        receipt: `${g.totalKills.toLocaleString()} kills vs ${g.totalAssists.toLocaleString()} assists over ${games} games`,
        salience: (0.5 - assistShare) * 0.3,
      });
    }
  }

  // ── best teammate, from the squad's pair matrix ──
  if (bestPair && bestPair.games >= 100) {
    out.push({
      title: `${bestPair.partner.split(' ')[0]} brings out your best`,
      finding: `Your record alongside ${bestPair.partner} is ${pct(bestPair.winrate)}% over ${bestPair.games} ranked games — your strongest pairing in the stack. When only two of you queue, make it this one.`,
      receipt: `${Math.round(bestPair.winrate * bestPair.games)}/${bestPair.games} together`,
      salience: Math.max(bestPair.winrate - careerWr, 0.015),
    });
  }

  // ── volume signature: the life-partner hero ──
  const vol = m.analyzed.pool[0];
  if (vol && vol.games >= 150 && !out.some((i) => i.title.includes(vol.name))) {
    const vsField = vol.fieldWr != null ? vol.shrunkWr - vol.fieldWr : null;
    out.push({
      title: `${vol.name} is the long-term relationship`,
      finding: vsField != null && vsField > 0.015
        ? `${vol.games} games and you genuinely out-pilot the field on ${vol.name} (+${(vsField * 100).toFixed(1)} points). The hours show.`
        : `${vol.games} games on ${vol.name} at ${pct(vol.shrunkWr, 1)}% — the field averages ${pct(vol.fieldWr ?? 0.5, 1)}%. The comfort is real; the edge is ${vsField != null && vsField < -0.01 ? 'not there yet — worth studying top builds' : 'roughly neutral'}.`,
      receipt: `${vol.games} games, KDA ${vol.kda.toFixed(1)}, ${vol.deathsPerGame.toFixed(1)} deaths/game`,
      salience: 0.03 + Math.abs(vsField ?? 0) * 0.5,
    });
  }

  // ── one earned flex, if they have it ──
  if (g.pentaKills > 0 || g.maxKillingSpree >= 12) {
    out.push({
      title: 'For the group chat',
      finding: g.pentaKills > 0
        ? `${g.pentaKills} pentakill${g.pentaKills > 1 ? 's' : ''} on record and a ${g.maxKillingSpree}-kill spree. ${first} has receipts.`
        : `A ${g.maxKillingSpree}-kill spree on record. ${first} has receipts.`,
      receipt: `${Math.round(g.totalTime / 3600).toLocaleString()} hours played`,
      salience: 0.02,
    });
  }

  // Floor of three substantive insights: if the gates left someone thin,
  // surface their single most distinctive squad-relative trait, mildly
  // phrased, rather than shipping a hollow page.
  const substantive = out.filter((i) => i.title !== 'For the group chat');
  if (substantive.length < 3) {
    const traits: [string, number, string][] = [
      ['vision work', wardsPg / Math.max(base.wardsPerGame, 0.01), `${wardsPg.toFixed(1)} wards/game vs squad ${base.wardsPerGame.toFixed(1)}`],
      ['objective damage', objPg / Math.max(base.objSharePerGame, 1), `${Math.round(objPg).toLocaleString()}/game vs squad ${Math.round(base.objSharePerGame).toLocaleString()}`],
      ['damage dealt', dealtPg / Math.max(base.dmgPerGame, 1), `${Math.round(dealtPg).toLocaleString()}/game vs squad ${Math.round(base.dmgPerGame).toLocaleString()}`],
      ['damage soaked', takenPg / Math.max(base.takenPerGame, 1), `${Math.round(takenPg).toLocaleString()}/game vs squad ${Math.round(base.takenPerGame).toLocaleString()}`],
    ];
    const most = traits.sort((a, b) => Math.abs(b[1] - 1) - Math.abs(a[1] - 1))[0]!;
    out.push({
      title: `Your lean, relative to the squad: ${most[0]}`,
      finding: `${first}'s profile sits mid-pack on most axes; the clearest lean is ${most[0]} at ${most[1].toFixed(1)}x the squad average. Steady is a style too — the lineup can build around predictability.`,
      receipt: most[2],
      salience: 0.01,
    });
  }

  return out.sort((a, b) => b.salience - a.salience).slice(0, 5);
}
