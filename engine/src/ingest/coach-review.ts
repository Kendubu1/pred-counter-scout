// Coach assessment copy pass: rewrite the deterministic plan/insights from
// buildCoachReport (playerProfile.ts) into grounded, action-first, GAME-AWARE
// coaching via the IN-SESSION pred-scout-coach agent (no Anthropic API key).
//
// Two things this pass fixes vs the old version:
//  1) It runs over the LEAD's coach.json AND every squad member's per-player
//     report (data/artifacts/players/<uuid>.json) — previously only the lead got
//     grounded coaching, so members saw only the generic role-fit template.
//  2) It grounds each report in the player's ACTUAL recent games (pulled from
//     data/postgame/*.json: hero, role, KDA, this-game-vs-norm diagnostics), so
//     the coaching is "here is how you played and what to drill", not "queue a
//     different role". Role/queue advice is demoted to a minor note.
//
// The deterministic numbers stay the source of truth; the agent only reframes the
// prose, and every number it cites is ground-checked against the prompt by
// copy-verify (failing lines dropped). Output is a parallel `coachReasoning` block
// on each report; the UI prefers it and falls back to the templated plan/insights.
//
//   COPY_MODE=prepare npm run review:coach   # emit one grounded task per report
//   (pred-scout-coach agent fills engine/copy-tasks/coach.responses.json)
//   npm run review:coach                      # verify + write coachReasoning

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAllowed, verifyLine } from '../copy-verify.js';
import { ask, flushTasks, isPrepare } from '../copy-session.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const COACH = path.join(ROOT, 'data/artifacts/coach.json');
const PLAYERS_DIR = path.join(ROOT, 'data/artifacts/players');
const POSTGAME_DIR = path.join(ROOT, 'data/postgame');

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Hero { slug: string; name: string; games: number; rawWr: number; primaryRole?: string; engineCoachLine?: string }
interface Report {
  player: { name: string; uuid?: string; career: { games: number; winrate: number; kda: number }; current?: { points: number; rank: string } };
  goal: { tier: string; vp: number; gapVp: number; peakAllTime: number };
  archetype: { label: string; receipt: string };
  roles: { role: string; games: number; rawWr: number }[];
  pool: Hero[];
  leanInto: Hero[];
  ledger: { entries: { change: string; winsPer100: number; receipt: string }[] };
  plan: string[];
  insights: { title: string; finding: string }[];
  poolWidth: { heroesPlayed20Plus: number; top3Share: number };
  coachReasoning?: unknown;
  coachReasoningSource?: string;
}

/** The player's last few reviewed games as grounded one-liners (hero, role, KDA,
 *  this-game-vs-norm diagnostic). This is what makes the coaching game-specific. */
function recentGamesFor(uuid: string | undefined, limit = 5): string[] {
  if (!uuid || !existsSync(path.join(POSTGAME_DIR, 'index.json'))) return [];
  const idx = JSON.parse(readFileSync(path.join(POSTGAME_DIR, 'index.json'), 'utf8')) as { matches: { matchId: string; startTime: string }[] };
  const out: string[] = [];
  for (const m of idx.matches) {
    if (out.length >= limit) break;
    const fp = path.join(POSTGAME_DIR, `${m.matchId}.json`);
    if (!existsSync(fp)) continue;
    const f = JSON.parse(readFileSync(fp, 'utf8')) as any;
    const p = (f.players ?? []).find((x: any) => x.pid === uuid);
    if (!p) continue;
    const diag = p.diagnostics?.headline ? ` — ${p.diagnostics.headline}` : '';
    out.push(`${String(f.result).toUpperCase()} on ${p.heroName} (${p.role}) ${p.kills}/${p.deaths}/${p.assists}${diag}`);
  }
  return out;
}

function buildPrompt(c: Report): string {
  const pct = (x: number) => (x * 100).toFixed(1);
  const kitBySlug = new Map(c.leanInto.map((h) => [h.slug, h.engineCoachLine]));
  const topHeroes = [...c.pool].sort((a, b) => b.games - a.games).slice(0, 5);
  const recent = recentGamesFor(c.player.uuid);

  return `You are coaching ${c.player.name} in Predecessor (a MOBA). Give REAL, game-specific coaching based on how they ACTUALLY played recently and what to drill on their heroes — NOT generic "queue a different role" advice. The data below is the ONLY source of truth; use ONLY numbers that appear here.

RECENT REVIEWED GAMES (most recent first — lead your coaching with these):
  ${recent.length ? recent.join('\n  ') : 'no recent reviewed games on record — coach from their hero pool and kit reads below'}

WHERE THEY ARE: ${c.player.career.games} career games at ${pct(c.player.career.winrate)}% winrate, KDA ${c.player.career.kda.toFixed(1)}${c.player.current ? `, currently ${c.player.current.rank} (${c.player.current.points} VP)` : ''}. Goal: ${c.goal.tier} (${c.goal.vp} VP, gap ${c.goal.gapVp} VP; all-time peak ${c.goal.peakAllTime} VP). Player archetype: ${c.archetype.label} — ${c.archetype.receipt}
THEIR HEROES (with our kit-math read — use these for what to DRILL): ${topHeroes.map((h) => `${h.name} ${pct(h.rawWr)}% over ${h.games} games${kitBySlug.get(h.slug) ? ` — ${kitBySlug.get(h.slug)}` : ''}`).join('\n  ')}
ROLE RECORDS (context only — do NOT lead with this): ${c.roles.map((r) => `${r.role} ${pct(r.rawWr)}% over ${r.games}`).join(' · ')}
PRICED CHANGES (wins per 100 games): ${c.ledger.entries.map((e) => `${e.change} (+${e.winsPer100}; ${e.receipt})`).join('\n  ')}
POOL: ${c.poolWidth.heroesPlayed20Plus}+ heroes with 20+ games; top three are ${(c.poolWidth.top3Share * 100).toFixed(0)}% of games.
CURRENT (templated) PLAN to REPLACE with game-specific advice: ${c.plan.map((p, i) => `${i + 1}. ${p}`).join(' ')}
CURRENT INSIGHTS: ${c.insights.map((x) => `${x.title}: ${x.finding}`).join(' | ')}

Return strict JSON only:
{"assessment":"<1-2 sentences: how they have been playing lately + the single biggest lever to climb, tied to their ACTUAL recent games/heroes above>",
 "plan":["<imperative step tied to a SPECIFIC hero they play and what to DRILL on its kit (a combo, a power spike, positioning), referencing a recent game where it helps>", ... up to 5 ...],
 "insights":[{"title":"<short>","finding":"<one grounded, game-specific finding>"}, ... up to 4 ...]}

Rules: Lead with in-game execution — what to DO on their heroes — not role selection. Only mention role/queue choice if a role is clearly costing VP, and never as the headline. Plain language, no jargon. Tie every line to their actual heroes, kit reads, or recent games above. Use ONLY numbers that appear above; when unsure, use none. VOICE (maintainer rule): the report is read by the whole squad — never use second person ("you/your"); name the player (${c.player.name.split(' ')[0]}) in third person, or use bare imperatives for drill steps ("Open with E, then…").`;
}

/** Collect the reports to coach: the lead's standalone coach.json plus every
 *  per-member player report. Each carries the file to write coachReasoning back to. */
function collectReports(): { id: string; file: string }[] {
  const out: { id: string; file: string }[] = [];
  if (existsSync(COACH)) out.push({ id: 'coach', file: COACH });
  if (existsSync(PLAYERS_DIR)) {
    for (const f of readdirSync(PLAYERS_DIR).filter((x) => x.endsWith('.json')).sort()) {
      out.push({ id: `player-${f.replace('.json', '')}`, file: path.join(PLAYERS_DIR, f) });
    }
  }
  return out;
}

async function main() {
  const reports = collectReports();
  if (!reports.length) {
    console.error('no coach reports found — run `npm run coach`/`npm run squad` first');
    process.exit(isPrepare() ? 0 : 1);
  }

  let written = 0, rejected = 0, touched = 0;
  for (const { id, file } of reports) {
    const c = JSON.parse(readFileSync(file, 'utf8')) as Report;
    const prompt = buildPrompt(c);
    const raw = (await ask('coach', id, prompt)).trim().replace(/^```json?\s*|```$/g, '');
    if (isPrepare()) continue;

    // Ground-check against the numbers present in the prompt itself.
    const allowed = buildAllowed([], [prompt]);
    const keep = (s?: string): string | null => { if (!s) return null; if (verifyLine(s, allowed)) { written++; return s; } rejected++; return null; };

    let parsed: { assessment?: string; plan?: string[]; insights?: { title?: string; finding?: string }[] } = {};
    try { parsed = JSON.parse(raw); } catch { continue; } // no/!valid response: leave deterministic plan in place

    const reasoning = {
      assessment: keep(parsed.assessment),
      plan: (parsed.plan ?? []).map((p) => keep(p)).filter((x): x is string => !!x),
      insights: (parsed.insights ?? []).map((i) => ({ title: keep(i.title), finding: keep(i.finding) })).filter((i) => i.title || i.finding),
    };
    // Only write if the agent actually produced grounded content.
    if (!reasoning.assessment && !reasoning.plan.length && !reasoning.insights.length) continue;
    c.coachReasoning = reasoning;
    c.coachReasoningSource = 'in-session pred-scout-coach agent, grounded in the report + the player’s recent reviewed games; every number ground-checked, failing lines dropped';
    writeFileSync(file, JSON.stringify(c, null, 1));
    touched++;
  }

  flushTasks('coach');
  if (isPrepare()) { console.log(`[copy] prepared ${reports.length} coach tasks (lead + ${reports.length - 1} members)`); return; }
  console.log(`coach reasoning: ${touched} reports updated, ${written} lines written, ${rejected} rejected`);
}

main().catch((e) => { console.error(e); process.exit(1); });
