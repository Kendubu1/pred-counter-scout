# Lessons

Append-only. One entry per backlog item or significant finding.

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
