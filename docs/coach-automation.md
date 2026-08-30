# Squad postgame coach automation

**Goal:** when anyone in the 5-stack finishes a game, the coach pipeline runs
without being asked: postgame facts pulled, coaching narrative authored and
critiqued, coach + squad reports refreshed, everything committed to `main`.

**Shape:** no service in the Predecessor ecosystem emits webhooks, so
"event-based" is a polite poll with a committed high-water mark. A scheduled
Routine fires a fresh Claude session on a cadence; the session runs the watcher
and either exits quietly (no new games — one API call spent) or works the full
pipeline for each new match.

## Architecture change (2026-08-30): persistent worker session

Fresh-per-fire sessions turned out to have NO git authorization for this
repo: a run coached a game, went green, committed — and the push died on a
403 from the git proxy ("repo isn't in the session's authorized set"),
stranding the commit in an ephemeral container. Source/credential config
lives on a SESSION, and Routines cannot attach sources to the fresh
sessions they spawn — so the Routine now fires into a PERSISTENT WORKER
session created with the repo attached as a source (push access to main),
which survives container recycling. Consequences:
- Each fire starts with `git fetch origin main && git reset --hard
  origin/main` — the worker's clone is disposable; leftovers from an
  interrupted run are debris, never work to keep.
- A stranded-commit failure is impossible to lose data to: the watch
  marker only advances when a push lands, so an interrupted run's games
  are re-detected and re-coached on the next fire (this is the standing
  self-healing design doing its job).
- The old fresh-session Routines are disabled, kept for reference.

## Step 0 — bootstrap (added 2026-08-30 after a repo-less fire)

Fired sessions have started with an EMPTY environment (no repo at
/home/user/pred-counter-scout; the 2026-08-30 15:51 fire found /home/user
bare and could do nothing). The Routine prompts now carry the fix, and it
is policy: **if the repo is missing, clone it before anything else** —
`git clone https://github.com/Kendubu1/pred-counter-scout` with up to 4
retries on network failure — and only report "repo unavailable" if the
clone itself fails. A fired session must never report "nothing to do"
because the environment forgot the checkout.

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
   - exit 3 → new matches exist; continue:
2. `npm run postgame -- --squad` — SELF-HEALING film pull: discovers every
   stacked ranked game in the members' recent history (pred.gg source when
   creds are present), skips already-reviewed games, and writes the film index.
   This is deliberately not a per-uuid loop: if an earlier fire died mid-run or
   a game was missed for any reason, the next fire picks it up — the Aug 11-28
   backlog that motivated this design happened precisely because nothing was
   re-scanning history. Omeda's per-player enrichment degrades gracefully when
   omeda is 503 (postgame.ts handles it); the review still lands.
3. Deterministic enrichment over the whole set: `npm run postgame:kit`,
   `npm run postgame:items`, `npm run postgame:fights`, `npm run postgame:macro`
   (all idempotent — they only touch films missing their block).
4. Coaching narrative (session compute, NO API key — the standing copy policy):
   author the `coaching` block for each new game the way the pred-scout-coach
   agent does — grounded ONLY in that game's facts file, including the
   buildReads teaching layer (gained-vs-lost reasoning per player) — then run the
   independent critique loop SCOPED TO THE NEW GAMES ONLY:
   `COACH_GAMES=<id,id,...> COPY_MODE=prepare npm run coach:critique:prepare`,
   the independent critic pass, `COACH_GAMES=<same ids> npm run coach:critique`,
   and `npm run coach:loop:gate` until it converges (docs/agent-loops.md).
   COACH_GAMES takes comma-separated match-id prefixes; without it the loop
   re-judges the ENTIRE film library (~100 games) on every fire — never do
   that in the automation (added 2026-08-30 after a fire did exactly this).
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
- **Division of labour:** this Routine reacts to GAMES. Site data that ages on
  its own clock — the meta board's lane stats, the measured patch stats, and
  catching the moment omeda publishes a new balance patch — belongs to the
  separate daily pull (docs/daily-refresh.md), not here. One reacts to events,
  the other keeps the shelves stocked.
