# Lean coach review (second review, trial from 2026-11-08)

A slimmer coach pipeline that runs BESIDE the standard one in `docs/coach-automation.md`.
It reads the same postgame facts and engine blocks and writes only `film.coachLean`;
`film.coaching`, `coach-critique.ts`, `coach:contract` and the standard agent
(`.claude/agents/pred-scout-coach.md`) are untouched. The coach page shows a
**Standard | Lean** toggle on any game that has a published lean review.

## Why (review of the standard pipeline, 2026-11-08)

- Critic rounds per game rose to a median of 5 (max 10) in Nov 2-8; median ~16 min of
  critique per game, up to 49.
- Every round re-judged all ~96 lines, even when 2 changed.
- The 6-field per-player `buildReads` grew to ~1,140 words a review (from 137), ~60% of the
  lines the critic judges, mostly in a collapsed section, and duplicated `film.buildNotes`.
- The critic's brief was ~77,000 characters a round (raw catalog markup, the full event list,
  the preset text twice).
- The agent file and runbook grew by appended dated sections (~7,900 + ~3,000 words), several
  contradicting the active format: the documented cause of the 2026-10-19 regression.
- "Repeat until clean" had no cap (one game took 17 rounds).

## The five changes

| # | Change | Where |
|---|---|---|
| 1 | Only lines not yet approved go back to the critic (approved line hashes are stored) | `src/coach-lean.ts` applyLeanCritique |
| 2 | `buildReads` retired: one `buildCall` line per player; the engine's build notes carry the facts | spec + page |
| 3 | At most 3 critic rounds (`data/coaching/lean.json` maxRounds); a line still flagged in the last round is dropped; a flagged headline or lesson blocks the review for a human | `src/coach-lean.ts` |
| 4 | Slim source: rules stated once in the rubric, catalog text as plain text for named items only, events limited to structures and named majors | `sourceOf(f, { lean: true })` in `src/ingest/coach-critique.ts` |
| 5 | One consolidated spec (~1,900 words) replaces the layered agent file for this pipeline | `.claude/agents/pred-scout-coach-lean.md` |

Honesty gates are unchanged in kind: every number must exist in the facts (ingest and every
rewrite are ground-checked by `copy-verify`), the format contract runs in code, and an
independent critic (never the author) must pass every line before the review publishes.

## Run it (from `engine/`, zero-API)

1. `COACH_GAMES=<ids> npm run coach:lean:prepare` (without COACH_GAMES: the 5 newest games
   with a standard review and no lean one; `LEAN_LIMIT=n` to change).
2. Author: an agent following `.claude/agents/pred-scout-coach-lean.md` answers every task in
   `engine/copy-tasks/coach-lean.responses.json`. Then `npm run coach:lean:ingest` (fix and
   rerun until every game passes).
3. Critique: `npm run coach:lean:critique:prepare`, an INDEPENDENT critic answers
   `engine/copy-tasks/coach-lean-critique.responses.json` as
   `{ "<matchId>": {"flags":[{"key","issue","rewrite"|null}]} }`, then
   `npm run coach:lean:critique`. Repeat prepare/critic/apply until `npm run coach:lean:status`
   shows every game `published` (at most 3 rounds). A `blocked` game needs a human edit of
   `film.coachLean` and one more round.
4. `npm test`, commit `data/postgame/*` and `data/aggregates/coach-lean-history.json`.

## In the squad coach job

When `data/coaching/lean.json` has `"auto": true`, the coach job runs steps 1-3 for the same
`COACH_GAMES` right after the standard review publishes (docs/coach-automation.md step 4).
Use the `pred-scout-coach-lean` agent as the author and a separate general-purpose agent as the
critic. If any lean step fails, report it and still commit the standard review: the lean
review must never block the standard one. Report per game: rounds, lines judged per round,
lines dropped, and the minutes from lean prepare to published.
On since 2026-11-08 for every new game (trial).

## Revert

Set `"auto": false` in `data/coaching/lean.json` (stops new lean reviews) and
`"defaultView": "standard"` (already the default). The standard reviews were never changed, so
nothing needs restoring. To remove lean copy entirely, delete `coachLean` from the films.
To make lean the main review later: `"defaultView": "lean"`, then retire the standard steps.
