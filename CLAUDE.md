# CLAUDE.md

## Project

Predecessor Scout: a build/counter companion for Predecessor (5v5 MOBA).
Two halves:

- `ui/v2/` + `data/game-data/` + `data/2026-02-08/`: the LIVE site and its
  data. Frozen; do not modify without an explicit ask. Its game numbers are
  known to be pre-patch-1.14 (see lessons.md and `npm run drift`).
- `engine/`: the v5 kit-math engine, spec in `docs/v5-engine-design.md`.
  All numbers come from the `data/omeda/` snapshot (current patch, official
  API via omeda.city). This is where active work happens.

## Data policy (permanent, set by the maintainer 2026-06-12)

Pull from external APIs (pred.gg, omeda.city) ONLY when genuinely needed:
a scheduled refresh, a patch drop, or a new data requirement that cannot
be served from what we hold. Everything the site renders must be static
committed snapshots or computed by our own engine from them. Before any
API work: check whether committed data already answers the question
(verify-before-refresh); batch and alias queries; sequential requests
with delays and retry/backoff; identify ourselves via User-Agent. UI
features should be built against committed artifacts (zero-API) by
default. The 2026-06-12 provider outage proved the architecture: the
site served uninterrupted while both upstreams were down.

## Copy & analysis policy (permanent, set by the maintainer 2026-06-20)

No Anthropic API key. This project does NOT use `ANTHROPIC_API_KEY` for any
copy or analysis. All copy passes (augments, items, abilities, Eternals) and
any coaching/comparison analysis run on the existing Claude Code **session
compute** via the in-session agent `.claude/agents/pred-scout-coach.md`. The
flow is deterministic-bracketed so honesty is enforced by code, not the model:

1. `COPY_MODE=prepare npm run copy:prepare` (zero-API) emits grounded prompts to
   `engine/copy-tasks/<pass>.tasks.json`.
2. The `pred-scout-coach` agent reads those tasks and writes
   `engine/copy-tasks/<pass>.responses.json` using session compute + full game
   knowledge (kit, items, Eternals + minors, augments, builds, matchups).
3. `npm run copy:ingest` (zero-API) runs the unchanged numeric ground-check
   (`engine/src/copy-verify.ts`) and writes `data/aggregates/*.json`; any line
   citing a number absent from its source cell is still dropped.

`engine/copy-tasks/` is scratch (gitignored). The PREDGG_*/omeda snapshot creds
are unrelated to this and unaffected.

The copy is further hardened by an **independent judge**: a separate critic agent
(NOT the author) reviews the authored copy for wrong/misleading/jargon lines, and
the author→judge→apply loop iterates to a target agreement rate. The reusable
plan→build→judge methodology, the convergence gate (`npm run review:loop:gate`),
and how to wire a new loop live in `docs/agent-loops.md`.

## Autonomy policy (permanent, set by the maintainer)

1. Work the backlog in `priorities.md` top to bottom. After finishing each
   item: run the full harness, commit only on green, append findings to
   `lessons.md`, then move to the next item without asking.
2. Never fill an unverified constant with an estimate. Flag it in
   `engine/fixtures/calibration.json`, mark the dependent math as
   provisional, and skip ahead.
3. Stop early only for: a test that cannot be fixed in 3 attempts, anything
   that changes scope or architecture, or anything destructive. State the
   blocker and a recommended option when stopping.
4. **Credentials gate (added 2026-06-26, set by the maintainer).** If a task needs
   a live data pull (`PREDGG_CLIENT_ID/SECRET`, omeda refresh) and the credentials
   are NOT in the session, **PAUSE and request them before starting** — do not do
   partial work (backfills, estimates, "I'll redo it once the data lands") that has
   to be re-run after the fact. Verify creds up front for any refresh/pull/
   calibration task, and finish the **whole pipeline in one pass** (pull → every
   derived pass: artifacts, kit, skirmishes, etc.) so analysis isn't redone later.
   Doing half the work without data and re-running was double effort — gate on creds first.
5. Definition of done per backlog item: harness green, design doc updated,
   `lessons.md` updated, committed.

## Practical notes

- Engine commands (run from `engine/`): `npm test` (harness),
  `npm run answer -- <hero-slug>` (build generation),
  `npm run drift` (owned-data staleness report),
  `npm run snapshot` (refresh data/omeda after a balance patch),
  `npm run refresh` (FULL data refresh chain — needs PREDGG_CLIENT_ID/SECRET in
  the env: snapshot -> augments -> buildstats -> skills -> aggregate -> artifacts
  -> matrix -> agreement; refreshes winrates + builds for every hero's main and
  flex lanes. Follow with the zero-API copy passes: `COPY_MODE=prepare npm run
  copy:prepare` -> pred-scout-coach agent -> `npm run copy:ingest` and
  `npm run review:builds`. NOTE: secrets are injected at session start, so a newly
  added cred needs a fresh session before `refresh` can authenticate),
  `npm run probe` (live match-feed field check),
  `npm run matrix` (all-pairs matchup matrix; rerun after snapshot/artifacts),
  `npm run augments` (per-hero-role augment/eternal/crest field evidence + icons),
  `npm run skills` (per-hero recommended leveling order from pred.gg),
  `npm run copy:prepare` then (pred-scout-coach agent fills responses) then
  `npm run copy:ingest` (copy passes on session compute — NO API key; each line
  verified by src/copy-verify.ts). `review` / `review:items` / `review:abilities`
  are the per-pass ingest steps; prefix with `COPY_MODE=prepare` to emit tasks.
- Confidence rule: any output touching an unverified fixture constant is
  THEORY at best. The harness prints unverified constants on every run.
- The omeda.city match feed is oldest-first by default; always drive it
  with `?timestamp=` + cursor. Matches carry no patch field; partition by
  start_time against patch release dates.
