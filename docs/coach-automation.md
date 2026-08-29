# Squad postgame coach automation

**Goal:** when anyone in the 5-stack finishes a game, the coach pipeline runs
without being asked: postgame facts pulled, coaching narrative authored and
critiqued, coach + squad reports refreshed, everything committed to `main`.

**Shape:** no service in the Predecessor ecosystem emits webhooks, so
"event-based" is a polite poll with a committed high-water mark. A scheduled
Routine fires a fresh Claude session on a cadence; the session runs the watcher
and either exits quietly (no new games — one API call spent) or works the full
pipeline for each new match.

## The moving parts

| Piece | Where | What it does |
| --- | --- | --- |
| Watcher | `engine/src/ingest/squad-watch.ts` (`npm run squad:watch`) | ONE aliased pred.gg query for all five members' recent matches; diffs against the marker; exit 0 = nothing, exit 3 = new matches (uuids on stdout), exit 2 = creds missing |
| Marker | `data/postgame/watch-state.json` | Newest handled match `startTime` per member. Committed, so it survives across fresh sessions. Never edit by hand; the watcher owns it |
| Squad roster | `data/artifacts/squad.json` `members[].uuid` | Who counts as "the 5-stack". Re-run `npm run squad -- <lead-uuid>` to change it |
| This runbook | `docs/coach-automation.md` | The Routine's prompt says "follow this file" — edit HERE to change the automation's behaviour, no Routine surgery needed |

## What the fired session does

All commands from `engine/` after `npm install`. **Credentials gate first**
(CLAUDE.md autonomy rule 4): if `PREDGG_CLIENT_ID`/`PREDGG_CLIENT_SECRET` are
not in the env, stop immediately and report — no partial work.

1. `npm run squad:watch`
   - exit 0 → done. Commit nothing, report nothing.
   - exit 2 → creds missing: stop and say so loudly.
   - exit 3 → for each match uuid printed, in startTime order:
2. `npm run postgame -- <match-uuid>` — pulls the facts (omeda public API,
   match detail; the feed's list endpoint being down does not block a detail
   pull, but if the pull itself fails, leave that match for the next fire — the
   marker only advances past what the watcher saw, and the postgame file's
   absence is the retry signal).
3. Deterministic enrichment: `npm run postgame:kit`, `npm run postgame:items`,
   `npm run postgame:fights`, `npm run postgame:macro` (each `-- <match-uuid>`
   where supported; they no-op on games they don't apply to).
4. Coaching narrative (session compute, NO API key — the standing copy policy):
   author the `coaching` block for each new game the way the pred-scout-coach
   agent does — grounded ONLY in that game's facts file — then run the
   independent critique loop: `COPY_MODE=prepare npm run coach:critique:prepare`,
   the pred-scout-coach-critic pass, `npm run coach:critique`, and
   `npm run coach:loop:gate` until it converges (docs/agent-loops.md).
5. Refresh the reports: `npm run coach -- <lead-uuid>` and
   `npm run squad -- <lead-uuid>` (lead = `data/artifacts/squad.json` `.lead`).
6. `npm test` — commit only on green (autonomy rule 1).
7. Commit to `main` and push. **Data only**: `data/postgame/*`,
   `data/artifacts/coach.json`, `data/artifacts/squad*.json`,
   `data/aggregates/coach-critique*.json`. The automation never edits engine or
   UI code; if a step needs a code fix, stop and report instead.

## Operational notes

- **Cadence:** hourly (Routine minimum). Worst-case detection lag ≈ 1h after
  the game ends. A no-news fire costs one aliased API call.
- **Five-stack dedupe:** one squad game appears in up to five members' match
  lists under the same uuid; the watcher collapses them, so one game = one
  coach run.
- **First run:** the watcher initialises the marker at everyone's current
  latest match and replays nothing.
- **Backfill after downtime:** the watcher looks back 8 matches per member, so
  an evening of games between fires is caught in one batch.
- **Credentials:** the fired sessions read `PREDGG_CLIENT_ID`/`SECRET` from the
  execution environment's configured secrets. They are NEVER committed. If the
  watcher starts exiting 2, the environment lost its creds.
- **Stopping:** disable or delete the Routine (it is listed under Routines as
  "Squad postgame coach"); the repo needs no change.
