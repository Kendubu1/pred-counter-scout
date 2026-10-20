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
   `npm run postgame:items`, `npm run postgame:fights`, `npm run postgame:macro`,
   `npm run postgame:loadout` (all idempotent — they only touch films missing
   their block). `postgame:loadout` (added 2026-10-17) looks each film up in
   pred.gg's public match stream by its own match id and writes what every
   player RAN — augment, Eternal, both minors, crest — onto
   `players[i].loadout` (GraphQL cannot return perks at our tier). Coach the
   Eternal the player actually ran, not the engine's pick: the review page
   shows both ("ran" and "engine pick"), and the critic's SOURCE carries the
   loadouts for all ten players.
4. Read `data/coaching/personas.json` fresh. Author the active preset from each
   match's facts, using `.claude/agents/pred-scout-coach.md`. Never imitate sibling
   reviews: older copy is not a style template. Stamp `coaching.personaId` with
   the active ID. The preset overrides all legacy card/deep-dive requirements.
   For the active blunt-paragraph preset use concise verdict, why, one team action, and one
   pointed paragraph per player with supported keep/change advice woven in.
   Do not force criticism after strong play. No timestamps, stat dumps, duplicate
   verdicts or separate Keep/Change cards. Keep evidence in collapsed details.
   Run `COACH_GAMES=<id,id,...> npm run coach:contract`, then the independent
   critique loop SCOPED TO THESE GAMES ONLY:
   `COACH_GAMES=<ids> COPY_MODE=prepare npm run coach:critique:prepare`, independent
   critic responses, then `COACH_GAMES=<ids> npm run coach:critique`.
   Correct all flags and repeat until a fresh critique is clean. A loop STOP
   from plateau or maximum rounds is NOT permission to publish.
   Finally run `COACH_GAMES=<ids> npm run coach:contract -- --publish`.
   This requires a clean critique of the exact saved match facts and copy, and
   updates the reviewed marker in the index. Any later edit requires critique
   again. Do not publish pre-critique commits or advance the watch marker alone.
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


## Review voice and evidence gate (2026-10-19)

Use the latest maintainer tone section in `.claude/agents/pred-scout-coach.md`:
blunt competitive verdicts, occasional adult humor, and specific player advice.
The independent critic preserves grounded harshness. Before reusing a prior
review, remove simulated lane wins presented as actual wins, unproven attendance
claims and checks rewarding kill/death credit. Update the reviewed-match index
from the saved coaching objects. A copy-only refresh uses stored match facts;
it does not require a new profile or match API pull.

## Regression found 2026-10-19
The persistent worker authored e89f68db while naming v4 but imitating older
sibling reviews. This runbook also retained mandatory legacy cards. Both sources
of conflicting instructions are now removed from the active workflow. The
contract is enforced by scoped critique as well as the final publication step.
The Routine cadence is unchanged; this file governs its future runs.

## Voice escalation (2026-10-19, blunt-paragraph-v5)
The active preset now calls for decisive, pointed coaching with natural profanity
and behavior-based humor across the review. One isolated swear surrounded by
cautious report prose does not satisfy the voice. The critic must check this
explicitly as well as grounding. Do not manufacture a mistake to make a roast.
Keep K/D/A in the player header and advice in one paragraph. Older presets remain
selectable with `npm run coach:preset -- <id>`; saved v5 reviews can be restored
with `npm run coach:preset -- blunt-paragraph-v5 --restore-reviews`.
The exact pre-v5 two-match copy is archived in
`data/coaching/review-presets/before-blunt-paragraph-v5.json` for comparison only.


### Jungle vision equipment and sentry advice
Ward placements and wards destroyed measure actions, not equipped vision tools. The current normalized loadout stores augment, Eternal, minors and crest; it does not record ward-versus-sentry equipment or swap history. Never infer the equipped tool from low placements, zero placements, clears, or absence from the completed-item list. Match-linked explicit inventory evidence or user testimony can establish equipment; do not attach ambiguous testimony to a guessed player or match.

When wards are confirmed equipped but barely used, give direct actionable advice: switch to sentry for a denial-focused jungle plan and actively sweep before ganks or objectives, unless the team needs ward coverage the player will actually provide. Judge underuse in the context of match duration, opportunities and team coverage; there is no universal ward-count cutoff and no guaranteed win improvement. When equipment is unknown, keep the advice conditional: "If wards were equipped but unused, switch to sentry next game and sweep before ganks." Do not scold a confirmed sentry user for low ward placement alone. Use the actual placement/clear evidence for accountability, and put equipment uncertainty in collapsed details rather than repeating it throughout main copy.

### Varied cadence (blunt-paragraph-v6)
Do not give every player the same praise/correction/closing-roast structure.
Let the specific performance determine the order: a sharp opener, a joke inside
the reasoning, a plain practical paragraph, or an occasional closing jab.
Avoid mechanical template rotation and repetitive final punchlines. The critic
reviews the whole set of player paragraphs for this pattern, not only each
paragraph in isolation. Preserve supported keep/change advice and the edge.

### Match-linked vision correction (2026-10-19)
Read coaching.visionEvidence before authoring or revising a match. This stores explicit user testimony keyed by player ID within that match, separate from API facts; preserve it on rewrites. Do not transfer it to the same player in another match. Credit confirmed sentry clearing. Never tell an established sentry user to switch to sentry, even conditionally, or turn zero ward placements into a failure. Unknown equipment alone is not evidence of misuse and does not warrant a generic switch warning. Low confirmed ward use can support a specific sentry recommendation, with active sweeping required.

### Loss reflection and explicit takeaways (blunt-paragraph-v7)
For losses, write coaching.lossReflection explaining one plausible alternative team decision. Team describes the outcome; reflection explains the alternative; focus.action supplies one observable check. Every player paragraph needs an executable role-specific takeaway with a condition, without a duplicate Takeaway card. Preserve grounded keep advice and varied tone. Read enemy item trigger conditions as well as match events. Separate prospective role assignments from detected failures. Ward counts cannot prove pit coverage; kill-cluster isolation cannot prove getting caught; ability execution needs cast telemetry or replay. Preserve prior presets for rollback. The critic must assess actionability and duplication across the complete review.

### Communication and damage-output advice
Sentry use does not itself require an escort. Recommend communicating the gank target or objective plan and confirming follow-up; request support only when a supported threat or contested setup warrants it. Historical player-on-hero damage baselines can identify lower output but cannot prove missed shots or reload errors. Present shot completion as a prospective safe practice target, never a detected miss. Include the recorded diagnostics in critique evidence so supported output comparisons are not discarded.

### Role-specific build analysis in expanded evidence
For newly authored reviews set coaching.buildAnalysisVersion=1 and supply buildReads for every allied player with matchup, build, eternal, augment, crest and improvement paragraphs. Distinguish the actual role matchup (duo pairs for support/carry; jungle opponent and gank targets for jungle) from whole-team threats. Explain owned item/passive trigger conditions and relevant enemy defenses, then recorded Eternal/minors, augment and crest fit. Offer conditional alternatives with the benefit and sacrificed value, including a defensible keep when no swap is supported. Do not equate meta popularity with fit, final inventory with purchase timing, or catalog mechanics with actual procs, stacks, hit accuracy or active use. Draft choices are draft alternatives, not mid-match swaps. Avoid duplicating the main execution takeaway or listing the inventory again; the grouped popup already supplies it. Critique all six fields against catalogs and match facts.
