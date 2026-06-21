// Coach assessment copy pass: rewrite the deterministic plan/insights from
// buildCoachReport (playerProfile.ts) into grounded, action-first, game-aware
// coaching via the IN-SESSION pred-scout-coach agent (no Anthropic API key).
// The deterministic numbers stay the source of truth; the agent only reframes the
// prose, and every number it cites is ground-checked against the prompt by
// copy-verify (failing lines dropped). Output is a parallel `coachReasoning` block
// on coach.json; the UI prefers it and falls back to the templated plan/insights.
//
//   COPY_MODE=prepare npm run review:coach   # emit a grounded task from coach.json
//   (pred-scout-coach agent fills engine/copy-tasks/coach.responses.json)
//   npm run review:coach                      # verify + write coachReasoning

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAllowed, verifyLine } from '../copy-verify.js';
import { ask, flushTasks, isPrepare } from '../copy-session.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const COACH = path.join(ROOT, 'data/artifacts/coach.json');

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Hero { slug: string; name: string; games: number; rawWr: number; primaryRole?: string; engineCoachLine?: string }
interface Coach {
  player: { name: string; career: { games: number; winrate: number; kda: number }; current?: { points: number; rank: string } };
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

async function main() {
  if (!existsSync(COACH)) {
    console.error('no data/artifacts/coach.json — run `npm run coach -- <uuid>` first');
    process.exit(isPrepare() ? 0 : 1);
  }
  const c = JSON.parse(readFileSync(COACH, 'utf8')) as Coach;
  const id = 'coach';
  const pct = (x: number) => (x * 100).toFixed(1);
  const kitBySlug = new Map(c.leanInto.map((h) => [h.slug, h.engineCoachLine]));
  const topHeroes = [...c.pool].sort((a, b) => b.games - a.games).slice(0, 5);

  const prompt = `You are coaching ${c.player.name} in Predecessor (a MOBA). The data below is the ONLY source of truth — use ONLY numbers that appear here.

WHERE THEY ARE: ${c.player.career.games} career games at ${pct(c.player.career.winrate)}% winrate, KDA ${c.player.career.kda.toFixed(1)}${c.player.current ? `, currently ${c.player.current.rank} (${c.player.current.points} VP)` : ''}. Goal: ${c.goal.tier} (${c.goal.vp} VP, gap ${c.goal.gapVp} VP; all-time peak ${c.goal.peakAllTime} VP). Player archetype: ${c.archetype.label} — ${c.archetype.receipt}
ROLES: ${c.roles.map((r) => `${r.role} ${pct(r.rawWr)}% over ${r.games}`).join(' · ')}
TOP HEROES (with our kit-math read): ${topHeroes.map((h) => `${h.name} ${pct(h.rawWr)}% over ${h.games} games${kitBySlug.get(h.slug) ? ` — ${kitBySlug.get(h.slug)}` : ''}`).join('\n  ')}
PRICED CHANGES (wins per 100 games): ${c.ledger.entries.map((e) => `${e.change} (+${e.winsPer100}; ${e.receipt})`).join('\n  ')}
POOL: ${c.poolWidth.heroesPlayed20Plus}+ heroes with 20+ games; top three are ${(c.poolWidth.top3Share * 100).toFixed(0)}% of games.
CURRENT (templated) PLAN to REWRITE, not copy: ${c.plan.map((p, i) => `${i + 1}. ${p}`).join(' ')}
CURRENT INSIGHTS: ${c.insights.map((x) => `${x.title}: ${x.finding}`).join(' | ')}

Return strict JSON only:
{"assessment":"<1-2 sentence headline: where they are + the single biggest lever to climb>",
 "plan":["<imperative step that names a specific hero/role and what to DRILL on its kit, mechanism second>", ... up to 5 ...],
 "insights":[{"title":"<short>","finding":"<one grounded finding>"}, ... up to 4 ...]}

Rules: action-first (what to DO), plain language, no jargon. Tie advice to the player's ACTUAL heroes and their kit reads above (e.g. what combo or spike to practice), not generic platitudes. Use ONLY numbers that appear above; when unsure, use none.`;

  const raw = (await ask('coach', id, prompt)).trim().replace(/^```json?\s*|```$/g, '');
  flushTasks('coach');
  if (isPrepare()) return;

  // Ground-check against the numbers present in the prompt itself (the prompt is
  // the source of truth), so the agent can only cite numbers we actually showed.
  const allowed = buildAllowed([], [prompt]);
  let written = 0, rejected = 0;
  const keep = (s?: string): string | null => { if (!s) return null; if (verifyLine(s, allowed)) { written++; return s; } rejected++; return null; };

  let parsed: { assessment?: string; plan?: string[]; insights?: { title?: string; finding?: string }[] } = {};
  try { parsed = JSON.parse(raw); } catch { console.error('coach: response not valid JSON; leaving deterministic plan in place'); return; }

  const reasoning = {
    assessment: keep(parsed.assessment),
    plan: (parsed.plan ?? []).map((p) => keep(p)).filter((x): x is string => !!x),
    insights: (parsed.insights ?? []).map((i) => ({ title: keep(i.title), finding: keep(i.finding) })).filter((i) => i.title || i.finding),
  };
  c.coachReasoning = reasoning;
  c.coachReasoningSource = 'in-session Claude Code agent (pred-scout-coach) over coach.json only; every number ground-checked, failing lines dropped';
  writeFileSync(COACH, JSON.stringify(c, null, 1));
  console.log(`coach reasoning: ${written} lines written, ${rejected} rejected -> data/artifacts/coach.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
