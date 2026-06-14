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

## 2026-06-12 (night, cont. 6): augment icons + shuffle placement

- Perk icon hashes from the pred.gg catalog resolve at
  https://pred.gg/assets/<hash>.webp (found by scraping a hero page for
  16-hex asset URLs after guessing CDN paths failed). npm run augments
  now snapshots the 160 augment icons to ui/img/augments/<perkId>.webp
  (skip-if-exists, sequential, UA-identified) — same zero-API-at-render
  pattern as hero portraits.
- The gate section's augment rows carry their icons (top pick ringed
  green); the shuffle button moved out of the planner's flavor group to
  the card's top-right, where an action that re-deals the whole card
  reads as belonging to the card, not to one option row.

## 2026-06-12 (night, cont. 7): role context is part of the user journey

- "I clicked Zinx from the midlane and got support" — the meta board and
  hero grid dropped the lane context the user had already expressed.
  Every hero link now carries ?role= (meta board column, lane room rows,
  role-filtered grid), and the augment snapshot's role floor came down
  to 150 field games so flex lanes like Zinx mid (262 games) have cells.
  When a requested role's sample is still too thin, the page says so
  explicitly instead of silently substituting.
- Gate section v2: full mechanical description under every augment, a
  data-derived why on the top pick ("wins about 3.8 more games per 100
  than Disc of Demise — the field has voted"), and the Eternal block is
  now the role's field top-3 with our sim deltas attached per row —
  format matches the augment block, and the sim-vs-field disagreement is
  stated rather than resolved silently. Deeper per-augment reasoning
  (Phase's mana augment vs an Eden pairing) needs either the augment
  mechanics in the sim (item 9) or the LLM copy pass (item 8, still
  blocked on ANTHROPIC_API_KEY).
- Meta builds moved above lane checkpoints; the last UI 'Ng' ('${m.n}g'
  in meta builds) became 'games' — the artifact gate can't see UI
  templates, so UI strings still need eyes.

## 2026-06-12 (night, cont. 8): coverage audits beat spot fixes

- "Did the Zinx fix cover Steel too?" — the right answer is an audit,
  not a yes. Scripted check of every clickable hero-role combination
  (meta board cells × augment cells, every hero × at least one cell)
  found two real gaps the spot fix missed: Zinx-carry (121 field games,
  under the 150 floor but still on the meta board) and Legion (no
  qualifying role at all). Rule fixed structurally: floor 100 plus every
  hero's primary role always queried. The audit is now a harness gate,
  so the invariant ("if the site links it, evidence exists for it")
  survives future snapshots.

## 2026-06-12 (night, cont. 9): the LLM copy pass, finally — augments first

- Maintainer supplied the ANTHROPIC_API_KEY (env-only, never committed;
  the secrets grep now covers sk-ant-). Item 8's design held up: prompts
  assembled strictly from owned data (augment mechanics + per-role win
  evidence), claude-haiku-4-5 writes one when/why line per augment per
  role, and a numeric verifier drops any line citing a number absent
  from its source cell — 286 of 288 lines passed.
- The grounding worked where it mattered: Phase support's Psychic
  Support line ("take when your Linked Ally is mana-dependent") encodes
  the maintainer's Eden case without ever being told it; mechanics +
  evidence were enough context.
- Pattern for future passes (coach lines, squad copy): same shape —
  single-source prompt, strict JSON out, machine verification against
  the prompt's own numbers, silent fallback to template copy on
  rejection. AI copy is additive, never load-bearing.

## 2026-06-12 (night, cont. 10): the copy audit — in-session beats API

- The maintainer asked for the LLM check over all our whys, then asked
  why it costs API tokens when a Claude session is already paid for. It
  doesn't have to: a one-off audit runs in-session at zero API cost; the
  API pipeline is only for unattended runs (post-patch GitHub Action).
- Method that made it cheap: dedupe all player-facing strings into
  template families (numbers → N) — 208 uniques covered every line on
  the site. Findings fixed at the generation sites: naked sim ratings
  now carry units ("about 2,465 damage over a 10s rotation"), optimizer
  lines cap absurd deltas ("2.4× the" instead of "+378%") and de-smash
  item names (Azure Core), the self-contradicting primary/secondary
  plan line gets a same-role variant, "Two-hero rule" has a singular
  form, +0% Eternal recommendations fall back honestly, counter-swap
  trades read as give/take, damage receipts name their stat, "a 18-kill
  spree" became "a longest spree of 18", and the squad synergy note
  dropped "solo-ish" and second person.
- The audit list itself (208 templates) is the reusable artifact; the
  next pass only needs to diff new templates against it.

## 2026-06-12 (night, cont. 11): one lineup, not two

- The maintainer called the redundancy: the "Optimal lineup" card was
  just the planner's top option with all five selected. Merged into a
  single "The lineup" card — controls on top, the winning option
  rendered rich (avatars, role-true hero chips, plain off-role notes
  instead of a badge), alternatives compact below as "ALSO WORKS". The
  header is honest about state: "OPTIMAL LINEUP · all 120 permutations
  scored · worth +N wins/100" only when everyone is in, wheelhouse,
  unshuffled; otherwise "BEST FOR THIS GROUP" or "SHUFFLED SET".
- The OFF-ROLE badge died after two renames: the maintainer asked what
  it meant twice and then said it wasn't important enough to tag. The
  inline sentence carries it now. A label that needs a glossary twice
  should become a sentence the third time.

## 2026-06-12 (night, cont. 12): unfindable heroes were a filter interaction

- "We don't have all the heroes in this list" — all 52 were in the
  index; search was AND-ed with the lane filter, so any hero outside
  the selected lane was unfindable by typing. A typed query now searches
  the whole roster regardless of filter, with an autocomplete dropdown
  (portrait + role, arrow keys, Enter to open). When a user says data
  is missing, check the query path before the data.

## 2026-06-12 (night, cont. 13): the hero page learns to teach

- Hero pages split into tabs: "Game plan" (gate picks, builds, counters)
  and "Learn the hero" — the full kit from the official ability data
  (per-rank cooldowns and mana, real damage numbers, key bindings) with
  all 312 ability icons snapshotted from omeda's asset CDN (1.3MB,
  zero API at render). Ult rank levels carry their verified 6/11/16.
- The subnav needed a visibility filter (offsetParent !== null) once
  tabs existed — hidden sections were getting pills. Generated nav must
  re-derive from what is actually visible, not what exists in the DOM.

## 2026-06-12 (night, cont. 14): the crest completes the gate

- The gate section now covers all three start-of-game locks: augment,
  Eternal, crest — per-role field evidence in one format, pulled through
  the same simpleBuild endpoint (items slot CREST; snapshot now 288
  calls). Crest icons already lived in ui/img/items via slugified names.
- The evidence immediately earned its place: Steel supports buy Rift
  Walkers 3x more than Leafsong, but Leafsong wins 2 more games per 100.
  Popularity-vs-winrate gaps are exactly what this site exists to show.

## 2026-06-12 (night, cont. 12): the support model — backlog item 7

- Heal/shield parsing reused the damage parser's shape: find every
  "values <PowerTag>(+ratio%" group, classify by context (restore/heal
  verb before, "Shield" after), fold tick cadences ("every 0.5s for 3s"
  = 6 ticks) into per-cast totals. Pure heal/shield abilities (Muriel's
  Alacrity) now enter the kit model with an empty damage line, and
  current-text healing rides along even where damage numbers fell back
  to stale owned data. Conservative skips, listed not guessed:
  HealthText-scaled shields, passive-delivered heals (Phase!), Narbash's
  toggle regen.
- The golden scenario earned its keep on day one: with support weight
  vectors alone, Equinox (80 tenacity carrying 20% crit) made Muriel's
  front via the utility corner — she's hybrid, so the damage-type pool
  filter waved it through. The fix is a pool constraint (no crit, no
  lethality in support searches), not weight tuning: those stats feed no
  support objective, so their gold is dead weight by construction.
- The field agrees with math it never saw: Muriel's generated support
  core picked Crystal Tear and Windcaller — her two most-played items
  (39% each) — purely from heal ratios and heal_shield_increase math.
  Dekker (no parsed heal) correctly gets a tank/utility answer led by
  effective HP instead of a fake heal build.
- Archetype labels need a "best > 0" guard: when an objective's front
  best is zero, every build is within 98% of it, and a heal-less kit got
  the heal/shield label on its whole front.
- Regenerating artifacts without PREDGG creds used to wipe meta.json's
  topPlayers (a harness gate). build-artifacts now carries the committed
  leaderboard over when creds are absent — same zero-API-regeneration
  principle as the rest of the pipeline.
- Wording matters at the seams between models: a support page's
  "headline output" is heal/shield, but Eternal deltas are damage math —
  the coach line now says "your damage rotation" for supports so the
  Eternal claim can't be read as a healing buff.

## 2026-06-12 (night, cont. 13): augment mechanics in the simulator — item 9 closed

- The 161-augment catalog curated by hand into a second registry file
  (engine/fixtures/augments.json), keyed augment:<hero>:<catalog-id> so
  the field evidence joins for free. 46 augments got typed effects via
  new ability-scoped primitives (per-ability damage amps and cooldown
  mods, per-cast bonus damage, on-cast heals/shields with stat scaling,
  per-minute growth); 110 are unmodeled with the reason stated. A
  harness gate asserts every rostered augment has an entry, so a patch
  that adds augments fails loudly instead of silently shrinking
  coverage.
- Targeting by ability KEY, not name, was the right call: Muriel's E is
  'Alacrity' in current text but 'Serenity' in the stale owned fallback
  her def happens to use — names drift, slots don't.
- Curation conventions that kept honesty cheap: hit-conditional effects
  are modeled (the sim already assumes casts hit); isolated/nearest
  conditions are satisfied by 1v1 kill-window sims by construction;
  pickup/terrain/stack-cadence/team-side effects are unmodeled, always
  with the reason in the note. Kallari's 'abilities can crit' is the one
  provisional entry - its +40% ceiling bakes the unverified 1.75 crit
  multiplier.
- Percent deltas lie when the baseline is zero: Dekker + Polarity
  Strike is +0% heal output forever because she has none without it.
  Absolute deltas (healShieldAbs) carry that case.
- The cast-count floor makes cooldown augments lumpy: Plasma Barrage's
  -3.5s reads +0% in a 10s window (2 casts either way) but +7.8% at 20s.
  Always check the window before calling a cooldown effect worthless.
- The payoff reads mechanically true: Kallari's Critical Override pulls
  a crit item into her build, Aurora's Hypothermia pulls Magnify (shred
  stacking), Maco's shield augments pull Crystal Tear - 9 heroes' builds
  shift with the augment locked in, and 16 heroes' Eternal sims now run
  with the field's top augment modeled instead of the blanket
  'augment-blind' caveat.

## 2026-06-12 (night, cont. 14): Eternal when/why lines — pipeline before prose

- The maintainer asked whether Eternal explanations were in the backlog:
  they weren't — the 🧠 pass covered augments only. Shipped the pipeline
  half tonight: npm run review now writes one grounded line per top
  field Eternal per role, with mechanics sourced from the effect
  registry's sourceText (including its honest 'not in our sim' notes,
  which the prompt forbids embellishing) and the same numeric verifier.
- The verifier core moved to src/copy-verify.ts as pure functions so the
  ground-check itself is unit-tested without an API key — including the
  comma/decimal renderings and the pairwise winrate deltas that earlier
  passes allowed implicitly. A new gate also asserts every Eternal name
  in the field evidence joins a curated registry entry.
- This environment carries no ANTHROPIC_API_KEY, so the run is pending
  wherever the key lives. Pipeline-then-run beats hand-writing ~200
  lines in-session: the verifier, not the author, is what makes the
  copy trustworthy, and the unattended path is what survives patches.

## 2026-06-12 (night, cont. 15): Lotus and Deathstalker — two 'everywhere' mysteries, two different answers

- "Why is Lotus everywhere": because the field really does win with it.
  Shrinkage (now applied to the Eternal ordering — raw-winrate sorting
  was flaw 4 rediscovered) flips only 7 of 96 cells; pooled across 175k
  games Lotus wins 55.8% while the mass picks sit at 48-52%. The
  mechanism is now in the kit math: all four buff numbers were stated in
  owned eternals.json, so Lotus is encoded as expected value per
  2-minute proc (takedown procs excluded — the encoding is a floor).
  Honest residual: minority-pick selection bias can't be decomposed
  without rank covariates.
- "Why is Deathstalker everywhere": because the sim has no attack-speed
  cap. Onslaught (attack speed equal to total flat pen — the encoding is
  textually faithful) makes it superlinear with every pen item, and
  uncapped builds reach 3.5+ attacks/sec. The field's verdict: 0.6%
  median play, negative deltas where tried. Same shape, opposite
  conclusion: Lotus disagreement = sim too blind, Deathstalker
  disagreement = sim too credulous. The evidence layer is the tiebreak,
  exactly as component D intended.
- Shipped: attackSpeedCap flagged unverified (checklist 7 has the
  10-minute measurement), the design doc's off-meta evidence gate is now
  actually enforced (negative-evidence candidates are never promoted),
  the UI marks low-play negative-evidence items SIM-ONLY ⚠ instead of
  gold OFF-META, and builds stacking >100% AS carry an explicit
  optimism warning. The generator stays evidence-blind by design; the
  fix when the cap is measured will fall out of the math.

## 2026-06-12 (night, cont. 16): the Eternal lines, written in-session

- Maintainer directive: no API key — the copy pass runs in-session, the
  way the copy audit did (lesson cont. 10). 284 Eternal when/why lines
  (every hero-role cell's shrunk top-3) written in-session and merged
  through the SAME machine verifier as the API pipeline: 284 written, 0
  rejected. Provenance recorded as an in-session pass in the artifact.
- What made zero rejections possible: the lines cite mechanics numbers
  (which are in each cell's allowed set via the registry sourceText) and
  exact game counts, never winrates — the displayed winrates are shrunk
  and the verifier's allowed set carries raw ones. Where the field and
  our sim disagree (Neon/Wraith/Shinbi Demiurge), the line says so
  instead of picking a side silently.
- The page now explains its Eternal rows three ways: field evidence
  (shrunk, ordered honestly), sim deltas where modeled, and a grounded
  when/why line — the thing the maintainer asked for at the start of the
  night.

## 2026-06-12 (night, cont. 17): the item audit — Noxia's ICD and the sim's blind spots

- "Noxia shows up often" was a real sim bug: on-ability procs were
  credited inside the per-ability loop, so an item ICD applied per
  ability instead of globally — a 4-ability kit collected 4x the Noxia
  procs an 8s ICD allows (up to 48% of target max health from one
  item). Fixed: one global proc budget per window. Noxia 23 -> ~16-18
  builds; its residual appeal (90 MP + 20 haste + a now-honest 2 procs)
  is legitimate math.
- The systematic audit (sim usage vs field play vs evidence, both
  directions) found the deeper shape: SEVEN high-play field staples had
  no effect entries at all. Imperator (34% field play, crits +30%) went
  0 -> 13 sim builds the moment its primitive existed. Prophecy and
  Megacosm are now encoded; Overlord/Terminus/Fire Blossom carry honest
  unmodeled notes. Divine Potion (a 250g statless potion upgrade, 24.6%
  'play rate') was diluting every popular-build baseline — statless
  cheap actives are now excluded from the build pool.
- Sustain was in the design doc's objective vector (component C) and
  never implemented — lifesteal/omnivamp were worth literally zero to
  the optimizer, which is why the field's drain items lost every corner
  to pen stat-sticks. sustain10s is now an objective with a drain
  corner; Terminus is still outcompeted, but it is outcompeted on real
  math now instead of being invisible.
- What remains and why: the pen/attack-speed cluster (Deathstalker 27,
  Painweaver 15, Alternata 14) all hangs on the unmeasured attack-speed
  cap — the single highest-value practice-mode measurement on the
  checklist. The audit method (usage-vs-field both directions) should
  rerun after every snapshot; it found a bug, seven missing encodings, a
  missing objective, and a pool hygiene hole in one pass.

## 2026-06-13: eternal scaling answers + the generic line retired

- "Does it account for the scaling?" — yes, by construction: per-level
  terms (Krix +1% max health per level → +18% eHP at the checkpoint),
  per-minute expected-value accruals (Lotus's random 2-minute buffs),
  and build-relative multipliers (Demiurge's 12% on item stats) are all
  realized at the evaluation minute. Worth restating on demand because
  the page shows only the resulting deltas.
- "Field evidence only — not in our kit math yet" was two problems:
  a display bug (the page matched only the top-3 modeled Eternals, so a
  modeled one ranked 4th claimed to be unmodeled) and a vagueness bug
  (the registry has SPECIFIC reasons — Exarch buffs the heal target,
  Aion is an economy effect). Artifacts now emit every ranked Eternal
  with deltas or its precise reason, and the page prints the reason.
  A generic disclaimer is a smell: if the system knows why, say why.

## 2026-06-13: accessibility audit — measure, don't eyeball

- Contrast is computable: --text-2 (#6a6a80) measured 3.75:1 on the page
  background — below WCAG AA's 4.5:1 — and it carried most of the small
  print sitewide (scope banners, notes, hints, receipts). Lifted to
  #82829a (~5.0:1) while staying clearly dimmer than --text-1 (7.3:1),
  so the visual hierarchy survives the compliance fix.
- :focus-visible outlines added globally (keyboard navigation had no
  visible focus anywhere); homepage role filters were the last
  lowercase UI labels — capitalize via CSS so data stays untouched.
- "headline +0% · burst +0% · 20s fights +0% · eHP +18%" buried the one
  number that mattered under three zeros. Delta lists now print only
  the non-zero parts. Zeros are data; they are rarely information.

## 2026-06-13: the insider-terminology sweep

- Terms only the builders know, found and translated in user-facing
  strings: "shrunk winrate" → "adjusted so small samples don't
  overclaim" (meta board note, coach scope + role-focus header, squad
  honesty list); "headline" → "main output"; "eHP" → "survivability";
  "confidence-weighted role winrates" → "thin role records count less";
  "percentile-averaged" → "rank-averaged" with a plain gloss.
- The terminology stays in CODE (shrunkWr, headlinePct, ehpPct are good
  variable names) — the sweep is about the boundary where engine
  vocabulary leaks into player-facing sentences. The boundary is the
  template string, and that is where the translation belongs.

## 2026-06-13: viewport-safe anchoring + the item quick view returns

- The "had to re-zoom to reset" bug: centering the active subnav pill
  with scrollIntoView lets the browser scroll ANY ancestor — on iOS
  under pinch-zoom that pans the visual viewport sideways. Fix: scroll
  only the pill row itself (host.scrollTo with computed offset). Rule:
  never scrollIntoView for cosmetic centering inside a scroller; address
  the scroller directly.
- Anchor offsets now measure the real sticky header (--toph custom
  property set from .top offsetHeight) instead of a hard-coded 96px —
  sections land exactly 10px below the header on every page and layout.
- The v2 item quick-view is back: tap any item icon (build rail, meta
  builds, crests) for a popup with price, stats, and effect text from
  the committed omeda catalog — lazy-loaded, zero API, Escape/backdrop
  dismiss, aria-modal. One delegated listener serves every current and
  future item icon via data-ipop.
- Process note: a multi-edit python script that asserts mid-way writes
  NOTHING (write happens at the end) — the popup attributes landed in a
  later script while CSS/JS never did, yielding silent dead markup.
  Verify features by exercising them, not by edit success.

## 2026-06-13: item why-lines through the same verified-copy pipeline

- npm run review:items writes one plain-language "who leans into this
  and why" line per completed item + crest (180 of 182 passed the
  numeric verifier), grounded only in the item's own stats and effect
  text, rendered in the quick-view popup with provenance. The pipeline
  from item 8 (single-source prompt → strict JSON → machine verification
  → silent fallback) is now on its third reuse; the marginal cost of a
  new copy surface is one prompt and one render line.

## 2026-06-13: the sim pick steps forward

- The maintainer was right that the value was hiding: augments sorted by
  field winrate with sim footnotes read as a stats site, not a kit-math
  product. A parallel investigation agent found artifacts already emit
  the sim's preferred augment first (rankAugments order), so the fix was
  pure UI: a ⚙ SIM PICK badge, a verdict line after the list (✓⚙ when
  field and math agree, ⚖ with both sides' numbers when they disagree,
  honest no-opinion when nothing is modeled), and buildShift promoted to
  its own line — the augment→build consequence is the product's unique
  value and was buried mid-sentence.
- Skylar answered precisely: the sim ranks augments, not abilities; her
  unscored augment (Assault MK-II) is the one whose mechanics need a
  windowed on-hit effect kind — and its "unstated" missile damage is
  actually stated in Air Assault's own tooltip. The blocker list became
  priorities item 10 with expected coverage gains per unlock.

## 2026-06-13: the Learn-the-hero tab, v2-grade

- Rebuilt the Learn tab into v2's structure: (1) patch changes for this
  hero — trend badge, plain summary, "if you play / if you face" grid,
  exact change lines — read from the held current-patch data/game-data/
  hero-patch-state.json (40/52 heroes changed; the rest honestly show no
  section); (2) leveling order; (3) the kit, each ability now carrying a
  🎯 how-to-play tip and a ▲buffed/▼nerfed-this-patch badge matched to
  the change lines by ability name; (4) how it wants to play.
- Skill order: derived a noisy proxy from summedLevelTime first and got
  Gideon BACKWARDS — then took the maintainer's nudge to check the API
  and found hero.data.recommendedSkills, the authoritative 18-entry
  in-game recommended path. Lesson restated: when an authoritative field
  exists, a clever proxy is just a bug waiting to disagree with it. One
  call per hero, 52/52 covered, ult levels read straight from the path.
- Wukong has no ULTIMATE entries in his recommended path (kit ranks
  differently) → empty ultLevels. Real data, not a gap: the test allows
  empty-or-[6,11,16] and the UI shows the ult timing only when present.
- ability-tips coverage bug: haiku sometimes returns keys as 'R "Feast"'
  not 'R', so strict parsed[key] lookup dropped countess/howitzer
  entirely. Tolerant leading-token match fixed it (50→52). Also: a
  filtered re-run OVERWROTE the whole file (lost 274 tips) until the
  writer was made merge-with-existing — partial regens must never clobber.
- Harness gate added: skill orders + ability tips must cover all 52.

## 2026-06-13: the sim now levels abilities the way the field does

- Maintainer asked whether the 20s-fight sim assumes the right skill
  priority. It did NOT: skillPriority used a damage-growth/cooldown
  heuristic that disagreed with the field's actual recommended max-order
  on 27 of 52 heroes' first-maxed ability. Now that recommendedSkills is
  snapshotted, the kit carries recommendedMaxOrder and the sim levels
  basics that way (heuristic only fills abilities the field order omits).
  All artifacts + the matrix regenerated; invariants held (81 green).
- Confirmed for the record: the sim's headline objectives (burst, 20s,
  main output) and the matchup kill-window verdicts both run on the
  OPTIMIZER's build (headlineBuild), not the meta build. The meta-build
  card evaluates each meta core separately. Cross-hero combat comparisons
  (the matrix) therefore hold the build dimension constant per hero.

## 2026-06-13: sim picks on the home board + the Learn-tab trend badge

- "Show top heroes by our math, not just winrate." The all-pairs matrix
  is the fair cross-hero metric (build dimension held constant per hero):
  each lane now shows "⚙ Sim picks · strongest in fights on paper" =
  the heroes with the best net kill-window edge across the whole lane,
  THEORY-labeled, clickable. Surfaces low-pick/strong-on-paper heroes
  (GRIM.exe in carry) the winrate board hides.
- Learn-tab trend badge: viewing a buffed/nerfed hero shows ▲buffed /
  ▼nerfed next to the Learn-the-hero tab so players know to look —
  driven by the same held patch state, colored by trend.
- Bug caught by exercising, not by tsc: getMatrix() cached the unresolved
  PROMISE in the global (the lane room awaited it locally so never
  noticed); the new home-board caller read .pairs off the promise.
  Fixed to await-and-cache. A lazy getter must store the resolved value
  if any caller reads the global directly.

## 2026-06-13: duo-lane synergy — mine the truth, not the proxy

- Maintainer asked why the lineup doesn't seat a synergistic pair in the
  duo lane. It didn't, because the optimizer scored all five seats
  independently. Chose option: mine TRUE duo-lane records (carry+support
  same team) from role-aware rosters (~150 ranked matches deep, the
  MatchPlayer.role field), not the any-lane pair proxy.
- The choice paid off immediately: Cuban+Goldilocks, the best ANY-lane
  pair (56%), are 1-of-4 (25%) actually laning together — the proxy
  would have seated a bad duo. The real star is Willy+Mr_Meat31 at 69%
  over 26 duo-lane games; the optimizer now seats exactly them.
- Bonus is shrunk toward .5 (k=15), thresholded at 10 duo-lane games,
  weighted 0.6, and the identical formula lives in BOTH the engine
  optimizer and the client planner so the displayed lineup never drifts
  from the computed one. The lineup surfaces the chosen pair's real
  record so the recommendation explains itself.
- Sim-picks scope (answered, not changed): the all-pairs matrix sims
  each hero ONLY in its primary role with its primary-role build, so
  off-meta flexes (Zinx offlane, Iggy offlane) are never simulated and
  can't appear in another lane's sim picks. Role-aware sims would be a
  large expansion (role builds + role matrix); logged for later.

## 2026-06-13: why the off-meta builds were weird — 85% of item passives were invisible

- The optimizer's "weird" builds had a single mechanical cause: only 19
  of 126 completed items had their passive encoded; the other 107 (85%)
  were flat-stats-only to the sim. So it systematically preferred the
  items whose passives we'd modeled (Necrosis's +15% ult dmg) over the
  meta staples whose value is unmodeled (Plasma Blade's ramping crit,
  Oathkeeper's spellblade) — and could not justify a build against the
  field because it was comparing a fully-credited item to a half-credited
  one without knowing it.
- Fix pattern mirrors the augment work: cluster the effects into
  archetypes, add the minimal new kinds (ramp_to_stat; reuse damage_amp
  for "target takes more"), encode from stated numbers only, flag the
  uncodable (execute thresholds, unstated proc cadences) as unmodeled.
  First batch: Skylar/Shinbi now build the field core and the meta-build
  card flipped from "swap X" to "optimizer agrees — the winrate is
  earned." The reading of the actual item text corrected two catalog
  guesses (Wraith Leggings is a flat ability amp, not a below-40
  conditional) — always model from the source text, not a summary.

## 2026-06-13: a container restart silently reset the branch 38 commits back
- After a restart, the local branch HEAD pointed 38 commits behind origin
  and two uncommitted data files (skill-orders.json, ability-tips.json)
  were gone — so a full artifact regen silently used the heuristic
  skill-order fallback (data.ts try/catches the missing file). Caught it
  only because the re-added Learn-tab coverage test threw ENOENT.
  Recovery: back up the turn's source changes, `git reset --hard
  origin/<branch>`, re-apply, regenerate. Lesson: after any restart,
  verify HEAD == origin/<branch> and that generated-but-committed data
  files are present BEFORE regenerating — a try/catch data loader will
  happily produce wrong output from missing inputs.

## 2026-06-13: the execute was modelable all along — read the condition field

- Maintainer pushed on Vanquisher's execute ("once they're low they're
  just gone"). I'd called it uncodable for lack of a threshold — but the
  threshold (5%) was in the effect's `condition` field, which my text
  extraction (menu/game_description only) never read. Modeled it as a new
  `execute` kind crediting thresholdPct% of target HP as bonus burst (the
  bottom slice is a free kill). Vanquisher's burst contribution rose and
  it's now valued for what it does, not just its flat stats.
- BROADER lesson: ~28 completed items carry a `condition` field with the
  trigger/threshold numbers the descriptions omit (Lifebinder "every 10%
  missing health", Viper "Against Eroded", etc.). My item-effect catalog
  and encodings read the wrong fields. Item 11 must re-extract effect
  text INCLUDING condition before modeling — several "uncodable" flags
  were really just unread data.

## 2026-06-13: kicked off the item-passive modeling process (batch method)
- Established a repeatable batch loop for item 11: extract full text WITH
  the condition field → categorize → encode-from-stated-numbers / flag
  out-of-scope with a reason → ratchet test → regenerate → measure agree
  rate. 36/126 items now modeled (from 19). The ratchet test
  (effects.test.ts) makes coverage monotonic and forbids reasonless
  unmodeled flags.
- Most "new kinds needed" turned out to reuse existing ones once read
  correctly: spellblades (Solaris/Crescelia/Augmentation) are on_ability_hit;
  conditional/range amps are damage_amp; shred is armor_shred. The genuine
  out-of-scope tail is small and honest: ally shields (team-side), evolve
  economy, unstated proc cadences, out-of-combat regen, positional auras.
- The agree-with-field rate moves slowly (11→12) because a hero's top meta
  build often still contains one unmodeled item — coverage has to be deep,
  not just broad, before the verdict flips. The build CONTENT improves
  faster than the verdict line.

## 2026-06-13: folded the whole completed-item tier into the model + a visible breakdown
- Finished the item-11 sweep: every completed-tier item now carries a
  decision — 65 modeled, 61 honestly-unmodeled-with-reason, 0 untouched
  in the 2400g+ doc tier (68 modeled across all 133 item entries; counts
  19→27→36→68). The maintainer asked to "fold every major item into this
  understanding" and to SEE the reasoning, so the deliverable is a
  generated breakdown: docs/item-effect-model.md (npm run item-model)
  renders, per item, base stats + each passive split out with its trigger
  condition + the primitive it maps to + a plain "how it rolls into the
  sim" sentence. Generated, so it never drifts from effects.json.
- Verify the SOURCE, not the agent. A background agent drafted encodings
  but read a stale 19-modeled tree (container-restart git reset, twice
  this session) and miscited the schema (claimed ramp_to_stat /
  target_below_40 were absent — they were committed). I re-extracted every
  candidate's text straight from data/omeda/items.json before encoding and
  found four cleanly-modelable items it had filed as unmodeled: Alternator
  (Alternate-ability amp — an ITEM can carry an ability-scoped primitive),
  Echelon Cloak (camo-opener burst → damage_amp burst_only), and Tainted
  Charm/Totem (proximity anti-heal). Net: trust the snapshot text, treat
  agent proposals as leads.
- "Honestly unmodeled" is a real coverage decision, not a gap. The 61
  flagged items cluster into a small set of stated reasons the sim cannot
  represent: ally heals/shields (team-side), farming/evolve stacks,
  takedown-gated cooldown refunds, enemy-shield-gated bonuses, target-mana
  burn (true damage off the target's mana), defensive/incoming mitigation,
  multi-target splash, and mobility/movement-stack cadences. Writing the
  reason down each time is what lets the ratchet test forbid a silent gap
  and what makes the breakdown doc trustworthy.
- Don't credit a tradeoff's upside alone. Cursed Ring (+20% AS but basics
  deal 25% less, plus an attack-speed-cap change) and Onixian Quiver
  (melee-only crit + multi-projectile splash) were left unmodeled on
  purpose: the schema can't express a basics-only penalty or a melee gate,
  so crediting only the good half would have actively misled the optimizer.
- Impact: Skylar's engine core now shares Plasma Blade + Vanquisher +
  Imperator with the field's staples (it used to over-build the handful of
  items it understood). Manta Scythe's "isolated target +10%" is fair to
  model as always-on because the kill-window sim is 1v1 by construction —
  the same convention already used for augment "isolated/nearest" amps.

## 2026-06-13: a playstyle steer must route by the hero's damage type
- The on-hit steer pointed every hero at sustained auto-DPS. For Zinx that built
  a physical-crit core — her basic (Refibrillator) really is physical (+55% PP),
  so on pure auto-DPS physical crit wins. But all four of her abilities are
  magical: the magical core does 32x her rotation damage (rot10 7204 vs 225).
  The field builds magical because real fights are rotations, not auto-attacking.
- Fix: playstyleObjectives(playstyle, kit) routes on-hit by damage type, reusing
  the engine's existing physical-auto-attacker test (carry or basicScaling>=90,
  and not magical). Physical ADCs stack basic DPS (autoDps); magical/hybrid
  casters weave the on-hit into the rotation (rot10). Lesson: a playstyle
  classifier names the ARCHETYPE (on-hit), but the OBJECTIVE it maps to has to
  be conditioned on how the hero actually deals damage — otherwise the steer
  fights the kit. The damage-type routing already lived in headlineObjective;
  the steer just has to honor it instead of overriding it blindly.

## 2026-06-14: attack-speed cap — the value was stated, not unmeasurable
- The bug sweep (after the cooldown fix) flagged one outlier: Terra's autoDPS at
  6.6x the offlane median, driven by aps 3.34 with NO cap. The calibration note
  gated attackSpeedCap as "UNMEASURED — measure in practice mode", but the value
  is STATED in the item data: Cursed Ring's Broken Chains reads "Increase the
  Attacks per Second Cap from 3 to 4", so the default cap is 3.0 (4.0 with that
  effect). A gated constant isn't always unmeasurable — check the item tooltips
  before deferring. Applied 3.0 from calibration (still verified:false, output
  stays THEORY pending a formula check).
- The cap is BUILD-AWARE: added an attack_speed_cap effect kind +
  attackSpeedCapOverride on the resolver, modeled Cursed Ring's Broken Chains as
  cap:4, and the sim takes max(override, default). A build with Cursed Ring caps
  at 4.0; everything else at 3.0. The aps cap is applied AFTER the AS-ramp too,
  not just the base, so ramping items can't sneak past it.

## 2026-06-14: kit-derived playstyle on top of the field steer (Gideon slice)
- The "templated" feeling was the OBJECTIVE, not the generation. Beam search is
  individuated per hero; the six COMBAT_VECTORS corners are global, so every hero
  is scored through the same value function. main already shipped an
  augment-as-playstyle steer (field-derived: the lane's most-played augment ->
  enum -> bias corner). That's still popularity-anchored, which is the maintainer's
  exact complaint. The fix is a KIT-derived signal fused on top, so a hero the
  field hasn't solved (or a new one) still gets a coherent steer.
- Data-model trap: every caster is tagged damageType:'hybrid' (physical basic,
  magical abilities — gideon, countess, gadget, howitzer, muriel...), so a
  `damageType === 'magical'` check silently NEVER fires for the heroes it most
  matters for. Added kitPowerType(kit): resolve the real power type from the
  majority damage type of the DAMAGING ABILITIES, not the kit tag. With it, Gideon
  reads ability-burst/poke, magical — and the Vesh (Ability Damage Mage) Eternal
  wins its fit, as it should. Before the fix, the hybrid tag made Vesh score 2.45
  (attackPower -0.3 branch) and Demiurge's raw item-scaling delta won instead.
- Eternal as major -> minor1, minor2: rank the major by kit fit (dominant) blended
  with sim delta, then score each minor by its MARGINAL gain ON TOP OF that major
  (conditioned on the major being equipped), falling back to the curated
  recommendation when unmodeled. This subsumes the hardcoded ehpWeight heuristic.

## 2026-06-14: Option-A robustness beats the binary THEORY flag
- Unverified constants now carry a plausible range in calibration.json (crit
  [1.6,1.8], mitigation K [100,150]). robustnessOf sweeps the 2x2 grid through the
  generator and asks: does the #1 build survive the whole region? Threaded K through
  SimOptions.mitigationK (default 100 -> byte-identical; the 83 baseline tests
  stayed green) so the sweep varies it faithfully, EHP included.
- The sweep is not trivially stable, which is the proof it's doing work: Gideon's
  KIT-STEERED burst build is robust to both constants, but the UNSTEERED build is
  FRAGILE — its #1 flips when K moves 100->150 — so the sweep names mitigation as
  the constant to measure first. A binary THEORY stamp can't make that distinction;
  it marks the robust pick and the coin-flip pick identically.
- AS cap: kept the tooltip-sourced 3.0 (stronger source); logged the maintainer's
  350-420% web finding as a crossCheck note (almost certainly a percent-bonus view
  of the same absolute cap; base AS x cap ~= 3/sec). Don't overwrite a stated
  in-game value with a looser web number; record both and reconcile in practice mode.

## 2026-06-14: the agreement validator's first finding is a real sim blind spot
- agreeWithField checks whether the GENERATED front reproduces the field's winning
  cores (hit@k, n-weighted coverage, Spearman) — complementing explain, which
  attributes ONE given build. Runs post-generation, never feeds the objective.
- Finding: Gideon's front does NOT cover the field's 55%/n=390 core (Azure Core +
  Combustion + Wraith Leggings), even at 3 items. Root cause: the damage objective
  is MANA-BLIND — rotation damage assumes casts land within the window regardless of
  pool, so Azure Core's 450 mana / 15 haste is invisible and the sim prefers raw
  magical power. This is exactly the disagreement the validator exists to surface,
  not a number to engineer around. The fix (mana-constrained sustained casting) is
  future work; the slice ships the finding honestly.

## 2026-06-14: same kit, different lane — playstyle must be lane-conditioned (Zinx)
- Zinx exposed three coupled gaps the Gideon slice didn't. (1) She's tagged
  hybrid; kitPowerType resolves her to magical from the ability damage type (same
  fix Gideon needed). (2) She has two heals BUT CANNOT HEAL HERSELF (Infuse + the
  ult heal are ally-directed) — so she's an enchanter, not a self-sustain kit. The
  'sustain' objective was conflating the two: ability heals are ally OUTPUT
  (healShield10s); self-drain via lifesteal is sustain10s. Split them — an
  enchanter who can't self-heal should never steer to sustain10s.
- (3) The big one: a kit's playstyle has to be LANE-CONDITIONED. Zinx's heal
  abilities gave a fixed sustain bump that made her 'sustain' in EVERY lane, even
  mid/carry where she's a poke damage hero. Worse, the sustain steer is
  healShield10s, which COMBAT_KEYS doesn't include, so generateBuilds silently
  DROPPED it — her damage lanes got no steer at all and an enchanter Eternal
  (Exarch) even in carry. Fix: ally healing LEADS the playstyle only where it's a
  scored win condition (support); in a damage lane it's demoted below the damage
  signals. Now: support -> sustain/poke, healShield10s steer, Exarch; mid/carry ->
  poke/sustain, rot10/rot20 steer (a combat objective the search keeps), Vesh.
- Eternal-major selection: switched from additive (sim + 3*fit) to multiplicative
  (max(0.1,1+fit) * (1+sim/100)) so FIT leads the major's IDENTITY and sim only
  refines. The additive form let a modeled off-archetype damage major (Vesh, +sim)
  beat the unmodeled best-fit support major (Exarch, sim=0) on a support hero. An
  Eternal's deity archetype is a fit decision; the sim delta breaks ties within an
  archetype, it doesn't override the archetype. Verified Gideon still picks Vesh.
- Lesson for the roster generalization: "has a heal ability" is not "is a sustain
  hero" — role/lane decides whether that heal is the win condition or just utility.

## 2026-06-14: the sim must level abilities by the real per-level path (V2 chart)
- ranksAtLevel used a heuristic (one point per ability, then max by priority). It
  got ult TIMING right (fixed 6/11/16) but the basic-rank distribution was an
  approximation, so the early/mid stages didn't reflect how the hero is actually
  played. skill-orders.json already holds the full 18-level recommended SEQUENCE
  (the V2 ability chart, pred.gg recommendedSkills) but only maxOrder was loaded.
- Fix: load the full sequence into kit.recommendedSequence (mapping omeda
  RMB/Q/E/R -> PRIMARY/SECONDARY/ALTERNATE/ULTIMATE) and tally ranks point-by-point
  up to the level. Now any evaluation at level L uses exactly the abilities online
  and their ranks at L: Zinx at L5 has ULT=0 (correctly absent before 6) and
  Bad Medicine/Ricochet already ahead; the staged early/mid sims finally reflect
  "factor in abilities when they're acquired." Converges with the old heuristic by
  L13, so the level-13 tests were unaffected (harness stayed green at 93->94).
- Open follow-ups surfaced this session (not yet built): (1) mana-aware objective
  so mana-starved heroes (Zinx 290/340 at L1, Shinbi, Argus) get steered to mana
  items early and Azure Core stops being invisible; (2) model the EVOLVING ORB
  (Orb of Enlightenment -> Orb of Growth, "Inner Growth" stacking, in the meta
  build) as a ramping stat gain rather than flat final stats; (3) the ult is still
  credited once per rotation WINDOW despite its ~120-160s cooldown, which
  over-credits ults in rot10/rot20 (separate from acquisition timing).

## 2026-06-14: mana is a BURST-cadence constraint, not a sustained-rotation one
- Tried to make the build search mana-aware via the 10s rotation cost (manaSpent10s
  vs pool). It did NOTHING: cooldowns space casts over 10s and the pool scales, so
  EVERY mana hero reads adequacy 1.0 at every level. A 10s mana model can't see
  mana pressure at all.
- The metric that actually discriminates is "combos before dry" = pool / one-combo
  cost (sum of ability costs, one cast each), level- and item-aware. Zinx 1.9 combos
  at L9, Shinbi 2.5, Gideon 2.9 (he scales mana +372% L1->L18 and needs it least),
  and a mana item lifts Zinx to 3.3. This matches the maintainer's read exactly
  (Zinx/Shinbi/Argus sparse early; Gideon scales out of it).
- Search penalty: factor = 0.5 + 0.5*adequacy where adequacy = min over early item-
  timing stages (1/2/3 items at L9/12/14) of min(1, combosBeforeDry/3). Applied to
  the beam keep-sort and the headline sort, NOT as a Pareto axis (avoids front
  bloat). Result: Zinx front-loads mana (adequacy 1.0), Gideon untouched (0.97),
  resourceless kits inert (1.0). Also the structural fix for the Azure-Core miss.
- Lesson: match the constraint's MODEL to its real regime. Mana doesn't bind a
  paced rotation; it binds repeated combos in a skirmish. Modeling it on the wrong
  window silently produced a no-op. The level scaling itself is the indicator the
  maintainer pointed at: pool/combo by level is what says "this hero needs mana".

## 2026-06-14: on-hit reasoning + roster re-tag from augment & lane behaviour
- Why a weak-ability mage leans on-hit (Zinx): attack speed + a MAGICAL on-hit item,
  not ability damage. Her meta core is Prophecy + Spectra + Orion (Orion converts
  ability haste -> attack speed). The procs were modeled, but the optimizer couldn't
  reach the build: the field core is a balanced hybrid no single objective corner
  picks, and the autoDPS corner overshot to PHYSICAL crit (Deathstalker) because the
  item pool read the 'hybrid' tag as "allow everything."
- Fix: relevantPool routes through kitPowerType. A magical kit drops physical
  power/crit/lethality and keeps magical power + attack speed + ability haste (which
  feed magical on-hit). An on-hit steer on Zinx now builds Orion + Spectra, not
  Deathstalker. Note: a naive "magical_power>0" filter was WRONG — Spectra has 0
  magical_power (its magic is in the on-hit proc), so the rule keeps attack-speed
  items, not just MP items.
- Re-tagging the roster (maintainer: tag from augment + lane behaviour, not the kit
  tag): npm run classify emits per-hero-lane (real power type) x (playstyle from the
  lane augment fused with the kit) for all 52 heroes -> classifications.json. 26
  agree / 37 disagree / 24 kit-only / 9 field-only. The disagreements are the
  product: Eden is ability-burst not on-hit; Bayle/Boris are sustain bruisers; Argus
  mid is on-hit. The augment classifier now reads attack-speed->on-hit,
  barrier->sustain, damage-reduction->tank, AoE->ability-burst (16 unclassifiable
  augments -> 9; the rest are non-damage utility that honestly falls back to kit).
- Lesson: the augment is the field's DECLARATION of intent; it tags playstyle better
  than kit numbers for heroes whose power is in items/behaviour, not raw ability
  scaling. The kit is the fallback when the augment declares no damage playstyle.

## 2026-06-14: pred.gg build NAMES are a free label cross-check; the sim proved on-hit
- pred.gg's frozen snapshot stores a build-tab NAME per hero-lane (118/118 covered):
  "On-Hit/Crit", "Crit/Sustain", "Pen/On-Hit", "On-Hit/Anti Tank"... These are
  human-curated playstyle labels, NOT item lists, so they cross-check our re-tag
  without copying anything. npm run classify now shows our tag vs the pred.gg name
  per lane: 31 agree / 47 differ / 18 no-overlap (their taxonomy adds item terms
  like Crit/Pen/Scaling that don't map to our 5 playstyles).
- The "differ" cases are the accuracy gold: Drongo's AoE augment (Bring The Boom)
  tagged ability-burst, but pred.gg builds him On-Hit/Crit -> our augment-as-
  playstyle misreads an AoE augment on a fundamentally on-hit carry. Bayle/Boris:
  augment says sustain (lifesteal), pred.gg name says On-Hit -> both true (on-hit
  build WITH a sustain augment); the augment declares the perk, the build name the
  item archetype. Use the name to validate, the augment to steer.
- Sim PROOF that magical on-hit is Zinx's route (maintainer: "prove it with the
  sim"): after the power-type-aware pool, an on-hit steer builds Orion+Spectra+
  Prophecy and agreeWithField goes hit@6 false/0% -> hit@6 TRUE/59%, reproducing the
  field core (Prophecy+Spectra+Orion). The sim EARNED the field build from first
  principles once the pool stopped leaking physical crit. Agreement is the proof.

## 2026-06-14: evolving items — buy the source, credit the evolved value
- "The orb that evolves" = Orb of Growth -> Orb of Enlightenment. You BUY Growth
  (the field does: Shinbi/Iggy n=187/Renna/Countess); it farms bonus XP and at 500
  evolves into Enlightenment (Per Level: +3 MP, +15 Health). Growth was unmodeled,
  so the sim never bought the meta item. Now Growth is credited at its evolved
  per-level MP/HP. "Alternata" (maintainer saw on Wukong/Eden) is the same pattern:
  Alternator -> Alternata. And Catalytic Drive -> Cybernetic Drive.
- General rule found from build_paths: an evolving completed item is an Epic/Legendary
  whose single build_paths target is also Epic/Legendary. Three in the build pool
  (orb, alternator, catalytic) + 8 crest lines (crests aren't in the build pool yet).
  The evolved forms (Orb of Enlightenment, Alternata, Cybernetic Drive) are NOT
  directly buyable, so they're excluded from completedItems (EVOLUTION_TARGETS); the
  source carries the evolved value. This replaced an Orb-Of family hack with one
  general mechanism.
- Per-item: Orb of Growth -> evolved per-level MP/HP. Catalytic Drive -> evolved
  +12% total armor (Cybernetic Conversion). Alternator was already fine (its +15%
  alt-ability amp is modeled; the evolved "Nata Style" cooldown ripple is genuinely
  unmodelable — depends on cast interleaving, same reason Alternata flags it).
- Broader item review (maintainer: "review all items"): build pool is 132 items,
  68 have a modeled passive, 62 are flat-stats-only (passive uncredited), 2 have no
  entry. The 62 are the standing coverage backlog (priorities item 11, ratcheted);
  prioritize by field play-rate and by where the agreement validator flags a
  sim/field disagreement.

## 2026-06-14: the "Alternate ability" question exposed a key-map scramble bug
- Explaining the Alternator item ("Your Alternate Ability deals 15% more damage")
  surfaced a real bug. "Alternate ability" = the RMB (right-click) ability slot,
  which EVERY hero has (Gideon RMB = Void Breach, Wraith RMB = Knock Knock). Not a
  stance mechanic. The item is strong when that RMB is a damage ability; useless if
  the RMB is a stance/utility toggle.
- The bug: data.ts had TWO disagreeing omeda->internal key maps. Abilities used
  OMEDA_KEY_MAP (RMB->ALTERNATE, Q->PRIMARY, E->SECONDARY); skill orders used
  OMEDA_TO_KIT (RMB->PRIMARY, Q->SECONDARY, E->ALTERNATE). Same omeda key, different
  internal slot. So skill-order leveling assigned points to the WRONG ability:
  Gideon's engine maxed Cosmic Rift (PRIMARY) by L9 when pred.gg maxes Void Breach
  (RMB). Roster-wide scramble of which ability is high-rank at each level -> wrong
  rotation damage at every non-max level. (Ult timing was unaffected: R->ULTIMATE in
  both. Level-13 results mostly converge, which is why it hid until now.)
- Fix: delete OMEDA_TO_KIT/SEQ_TO_KIT; map skill orders with the SAME OMEDA_KEY_MAP
  the abilities use. Gideon now maxes Void Breach first. Added a regression test
  that the RMB ability out-ranks Cosmic Rift early and is keyed ALTERNATE.
- Lesson: when two pipelines map the same external key into the same internal
  namespace, they MUST share one map. The Alternator item modeling itself was
  already correct (abilityKey ALTERNATE = RMB via OMEDA_KEY_MAP); only the skill
  order used the wrong map.

## 2026-06-14: attack-speed steroid abilities (Sparrow/Murdock) were invisible
- Maintainer caught it: Sparrow (Heightened Senses, 25/30/35/40/45% AS) and Murdock
  (Hot Pursuit, 15/20/25/30/35% AS) max a "utility" ability early for an attack-speed
  SPIKE. These abilities have no damage line, so def construction dropped them
  entirely -> the AS never reached the sim -> their auto DPS (their whole identity as
  carries) was undervalued. This is the concrete case behind the earlier "the sim
  only levels damaging abilities" caveat.
- Fix: parse a per-rank "X/Y/Z% Attack Speed" self-buff (+ approx duration "for Ns")
  from ability text (parseSelfAttackSpeed); retain buff-only abilities in the kit
  (new branch in def construction); credit the AS in auto DPS uptime-weighted
  (selfAttackSpeedPct: full in a burst window, buffDuration/cooldown sustained).
  attacksPerSecond gained an extraAsPct param. Retaining these abilities ALSO fixes
  their skill-order leveling (the E slot is no longer dropped).
- Lesson: "no damage line" != "no combat value." An ability can be a pure stat
  steroid (attack speed, and likely power/pen/haste buffs too) that the field maxes
  first precisely because it scales the auto-attacks. The damage-only def filter was
  silently discarding a carry's core power. Next: generalize to other self-buffs.

## 2026-06-14: generalized self-buffs to permanent passive stat gains
- After the AS steroid, surveyed the roster: most other ability self-buffs are
  PASSIVES (always-on) granting power/pen/haste — "Passive: Gain 8/11/14/17/20
  physical power" (Feng Mao Safeguard), Wraith's Surprise, Surprise! gives
  10/14/18/22/26 physical PENETRATION. These had no damage line so they were
  dropped, losing both the stat and the ability's place in the skill order.
- Added parseSelfStatBuffs (power/pen/haste/lifesteal/omnivamp from "Gain X ...")
  + AbilityDef.selfStatBuffs; retain buff-only abilities; fold the gains into the
  effective item totals at full uptime (applySelfStatBuffs) so they feed every
  damage window. Retaining Wraith's Surprise, Surprise! also fixes her leveling
  (it was the dropped ability behind her earlier skill-order mismatch).
- Scope call confirmed with the maintainer: only COMPLETED Epic/Legendary items are
  in the build pool, so the smaller components ("belts") that build into them are
  already excluded — no effort spent modeling them. The 62 flat-stats-only backlog
  is all completed items.
- Uptime model: permanent passives = 1.0 (always on); temporary steroids (AS) =
  duration/cooldown. Temporary non-AS steroids are rare/none among leveled abilities
  (the power ones are passives), so they're deferred.

## 2026-06-14: hero passives — model the EHP/stat ones, skip the conditional ones
- The Passive slot isn't built into abilities[], so no hero passive was modeled.
  Surveyed Steel + Riktor + the survey hits: passives split like the maintainer
  guessed. Steel's Cybernetic Shell (7% max-HP refreshing self-shield + armor
  cross-conversion) is pure EHP -> undervalued his whole tank identity. Riktor's
  Suspended Sentence (halt enemy cooldowns on CC) is utility/CC -> outside the
  sim's damage/EHP/heal objectives, no impact on our numbers.
- Most passives are conditional/stacking/proc (Gideon tether, Legion thresholds,
  Gadget/Boris stacks), NOT clean flat grants -- the earlier "9 power passives"
  survey over-counted by matching any "power" mention. Auto-crediting them would
  over-count, so they stay unmodeled.
- Modeled the clean case: parsePassiveSelfShield reads "shields ... for X% of max
  health" (only Steel today, 7%) into kit.passiveSelfShieldPctMaxHealth; EHP adds
  it as always-on effective HP (+472 eHP for Steel). Generic pattern, future-proof.
  Steel's armor cross-conversion is a remaining unmodeled piece (build-dependent).
- Lesson: a hero passive is worth modeling only when it maps to a scored objective
  (EHP/damage/heal) AND is unconditional. CC/lockdown/proc passives are real value
  the sim doesn't score -- flag, don't fake.

## 2026-06-14: neutral-objective solo-clear (who can take the Fangtooth)
- A great player question the EHP + staged-DPS + damage-reduction work unlocks:
  out of the junglers, who can solo the Fangtooth early, or with one item online?
  It's pure kit math: sustained damage vs the objective's armor for time-to-kill,
  vs its contact damage against the hero's effective HP (+ self-heal) for survival.
- Built soloClear + bestOneItemClear (src/objectives.ts) and npm run objectives,
  which ranks the 22 junglers at L4 bare and L6 with their best single item.
- DATA GAP honored per autonomy policy: we have NO neutral-objective stats, so
  added calibration.neutralObjectives.fangtooth as UNVERIFIED placeholders (HP,
  armor, contact DPS) with verified:false; soloClear reports provisional:true and
  output is THEORY until measured in practice mode. The machinery is correct; the
  rankings become meaningful once real Fangtooth stats are entered.
- This is the capstone that ties the session's defensive work together: EHP now
  reflects armor + HP + shields + damage-reduction + self-shield passives, so
  "survive the camp" is finally a real computation, not just raw HP.
