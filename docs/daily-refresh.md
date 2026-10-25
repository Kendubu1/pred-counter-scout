# Daily data refresh

**Goal:** the site's non-match data stays current without anyone asking: the
meta board's lane stats track the live patch, the measured patch stats keep
maturing, and the moment pred.gg publishes a new balance patch the catalog is
refreshed and verified — instead of the two-patch-stale snapshot that shipped
through the 1.16 era (lessons.md 2026-08-28). The catalog moved from omeda.city
(frozen since 2026-08-28) to pred.gg on 2026-10-14 (`npm run catalog`).

**Shape:** a once-daily Routine fires a fresh session that runs the pulls below
and commits data-only changes to `main`. It complements the hourly "Squad
postgame coach" Routine (docs/coach-automation.md): that one reacts to the
squad's GAMES; this one keeps the SHELVES stocked.

## Architecture change (2026-08-30): persistent worker session

Fresh-per-fire sessions turned out to have NO git authorization for this
repo: a run coached a game, went green, committed — and the push died on a
403 from the git proxy ("repo isn't in the session's authorized set"),
stranding the commit in an ephemeral container. Source/credential config
lives on a SESSION, and Routines cannot attach sources to the fresh
sessions they spawn — so the Routine now fires into a PERSISTENT WORKER
session created with the repo attached as a source (push access to main),
which survives container recycling. Consequences:
- Each fire starts with a NON-destructive sync (changed 2026-10-19):
  `git fetch origin main`, then, if the tree is dirty from an interrupted
  run, `git stash push -u -m "leftover <date>"` (reversible — the leftovers
  are debris, but a stash is not a deletion), then `git checkout main &&
  git merge --ff-only origin/main`. Never `git reset --hard`: the worker's
  auto-mode permission check treats it as irreversible local destruction
  whenever the tree is dirty and refuses it, which blocked the 10-18 and
  10-19 fires before any work ran. If the fast-forward fails (local commits
  that never pushed), stop and report rather than discarding them.
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

## What the fired session does

All commands from `engine/` after `npm install`. **Credentials gate first**: if
the pred.gg credentials are missing or the token exchange fails, STOP and report:
since 2026-10-14 every step, the catalog included, is a pred.gg pull.

1. `npm run catalog` then `npm run patchcheck` — refresh the pred.gg catalog and
   VERIFY it against the committed patch digests. Three outcomes:
   - patchcheck clean, no hero/item changes in the diff → catalog was already
     current; continue.
   - patchcheck clean, catalog changed → a balance patch landed in the catalog.
     Continue with the full chain below, and if data/patches/ has no digest for
     the new version yet, note that loudly in the report — the digest is
     hand-captured from the official notes and is a maintainer task
     (scripts/apply-patch.js onboards it).
   - patchcheck reports STALE values → pred.gg has not fully published the patch;
     REVERT the catalog (git checkout -- data/catalog) and stop. A half-applied
     catalog is worse than a verified old one.
   - a new hero or item appeared → also run `npm run icons` (portraits, ability
     icons, augments) before step 4.
2. `npm run lanestats` — the meta board's lane matrix, ranked, version-pinned
   to the current patch (14 aliased calls).
   It chains `npm run bans` (14 aliased calls, added 2026-10-25): per-hero
   ranked ban counts, all ranks and per rank band, into
   data/aggregates/predgg-bans.json. `npm run artifacts` then chains
   `npm run ban-board` (zero-API) to write data/artifacts/bans.json for the
   homepage "Most banned" strip and ui/v6/bans.html.
3. `VERSIONS=<current ids> OUT=data/aggregates/predgg-general-stats-<patch>.json
   npm run genstats` — the measured patch window (ids from the lanestats output
   or `data/aggregates/predgg-lane-stats.json` .versionIds). Then
   `node ../scripts/build-measured.js <patch>` and
   `node ../scripts/build-patch-page.js <patch>` if a predictions file exists
   for the patch.
4. `npm run perks` — augment / Eternal / minor / crest win evidence counted
   from pred.gg's public match stream (get-matches-since), resumed from the
   committed cursor in data/aggregates/perk-stream.json (~1,000 requests a day;
   a new patch starts a fresh window). Rewrites predgg-augments.json and
   predgg-builds.json (core builds from each player's purchase order).
   Gold+ is tagged by rank AT MATCH TIME: each page's ranked matches go to
   one aliased GraphQL `match(by: { id })` call (src/ingest/match-rank.ts,
   ~0.7s a page, inside the 2s stream delay) for the rank every player held in
   that game. Every hero-role cell keeps a `gold` sub-count, shipped as
   `goldPlus` in predgg-augments.json (20+ games; its games/wins are the
   hero-role Gold+ baseline) and `goldByRole` cores + `baselineByRole` in
   predgg-builds.json (`goldBasis: "match-time"`). The first run after this
   change drops the one day of ladder-basis (current-rank) Gold+ counts and
   restarts `goldFrom`. Plat+ (`plat` cells, `platPlus`, `platByRole`,
   `baselineByRole.*.plat`) is counted from the same lookup at no extra cost.
   The page's high-rank band is Plat+ only (Gold+ stays in the files, unshown).
   A lane OPENS on Plat+ once its most-played Plat+ build has 100+ games
   (MIN_BAND_BUILD_GAMES in src/artifacts.ts), else all ranks; the builds
   page's rank filter (All ranks / Plat+, in the hero header) switches the
   opening picks (`platPlus`: augment, Eternal, minors, crest) and the builds
   (`metaBuildsByBand`) together, as soon as the lane has any Plat+ data, with
   thin-sample notes; a section with no Plat+ data falls back to all ranks and
   says so. Matchups stay all ranks. There is no backfill, so expect lanes
   to fill over the following weeks, popular ones first (1.17 volumes: median
   lane ~34 days to a 100-game top Plat+ build).
   Since 2026-10-25 perks also writes data/aggregates/build-matchups.json
   (no extra requests): each hero-role's first 3 core items, split by lane
   opponent and by every enemy hero, for all ranks and Plat+ (rank at match time from the same lookup; the
   seed's and first runs' ladder-basis Plat+ counts are dropped on migration,
   see `platFrom`). Commit it with
   the other aggregates. It resets with the patch window like perk-stream.json.
   `window.segments` lists the counted stretches, including a one-off
   `seed:fork-poc` (Oct 22-24). Read it with `npm run matchups:builds -- <hero>`.
   Then `npm run aggregate && npm run matchups:feed` — the pred.gg match samples
   (gold curves + item play rates; same-role head-to-head lanes, resumed
   incrementally inside the current patch family). Then `npm run checkpoints`
   — re-derives the checkpoint gold in engine/fixtures/calibration.json from
   the new snapshot. Required: the harness holds that fixture within 15 gold of
   its snapshot, and the medians drift daily (2026-10-18 refresh went red on
   midlane@15, 6062 vs 6081, before this step existed).
5. `npm run artifacts && npm run matrix && npm run agreement` — fold the fresh
   evidence into the hero pages and boards.
6. `npm test` — commit ONLY on green.
7. Commit data files only (data/catalog/*, data/aggregates/*, data/artifacts/*,
   data/postgame/* changed by `postgame:loadout`, ui/patch-*.html regenerated by
   the builders, and engine/fixtures/calibration.json when `npm run checkpoints`
   rewrote it — that one fixture is measured data the script owns) directly to
   main and push. Never edit engine or UI source by hand; if a step needs a code
   change, stop and report instead.

## Operational notes

- **Cadence:** daily at a quiet hour. A run where nothing changed commits
  nothing.
- **Why refresh the catalog daily when patches are ~3-weekly:** a catalog can
  lag live and move without announcement; the daily patchcheck is how the site
  notices it flipped. (omeda's lagged by days, then froze for good on
  2026-08-28; pred.gg had 1.17.2 the day after release.)
- **Gated endpoints are retired from the chain** (2026-10-16): `augments`
  (simpleBuild) and `buildstats` (coreBuild) stay out for good. `npm run perks`
  counts the same evidence (augments, Eternals + minors, crests, item cores)
  from the public match stream, so nothing waits on an app-tier unlock.
- **Worker v2 (2026-10-16):** the "Daily data refresh (v2)" Routine (08:56 UTC)
  fires into the persistent session "Daily data refresh worker (v2, pred.gg
  stream)". It reads PREDGG_CLIENT_ID / PREDGG_CLIENT_SECRET from the
  ENVIRONMENT only (no credentials in any prompt), so rotating the keys means
  updating the environment's variables, nothing else. When copy tests fail
  because new lanes or builds appeared, it runs the zero-API copy loop plus one
  critic round before committing. The 2026-08-30 worker Routine is disabled.
- **Stopping:** disable or delete the "Daily data refresh (v2)" Routine.
