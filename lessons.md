# Lessons

Append-only. One entry per backlog item or significant finding.

## 2026-06-12: Squad v2 — synergy matrix, member reports, partial-stack planner

- The full pairwise matrix (5 commonPlayers calls) immediately produced
  the day's best coaching fact: the most-played duo (lead + Xeebs, 405
  games) is the stack's WEAKEST pair at 51%, while the strongest pair
  (56% over 193g) rarely anchors the lineup. Volume and synergy are
  different axes; show both.
- The partial-stack planner validates the optimizer's logic: remove the
  better jungler from the selection and the lead correctly reclaims the
  jungle seat. Context-dependent recommendations need the context to be
  a user input, not a baked assumption.
- One report builder shared by coach.json and players/<uuid>.json keeps
  every page's numbers in agreement; per-member pages then cost zero
  extra API calls because squad.ts already holds the profiles.

## 2026-06-12: Squad report (five-stack coaching)

- commonPlayers with a RANKED filter finds a five-stack unambiguously:
  the games-together distribution cliffs from 289 to 6. Thresholds can
  be lazy when the signal is this bimodal.
- Solo-optimal and squad-optimal are different answers: the lead's best
  solo role (jungle) loses the seat in the stack because a teammate
  holds it with better numbers, so the optimizer reseats the lead on
  their 355-game support. Surfacing that tension explicitly (both are
  right, different questions) is better coaching than hiding either.
- Brute force is fine at this scale: 120 permutations of
  confidence-weighted shrunk role winrates, no cleverness needed.
- Private profiles appear as null names but keep full stats; render a
  placeholder, never drop the seat.

## 2026-06-12: Coach report + freshness sweep

- Freshness audit cost 3 API calls: the omeda snapshot is byte-identical
  to live (1.14.4 still current, version 150 still staged), so the right
  move was to verify and NOT re-crawl. Cheap verification before
  expensive refresh should be the standing pattern.
- The personal coach report writes itself from two API calls joined with
  local baselines. The strongest coaching signals were structural, not
  mechanical: best-role winrate gap (jungle +2.8 over overall), a role
  actively costing VP (offlane 43.4% over 159g), pool width (top three
  heroes only 38% of games), and an all-time peak that already touched
  the target tier. None of these need bracket-specific baselines.
- Shrinkage emptied the "park these" list that raw winrates would have
  filled: 44-46% over 30-60 games is not credible evidence of a bad
  hero. The honest version of tough love is quieter than the raw
  numbers suggest.
- Player-filtered statistics (timeframe/rating) return null on app-only
  tokens; likely needs user-delegated consent (the authorize flow with
  the callback). Career + per-split ratings carry the report fine.

## 2026-06-12: pred.gg API access (authenticated)

- Auth flow discovered by probing: GET https://pred.gg/auth/token with
  HTTP Basic (client_id:client_secret) returns a ~30-min JWT; /gql takes
  it as a Bearer. The 405-not-404 on POST was the tell that the route
  existed. POSTing forms to a SvelteKit app gets CSRF-blocked; that error
  fingerprinted the framework.
- The GraphQL schema is rich and largely public-read: versions (a full
  patch registry with exact release timestamps, including a staged
  unreleased build), heroes/items, matches, players. Credentialed scopes
  add leaderboards and build_statistic/matchup_statistic reads: the data
  the old site scraped from pages is now available sanctioned.
- pred.gg hero names are internal codenames (Weaver=N3ON, Trooper=Legion)
  but their slugs align with omeda's; join on slug, map display names
  locally.
- hero_id 75 deepens: omeda publishes ids 70-74 and 77 but not 75, while
  75 plays 4.5k+ games in the feed. Likely tied to the staged version
  row. Still open.
- Secrets live in PREDGG_CLIENT_ID/SECRET env vars only; the pipeline
  degrades gracefully without them, and a meta.json gate fails loudly if
  the feature silently vanishes from a credless regeneration.

## 2026-06-12: The Adele question (support caveat)

- A user spotted assassin items on a support in one glance. Root cause:
  the objective vector measures only damage and self-EHP, and the loader
  drops the very stats support items are made of, so support items can
  never win a slot. For supports the engine was answering a different
  question than the page implied.
- The fix that respects the no-vibes rule is labeling, not fabrication:
  a support build without heal/shield math would be exactly the
  hand-waving this project exists to replace. Support-role pages now
  carry an explicit max-damage-only caveat until the support model ships
  (now backlog item 7).
- Every model has an implicit question it answers; the page must state
  that question, or users will assume a different one.

## 2026-06-12: Visual test pass + meta board

- A headless-browser screenshot reviewed by eye caught what no unit test
  could: a CSS selector typo (.eternal-row .alt img vs .eternal-alts
  .alt img) rendered Eternal icons at full image size, and the matchup
  gameplan collapsed to a one-word column on mobile. Screenshots are now
  a scripted step (npx tsx src/ingest/screenshot.ts) and belong in every
  UI change before publish.
- OPEN QUESTION: hero_id 75 has 4,570 games in the current window with
  ~50% WR but is absent from omeda's live heroes.json (52 entries).
  Possibly a newer hero not yet exposed, or a mode-specific id. Excluded
  from the meta board (no kit, no portrait); revisit on next snapshot.
- Aggregate snapshots are date-named; a UTC midnight rollover created a
  second file and the fixture-binding gate fired on a 19g drift. The
  gate worked exactly as designed: regenerating aggregates forces a
  conscious fixture re-derivation.

## 2026-06-11: Artifact pipeline + Zone 1 prototype (backlog item 6)

- The whole roster renders from precomputed JSON: 52 artifacts in 74s on
  a laptop-class runner, so the Concept A static model holds with room
  to spare for matchup variants.
- Off-meta proof semantics need care in copy: the 8%+ edge is build vs
  most-played-items build on a named objective, not the single item's
  marginal contribution. The page wording reflects that; the marginal
  attribution version needs leave-one-out evals (cheap, next pass).
- A coach line assembled from computed values (spike minutes, eternal
  deltas) reads surprisingly well without an LLM; the copy pass becomes
  polish, not load-bearing, which keeps the verifier's job small.

## 2026-06-11: Statistical evidence layer v0 (backlog item 5)

- Item-presence winrates from finished inventories carry survivorship
  bias (winners finish more items). The bias cannot be removed at this
  aggregation level, so it is labeled on every output and deltas are
  read comparatively, never absolutely. Fix path: condition on game
  duration or slot index.
- Method-of-moments empirical Bayes beats hand-picked K: the prior
  strength comes from the spread of the cells themselves, and the same
  10-line estimator serves hero-level and item-level shrinkage.
- First sim-vs-evidence disagreement logged: the generator likes Noxia
  on Gideon (max-health proc vs bruisers); shrunk evidence reads -0.5wr
  over 92 games. Neither is conclusive; this is the discovery loop the
  design wanted, now running on real numbers.

## 2026-06-11: Matchup checkpoint engine (backlog item 4; gate deferred by maintainer)

- A matchup framework is only as good as the weaker kit's data. The first
  Gideon-vs-Countess run showed a false all-game edge because Countess's
  ult had not parsed (percent-max-health phrasing). Coach-sense review of
  real pairs is a mandatory step after any matchup change; it found what
  45 unit tests did not.
- Percent-max-health ult parsing (pattern B) lifted damaging-ult coverage
  from 35 to 37 of 52 kits; 15 remain, mostly genuine utility ults plus 7
  harder formats (wukong, zinx, legion, boris, adele, crunch, sparrow)
  now tracked as a known gap.
- Measured gold curves make spike timelines blunt and honest: with an
  18k full build and ~12k median gold at minute 30, items 5 and 6 land
  "30+min" for most roles. Recommendations should optimize the first
  three to four purchases; the rest is aspiration in a normal game.
- Gameplan text must be derived from the verdict pattern, not from a
  coarse branch: "you win everywhere" and "your edge peaks early then
  levels off" are different coaching instructions.

## 2026-06-11: Match-feed aggregates (backlog item 2)

- gold_earned_at_interval is per-minute cumulative gold (array length
  matches duration; final entry matches gold_earned), with ~2-3 pregame
  entries at the front. Verify interval semantics against a second field
  before trusting any time series.
- The placeholder gold economy was ~2x too rich (assumed 4.6k carry gold
  at minute 10; measured median is 2,473 over 16k samples). Affordability
  and spike-timing math built on the guess would have been badly wrong.
  Measure before modeling, even for "obvious" constants.
- The mode field is a zoo (pvp, ranked, custom, solo, TEAM_VS_TEAM_RUSH,
  brawl). Whitelist modes explicitly; never blacklist.
- 120 polite pages (~4 min) yields 8k matches and 160k+ gold samples per
  minute mark: ample for medians. The off-meta play-rate gate found its
  first real candidate on day one (Magnify on Gideon: Pareto-optimal vs
  bruisers, 0% play rate in 1,736 games).

## 2026-06-11: Item effect schema (backlog item 1)

- Tag-stripped effect text loses which stat a "(+X%)" scales from; the
  stat is in the surrounding markup tag (AttackDamageText vs
  AbilityPowerText vs an icon id). Curate from raw markup, never from
  cleaned text. This disambiguated Deathstalker's Onslaught: attack speed
  equal to 100% of physical penetration, a real cross-stat conversion.
- About 60% of effect targets were cleanly encodable from stated numbers;
  the rest are stack-cadence, positioning, or RNG dependent. Declaring
  them kind:"unmodeled" with a note costs nothing and keeps the registry
  honest; 5 of 12 Eternal majors are in that bucket pending telemetry.
- Marginal-gain ranking surfaces real time dynamics: Vesh's per-minute
  scaling overtakes Demiurge for Gideon around minute 14. Eternal advice
  must be game-time-aware, which no winrate table could express.
- First ranking pass put Krix (+18% eHP) above damage Eternals for a
  ranged mage; survivability weights need kit-context discounting. Coach
  sanity checks on real output catch what unit tests do not.

## 2026-06-11: Engine v0.1 (simulator, search, harness)

- The owned ability scrape has holes: 33/49 heroes had castable slots with
  no damage entries (Crunch's whole kit, Murdock's Buckshot). Structured
  data that looks complete is not; always run a coverage census before
  trusting a source.
- omeda.city `/heroes.json` closed the base-stat gap in one shot: 18-level
  arrays for health, armor, attack speed, mana, base AD, for all 52 heroes.
  Check the sanctioned API for a field before designing a workaround.
- The match feed is oldest-first by default. The "null enrichment on fresh
  matches" finding from earlier research was wrong: those were 2022 matches
  that predate the fields. Matches 1h old are fully enriched. Probes beat
  assumptions; keep `npm run probe` alive.

## 2026-06-11: Patch-currency validation

- The owned hero-abilities.json and items.json are pre-1.14 despite
  commits titled "Apply 1.14.4 patch" (those only updated digests/meta).
  69 ability damage values and 183 cooldowns drifted. Lesson: a commit
  message saying a patch was applied is not evidence the numbers moved;
  validate against an independent source or the patch digest itself.
- Patch digests stating exact values (Void Breach "85-225 -> 95-235") are
  gold for arbitration: they let a test pin source currency permanently.
- Conclusions are patch-sensitive even when the math is right: the 1.14
  global cooldown increase moved Gideon's haste-vs-power crossover from
  10s to ~15s. Tests should assert monotone invariants, not conclusions;
  conclusions get named "golden" gates that a human reviews when they fire.
