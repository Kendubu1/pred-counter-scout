# Lessons

Append-only. One entry per backlog item or significant finding.

## 2026-06-12: The film room (genuine per-player insights)

- "Not genuine" was accurate user feedback about template plans: five
  people, five identical bullet shapes. The fix was new DATA, not new
  prose: per-player recent-match histories (tilt, game-length splits,
  form, death trends) and squad-relative identity stats (vision,
  objectives, damage dealt/soaked) make findings personal by
  construction.
- Significance gates cut both ways: they kept Willy's temporal section
  honest (no fake form story) but left two members with only a flex
  line. The fix is breadth of insight TYPES plus a floored fallback
  (mildest distinctive trait), never loosened gates.
- A genuineness gate now lives in the harness: no two members may ship
  identical insight lists.
- pred.gg threw a transient 504 mid-run; the client now retries 5xx/429
  with backoff. Any client without retry is a latent pipeline failure.

## 2026-06-12: Calibration from live data

- One constant fell to data alone: ultRankLevels verified via pred.gg's
  in-game recommendedSkills arrays (ULTIMATE at positions 6/11/16).
  Check whether the game publishes a fact before scheduling a
  measurement session for it.
- The crit envelope (largest_critical_strike / predicted max basic over
  6,657 crit builders) double-pays: its densest bins (1.6-1.8) are
  consistent with the assumed 1.75 multiplier AND discriminate the
  scaling basis, since the total-power reading would imply an absurd
  1.2x crit. Joint inference from one distribution.
- The mitigation fit raised a real warning instead of a confirmation:
  implied K rises 122->150 with armor, the signature of shields/DR
  contaminating total_damage_mitigated. If true K exceeds 100, EHP
  outputs currently overvalue armor; the practice-mode mitigation
  measurement is now the single highest-priority item on the checklist.
- Aggregate fields verify SOME constants but each needs a mechanism
  argument for why the statistic identifies the constant; where the
  field is contaminated, record the evidence and keep the flag red.

## 2026-06-12: Meta builds explained + the ledger POV

- The sim explaining evidence is the project thesis landing: pred.gg's
  most-played Gideon core (55.2% over 390g) is also the sim's own best
  core for its objective ("the winrate is earned, not luck"), while the
  third meta core triggers a +25% optimizer suggestion. Agreement
  validates the sim; disagreement generates testable content. Both are
  product.
- Counter swaps must price the tradeoff or they are vibes: "their 3s
  all-in loses 32% of its bite for 11% of your damage" is a decision a
  player can actually make mid-game.
- "Best objective" labels need a discrimination filter: when all cores
  tie on an objective, relative-max picks nonsense. Require >=5% spread
  before an objective may explain a build.
- The ledger (wins per 100 games) is the report POV that survived: one
  currency, every claim priced, receipts attached, non-additivity
  stated. Archetype labels need shrinkage-aware thresholds (4 points of
  shrunk spread is a big gap).
- The meta.json pilots gate fired on a credless regeneration mid-session
  and was right to.

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

## 2026-06-12: Mobile feedback pass — copy is a data product too

- Three maintainer screenshots flagged the same root cause five ways:
  copy written from the engine's point of view ("355g", "+5.2 points",
  "combined points", "Closet X Main" five times). Numbers a tool can
  parse are not numbers a teammate can read. New standing rules: spell
  out "games", express every winrate delta as "wins per 100 games",
  and never address a specific person in shared-page copy.
- First-match-wins archetype rules collapse onto whichever trait is most
  common in the group (everyone has a 75-game pocket hero, so everyone
  became a Closet Main). Fix that generalizes: emit ALL true candidate
  identities ranked by strength, then assign squad-wide with a no-repeat
  constraint — strongest claims pick first. Honesty is preserved because
  every candidate receipt is independently factual; the pass only chooses
  which true fact leads. Harness now gates on label distinctness AND on
  the word "points" appearing in receipts.
- A runtime `plink is not defined` shipped past `node --check` because
  syntax-checking a template string does not execute it. The Playwright
  pageerror listener caught it on the first screenshot. Visual checks
  must capture console/page errors, not just pixels.
- "Coach" nav that deep-links one person's report reads as a personal
  page; a roster picker (squad.json is already on disk, zero API) makes
  the same artifact set serve all five members.
- The coach report told Willy "queue jungle as primary" while the meta
  card showed only his volume roles — cross-card coherence needs the
  same role-selection logic everywhere (union of plan-primary + volume).

## 2026-06-12 (later): Trio synergy + killing the case-by-case "why" text

- The per-seat opportunity-cost receipts ("X is the better support — so
  why Y?") died after three rewrites: factual, third-person, plain
  language, and the maintainer still cut them. The lesson is about
  placement, not phrasing — a roster card is for decisions, and three
  sentences of optimizer justification per seat is explanation debt.
  One general principle line ("seats are scored as a set...") carries
  the same trust with none of the noise. Receipts belong on demand
  (hover, coach page), not inline.
- pred.gg commonPlayers is pairwise-only, but Match.matchPlayers exposes
  full rosters, so trio records are minable: union of each member's last
  50 ranked matches (matchesPaginated caps a page at 50), dedupe by match
  uuid, count 3-subsets per team side. 97 distinct matches gave all 10
  trios 27+ games. Window-vs-all-time mismatch is labeled in the UI note
  and honesty list rather than hidden.
- Internal links beat external ones when both exist: player names now go
  to their own coach pages (pred.gg stays one hop away in the page
  header). External-profile links on every name made the site feel like
  a directory for someone else's product.

## 2026-06-12 (later still): role attribution for hero suggestions

- Maintainer caught a real attribution flaw via one example (Cuban's
  Zinx): seat suggestions tagged each hero with the FIELD's primary role
  and credited the player's whole-hero winrate to that seat, silently
  blending lanes. pred.gg heroStatistics accepts filter { roles: [...] },
  so the player's own per-role record is queryable (5 light queries per
  player). Seat picks now require 20+ of the player's own games on the
  hero in that exact role.
- Two payoffs beyond correctness: honest off-meta flexes surface
  (Mr_Meat31's Murdock OFFLANE, 65% over 57 games, was invisible because
  the field plays Murdock carry), and the coach lean-into cards can show
  "where you play it" splits (Cuban's Zinx: support 56%/32, mid 52%/29).
- Caveat carried in the honesty list: per-role rows only cover
  role-tracked matches, so role counts sum below the hero's total games.
- Pattern reinforced: when a number could be attributed multiple ways
  (hero x role, here), check whose attribution the source uses before
  presenting it as the player's.

## 2026-06-12 (evening): the lane room — pick-first vs counter flow

- The landing page's lane filter was a grid filter, not a decision tool.
  Reframed as a "lane room": choosing a lane opens a panel with the full
  lane meta (annotated with each hero's worst sim matchup as blind-pick
  safety) and a countering mode — lock the enemy's pick, get the lane's
  answers ranked by kill-window checkpoints. All client-side from
  committed artifacts; zero API at view time.
- Counter coverage doubled for free by reading matchups in BOTH
  directions: hero A's artifact row vs B serves B's counter view with
  verdicts inverted. 6 matchups per hero (up from 2) cost 50s of sim
  time for all 52 artifacts.
- Hero augments: confirmed absent from every source we hold (omeda
  heroes.json has no augment fields). Backlog item 9 written — needs
  source research before any encoding; per the no-estimates rule the
  hero pages stay augment-silent rather than guessing.

## 2026-06-12 (late): all-pairs matchup matrix

- Maintainer's "how do I counter an Iggy offlane" exposed the structural
  limit of per-artifact matchups: same-primary-role only, so off-meta
  flexes are invisible on both sides of the counter view. Fix: a batch
  all-pairs matrix (npm run matrix) — 1,326 unordered hero pairs in ~1s
  because the closed-form sims are cheap once headline builds are cached
  (beam search dominates cost). 34KB compact artifact (y/e/= verdict
  strings), UI inverts for the reverse direction.
- Counter view now takes ANY enemy via a flex dropdown; honest caveat
  carried: matrix sims assume each kit's standard build and primary-role
  income, so a flexed enemy's gold may run leaner than modeled.
- The Iggy answer the sim gives: he owns the late checkpoints against
  nearly the whole offlane roster; counters are early-window heroes who
  must close the game before the flip (Greystone, Zarus), or Terra who
  holds both ends.

## 2026-06-12 (night): lead with the 20-second decision

- The hero page led with the build, but the first in-game decision is
  the Eternal (locked within ~20s of spawn) and the augment — and the
  augment changes which build is right. Page reordered: "At the gate"
  section first (Eternal + derived playstyle sentence from whichever
  sim delta dominates: burst→assassination, 20s-rotation→skirmish,
  eHP→frontline), build second and renamed "the optimizer's build" so
  the meta builds below read as comparisons, not corrections.
- Augment honesty carried at the decision point itself: the gate
  section says augments are the missing half and why builds are
  per-style starting points (data still absent; backlog item 9).
- A float:right h2 hint squeezed adjacent line boxes to ~80px on
  mobile (one word per line) — floats extend below their box and
  shorten neighboring line boxes. Mobile now unfloats hints. Caught
  only by screenshot review, again.
- Coach lean-into cards now carry the full engineCoachLine (spike
  timing + eternal why) instead of a bare "take X".

## 2026-06-12 (night, cont.): game-mode attribution — "no way Cuban has 20 pentas"

- He didn't: 17 were ARAM, 1 Rush, 2 ranked. pred.gg generalStatistic /
  heroStatistics default to ALL modes — more than half of one member's
  "career games" were ARAM. Every profile pull now filters
  gameModes: [RANKED, STANDARD] (real 5v5s), with gamemodeStatistics
  pulled unfiltered so casual flexes are attributed, not blended
  ("2 pentakills in real 5v5s — plus 18 in ARAM, the group chat can
  rule on those"). Scope banners state the exclusion.
- Third attribution bug in one day, same shape: a stat that LOOKS like
  one population (ranked 5v5) silently includes others (lanes, modes).
  New default: before surfacing any aggregate from an API, ask what
  populations it pools and filter to the one the page claims.
- Squad planner controls compacted into a labeled split (who's queueing /
  flavor) with short names: 5 rows of chips down to ~2 on mobile.

## 2026-06-12 (night, cont. 2): thresholds should degrade, not hide

- "Why no mid suggestion for Meat?" — because the wheelhouse floor (20
  role-true games) silently hid everything below it. The real samples:
  Goldilocks offlane Wukong 13/Aurora 11 (worth showing, thinly), Meat
  midlane Bright 8/Fey 6 (genuinely nothing). Floor lowered to 10 and
  thin samples (<20) display their game count instead of vanishing —
  a threshold should change how confidently a number is shown, not
  whether the row exists.
- uuid→name mapping must be read from data, not memory: first probe
  attributed Xeebs' Greystone-offlane record to Goldilocks by assuming
  uuid order. Verify identity joins before reporting per-person numbers.
- Planner gains an 'any lane hero' mode (shuffle deals from the lane's
  whole tracked roster with field winrates) and the meta-mode "you:"
  note now says "(all lanes)" — that number is whole-hero, not
  role-split, and claiming otherwise would repeat today's attribution
  bug in miniature.

## 2026-06-12 (night, cont. 3): the mode audit the maintainer asked for

- Full five-stack audit of what each surface pools. Career/hero/role
  pulls were already clean (real 5v5s) after the penta fix, but
  pullRecentMatches filtered on a GUESSED enum value ('pvp') that the
  API never returns (it's STANDARD) — standard games were silently
  dropped from the film-room sample while ARAM was excluded by luck.
  Filter fixed to RANKED+STANDARD, pull depth raised to the API cap
  (50). Magnitude of the cleanup per member (casual games previously
  in scope): Cuban 960 (57% of his total), Mr_Meat31 977, Xeebs 648,
  Willy 407, Goldilocks 340.
- Recent-form reality check: Cuban's last 50 matches are 42 ARAM /
  8 ranked — his temporal insights now rest on few real games and the
  n-gates suppress them rather than fake them. That is the system
  working.
- One ledger receipt still printed "(164g)" — the maintainer read "87g"
  as gold elsewhere too. Fixed at source and the harness now greps all
  player-facing artifacts for the Ng pattern, so the abbreviation can't
  ship again. Validating enum values against the API (not guessing) and
  banning ambiguous units are now both gated, not remembered.

## 2026-06-12 (night, cont. 4): navigation as a system

- Top nav unified across all three pages: wordmark links home (build
  lab), three destinations as pills with the active page highlighted —
  page identity moved from a superscript beta tag into the nav state
  itself. Below it, a frozen glassy subnav (backdrop blur, horizontal
  scroll, no scrollbar) generated from each page's section headers, with
  an IntersectionObserver scrollspy highlighting the section in view and
  auto-centering its pill. One builder function per page, labels derived
  from h2 text before the '·' separator, so new cards self-register.
- "sim coverage building" was a coverage gap wearing a friendly label:
  lane-flex heroes (Zinx listed in midlane, artifact written support-
  side) never had artifacts fetched for that lane. The pick-first
  trouble note now derives from the all-pairs matrix vs the DISPLAYED
  lane's meta — full coverage, label retired.

## 2026-06-12 (night, cont. 5): augments found — pred.gg's perk system

- "Sim coverage" question resolved: the kit-math sims DO cover all
  1,326 hero pairs (the matrix); the old label was a UI fetch-scope bug,
  already retired this session.
- The augment source item 9 was waiting for: pred.gg models augments as
  perks (slot HERO_SPECIFIC_1) with a full catalog (161 augments, names
  + mechanical descriptions) and per-hero per-role win statistics via
  hero.simpleBuild(filter).perks(slot:). Eternal evidence rides the same
  endpoint (slot ETERNAL_1). npm run augments snapshots both (136 calls,
  real-5v5 filter, roles with 300+ field games).
- Hero page now leads with the augment choice — the first lock-in of the
  match — role-aware (?role= carried from the lane room, switcher for
  multi-role heroes like Steel support/offlane). The Eternal block
  compares our augment-blind sim against the field's top-winrate Eternal
  per role and says when they disagree (Steel offlane: sim Demiurge vs
  field Vermis) instead of pretending one answer.
- Lesson: when the maintainer says "I think provider X has this data,"
  introspect the schema before restating that we lack a source — the
  earlier item-9 writeup said "no source" after checking only omeda.
