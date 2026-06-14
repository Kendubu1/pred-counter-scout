# Predecessor Scout v5: Kit-Math Engine and Site Redesign

Design document, June 11, 2026. Covers the pitfall audit of the current engine, the data strategy, the next-generation modeling architecture, two delivery concepts, cost tiers, the tech stack, and the UX redesign. Sources are cited inline. Claims that could not be verified are flagged as such.

## Research grounding (verified facts and flags)

The game is on patch 1.14.4, live June 9, 2026, with a small 1.14.5 hotfix referenced on the 1.14.4 page but not yet indexed (predecessorgame.com/en-US/news/patch-notes). The roster is 52 heroes per the official gallery; the repo's owned data covers 49 and is missing N3ON (1.12), Adele (1.13), and Legion (1.14), the last of which is a top-tier carry this patch (statz.gg/predecessor/hero-tier-list). Patch 1.14 replaced Minor Augments with the Eternals system (12 Eternals, 1 Major plus 2 Minor blessings, six deity families), raised global durability and cooldowns, reworked tenacity, and made percent armor pen multiplicative (predecessorgame.com 1.14 notes). Hero-specific augments remain, roughly 3 per hero. Flags: the exact Harbinger and Primarch family pairings, the pre-1.14 "Divination" item, and gold economy constants could not be verified from public sources.

On data access: pred.gg is omeda.city, rebranded (announcement on omeda.city). Both ride the official Omeda Studios public API (announced April 2023, keyless, no formal rate limits, "responsible usage" requested; predecessorgame.com/en-US/news/notices/public-api). The omeda.city REST API is live and was queried directly during this research: `/matches.json` returns per-player match records including `inventory_data` (item IDs), `role`, `rank`, `vp`, KDA, full damage breakdowns, and gold (docs at omeda.city/news/10). Two caveats observed directly: fresh June 2026 matches had null `inventory_data`/`role`/`rank` (enrichment lag, or a schema change; verify before building), and no augment or Eternal field appears in match payloads, so observed winrates for augments and Eternals are not computable from this source. The Predecessor EULA prohibits client-side extraction tools; the public API is the sanctioned channel.

On prior art: pure winrate-mirroring assistants measurably do almost nothing (a matched-design study of Dota Plus found about +0.38% winrate for subscribers; nims11.github.io/blog/dotaplus). u.gg's documented "most frequent build above baseline winrate" rule structurally cannot recommend rare-but-better builds. lolalytics is the methodological standout: pick-balance adjustment for popularity and skill confounds, sample sizes on every stat, significance flags (lolalytics.com). First-principles optimizers exist and their failure modes are documented: LoLSolved (genetic search over build orders) was criticized for ignoring the enemy side, unmodeled champion mechanics, and per-patch maintenance burden (news.ycombinator.com/item?id=25968564); LolItemSets used simulated-annealing Pareto search over DPS, effective HP, and sustain. Draft-only win prediction tops out around 55 to 65% accuracy (Hodge et al., arxiv.org/abs/1711.06498: 58.75% mixed-rank). Empirical Bayes shrinkage is canonical in sports analytics (varianceexplained.org/r/empirical_bayes_baseball) and no MOBA site publicly documents using it; that is an open edge. RL is rejected on cost and fit: OpenAI Five used roughly 770 petaflop/s-days and scripted its item purchasing rather than learning it (arxiv.org/abs/1912.06680).

One input from the brief was not provided: the `{{PLAYSTYLE_NOTES}}` player-profile placeholder arrived unfilled. The personalization design below is therefore parameterized around a profile schema with neutral defaults rather than tuned to a specific player.

## 1. Pitfall audit

Starting point, so we agree on what exists. The engine in `main` as of commit 316007d does the following. The scraped layer (`data/2026-02-08/*.json`, from pred.gg pages at patch 1.11.2) supplies per-role popular builds with winrates, augment and crest winrates, 4th/5th/6th item slot winrates, skill orders, and top-10 head-to-head counter lists. The owned layer (`data/game-data/`) supplies full kits with per-rank damage, scaling ratios and cooldowns, curated 0-10 hero attributes and traits, 280 items with stats and effect text, and the 12 Eternals with curated fit weights. Commit bdad1ab (June 10) added an early/mid/late phase engine, replaced `wr * log2(matches)` ranking with Bayesian-shrunk winrates, and raised the head-to-head minimum to 5 games. Commit e124ed1 (June 10) added `ui/kit-engine.js`, which derives playstyle components, phase power, a kit power index, and a ridge-calibrated kit-only matchup forecast, plus `scripts/validate-kit-model.js` as a recurring alignment check. Recommendations are assembled in `ui/matchup-engine.js` by greedy item scoring over tag heuristics, anchored to the highest shrunk-winrate popular build.

Two of the recent changes were genuinely right: shrinkage was the correct replacement for the log-popularity multiplier, and the matchup forecast ships honestly labeled low confidence. The audit below is about what remains.

Flaw 1: the kit power index is anticorrelated with reality, and the code claims the opposite. `KIT_POWER_WEIGHTS` in `ui/kit-engine.js:21` carries the comment "calibrated against matches-weighted observed WR." Running `scripts/validate-kit-model.js` today returns Pearson r = -0.29: the model ranks Maco (100), Grux (96), and Khaimera (82) at the top, all with sub-50% observed winrates, and assigns Wraith (53.3% WR) a kit power of 0. The cause is the math itself: `LATE_POWER = 1.5` (line 34) assumes a flat 150 bonus power at full build for every hero, which undervalues carries whose full builds exceed 250 power with multipliers; the basic-attack contribution is a magic constant (`dmg1 * 0.012`, line 144); cooldown uptime ignores ability haste; there is no attack speed, crit, or mitigation math anywhere; and min-max normalization lets one outlier crush the rest of the roster to near zero. The new design replaces this index with a combat simulator (section 3, component B) and retires kit power as a user-facing number.

Flaw 2: popularity bias was treated, not cured. `getHighestWRBuild` (`ui/matchup-engine.js:160`) selects among pred.gg's three popular build tabs, so the candidate set is the herd by construction; shrinkage only reranks within it. The "Aggressive" build shown to users is literally the most popular high-winrate build, and `scoreForPath` (line 349) pays a +10/+10/+5 bonus for items "proven" in popular builds. This is u.gg's documented frequency-anchoring limitation reproduced exactly. The new design generates candidates by searching the full item space and uses observed data only as evidence and calibration, never as the candidate set (section 3, components C and D).

Flaw 3: skill confounding is not handled anywhere. Every winrate consumed by the engine is an all-ranks aggregate (acknowledged in `README.md:44`). No rank covariate, no pick-rate adjustment, nothing like lolalytics' pick-balance index. One-trick inflation and "good players pick X" effects pass straight through to recommendations. The new design ingests match-level records with `rank` attached and fits hierarchical models with rank as a control (section 3, component D).

Flaw 4: the shrinkage prior is wrong, and the floor beneath it is sand. `adjustedWinRate` (`ui/matchup-engine.js:153`) shrinks everything toward a flat 50% with K = 25. A build's winrate should shrink toward that hero-and-role's own mean, not toward the global coin flip; shrinking a strong hero's builds toward 50% systematically punishes them and flatters weak heroes. `getHighestWRBuild` also silently retries with `minMatches = 1` (line 178) when nothing passes the 2-match bar, reintroducing the small-sample noise the fix was meant to remove. The new design uses beta-binomial empirical Bayes with hierarchical means (item within archetype within hero-role within patch) and hard minimum-evidence gates that fail closed rather than degrading to n = 1.

Flaw 5: patch drift is structural, not incidental. `data/manifest.json` pins a single winrate snapshot, 2026-02-08, which is patch 1.11.2. The engine blends those February numbers with June's 1.14.4 game data across a map rework, global durability and cooldown changes, a tenacity rework, and the pen formula change. Worst case: `_pickAugment` (`ui/matchup-engine.js:263`) ranks augments by winrates recorded in a system that 1.14 partially replaced with Eternals. The new design partitions all evidence by patch, applies recency decay within a patch, and gates any cross-patch pooling behind an explicit "no balance change touched this entity" check derived from the existing patch digests.

Flaw 6: the matchup model is trained on a censored sample and rendered with false precision. The ridge forecast (`ui/kit-engine.js:43`, fit per `scripts/validate-kit-model.js:108`) is calibrated on 1,131 pairs taken from pred.gg's top-10 counter lists: only pairs popular enough to chart appear, so the training distribution is biased toward common matchups. Holdout r = 0.146 and 54.3% direction accuracy are disclosed in the code, which is commendable, but the UI still prints a per-pair predicted winrate to one decimal place. Several coefficients (durability -2.7, sustain -2.5) most plausibly encode role composition, not causal matchup effects. The new design computes head-to-head evidence from its own match-level data with role and rank controls, presents intervals or verdict chips instead of point winrates, and uses simulation for unseen pairs (section 3, component E).

Flaw 7: validation is circular. `validate-kit-model.js` scores the kit model by its agreement with the same confounded, stale, censored winrates the kit-first pivot exists to escape, and the kit weights were tuned toward them. A kit model tuned to reproduce solo-queue winrates inherits solo-queue's confounds and stops being a kit model. The new design validates the simulator against mechanical ground truth (in-game measured fixtures) and validates the recommendation policy against held-out, current-patch match outcomes with controls (section 5).

Flaw 8: regex is doing the job of a mechanics schema. Item capabilities come from `EFFECT_TAG_PATTERNS` (`ui/matchup-engine.js:13`), where `/slow/i` mints a CC tag and `/bonus damage/i` mints burst; kit CC falls back to regex over description prose (`ui/kit-engine.js:87`); `_pickAugment` boosts augments whose names contain substrings like "tainted" (`ui/matchup-engine.js:270`). Gold-per-stat values are a hardcoded table (`ui/matchup-engine.js:57`) rather than being derived from basic component items. The new design replaces all of this with a hand-curated structured effect schema (section 3, component A); it is a one-time cost of roughly 200 entries.

Flaw 9: the build search cannot express item synergy. Builds are assembled by three sequential argmax picks (`ui/matchup-engine.js:737`) under tag-coverage penalties. Multiplicative interactions (crit times attack speed, percent-HP on-hit against stacked health), diminishing returns, overcap waste, and gold-timing order are all invisible to it. `buildPhaseLean` (line 452) adjusts phase power by arbitrary +4/+2 tag bonuses and hardcoded 8,700/9,400 gold thresholds. The new design searches the combinatorial space with the simulator as the objective (section 3, component C).

Flaw 10: coverage and identity hygiene. Three roster heroes are absent from all owned data, including the meta-defining carry Legion. Hero codename mappings are pasted into three separate files (`combo-engine.js`, `ability-interactions.js`, `support-synergy.js`). Curated 0-10 attributes in `hero-profiles.json` feed `build-engine.js:16` stat weights even though the real per-ability scaling ratios sit unused in `hero-abilities.json` for that purpose.

Flaw 11: the UX buries the engine. Detailed in section 8; in short, seven tabs fragment one hero's story, builds live in three different surfaces, and the home page sells four flows rather than the one question players have.

## 2. Data strategy

Recommendation: hybrid, weighted heavily toward an owned pipeline on the official API. Permanently drop pred.gg page scraping; the v4 plan already records community pushback over it, and pred.gg and omeda.city are the same project, so scraping their pages while bypassing the sanctioned API is both a relations risk and pointless effort.

Concretely: ingest the match feed (omeda.city `/matches.json`, cursor-paginated, or the official endpoints directly) on a schedule, lagged 72 hours to clear the observed enrichment delay. Persist only compact aggregates in the repo: per patch, per hero, per role, per rank band, counts and wins for item presence, item pairs within builds, same-role hero pairs, and core-build archetypes. Raw pages are processed in CI and optionally archived as release assets for reproducibility; they do not enter git (at an estimated 10k to 50k matches per day, raw data would bloat the repo; that volume figure is an estimate from roughly 1.7k Steam CCU plus console, flagged as such). Keep the owned kit, item, Eternal, and patch-digest data as the backbone; it is current to 1.14.4 and is the engine's real moat.

Fill two gaps. First, per-level base stats (health, armor, attack speed, mana) exist nowhere in owned data; source them from the official hero endpoint referenced in the API announcement (`/api/public/hero/<name>`, fields unverified, flag) or the wiki, then verify in practice mode. Second, accept that augment and Eternal winrates are not computable from the API today (no field in match payloads); recommendations for them must stand on mechanics math alone and be labeled accordingly. This is honest and it aligns with the kit-first thesis.

What pred.gg-derived aggregates still offer (popular-build snapshots, skill orders) the new engine either computes from its own match ingest or derives from simulation, so the dependency can go to zero without feature loss. Attribute the data source on the site, keep request rates polite, and consider a goodwill note to the pred.gg developer; in a community this small, the brand repair is worth more than the data.

## 3. Modeling architecture

Recommendation: a five-component stack where deterministic kit math generates and explains builds, statistics validates and calibrates them, and personalization reweights objectives. Each component below states what it buys and what breaks without it.

Component A, structured mechanics layer. A curated, versioned schema that turns prose into math: every completed item, crest, hero augment, and Eternal blessing encoded as typed effect primitives (flat stats, proc damage with internal cooldown, percent max or missing or current HP damage, heal and shield amounts with ratios, stacking rules, unique-passive groups, auras, actives with cooldowns), plus hero base-stat curves and a calibration fixture file holding in-game measured constants: the mitigation formula (presumably damage times 100/(100+armor), unverified, must be measured), the crit damage multiplier, the attack speed formula, and post-1.14 tenacity and multiplicative pen behavior. Roughly 200 curated entries and an afternoon of practice-mode measurements per patch. This is the single highest-value investment in the design. Without it, everything above it computes precise answers to misread mechanics, which is the current regex state of the world. Status, June 11: first curated registry shipped (engine/fixtures/effects.json): 32 modeled targets covering the key item passives, 7 of 12 Eternal majors plus 8 minors, and one provisional augment; 5 Eternal majors (Marrow, Nihil, Aion, Exarch, Lotus) are declared unmodelable without match telemetry rather than guessed, and the simulator consumes the rest (stat multipliers, procs with ICDs and ramps, cooldown rates, multiplicative percent pen, shred, shields). Status, June 12: the full pred.gg hero-augment catalog is curated (engine/fixtures/augments.json, keys join the field evidence by catalog id): 46 of 156 augments carry typed effects through new ability-scoped primitives (per-ability damage amps and cooldown mods, per-cast bonus damage, on-cast heals/shields with stat scaling, per-minute stat growth), and 110 are declared unmodeled with the reason stated (positioning/pickup conditions, stack cadences, team-side value, AoE-only value, passive-targeting). Conventions: hit-conditional effects are modeled because the sim already assumes casts hit; 1v1 kill-window sims satisfy isolated/nearest-enemy conditions; Kallari's ability-crit entry is provisional because it bakes the unverified crit multiplier. The simulator consumes ability-scoped effects everywhere (rotation, burst, heal output, EHP), per-augment build shifts are emitted where the optimizer's answer diverges with the augment locked in (9 heroes shift at current patch), and Eternal rankings run augment-aware wherever the field's most-played augment is modeled (16 heroes), retiring the blanket augment-blind caveat.

Component B, combat simulator. Closed-form evaluation, not tick simulation: for a (hero, build, level, Eternal, augment) tuple it computes rotation damage over 3/6/10/20-second windows against reference defense profiles (squishy, bruiser, tank, each with current-patch armor and HP values), single-combo burst, sustained auto-attack DPS with attack speed and crit curves, effective HP physical and magical, mana feasibility of the rotation, CC uptime, and healing output. Evaluations cost microseconds, which makes search feasible. Worked example, the exact computation the simulator industrializes: Gideon, rank-5 Void Breach and Cosmic Rift, pure-power core (Oblivion Crown, Wraith Leggings, Amulet of Chaos; 315 MP, 0 haste, 9,550 gold) versus hybrid-haste core (Timewarp, Noxia, Astral Catalyst; 245 MP, 65 haste, 8,850 gold). At current 1.14.4 numbers: pure power wins the one-combo burst by 10% (836 vs 762) and every window up to 10 seconds; haste crosses over near 15 seconds and wins a 60-second attrition fight by 56%, on 700 less gold. Patch-currency correction, June 11: this example was first computed on the repo's owned ability data, which validation against the 1.14.4 patch digest exposed as pre-1.14 (old cooldowns, old item stats). On the stale data the haste crossover sat at 10 seconds; the 1.14 global cooldown increase, which Omeda shipped explicitly to offset Eternal haste, moved it to 15. The engine now sources all numbers from an official-API snapshot, and a patch gate in the harness pins a digest-stated value (Void Breach 95 to 235) so a stale regression fails the build. Assumptions still to verify in fixtures: haste formula cooldown times 100/(100+AH), mitigation constant, no item passives, no mana limit. That is a real, checkable claim about how Gideon should itemize for extended fights versus pick attempts, derived from zero winrate data. This component is also where "this augment genuinely synergizes, as math" comes from, because augments and Eternals modify specific abilities with known numbers (Vesh's Major is 6% +0.5%/min of ability damage as a DoT; its value on Gideon is a multiplication, not a vibe). Without B there is no first-principles generation at all, and skill-order advice also dies, since dropping pred.gg drops scraped skill priorities; B derives max order from marginal rotation damage per rank instead. Status, June 12: heal and shield amounts and ratios parse from current ability text the way damage does (multi-tick effects fold into per-cast totals; pure heal/shield abilities with no damage line enter the kit model; HealthText-scaled and passive-delivered effects are skipped conservatively, never guessed — Phase's passive heal is the named gap). The simulator reports heal/shield output over a window, amplified by heal_shield_increase, under a documented one-beneficiary convention, and the previously dropped support item stats (heal_shield_increase, gold_per_second, tenacity, movement_speed) are in the item model. Skill priority counts heal growth so a support's bread ability is not ranked last for dealing no damage.

Component C, build generator. Multi-objective search over the completed-item space (roughly 80 to 110 viable tier-3 items): beam search seeded by single-item marginal utility, refined by simulated annealing, under constraints (one crest, unique-passive groups, mana adequacy, role gold curves for affordability checkpoints). The objective is a vector, not a scalar, because LoLSolved's documented failure was objective misspecification: burst damage, sustained damage versus each defense profile, effective HP both types, sustain, and utility output. The output is a Pareto front per hero and role, which is what "novel builds from first principles" concretely means: any Pareto-optimal point is a candidate build regardless of whether anyone plays it, and popularity never enters the objective. Named archetypes fall out of the front (the burst corner, the uptime corner, the survival corner), and build order is chosen by greedy power-per-gold along the purchase path, which yields spike timings for free. Without C, the engine can only rerank what is already popular, which is flaw 2. Status, June 12: support-role searches optimize a support objective vector (heal/shield output, physical and magical survivability, poke rotation, utility as movement speed plus tenacity) in place of the pure-damage corners, with crit and lethality items excluded from the support pool as a golden-rule constraint (the math alone let Equinox's 80 tenacity smuggle 20% crit onto an enchanter). The support pages' max-damage-only caveat is off; residual limits (one beneficiary, active abilities only, no CC or damage-reduction scoring) ride in the artifact's confidence notes.

Component D, statistical evidence layer. Hierarchical empirical Bayes over the owned match ingest: beta-binomial shrinkage of item, archetype, and hero-role winrates toward their parent means, partitioned by patch, with rank band as a covariate. At the low tier this is closed-form empirical Bayes in TypeScript; at higher tiers a full partial-pooling model in PyMC. Its three jobs: calibrate the mapping from simulator utility to expected winrate (so verdicts are anchored, not just relative); flag where reality disagrees with the simulator, which is the discovery loop that catches missing mechanics; and put honest intervals on everything user-facing. It is evidence, never generator. A GBDT outcome model on match features is an optional add-on for calibration context only; draft-time prediction has a documented 55 to 65% ceiling, so no feature should promise more. Without D, off-meta claims are unfalsifiable and the simulator's blind spots go undetected.

Component E, matchup, scaling, and personalization. Matchups: for a pair in a lane, simulate both kits with their recommended builds at checkpoint minutes (5/10/15/20/25/30) using role gold-and-XP curves from owned data, and compute kill windows (can A's full combo plus two autos kill B through B's effective HP and sustain at that checkpoint, and vice versa), escape-versus-engage cooldown coverage, and range deltas. Status, June 11: checkpoint kill windows are live (engine/src/matchup.ts): gold-curve-aware purchase ordering, measured spike timelines, both sides' real base stats plus affordable build prefixes, per-checkpoint verdicts with drivers and a gameplan sentence, all carrying THEORY and provisional-level flags. Adding percent-max-health ult parsing during this work moved Gideon versus Countess from a false all-game edge to an honest early-window read, which is the framework catching its own blind spot. Output per-phase verdict chips with drivers, plus observed head-to-head evidence (same-role pairs from owned match data, shrunk, patch-current) shown with intervals. No point-winrate theater for unseen pairs. Personalization: a profile object `{roles ranked 1-3, aggression 0-1, damageProfile, comfortHeroes[], typicalGameLength}` reweights the objective vector (aggression weights the early checkpoints and kill windows, long games weight the 20s objectives and scaling corner), filters the hero pool by role, and ranks comfort-adjacent heroes by kit-vector similarity. Deterministic and visible ("tuned for you" chip), because there is no telemetry to run bandits on yet; contextual bandits become justified only if the site later logs which recommendations users act on, and the design leaves that hook open. The `{{PLAYSTYLE_NOTES}}` input was not provided, so defaults ship neutral.

Off-meta discovery, concretely defined. A candidate is a build, item swap, augment, or Eternal choice that is (a) Pareto-optimal or within 3% of the front in simulation, (b) underplayed in owned match data for that hero and role (below a 2% play-rate threshold), and (c) ahead by at least 8% on a named objective in a named scenario (for example, rotation damage at 20 seconds versus bruiser profile). Status, June 11: criteria (a) and (b) are live. The aggregate pipeline measures play rates over 8,033 current-patch matches, and the first real candidate surfaced immediately: Magnify sits on Gideon's Pareto front for the bruiser-matchup objective (ramping 30% magical armor shred) at a 0% play rate across 1,736 Gideon games. Real per-role gold curves from the same pipeline replaced the placeholder checkpoint economy, which measurement showed was roughly twice too rich. It is promoted only if the evidence layer does not contradict it (the shrunk effect of its distinguishing components is not credibly negative) and it passes the section 5 harness. The published artifact carries the proof: the scenario, the numbers, the assumptions, and the evidence state. If no candidate clears all gates for a hero, the page says exactly that ("no defensible off-meta option this patch"), which the brief explicitly prefers over forcing one. Thresholds are configuration, and the defaults above are starting points to tune against the harness.

Tension to keep visible rather than paper over: the coach wants crisp verdicts, and the data scientist knows pre-game signal is weak and intervals are wide. The resolution is that verdicts are phrased as gameplans tied to mechanisms ("your kill window opens at two items; force trades before their core completes") with a confidence badge, never as a fabricated percentage. A second tension: a coach will not scrim-test a sim-only build on faith. The confidence grammar in section 8 marks sim-only outputs as Theory explicitly so scrim prep can treat them as hypotheses, which is what they are.

## 4. Concept A: static site

Recommendation: keep GitHub Pages and ship the engine as a precomputed-artifact pipeline. Zero servers, near-zero cost, and the whole engine runs at build time.

Stack: TypeScript on Node 22 for ingest, mechanics, simulator, search, and artifact generation; DuckDB inside CI for aggregation; Zod schemas validating every artifact; Astro (or the existing vanilla setup, but Astro is recommended for componentization) building the site from JSON artifacts; GitHub Actions as the only orchestrator.

Pipeline stages, each a CI job: `ingest` (nightly cron, cursor over the match feed with 72-hour lag, emit aggregate parquet and JSON deltas), `mechanics` (per patch, regenerate item/ability/base-stat data, re-enter calibration fixtures from practice-mode measurements), `engine` (run simulator and search for 52 heroes times their roles, plus matchup checkpoints for same-role pairs, emit per-hero artifacts including Pareto builds, spike timelines, matchup verdicts, off-meta proofs), `copy` (LLM pass that turns artifacts into coach-voice prose; every number in the prose is checked against the artifact by a verifier step and rejected on mismatch, exactly the v4 plan's ground-check design), `publish` (write versioned JSON to the site data directory, bump manifest).

Status, June 11: the engine stage is live end to end. Per-hero artifacts (build with spike minutes, play rates and shrunk evidence per item, eternal rankings, checkpoint matchups vs the most-played same-role opponents, off-meta proofs or honest absences, THEORY flags) generate for all 52 heroes in 74 seconds, and a Zone 1 prototype page (ui/v6) renders The Answer from them. Cadence: full regeneration on every balance patch, triggered manually when the patch digest is added (one to three days after patch day, once enrichment-lagged data exists); weekly evidence refresh in between (aggregates and confidence badges change, builds change only if gates demand); hotfix path for emergencies. Cost: GitHub Actions and Pages are free for public repos; the LLM copy pass is the only metered spend (section 6).

## 5. Concept B: test-before-publish pipeline

Recommendation: build Concept B as gates on Concept A's pipeline rather than a separate system. Same artifacts, same CI; B adds a `validate` stage between `engine` and `copy`, and publishing becomes conditional. This satisfies the requirement that A grows into B by construction.

What gets tested, in five layers. First, mechanics unit tests: item stat sums, gold-efficiency values derived from basic component items rather than a hardcoded table, and formula snapshots asserted against the calibration fixtures (if the measured mitigation constant changes and nobody updates fixtures, the build fails loudly). Second, golden scenario suite, the regression heart: a curated set of matchup and comp scenarios with required outcomes. Examples: against a Narbash plus Mourn sustain lane, the recommended build must include anti-heal by the second completed item; a crit build must not be recommended into a 200-armor tank scenario when the percent-HP or pen alternative out-damages it; an enchanter support is never handed a crit core; every mage build must complete a standard rotation within its mana pool at each checkpoint. Third, sanity invariants: adding a sixth damage item never lowers any damage objective (monotonicity), power curves are smooth in gold, no build violates unique-passive or crest constraints, every recommended path is affordable on the role's median gold curve by its claimed spike minute. Fourth, statistical gates: the utility-to-winrate calibration is checked on held-out recent weeks (Brier score and calibration error within tolerance), minimum-evidence thresholds for any "Proven" badge are enforced, and no off-meta promotion ships without its proof object attached. Fifth, churn gates: a diff against the last published artifacts; if more than 30% of top builds change without a patch-note cause linked in the digest, publication stops for human review.

Pass criteria: all five layers green. Failure handling: the pipeline publishes nothing, the previous artifacts stay live, and CI opens a GitHub issue containing the failing scenario, the offending artifact diff, and the proof objects involved; a human either fixes data, adjusts a fixture with a measurement, or consciously overrides with a labeled commit that the issue links for audit.

Honesty check the brief demanded. A bad build this harness would catch: a simulator mana-model bug produces a triple-haste, zero-regen Gideon core whose rotation runs dry in 9 seconds; the mana-feasibility invariant fails it before publish (the current engine has no equivalent guard). A failure it would miss: human execution and macro context. A build can pass every gate and still be wrong for most players because its value depends on hitting every cooldown-cycle cast on a console controller, or because it sacrifices wave-clear the sim does not model (minion-clear and the new Shrines objective economy are explicitly out of scope for the v1 simulator). The mitigation is the Theory badge and the evidence loop, not pretending the harness sees everything.

## 6. Cost tiers

| Tier | Stack | Rough monthly cost | What you gain | What you sacrifice |
|---|---|---|---|---|
| Low | GitHub Actions + Pages, TypeScript engine, DuckDB in CI, empirical Bayes in TS, Claude Haiku for copy, omeda.city API | $0 to $10 (LLM copy roughly $2 to $8 per patch, everything else free) | The full kit-math engine, harness, patch cadence, off-meta proofs; buildable solo this weekend | Nightly-batch data only; closed-form stats (no full posterior); copy quality of a small model; no user telemetry |
| Medium | Low tier plus one $6 to $12 VPS (continuous ingest, DuckDB warehouse of raw matches), PyMC partial pooling run per patch, Claude Sonnet copy, custom domain, optional Cloudflare R2 archive | $25 to $60 | Raw match history retained (retro-analysis, better matchup samples), real hierarchical posteriors, sharper prose, faster post-patch turnaround | A server to maintain; modest cost; complexity of a two-runtime stack (TS + Python) |
| High | Medium plus managed ClickHouse or Postgres, scheduled sim sweeps on Modal or similar, experiment logging, monitoring, preview deploys | $250 to $600 | Interactive queries over full history, per-rank-band models, fast whole-roster sweeps, infrastructure for telemetry-driven personalization (bandits become possible) | Real money for a roughly 2k-CCU game's audience; meaningful ops burden for a solo builder; little user-visible gain over Medium today |

Best bang for buck: Low tier now, with Medium's single VPS added the moment retro-analysis hurts (the first time a patch drops and you wish you had kept raw matches, which will happen within two patches). The upgrade path is clean because the artifact schema never changes across tiers: Low to Medium moves ingest from CI cron to the VPS and swaps the stats implementation behind the same artifact interface; Medium to High moves storage and compute, nothing else. High is not recommended until there is telemetry worth a bandit or an audience worth the ops.

## 7. Tech stack

| Library / tool | One-line justification |
|---|---|
| TypeScript + Node 22 | Matches the existing repo; one language across engine, pipeline, and site |
| tsx | Zero-config TS execution for pipeline scripts |
| Zod | Runtime schema validation at every pipeline boundary; bad data fails loudly |
| DuckDB (node bindings) | Free, embedded, columnar aggregation over match data in CI; no database server |
| Vitest | Fast TS-native test runner for the section 5 harness |
| GitHub Actions | Free public-repo CI; the entire orchestrator for Concepts A and B |
| Astro | Actively maintained static-site framework; islands keep the interactive bits small |
| uPlot | Tiny (around 40KB), fast canvas charts for power curves and scaling plots |
| Anthropic SDK (claude-haiku-4-5 low tier, claude-sonnet-4-6 medium) | Metered coach-voice copy generation behind the ground-check verifier |
| simple-statistics | Lightweight closed-form stats (beta-binomial EB) at the low tier |
| polars + PyMC (medium tier and up) | Industry-standard hierarchical Bayesian fitting when full posteriors are wanted |
| Playwright (optional) | Visual regression screenshots of generated pages before publish |

All of the above are actively maintained as of mid-2026. Nothing on the list is abandoned, and nothing requires a server below the Medium tier.

## 8. UX and information architecture redesign

Audit of what exists. The live v2 app fragments one hero across seven tabs (Overview, Patch, Abilities, Eternals, Counters, Synergy, Stats in `ui/v2/index.html`, rendered by `renderOverview` through `renderStats` in `ui/v2/app.js`). Builds appear in three unrelated surfaces: Overview's top-three popular builds, Counters' aggressive-versus-counter pair, and the Build Lab. Eternals are explained twice (tab and standalone page) with different framing. "Patch" means three different things across the home banner, the per-hero tab, and the site-changelog page. The home page (`#landingPage`) leads with four flow cards and a meta-movers banner; nothing on it demonstrates what the engine can do, and the answer to "what do I build" is three clicks and one tab-scan away. Confidence today is raw winrate percentages with match counts, plus one honest "low confidence" line on the kit forecast. The fastest current path to "what do I build, in what role, and why" requires the Overview tab plus mental assembly from at least two more tabs.

Hero page redesign: one scrolling page, three zones, anchors instead of tabs, every deep section one click from the top.

Zone 1, The Answer, fully visible in the first viewport. Header strip: portrait, name, role pills (preselected from the player profile, switchable inline), three playstyle chips derived by the engine, one confidence badge. The Answer card: left side, crest plus six items in purchase order with the spike items marked; right side, Eternal (Major plus two Minors) and hero augment; underneath, one coach sentence stating the build's mechanism ("Win through cooldown uptime: this build casts five rotations in the time pure power casts three") and a power-curve sparkline with spike dots at item completions. Three proof chips under the card, each expandable: a sim number ("+53% rotation damage at 20s"), a matchup fact ("kill window opens at 2 items vs squishy mids"), an evidence state ("observed 61% over 412 games this patch" or "Theory: no observed data for Eternals"). That is the under-10-seconds requirement: build, role, and why without leaving the first screen.

Zone 2, Adapt. A matchup bar: chips for the five most common same-role opponents plus a search field. Selecting an enemy swaps items in place with the diff highlighted and a one-line reason per swap, and shows early/mid/late verdict chips with drivers and the gameplan sentence. A playstyle toggle (Aggressive, Balanced, Scaling) re-picks from the Pareto front and visibly changes the card, which is how the engine's adaptation becomes tangible.

Zone 3, Depth, as collapsed sections: Full reasoning (the simulator tables behind the proof chips), Off-meta lab (the proof object, or the honest "no defensible off-meta option this patch" line), Abilities and combos (with the existing platform button art), Eternals in depth, Scaling curves (interactive DPS-versus-time and DPS-versus-armor plots), and a Stats appendix (sortable matchup evidence table with intervals and sample sizes). The Patch story for the hero becomes a slim banner above Zone 1 when the hero changed this patch, not a tab.

Home page redesign: its job is routing plus proof of value, in that order. Top: a single search box ("Who are you playing?") with role quick-filters and recent heroes; one click lands on Zone 1 of a hero page, so the common case is two interactions total. Below it: the player-profile chip (roles, aggression, game length; set once, edited inline) that silently personalizes every default on the site, and an "engine receipt" card that rotates one real reasoning example per visit (the Gideon haste math, for instance) so a new visitor sees what makes this tool different without clicking anything. Below the fold: a condensed this-patch strip (three movers with one-line whys, linking to the patch page) and quiet links to the secondary tools (Draft helper, Team Lab, Learn Eternals). Draft helper and Build Lab remain separate flows reachable from the header; they stop competing with the primary question on the landing screen.

Confidence and reasoning, visually. Three badges with fixed semantics: Proven (green): simulation and current-patch observed evidence agree, sample above threshold; Theory (blue): math-backed, observed evidence thin or structurally unavailable (all Eternals and augment picks today); Watch (amber): observed evidence disagrees with the simulator or the entity changed this patch and is unverified. Badges always carry a tooltip with the actual numbers: sample size, interval, sim deltas, patch tag. Two hard rules: no bare winrate percentage anywhere without sample size and patch tag attached, and no point predictions for unobserved matchups, verdict chips and intervals only. The coach-voice rule for all generated copy: imperative first, mechanism second, numbers one tap away.

## 9. Kit-derived playstyle, conditional loadout, and Option-A robustness (June 14)

Framing. A hero's loadout is a directed graphical model, not a flat choice:
`kit -> playstyle z -> build -> augment -> eternal(major -> minor1, minor2)`. Each
downstream pick is scored conditioned on its parents. The "templated" feeling the
maintainer flagged came from the objective being global (`search.ts` COMBAT_VECTORS,
one set of corners for all 52 heroes): the generation was individuated, the *value
function* was not. The fix is to condition the objective on a per-hero playstyle
derived from the kit itself.

What `main` already shipped (do not rebuild): an *augment-as-playstyle* steer
(`playstyle.ts`) — a discrete enum (`on-hit|ability-burst|sustain|tank|poke`)
read from the augment the field runs in a lane, added as a bias corner via
`generateBuilds(objectiveBias)`, routed by damage type; the attack-speed cap (3.0/sec,
tooltip-sourced); `npm run explain` (leave-one-out attribution on a given build);
and the multi-stage early/mid/late power curve. This section is the layer on top.

Kit-derived playstyle (this work). `kitPlaystyle(kit)` classifies into the *same*
enum from kit mechanics (basic-attack carry, ability scaling, cooldowns, on-hit/heal
payloads), and `fuseSteer` reconciles it with the field's lane augment: agreement is
a confident steer, disagreement keeps the kit lean but names the gap (the project's
"disagreement is product" thesis). A data-model trap surfaced here and is worth
recording: every caster is tagged `damageType: 'hybrid'` (physical basic, magical
abilities — e.g. Gideon), so `damageType === 'magical'` checks silently never fire.
`kitPowerType(kit)` resolves the real power type from the majority damage type of the
damaging abilities; both the kit classifier and the Eternal fit scorer route through
it. Gideon then reads as `ability-burst / poke`, magical.

Conditional Eternal loadout. `selectEternalLoadout` picks the major by kit fit
(dot of the playstyle against each Eternal's curated `fit` block, dominant) blended
with its modeled sim delta, then selects one blessing from each minor slot by the
*marginal* sim gain ON TOP OF that major (so a minor's value is conditioned on the
major actually being equipped), falling back to the curated recommendation when a
minor's mechanic is unmodeled. For Gideon this yields Vesh (Ability Damage Mage) +
The Tenth Seal + Mind Rot, each with a real conditioned delta. This subsumes the old
hardcoded `ehpWeight = ranged?0.25:0.6` heuristic — durability now flows from fit.

Option-A robustness (replaces the binary THEORY flag, for the slice). Unverified
constants carry a plausible `range` in `calibration.json` — crit [1.6,1.8],
mitigation K [100,150] (the data warning that K may exceed 100 finally has teeth).
`robustnessOf` sweeps the 2x2 corner grid through the generator and asks whether the
#1 build survives; if not, it attributes the flip to the specific constant. The sim
now reads K through `SimOptions.mitigationK` (default 100, behaviour-preserving) so
the sweep varies it faithfully. Result for Gideon: the kit-steered burst build is
STABLE across both ranges, while the *unsteered* build is FRAGILE — its #1 flips
when K moves to 150 — so the sweep correctly flags mitigation as the constant to
measure first. The attack-speed cap stays at the tooltip-sourced 3.0; the maintainer's
350-420% web finding is recorded as a `crossCheck` note (likely a percent-bonus view
of the same absolute cap; confirm units in practice mode).

Agreement / retrodiction validator. `agreeWithField` checks whether the *generated
front* reproduces the field's winning cores from `predgg-builds.json` (hit@k,
n-weighted coverage, Spearman of field WR vs our headline) — complementing `explain`,
which attributes a single given build. It runs after generation and never feeds the
objective. First finding: Gideon's front does NOT cover the field's 55%/n=390 core
(Azure Core + Combustion + Wraith Leggings), even at three items — the sim prefers
raw magical power over Azure Core's mana+haste because the damage objective is
*mana-blind* (rotation damage assumes casts land within the window regardless of
pool). That is a real, testable sim limitation the validator is designed to expose;
the fix (a mana-constrained sustained-casting model) is future work.

Lane-conditioned playstyle (Zinx, second slice hero). The same kit must resolve to
a *different* playstyle by lane. Zinx is an ally-heal enchanter (she cannot heal
herself — her Infuse and ult heals are ally-directed) yet plays mid/carry as a
poke/on-hit damage hero. The classifier now conditions the heal/sustain signal on
the lane: ally healing LEADS only where it is a scored win condition (support, the
role whose objective set scores heal/shield output); in a damage lane the heal is
demoted to utility and the damage identity (poke here) leads. This matters mechanically,
not just cosmetically — a `sustain` classification steers to `healShield10s`, which a
combat objective set drops, so an un-conditioned Zinx got NO effective steer and an
enchanter Eternal (Exarch) even in carry. Conditioned, she reads sustain/poke in
support (Exarch major) and poke/sustain in mid/carry (steer becomes rot10/rot20, a
combat objective the search keeps; Eternal becomes the damage major Vesh). The
`sustain` objective mapping was also split: ability heals are ally OUTPUT
(`healShield10s`), distinct from self-drain via lifesteal (`sustain10s`), which an
enchanter who cannot self-heal never gets. The Eternal-major choice is now fit-led
(multiplicative blend, fit dominant) so a best-fit but unmodeled major (Exarch,
sim=0) still beats a modeled off-archetype damage major — the additive blend got
this backwards.

Staged ability acquisition (the V2 ability chart). The multi-stage sim must reflect
which abilities a hero actually has at each stage. `ranksAtLevel` previously used a
heuristic for basic-ability ranks (correct ult timing, approximate basics); it now
tallies the full 18-level recommended path (`skill-orders.json` `sequence`, the V2
chart, loaded into `kit.recommendedSequence`) point by point up to the level. So an
early-stage evaluation has the ultimate only from the level it is taken (Zinx ULT=0
at level 5, =1 at 6) and basics at their real recommended ranks. It converges with
the old heuristic by level 13, so the level-13 objective and its tests are unchanged.

Mana-aware objective (burst cadence, level + item timing). Mana pressure is a
burst/combo property, not a sustained-DPS one: over a 10s rotation cooldowns space
casts out and NO kit ever runs dry (every hero's adequacy was 1.0), so a 10s mana
model is useless for itemization. The metric that actually discriminates is "combos
before dry" = mana pool / one-combo cost, both level-aware (base mana[level], ranks
at level) and item-aware (item mana): Zinx is 1.9 combos at L9, Gideon 2.9 (he scales
mana +372% and needs it less), and a mana item lifts Zinx to 3.3. The search now
penalizes builds (down to a floor) whose worst early item-timing stage (1/2/3 items at
~L9/12/14) can't sustain ~3 combos, so a starved kit is steered to bring mana online
early while a mana-rich or resourceless kit is untouched. Effect: Zinx now front-loads
a mana item (adequacy → 1.0); Gideon is left alone (0.97). This is also the structural
fix for the Azure-Core retrodiction miss. Still open: modeling the evolving orb (Orb
of Enlightenment → Orb of Growth, "Inner Growth" stacking, a meta item) as a ramping
gain rather than flat final stats; and the ultimate being credited once per rotation
window despite its ~120-160s cooldown.

On-hit reasoning via a power-type-aware pool. A magical hero can lean on-hit not
through ability damage but through ATTACK SPEED + a magical on-hit item (Zinx's meta
core is Prophecy + Spectra + Orion, where Orion converts ability haste → attack
speed). The mechanics were modeled, but the optimizer couldn't reach the build: the
field core is a balanced hybrid no single corner picks, and the autoDPS corner
overshot to physical crit (Deathstalker) because the item pool treated the 'hybrid'
tag as "allow everything." Fix: `relevantPool` now routes through `kitPowerType`, so a
magical kit's pool drops physical power/crit/lethality and keeps magical power,
attack speed, and ability haste (which feed magical on-hit). An on-hit steer on Zinx
now builds Orion + Spectra, not Deathstalker — the model reaches and can explain the
meta on-hit build. (Why it works, not modeled yet: a pure-physical-crit mage is also
a hybrid-tag artifact the pool now closes.)

Roster re-tagging (augment + lane behaviour). The omeda damage tag is too coarse
('hybrid' for nearly every caster), so the authoritative classification is (real
power type) × (playstyle from the lane's field augment, fused with the kit). `npm run
classify` emits this for all 52 heroes / 96 hero-lanes to
`data/aggregates/classifications.json`: per lane it records the field's top augment,
its classified playstyle, the kit playstyle, the fused tag, and an agreement verdict
(26 agree, 37 disagree, 24 kit-only, 9 field-only). It surfaces field-driven
corrections the kit alone misses (Eden reads ability-burst not on-hit; Bayle/Boris
are sustain bruisers; Argus mid is on-hit). The augment classifier gained
attack-speed→on-hit, barrier→sustain, damage-reduction→tank, and AoE→ability-burst
cues, cutting unclassifiable augments from 16 to 9 (the rest are genuinely non-damage
utility — mobility, XP, homing — that honestly fall back to the kit).

Scope and isolation. The above is a Gideon + Zinx vertical slice behind a
`--playstyle` flag; the other 50 heroes' paths are byte-identical (a snapshot test
guards determinism). Tests live in `engine/test/playstyle.test.ts` (10 cases); the
full harness is green at 93. Generalising the slice to the roster, the mana-aware
objective, and per-lane field cores in the retrodiction validator are the named next
steps.

## Verification summary

The loop ran three passes against the checklist before this document was finalized. Pass 1 caught three substantive problems: the worked Gideon example originally reported only the extended-fight window, which oversold the off-meta option; it now reports the burst tradeoff (A wins one-combo by 9%) alongside the uptime advantage, which is the shape every off-meta proof must have. Dropping pred.gg silently dropped skill-order data; the simulator now explicitly owns max-order derivation. And augment plus Eternal winrates turned out to be structurally unavailable from the API (no field in match payloads), so those recommendations were moved to mechanics-only with a mandatory Theory badge instead of implying observational backing. Pass 2 caught infrastructure and presentation issues: raw match storage in git was unrealistic at estimated volumes, replaced with aggregate-only persistence plus optional release-asset archives; the medium tier originally specified a managed database, replaced with a single VPS running DuckDB, which is cheaper and sufficient; and matchup output originally included predicted winrate points for unseen pairs, which reproduces the old ridge model's false-precision mistake, replaced with verdict chips and intervals. Pass 3 scored the deliverables: audit 5, data strategy 5, architecture 4 (the long pole is simulator fidelity for item passives, and the document says so), Concept A 5, Concept B 4 (it cannot see execution difficulty or macro effects, named explicitly), cost tiers 5, stack 5, UX 4 (the under-10-seconds claim holds on the spec, but only a prototype proves it). Remaining known weaknesses, stated rather than hidden: the mitigation and crit constants are unverified until the first calibration-fixture session; match-volume and API-field assumptions need one day of ingest prototyping to confirm; and lane-pressure and objective economics (Shrines) are deferred from the v1 simulator.
