# Fork in the road: observed counter-item value

Status: DESIGN (2026-10-25). Not scheduled in priorities.md yet.
Origin: squad thread (EPA-style item metric, "order matters", "2nd/3rd item
changes vs the Gideon", "segment K/D for correlation").

## 1. Problem

Counters are where the app is weakest. What exists today:

| Question | Where | Evidence |
| --- | --- | --- |
| Which **hero** beats this enemy? | v6 counter-pick flow (`ui/v6/index.html`), `feed-matchups.json`, `matchup-matrix.json` | Observed lane records + sim |
| Which **item** do I swap in vs this enemy? | `artifacts/<hero>.json` `matchups[].counterSwap` | **Simulator only.** Rests on the open calibration gate (priorities #3), so it is THEORY |
| What do players actually build at slot 2/3 vs this enemy, and does it win? | nowhere | none |

So the item side of countering has no observed evidence. This doc adds it.

## 2. What the user sees

A card per lane matchup (hero page matchup row + counter flow). The numbers
below are **illustrative mock-ups only**, not measured values:

```
YOUR 2ND ITEM vs Gideon (magical burst)              1.17.2 · ranked · 4,210 games
  Warden's Faith      +3.4 win-%   ████████  strong       31% of players
  Tainted Blade       +0.6 win-%   ██        noise        22%
  Deathstalker        -1.9 win-%   ▼         likely worse 40%
  Sim agrees: Warden's Faith (counterSwap)  ✓
```

Plus an **order fork** row when it matters (Thomas's case):

```
  Tainted Blade 1st vs 2nd into healers: 1st +2.7 win-% (strong)
```

Rules for the card:
- One number per option: **win-% vs the hero-role's usual slot-k options**,
  after the adjustments in section 5. Not "EPA points".
- A confidence word (strong / likely / noise) plus the sample size.
  Low-sample options are hidden, not shown as zero.
- "No real fork here, build what you like" is a valid, shown outcome.
- When the observed winner and the sim's `counterSwap` agree, say so. When
  they disagree, show both and label the sim side THEORY.

## 3. Definitions

- **Core item**: a completed Epic item. This uses the same set as the ordered
  3-item cores in `perk-stream.ts`, the `coreItemByGameId` map.
- **Slot k**: the k-th distinct core item by purchase `gameTime`
  (`incomeData.transactions`, `transactionType === 10`). v1 tracks k = 1, 2, 3.
- **Fork**: for a (hero, role, slot k, context) cell, the distribution of
  items bought at slot k and each option's win record.
- **Order fork**: for an item X, it was bought at slot 1 vs slot 2 (or 2 vs 3).
- **Context**: what the player is countering (section 4).

v1 does NOT condition on what was bought before slot k (the prefix).
Prefix conditioning divides samples by about 5. It moves to phase 3, and only
for heroes whose slot 1 is near-locked anyway.

## 4. Context: what you're countering

The squad framed this per opponent ("vs Grux offlane"). The data cannot
support that broadly (section 7), so context is hierarchical. Each level
shrinks toward the one below:

1. **Lane opponent hero**: the same `roleName` on the other team. Shown only
   when the cell clears the floor.
2. **Lane opponent archetype**: about 6 buckets from
   `data/aggregates/classifications.json` (`powerType` × `tag`):
   magical burst, magical sustained/rotation, physical auto-DPS,
   physical rotation/bruiser, healer/shield, tank/EHP.
3. **Enemy team threat flags**: whole-team features that drive itemization
   regardless of lane: `healers >= 1`, `magical >= 3`, `physical >= 4`.
   This covers "anti-heal because their jungler heals" even when your lane
   opponent doesn't.
4. **Hero-role baseline**: no context, all games. This is the prior.

Prerequisite: `classifications.json` is dated 2026-06-14 and covers 52
heroes, while the stream sees 55. Re-run `classify` and give every
stream hero a bucket before counting. An unbucketed hero goes to
`unknown.heroes` and is not guessed (autonomy rule 2).

## 5. Confounding (the part that makes or breaks this)

Raw "win rate when bought X at slot 2" lies in two known ways. `evidence.ts`
already notes the first for item presence:

1. **Ahead players buy faster and win more.** A slot-2 item finished at
   minute 11 is a winning player. If one option is cheaper or bought by
   stronger players, it inherits their win rate.
2. **Defensive items are bought from behind.** Players getting blown up by
   Gideon buy magical armor, so raw win rates understate defensive counters.

Mitigation in v1:

- **Compare options at the same fork only**: slot-k option A vs slot-k
  option B. Never compare against "didn't buy it". Both groups reached
  slot k, which removes the survivorship gap.
- **Stratify by tempo.** Bucket each row by the completion minute of its
  slot-(k-1) item relative to the hero-role median: fast / normal / slow /
  very slow (quartiles). Compute each option's win rate inside each
  bucket, then **standardize**: weight buckets by the cell's overall tempo
  mix, not the option's own mix. An option is then credited for winning
  more *at the same tempo*, not for being bought by players already ahead.
  For slot 1, use the slot-1 completion minute itself.
- **Report the tempo mix** per option as a diagnostic. If one option is
  bought 80% from "very slow" rows, the card says "usually bought from
  behind".

Not available in v1, so not claimed: gold/kill **difference** at purchase
time. Section 9 checks whether the stream carries it. Without it, tempo is
the proxy, and the doc and UI say so. Expect defensive counters to remain
somewhat **understated**. This is a known, signed bias, so a positive
defensive delta is conservative.

## 6. Statistic

Per (hero, role, slot k, context level, option):

1. Standardized win rate `p_opt` (section 5).
2. **Delta** = `p_opt` − the cell's standardized slot-k win rate over all
   options.
3. **Shrinkage**: beta-binomial toward the same option's delta one context
   level down (opponent → archetype → threat flag → hero-role → 0).
   The prior strength uses `momPriorStrength` from `src/evidence.ts`.
   This reuses that code, with no hand-picked K.
4. **Interval**: 80% beta posterior interval on the shrunk delta.
   - strong: interval excludes 0 and |delta| ≥ 2 win-%
   - likely: interval excludes 0
   - noise: otherwise (shown greyed, or the whole fork collapses to
     "no real fork")
5. **Floors**: option shown at n ≥ 150 at archetype level and n ≥ 300 at
   opponent level. The cell must hold ≥ 2 options above the floor to be a fork.
   These are starting values; tune them after looking at the first window, and
   record the change in `lessons.md`.

Order fork: the same machinery, with "option" = X at slot j vs X at slot j+1,
limited to items that appear at both slots above the floor.

## 7. Sample budget (why hierarchical)

The current window is 1.17.2, 2026-10-13 → 10-25: 58,235 ranked matches,
about 580k hero-role rows. Legion carry, a popular cell, is ~13.3k games.

- vs an **archetype** (~6): ~1–4k games per cell. With options at ~10–40%
  share, that is 100–1,600 per option. **Workable.**
- vs a **specific opponent** (~10–15 common lane opponents): ~300–1,500
  per cell, so 30–600 per option. **Only the top matchups clear the floor.**
- Niche hero-roles (≤ 2k games): archetype level only, often "noise".

So the card defaults to archetype, upgrades to the specific opponent when
the floor allows, and says which one it is showing.

## 8. Pipeline and data policy

**No new API traffic for v1.** `npm run perks` already reads every ranked
stream row daily, including `incomeData.transactions` with `gameTime`, both
teams' `playerData`, `roleName` and `teamId`. The fork counters are new
accumulators in that same loop:

- New state file `data/aggregates/fork-stream.json` with the same cursor
  semantics and patch window as `perk-stream.json`, resuming daily. Keep it
  separate so the perk file stays small.
- `forksFrom` timestamp: counting starts at the first run after this ships.
  **Forward-only, no backfill.** A backfill to the patch start is ~13k
  extra requests for 12 days of data. That is not justified when the
  daily run fills the window anyway; the build cores did the same
  (`coresFrom`).
- Patch boundary: reset at a new patch, like the perk window. Never pool
  across versions.
- Ranked only. A `gold` sub-cell like the perk stream's (Gold+ players) is
  counted but not shown until it clears the floors.

Size estimate: 83 hero-roles × 3 slots × (~6 archetypes + ~15 opponents +
3 flags + 1) × ~10 options × 4 tempo buckets ≈ 250k counters before pruning.
Store only `{n, w}` per tempo bucket, prune options with n < 5 at
patch end, and write the consumable artifact gated at the floors. That
artifact goes to `data/artifacts/forks.json` or per-hero
`artifacts/<hero>.json` `forks`. It is computed by the engine (zero-API),
consumed by the UI, and the raw state stays out of the UI.

Refresh chain: `perks` (now also writes fork-stream) → `artifacts` → the UI
reads it. No copy pass in v1. Cards are numbers plus fixed templates. A
coach line can come later through the verified copy flow.

## 9. Phase 2: K/D after the spike (the closest true EPA analog)

Win/loss is a noisy outcome 20+ minutes after the purchase. A cleaner
outcome for "did this item work vs this opponent" is the **lane kill
difference in the N minutes after the slot-k item completes, minus the
same window before it**, compared across options at the same fork.

Requirement: kill events with `gameTime` and both sides' players.
- Per-match GraphQL `heroKills` has this (`predgg-match.ts`). The
  `feed-matchups` sample (~25.5k matches this window) already pulls
  per-match detail. **Verify** whether it keeps kill timelines; if so,
  phase 2 runs on that sample at zero extra cost.
- **Verify** whether the public stream rows carry any kill timeline or
  gold-diff field. Check one cached page; do not run a new pull just for this.
  If they do, both phase 2 and the section 5 gold-diff adjustment become
  available at full volume.

If neither holds, phase 2 is parked. It is not estimated.

## 10. Validation (harness)

- **Unit:** slot extraction from transactions (dedupe, ignore type 11
  starting items and sells), tempo bucketing, standardization math,
  shrinkage chain, floor gating.
- **Known-answer checks** (fail the method, not the item, if wrong):
  - Anti-heal options should show non-negative deltas under the
    `healers >= 1` flag on heroes that commonly buy them.
  - Magical-armor options should show non-negative deltas vs the magical
    burst archetype.
  These are sanity checks, not tuning targets. If they fail, investigate
  the confounding handling before shipping anything.
- **Placebo:** shuffle archetype labels across rows. Context deltas must
  collapse to noise. If they don't, the pipeline is leaking tempo or sample bias.
- **Agreement audit:** observed fork winner vs sim `counterSwap` per
  matchup, reported like `agreement-audit.json`. Disagreements are where
  the sim gets calibrated, which feeds priorities #3.

## 11. Out of scope

- A full win-probability model (football-EPA proper). It needs state
  timelines (gold diff, towers by minute) at volume. Revisit if section 9
  finds them in the stream.
- An item value for every item in every context. The card only answers
  forks that real players face, at slots with real alternatives.
- Prefix-conditioned forks ("given Malady first, slot 2 is...") until phase 3.

## 12. Milestones

1. **Prereq:** refresh `classifications.json` for all stream heroes and
   define the ~6 archetype buckets plus the 3 team-threat flags (tests).
2. **Count:** fork-stream accumulators in `perk-stream.ts`, forward-only
   (tests on fixture rows).
3. **Compute:** engine module `src/forks.ts` for standardization, shrinkage,
   gating, order forks, and the placebo + known-answer harness checks.
4. **Ship v1 UI:** fork card on the hero matchup rows and the counter flow,
   with the sim-agreement badge. Wait until the window holds ~5 days of
   counts so the first cards aren't all "noise".
5. **Phase 2:** K/D-after-spike, gated on the section 9 verification.
6. **Phase 3:** prefix-conditioned forks for locked-slot-1 heroes.

## 13. Open questions for the maintainer

- Archetype buckets: is 6 the right granularity for how the squad thinks
  about counters ("vs burst mage", "vs healer")? Merging tank into
  physical rotation would buy sample.
- Should the order fork ship in v1 (cheap, and it directly answers Thomas)
  or wait for phase 3?
- Floors (150 / 300) are starting values. Is "fewer, trustworthy cards"
  preferred over "more cards marked noise"?

## 14. PoC findings and decisions (2026-10-25, 8,331 ranked matches, 1.17.2)

Measured on the PoC extract (Oct 22 18:02 to Oct 24 10:29 UTC). The scripts behind
the band and coverage numbers were scratch analyses; fold them into
`npm run fork:poc` before relying on them.

**Method fixes found by the PoC (committed):** compare each option with the
rest of its cell, not with a cell average that contains it, and use the
variance of the smoothed per-stratum rate. Before the fix, ~4% of null
options fell outside the 80% interval instead of ~20%, which hid real
effects. A harness test pins the calibration.

**Stream fields (answers section 9):** each public-stream player row carries
`goldEarnedAtInterval` (index = minute + 3) and the match carries `heroKills`
with `gameTime`. The section 5 gold-diff adjustment and the section 9 swing
are both available at full volume, with no per-match GraphQL needed.

**Expert band = Plat+ (current ladder tier >= 3).** Two signals per card:
- *What experts build:* how much more often Plat+ players buy the item into
  this context than otherwise. Choices converge with far fewer games than
  win rates do.
- *Does it win:* the all-ranks, state-adjusted win delta (section 6).

Evidence for Plat+:
- Higher ranks counter-build more. Plat+ vs below Gold is clearly higher on
  all three checks: magical armor, physical armor and anti-heal.
- Diamond+ reacts most but is too thin: its per-item signals split-half
  correlate at 0.00 over 12 hero-roles.
- Plat+ is the most repeatable cut. Split-half r is 0.41 for Plat+, 0.26 for
  Gold+, 0.29 for all ranks, and 0.34 for Diamond-else-Plat. At about 2x the
  data, Plat+ projects to r ~0.73.
- Gold and Platinum buy rates are nearly identical, but Gold+ per-item
  signals are less repeatable.

**Lane-aware context.** Contrasting the lane opponent's damage type does not
exist for whole lanes. Carry opponents are almost all physical; mid and
support opponents are almost all magical. So popular, winning picks got no
card: Revenant carry (58% in Plat+), Riktor support (58%), The Fey mid (60%).
The cell's win rate did not differ between covered and uncovered hero-roles
(53.9% vs 53.9% in Plat+), so card coverage says nothing about viability.
Use the enemy-team context for those lanes (magic-heavy team, healing team,
tanky front line), and keep the lane opponent type for offlane and jungle.

**Rare and off-role picks (maintainer rule).** Skip hero-roles under 100
Plat+ games and under 15% of the hero's games, UNLESS they are winning,
because they may be the next build to catch on. Rare samples make "winning"
mostly luck. On the PoC window, 22 of 100 rare picks won both halves of the
window, against ~25 expected from coin flips, and 9 of 107 cleared an 80%
bar above 50%, about what luck alone gives. So winning is promoted in two
steps:
1. *Watchlist* (not shown as a recommendation): the luck-adjusted win rate,
   pulled toward 50% by 100 games, is above 52%.
2. *Rising* (shown, labeled as emerging): it KEEPS winning in fresh games
   collected after it was flagged, with at least 7 more days and a credible
   lead in that new data alone. Data that picked the candidate is never
   used to confirm it.

The PoC watchlist, which is unconfirmed and should be re-checked once the
daily run has fresh data: Argus offlane (42/66), Revenant offlane (30/46),
Drongo offlane (31/49) and Twinblast midlane (50/86), plus several with
fewer than 20 games.
