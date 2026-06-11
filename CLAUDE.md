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
4. Definition of done per backlog item: harness green, design doc updated,
   `lessons.md` updated, committed.

## Practical notes

- Engine commands (run from `engine/`): `npm test` (harness),
  `npm run answer -- <hero-slug>` (build generation),
  `npm run drift` (owned-data staleness report),
  `npm run snapshot` (refresh data/omeda after a balance patch),
  `npm run probe` (live match-feed field check).
- Confidence rule: any output touching an unverified fixture constant is
  THEORY at best. The harness prints unverified constants on every run.
- The omeda.city match feed is oldest-first by default; always drive it
  with `?timestamp=` + cursor. Matches carry no patch field; partition by
  start_time against patch release dates.
