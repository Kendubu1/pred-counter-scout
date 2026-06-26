# Ranked vs. ranked+standard — augment/Eternal/crest field evidence

**Date:** 2026-06-26 · **Author:** session investigation (no API key used for analysis)

## Why

The hero pages show field evidence for augments, Eternals, and crests (win% + game
counts, e.g. "Lotus 56.2% · 3,895 games"). That evidence is pulled from pred.gg with
`gameModes: [RANKED, STANDARD]` (`engine/src/ingest/augments.ts`), so it mixes ranked
ladder games with normal-queue (standard) games. The maintainer wants it **mainly
ranked** and asked for a pull to **see the split** before switching.

This is the informational pull. The actual switch to ranked-only is tracked as
**backlog item #12** in `priorities.md`; this report is the data that decision rests on.

## Method

- Re-pulled the same query with `gameModes: [RANKED]` only into a scratch file and
  compared it pick-by-pick against the committed ranked+standard snapshot.
- **Caveat:** the committed R+S snapshot is from **2026-06-20**; the ranked-only pull is
  from **2026-06-26** (6 days newer). Absolute counts aren't a clean subtraction, so the
  split is read from **per-pick ranked÷combined ratios** (the 6-day drift largely cancels
  in the ratio) and stated as approximate. The scratch ranked file and the temp ingest
  script were deleted after this report (exploratory, not committed).

## Headline findings

### 1. Standard is roughly half of each pick's sample — and the bulk of raw volume

| Measure | Ranked share | Standard share |
|---|---|---|
| Per-pick **median** (ranked ÷ combined, 1,046 picks ≥50g) | **~51%** | ~49% |
| Aggregate **sum** of all pick game-counts | ~35% | **~65%** |

The per-pick median says a typical augment/Eternal/crest row is about **half ranked, half
standard**. The sum is much more standard-weighted (~65%) because a handful of
mega-popular **base crests** (e.g. Marksman Crest at 500k+ games) are played far more in
normal queue and dominate the raw total. Either way: **standard is a large fraction of
the current evidence** — the maintainer's instinct is correct.

### 2. Standard inflates winrates — most severely on crests

Ranked winrates run **broadly lower** than the combined numbers (the ladder is a harder
field). The effect is small for most Eternals (~0.5–2 pp) but **large for crests**, where
the combined number is heavily diluted by normal-queue games:

| Pick | combined (R+S) | ranked only | shift |
|---|---|---|---|
| murdock/carry · Marksman Crest | 36.0% (531k) | 27.4% (64k) | **−8.7 pp** |
| drongo/carry · Marksman Crest | 35.6% (317k) | 27.4% (47k) | −8.2 pp |
| kira/carry · Marksman Crest | 35.2% (411k) | 27.7% (56k) | −7.4 pp |
| gideon/midlane · Magician Crest | 43.0% (631k) | 36.7% (61k) | −6.3 pp |
| eden/midlane · Vermis (Eternal) | 48.4% (4.3k) | 42.7% (1.1k) | −5.7 pp |

So the standard queue isn't just *adding* games — it's **changing the answer**, especially
for crest rows. That's the strongest argument for going ranked-only.

### 3. Going ranked-only drops ~1 in 8 Eternal/crest rows below the page's display floor

The hero page only shows Eternals and crests with **n ≥ 300** games
(`ui/v6/index.html:1046`, `:1257`). Re-counting ranked-only:

| Category | qualified in R+S | fall below 300 ranked-only |
|---|---|---|
| Eternals | 480 | **63 (13%)** |
| Crests | 375 | **46 (12%)** |

A real but manageable loss. Mitigations for the switch (backlog #12): lower the ranked
threshold, or fall back to ranked+standard for thin picks with an "(incl. standard)" note.

### 4. Lotus — the row the maintainer cited

Lotus runs **~0.5–2 pp lower** in ranked across every hero-role, and samples stay healthy
on the popular ones:

| Hero / role | combined (R+S) | ranked only |
|---|---|---|
| countess/midlane *(the cited row)* | 56.2% · 3,895 g | **55.2% · 2,756 g** |
| adele/support | 56.9% · 11,772 g | 56.2% · 4,597 g |
| renna/midlane | 57.1% · 10,963 g | 55.3% · 7,398 g |
| sparrow/carry | 60.1% · 7,016 g | 59.5% · 5,804 g |

So the live "Lotus 56.2% · 3,895 games" on countess/mid becomes **55.2% · 2,756 games**
ranked-only — still well above the 300-game floor, slightly lower win%, ~30% fewer games.

## Recommendation (feeds backlog #12)

**Switch the augment/Eternal/crest evidence to ranked-only.** The split shows standard is
a large share of the sample and **materially inflates winrates**, especially on crests
(up to ~9 pp). Ranked-only keeps healthy samples on the popular picks; ~12–13% of
Eternal/crest rows drop under the 300-game floor, handled by lowering the ranked threshold
or an "(incl. standard)" fallback for thin picks. Coach's `playerProfile.ts` mixes modes
too — a separate decision, out of scope here.
