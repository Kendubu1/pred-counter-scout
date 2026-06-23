# Predecessor Scout — V6 Senior-Principal Review

**Date:** 2026-06-20
**Target:** the v6 surface (`ui/v6/` — Build Lab / Squad / Coach) backed by the
`engine/` v5 kit-math engine and its committed artifacts.
**Method:** four parallel deep-read passes (v6 UI, engine fidelity, cross-hero
artifact trends, and external public benchmarking with citations), then a **fifth
independent clean-room pass** that had not seen the others' conclusions and was
tasked with red-teaming severity inflation. Findings below are the **reconciled**
result; where the two review lines disagreed, the disagreement is stated in-line.

> This report is the deliverable. No application code was modified. Nothing under
> the frozen `ui/v2/` was touched.

---

## 0. Why this review exists, and the thing you actually noticed first

You opened the **v6 page** directly on GitHub and asked, reasonably, *"why do we
have so many paths?"* That confusion is the headline finding, not a side note.

The repo now carries **five UI generations side by side** — `ui/v2` (the frozen,
known *pre-1.14* live site), `ui/v3` and `ui/v4` (literally titled "prototype"),
`ui/v5` (a partial `build-lab.html`), and `ui/v6` (Build Lab + Squad + Coach) —
plus orphaned loose pages at the `ui/` root (`team-lab.html`,
`learn-eternals.html`, `patch-notes.html`, `design-review.html`) and a pile of
loose `*.js` engines. **`ui/v6/` is the only UI wired to the live engine
artifacts** (`data/artifacts/*.json`, `matchup-matrix.json`), yet the front door
(`/index.html`) still redirects to `ui/v2/`. To reach v6 you have to type its path
yourself. That is exactly why it feels disconnected — the product you're building
is not the product the site serves. **See Finding A1; it is the cheapest
high-impact fix in this report.**

---

## How to read a finding

Each finding carries **Severity** (Blocker / High / Medium / Low), **Effort**
(S/M/L), a **Where** (`path:line`), the **problem** with a concrete example, **why
it matters to the end user** (especially a brand-new player), and a **specific
recommendation**. A short **"What's already right — don't regress"** section
follows the findings; please read it before acting, because several of this
product's *strengths* look like defects to a careless reviewer.

---

## A. Path & version consolidation

### A1 — The front door opens the frozen pre-patch site, not the engine-backed v6
**Severity: High · Effort: S · Where:** `index.html:1`, `ui/index.html:1`
The root is `<meta http-equiv="refresh" content="0;url=ui/v2/">`. Per `CLAUDE.md`,
`ui/v2` is frozen and its numbers are *known pre-1.14*; `ui/v6` runs on the current
patch via the engine. A first-time visitor lands on stale data and never discovers
v6, which has no inbound link. Both review lines rated this High/Blocker-adjacent
and independently called it the highest-impact, lowest-effort fix.
**Recommendation:** repoint `index.html` and `ui/index.html` to `ui/v6/` (or a
one-screen chooser). Follow SPA-migration hygiene from the benchmark: redirect
**per-route, not blanket-to-homepage**, keep retired versions reachable behind the
redirect for a grace window, then delete `ui/v3`–`ui/v5` and the orphaned loose
pages. (Source: Siteimprove migration guide; Stephan Spencer redirect best-practice
— see References.)

### A2 — Decide the fate of the orphaned satellite pages before cutover
**Severity: Medium · Effort: M · Where:** `ui/team-lab.html`, `ui/learn-eternals.html`, `ui/patch-notes.html`, `ui/design-review.html`
v6's nav has only three destinations (Build Lab / Squad / Coach). Team Lab and
Learn-Eternals are genuinely useful and have no v6 equivalent; the others are
v2-era or a design mockup. If you retire v2 you silently drop Team Lab and the
Eternals primer.
**Recommendation:** port Team Lab and Learn-Eternals into v6's nav (or explicitly
decide to drop them); delete `design-review.html` and `patch-notes.html` or move
them out of the served path.

### A3 — Two link conventions for the same destination across v6 pages
**Severity: Low · Effort: S · Where:** `ui/v6/coach.html:140` (`index.html?hero=`) vs `ui/v6/squad.html:300` (`./?hero=`)
Harmless today (both resolve) but fragile. Standardize on one.

---

## B. Per-page v6 UX & consistency

### B1 — The THEORY badge means the same thing but *looks* different on each page
**Severity: Medium · Effort: M · Where:** `ui/v6/index.html:107,305,730` (blue pill + real tooltip) vs `ui/v6/coach.html:159` (gold pill, no tooltip) vs `ui/v6/squad.html:183` / `coach.html:352` (plain prose)
The single most important trust signal renders three ways: a blue pill with a
constant-by-constant explainer on Build Lab, a **gold** pill (gold elsewhere means
*warning/off-meta*) with no explainer on Coach, and as running text on Squad. A new
player learns "blue THEORY = unproven math," then can't tell if the gold one means
the same or something worse.
**Reconciliation:** the independent pass stresses that the *concept* is consistent
and well-disclosed (a strength); the defect is purely the **visual grammar** and
the missing explainer on two pages. Agreed — this is Medium, not the High the first
pass gave it.
**Recommendation:** extract one shared `.badge.theory` (blue) with the same
tap/hover explainer and the THEORY one-liner (`index.html:386`); use it verbatim on
all three pages. Add the definition to the Squad/Coach footers (a user can deep-link
straight into a Coach report from `squad.html:158` and never see it defined).

### B2 — The "numbers one tap away" affordances are desktop-only and keyboard-dead
**Severity: High · Effort: M · Where:** `ui/v6/index.html:275,686,1059` (item popup), `:107,730` (THEORY tooltip), `:474` ("kill window" dot tooltip)
The product promise is *imperative on the surface, numbers one tap away*. But the
item detail popup triggers are `<div data-ipop>` opened by a document click listener
— no `tabindex`, no `role="button"`, no Enter/Space — so keyboard users can't open
any item's stats or its "why" line. The THEORY explainer and the "kill window"
definition live **only** in `title=` tooltips, which never fire on touch — i.e.
invisible to the majority mobile audience of a MOBA companion. The modal itself is
done right (`role="dialog"`, `aria-modal`, Esc).
**Recommendation:** make item triggers real `<button>`s (or add `tabindex`+`role`+
keydown), move focus into the dialog and restore on close; convert the THEORY and
"kill window" tooltips to a tap-to-open popover (reuse the existing `ipop` pattern).

### B3 — Primary hero navigation is non-semantic clickable `<div>`s
**Severity: Medium · Effort: M · Where:** `ui/v6/index.html:671,675` (`.hcard`), `:313` (`.mp`), `:284,515` (`.lrow`)
Picking a hero — the main nav action — is `<div class="hcard" data-slug>` with an
`onclick`, no `href`/`role`/`tabindex`. Keyboard/screen-reader users can't Tab to or
activate a hero. (Squad/Coach do this correctly with `<a>`/`<button>`, so quality
diverges across the v6 pages.)
**Reconciliation:** first pass said High, independent said Medium and noted that
`alt=""` on the *decorative* hero/item images beside text labels is actually
**correct** — so the real a11y debt is interactive semantics, not alt text. Settled
at Medium.
**Recommendation:** render hero cards/rows as `<a href="?hero=slug&role=...">` (the
router already reads those params at `index.html:1163-1169`) — free keyboard support
via progressive enhancement.

### B4 — Verdicts encoded by color alone
**Severity: Medium · Effort: M · Where:** `ui/v6/index.html:196-197,318,473-474`
Kill-window dots (you/even/enemy) and winrate direction are green/gray/red only;
the text is in a hover `title` (touch-invisible). ~8% of male players can't reliably
separate the red/green that carries the central matchup verdict.
**Recommendation:** put a glyph inside the dots (✓ / – / ✗) and a small text legend.

### B5 — Coach stamps a blanket THEORY badge over empirical pred.gg data
**Severity: Low · Effort: S · Where:** `ui/v6/coach.html:159` vs `:183-186`
The post-game card wears one THEORY pill, but the same card shows *empirical*
pred.gg lane winrates over thousands of games — which are not theory. This undersells
real data and muddies the THEORY signal used (correctly) elsewhere. *(New in the
independent pass.)*
**Recommendation:** scope the THEORY badge to the sim-derived rows (kill-window,
counters), not the whole card.

### B6 — Shared page scaffolding is triplicated; Squad re-implements engine scoring in the browser
**Severity: Low · Effort: M · Where:** `ui/v6/index.html:409-436`, `squad.html:407-431`, `coach.html:469-493` (copy-pasted `buildSubnav`/`esc`/`pct`); `squad.html:253-272` (`duoBonus` hardcodes `(shrunkWr-0.5)*0.6`, "matches the engine optimizer")
Maintenance/drift risk, not user-facing. The client-side re-scoring will silently
desync if the engine's weighting changes.
**Recommendation:** factor a tiny zero-API `scout-common.js`; precompute ranked
lineups into `squad.json` instead of re-scoring client-side.

---

## C. New-player actionability ("explain, don't throw numbers")

This is where the product most often violates its own stated rule — *imperative
first, mechanism second, numbers one tap away* — and it's the lens you cared about
most. The benchmark backs the rule: best-in-class beginner UX (Mobalytics) leads
with "what to do / what to work on next" and defers numbers behind progressive
disclosure (References).

### C1 — Raw, unitless sim integers leak into the default view
**Severity: High · Effort: M · Where:** `ui/v6/index.html:928-932` (proof chips: `burst 1840 · 20s vs bruiser 6200 · auto DPS 2004`), `:241,943,982-987` (five-digit `headlineValue` on stage bars)
These are unitless, baseline-free numbers — meaningless to a new player and, per the
calibration policy, they're *unverified-constant* outputs shown as bare integers.
There's a good plain-English `.coach` line right above (`:927`) that they undercut.
**Reconciliation:** both passes flagged this; severity High for the proof chips,
Medium for the stage values. Note the numbers tables *do* correctly sit behind a
`<details>` (`:977`) — the fix is to send these stragglers there too.
**Recommendation:** move absolute integers behind the existing "The numbers"
expander; keep only comparative deltas/percentages on the surface, with the `.coach`
imperative as the hero of the card.

### C2 — Statistician jargon shown to beginners: "shrunk winrate", "meta score", "out-simmed", "kill window"
**Severity: High (copy) · Effort: S · Where:** `ui/v6/index.html:625` (tooltip "shrunk winrate"), `:860` ("shrunk toward the role's pick-weighted mean"), `:510` ("out-simmed"), `:474,563` ("kill window")
Coach already phrases this well — `coach.html:398` "winrate per role, **thin samples
adjusted**". Build Lab does not.
**Recommendation:** standardize on the Coach phrasing everywhere ("adjusted for
sample size"); drop literal "shrunk"/"pick-weighted mean" from user strings; define
"kill window" once, prominently ("the minutes when your combo can actually kill
them"), and prefer "loses the 1v1" over the invented "out-simmed."

### C3 — Matchup "gameplan" is a verdict-bucket template: **7 distinct strings cover all 312 matchups**
**Severity: High · Effort: M · Where:** `data/artifacts/*.json` `matchups[].gameplan`; generator `engine/src/artifacts.ts` (verdict→sentence); example `data/artifacts/sparrow.json:486` (Murdock and Drongo get byte-identical gameplan *and* counterSwap)
Across 52 heroes × 6 matchups, two templates cover **225 of 312 rows (72%)**; 41 of
52 heroes have ≤3 unique gameplans. The text keys off a win/lose bucket, not the
enemy's kit, so it never names the opponent and reads as filler — eroding trust in
the whole matchup feature.
**Recommendation:** inject at least one enemy-kit-specific clause (their key threat
ability / power-spike timing — available from the kit data) into the template, or
vary by matchup archetype so identical strings can't recur across clearly different
opponents.

### C4 — AI augment copy number-dumps: **71% of lines cite a raw winrate**, many with no action
**Severity: Medium · Effort: S · Where:** `data/aggregates/augment-reviews.json` `heroes.*`; e.g. `akeron/jungle` "Skip for ganking; 39.8% winrate is lowest.", `sparrow/midlane:113` "Avoid Endless Hunt at 50.8% winrate…"
202 of 286 hero-augment lines cite a winrate; many state a number with no "so do X."
The **eternals** section of the *same file* is genuinely good action copy — so this is
an internal, fixable inconsistency, and the eternals prompt is the model to copy.
And given Findings D3/G2 (these augments are largely unmodeled / THEORY), the precise
winrate projects false confidence.
**Recommendation:** update the augment-hero copy prompt to **require an action
clause** and demote the raw winrate to support; keep the existing `copy-verify.ts`
ground-check. (Same ground-check makes this safe — see References to D4.)

### C5 — The "at the gate" augment block is the densest panel on the site, shown first
**Severity: Medium · Effort: L · Where:** `ui/v6/index.html:816-824,832-839`
The first thing on a hero page mixes "20s fights +6%", "burst +12%", "(provisional
constant)" and a sim-vs-field reconciliation sentence that asks the *user* to
arbitrate ("our kit math prefers X … weight the field until calibration lands"). The
one imperative (the green ✓ top augment) is buried.
**Recommendation:** collapse the sim-vs-field reconciliation into a "why these
differ" expander; surface only "Take X (best here)" as the headline.

---

## D. Engine sim ↔ meta fidelity & gaps

**Does the sim explain the meta?** Partly, and **honestly** — every unverified
constant is flagged, every unmodeled effect carries a reason, everything is stamped
THEORY. The problem is not dishonesty; it's that some of what the engine *already
knows about its own limits is computed and then hidden from the user.*

### D1 — The headline build has **no** field-plausibility cross-check, so one niche opener leads 65% of heroes
**Severity: High · Effort: M · Where:** `engine/src/artifacts.ts:276-285` (`headlineBuild = generateBuilds(...)[0]`, no evidence gate) vs `:444` (off-meta candidates *are* gated on `winDelta<0 & n>=20`); evidence: `data/artifacts/*` first item
Across **34 of 52** heroes the sim's first item is **Viper** (22) or **Spectral
Schematics** (12); in **29 of 52** that opener has <10% field playrate while a
≥20%-playrate option sits in the same list (e.g. `revenant` Viper at 0.3% vs 74.8%
available; `crunch` Viper 0.3% vs 49.2%; `sparrow.json:36` Viper 7.6% listed above
Vanquisher 40.8%).
**Reconciliation — important:** the independent pass correctly warns that "make the
sim mirror the field" would be *wrong* — popularity deliberately never feeds the
objective (`search.ts:1`), and that's a strength. The defect is narrower and real:
the **off-meta promoter already has an evidence gate, but the headline build does
not** — the exact `Deathstalker`-class blind spot the gate was built to catch. So
the fix is consistency, not capitulation.
**Recommendation:** run the same `itemWinDelta<0 && n>=20` check over the *headline*
build's items in `buildRoleView`; when the sim-optimal opener is field-rejected,
demote it or surface both with an explicit "sim-pick vs field-pick" label.

### D2 — The agreement audit is computed every run, then dropped before the page
**Severity: High · Effort: M · Where:** `data/aggregates/agreement-audit.json` (no consumer in `engine/src/` except its generator)
The audit reports `avgCoreRecall 0.575` (the optimizer reproduces ~58% of field
cores), `exactTrioHit 5/51`, and `coreRecall: 0` for **Wraith, Maco, Phase** (they
build *none* of their field core; Wraith's misses — Soulbinder/Noxia/Wraith Leggings
— are items the sim *does* model, i.e. a `fixable` valuation bug, not a `blocked`
gap). Per-item disclosure on the page is excellent; the **aggregate** "this hero's
sim build shares little with what wins" is never shown.
**Recommendation:** load `agreement-audit.json` in `buildRoleView` (mirror
`loadPredggBuilds`); when `coreRecall` is low, add a `confidence.notes` line naming
the missed items and whether each is `fixable` (engine bug to file) or `blocked`
(unmodeled mechanic). This closes the largest *disclosed-but-hidden* inconsistency
with no new math and no API calls.

### D3 — Modeling coverage leaves whole high-value buckets invisible to the search
**Severity: Medium · Effort: L · Where:** `engine/fixtures/effects.json`, `augments.json`
Verified counts: **item passives** 40 fully modeled / 33 partial / **60 fully
unmodeled**; **augments 46/156 modeled** (110 unmodeled, used only as playstyle
classifiers); **eternal majors 8/12 modeled**. The silent-risk buckets are
team-side/aura items (Xenia, Enra's Blessing — credited at zero, so enchanters get
under-built), execute/health-gated finishers (Malady, Storm Breaker, Overlord), and
proximity auras. For sustain supports and execute-bruisers the sim-optimal build can
omit the very item the field wins with.
**Recommendation:** when the headline build omits a field core *because* its passive
is unmodeled (`blocked`), say so on the page (ties into D2). Track modeled-coverage
as a harness metric so the gap is visible per release. Prioritize modeling the
highest-playrate unmodeled items/augments per role.

### D4 — Unverified constants are correct to leave flagged — but the page can't tell the user *which number* is shaky
**Severity: Medium · Effort: S · Where:** `engine/fixtures/calibration.json:5-10` (mitigation K), `:21-31` (crit mult 1.75 [1.6,1.8], AS formula), `:51-56` (AS cap, unit conflict noted); surfaced flat at `artifacts.ts:673`
Leaving these `verified:false` and flagged is **mandated by policy, not a defect**
(see "don't regress"). The usability gap: `confidence.unverifiedConstants` is a flat
list, so a crit ADC whose entire ranking rides on an unverified 1.75 sees one
confident number. The benchmark note (patch 1.14 made %-armor-pen multiplicative —
which the engine already encodes) confirms the engine tracks real mechanics; the K
value is the one the data actively contradicts (implied K rises 122→150 with armor),
biasing every EHP/survivability output toward armor.
**Recommendation:** tag each objective with the constants it depends on so the UI can
mark crit/DPS/EHP numbers as extra-provisional; surface the existing robustness
sweep — if a recommendation flips between K=100 and K=150, downgrade it. Practice-mode
measurement of K, then crit/AS, is the highest-value calibration work (the
`CALIBRATION-CHECKLIST.md` already specifies how).

### D5 — One confidence level for everything: THEORY can't discriminate a thin build from a solid one
**Severity: Medium · Effort: M · Where:** all `data/artifacts/*` `confidence.level == "THEORY"` with identical constants/notes
**Reconciliation — read carefully:** the independent pass flags that calling THEORY
itself a bug would be *wrong* (it's the policy-correct label while constants are
unmeasured). The legitimate UX point survives that test: a label applied identically
to all 52 heroes carries no *comparative* information.
**Recommendation:** keep the THEORY flag; add a **secondary evidence-strength signal**
(sample-size tier / `evidenceN`) so heroes are differentiable today, and let the
THEORY flag collapse naturally once constants are calibrated.

---

## E. Build categorization with our own titles

### E1 — Builds have no human-readable titles anywhere — only recycled objective labels
**Severity: High · Effort: M · Where:** `engine/src/search.ts:38-49` (`ARCHETYPE_LABELS`), `:196-203` (tagging); schema `engine/src/artifacts.ts:59-72` (no `title`/`name` field); UI `ui/v6/index.html:900-913`; data `data/artifacts/sparrow.json:72`
Confirmed across **52/52** heroes: a build carries only `archetypes: string[]` from
the objective vector ("sustained DPS", "skirmish uptime", "extended fights") — the
*engine's internal corner names*, not the vocabulary players use. Sparrow and Terra
both reduce to `["sustained DPS"]`; Narbash and Zinx both `["heal/shield output"]`,
so unrelated heroes' builds look interchangeable. The meta-build list (`index.html:900`)
shows builds with **no title at all** — just an item-icon strip + winrate.
**Benchmark:** human-readable, archetype-encoding titles are the industry norm —
MOBAFire titles like *"Lethality / Burst Caitlyn Mid (+Crit)"*; even Predecessor's
own pred.gg/omeda.city title every build (though flavorfully, without a mechanical
tag). A `<Lethality | On-Hit | AP Burst | Crit | Bruiser | Tank> + <role>` scheme is
precisely the gap (References).
**Reconciliation:** first pass rated this High (a clear product gap vs the norm);
independent rated it Medium ("clearest single product gap" but lower urgency than the
broken/hidden items). Recorded as High given it's a named ask and a norm miss; treat
as High-value/Medium-urgency in sequencing.
**Recommendation:** add `title: string` to the `build` object (`artifacts.ts:59`) and
a **pure, deterministic** `buildTitle(top, kit, items)` in `search.ts` next to
`ARCHETYPE_LABELS`, called from `buildRoleView`. All inputs already exist at that
point: power/defense prefix from the item stat mix on `top.items` (high crit_chance +
low health → "Glass-Cannon"; health+armor+offense → "Bruiser"; lifesteal-dominant →
"Lifesteal"); core noun from the top archetype corner (burst→"Burst", sustained
DPS→"DPS Carry", heal/shield→"Enchanter", survival→"Frontline"); signature-item
suffix (any anti-heal item → "Tankbuster"; execute item → "Executioner"). No LLM
needed. If you do want LLM polish, route it through `copy-verify.ts` so a title can
only cite items/numbers present in the cell. Render the title above the icon strip at
`index.html:903`.

---

## F. Eternal minor sub-options

### F1 — The minors are confirmed real, computed by the engine, and then thrown away before the artifact
**Severity: High · Effort: M · Where:** data `data/game-data/eternals.json` (1 major + `minorSlot1[3]` + `minorSlot2[3]` per Eternal = 72 sub-options); engine `engine/src/eternals.ts:176-241` (`selectEternalLoadout`/`pickMinor`) — **consumed only in `engine/src/cli.ts:186-191`**; artifact `engine/src/artifacts.ts:510-530` builds `eternals` from `rankBlessings` filtered to `^eternal:[^:]+:major$` (`eternals.ts:41-42`) → **majors only**; UI `ui/v6/index.html:842-869` renders the major + winrate, no minor picker
**Benchmark — confirmed against the official patch 1.14 notes:** an Eternal is **1
Major Blessing + 2 Minor Blessing slots, each minor a 1-of-3 choice** from sets
unique to that Eternal. So the minors are *half* of an in-draft decision the tool
exists to answer. The engine already does the hard part well: `pickMinor` scores each
minor by its **marginal sim gain conditioned on the chosen major**
(`eternals.ts:222`), falling back to the curated `recommend.default` when the minor's
mechanic is unmodeled (only ~9 of 72 minors are modeled). But `selectEternalLoadout`
is wired only to the CLI; the `RoleView.eternals` schema (`artifacts.ts:74-99`) has no
minor fields, so the UI never sees it. Confirmed across **52/52** heroes: majors only,
in artifact *and* AI copy. (The dead `.eternal-row`/`.eternal-alts` CSS at
`index.html:181-187` is a vestige of a prior design that surfaced alternatives.)
**Why it matters:** Coach even sends users here — `coach.html:422` "engine: take X …
eternal + build page →" — but the build page has no minor guidance to land on.
**Recommendation (both passes agree, this is a top-two fix):**
1. **Plumb it:** in `buildRoleView`, call `selectEternalLoadout(...)` and add a
   `loadout: { major, minor1{name,modeled,deltaPct,note}, minor2{…} }` to the
   `RoleView.eternals` schema — the `MinorPick` shape already carries those fields.
2. **Render it:** show the recommended minor pair under each top Eternal on the
   Game-plan tab (and a thin 1-of-3 picker); remove or rewire the dead CSS.
3. **Copy it:** extend the Eternal copy pass (`engine/src/ingest/augment-review.ts`)
   to also take the two selected minor names + their `desc` + (for modeled minors)
   `deltaPct`, feeding those numbers to `buildAllowed` so `verifyLine` can ground a
   line like "pair with Mind Rot for +X% rotation." Unmodeled minors get a
   mechanics-only line — exactly how the major's unmodeled path already works. No new
   estimation; the verifier is unchanged.

---

## G. Cross-hero systemic trends

These are the highest-leverage fixes because one change touches every hero. (Several
restate findings above as *trends*, with the per-hero evidence.)

- **G1 — One niche opener for a whole damage class.** 65% of heroes open on Viper or
  Spectral Schematics; 29/52 lead with a <10% playrate item. → root cause + fix in
  **D1**.
- **G2 — Generic build identity everywhere.** 52/52 builds have no title; the
  archetype vocabulary is tiny and shared across unrelated heroes. → **E1**.
- **G3 — Eternal minors uniformly absent.** 52/52 heroes, artifact and copy. → **F1**.
- **G4 — Matchup gameplans are templated.** 7 distinct strings / 312 rows. → **C3**.
- **G5 — Confidence label can't discriminate.** 52/52 identical THEORY block. → **D5**.
- **G6 — Augment guidance thin + winrate-led.** ~70% of augments unmodeled; **20 of
  53 hero-roles have zero modeled augments** (e.g. `sparrow.json:198,207`), so the
  copy leans on bare winrate. → **D3 + C4**.
- **G7 — Item reviews are a glossary, not buy-advice.** `data/aggregates/item-reviews.json`:
  only 8 of 180 lines start with an action verb; text is per-item, not per-hero.
  **Severity: Low** — fine as a glossary; if you want "why this item in *this* build,"
  generate it at the build-entry level rather than reworking the shared glossary.

---

## What's already right — **do not regress** (from the clean-room skeptic pass)

Several things a careless reviewer would "fix" are this product's backbone. Leave
them:

- **Uniform THEORY labeling is correct, not a bug.** It's mandated whenever an output
  touches an unverified constant, and `calibration.json` documents which and why. The
  fix in D5 is to *add* a secondary signal, never to hide THEORY.
- **The sim disagreeing with the field is by design.** Popularity deliberately never
  enters the objective (`search.ts:1`); divergence is the discovery feature. D1/D2 are
  about *cross-checking the headline opener* and *surfacing the aggregate* — not about
  making the sim mirror the meta.
- **Off-meta items are already conservatively gated.** A candidate with a negative
  win-delta on n≥20 is rejected (`artifacts.ts:444`), the Deathstalker uncapped-AS
  case is named, and every promoted item wears a `SIM-ONLY ⚠` "test it" tag. Not
  reckless.
- **Unverified constants are flagged, never estimated** — exactly the autonomy policy.
- **The AI copy guardrail is genuinely robust.** Every numeric token is machine-verified
  against the source cell and failing lines are dropped (`copy-verify.ts`; 2 rejected /
  286 written). Reuse it for the new title/minor copy rather than inventing anything.
- **`alt=""` on decorative images beside text labels is correct WCAG** — the real a11y
  debt is interactive semantics (B2/B3), not alt text.
- **Squad's duplicated `roles[]` mirror** in artifacts is a documented backward-compat
  mirror (`artifacts.ts:733`), not a data bug.

---

## Prioritized backlog (do these in this order)

| # | Finding | Severity | Effort | Why it's here |
|---|---------|----------|--------|---------------|
| 1 | **A1** Point root at v6, retire v2–v5 | High | S | Cheapest high-impact fix; users currently land on stale pre-1.14 data |
| 2 | **F1** Surface Eternal minors (plumb→render→copy) | High | M | Engine already computes them; half of a real in-draft decision is hidden on every hero |
| 3 | **D2** Surface the agreement-audit aggregate (coreRecall) | High | M | Largest disclosed-but-hidden inconsistency; no new math/API |
| 4 | **D1** Evidence-gate the headline build's opener | High | M | One niche item leads 65% of heroes; reuse the existing off-meta gate |
| 5 | **C3** De-template matchup gameplans | High | M | 7 strings for 312 matchups erodes trust in the whole feature |
| 6 | **E1** Deterministic build titles | High | M | Named ask + industry norm; all inputs already computed |
| 7 | **C1/C5** Defer raw sim integers behind disclosure | High | M | Core "don't throw numbers" violation on the default view |
| 8 | **C2/C4** Plain-language copy + action-clause in augment copy | High/Med | S | Jargon + 71% bare-winrate lines; eternals copy is the model |
| 9 | **B2** Keyboard/touch access to "numbers one tap away" | High | M | Popup + tooltips unreachable for keyboard/mobile |
| 10 | **B1** One shared THEORY badge across pages | Med | M | Consistent trust signal |
| 11 | **D4/D5** Per-number provisional tagging + evidence-strength tier | Med | S/M | Make the honest uncertainty *discriminating* |
| 12 | **A2** Port Team Lab / Learn-Eternals into v6 nav | Med | M | Avoid silently dropping useful pages at cutover |
| 13 | **B3/B4/B5/B6** A11y semantics, color+glyph, scoped Coach badge, shared JS | Med/Low | M | Quality + maintainability |
| 14 | **D3/G6** Model highest-playrate unmodeled items/augments; coverage metric | Med | L | Closes silent mis-recommendation for supports/execute bruisers |
| 15 | **G7** Hero-contextual item rationale (optional) | Low | M | Glossary is fine; nice-to-have |

---

## Validation note

This report was produced by four parallel evidence-gathering passes plus a fifth
**independent clean-room pass** that had not seen the others' conclusions. Findings
both lines reached independently are stated plainly; the few they rated differently
(B1, B3, D5, E1) carry an in-line reconciliation. No unresolved disagreements remain
— the clean-room pass's skeptic notes were folded into the "do not regress" section
rather than discarded. External claims are cited below.

## References (external benchmark, 2026-06-20)

- Predecessor **Patch 1.14** "Harbingers of Ruin" official notes — Eternals =
  1 Major + 2 Minor slots (each 1-of-3); %-armor-pen additive→multiplicative; tenacity
  uncapped; anti-heal "Tainted" item family.
  https://www.predecessorgame.com/en-US/news/patch-notes/Patch_notes_1.14
- Build-title norm — MOBAFire creator titles encode archetype:
  https://www.mobafire.com/league-of-legends/build/lethality-burst-caitlyn-mid-crit-ad-stack-all-champion-matchups-606717 ;
  Predecessor-native titles: https://pred.gg/guides , https://omeda.city/builds/1695
- Stat aggregators split by mode, not title: https://op.gg/lol/champions/varus/build
- Beginner UX — progressive disclosure:
  https://www.uxpin.com/studio/blog/what-is-progressive-disclosure/ ;
  coaching voice: https://mobalytics.gg/blog/lol-mobalytics-beginners-guide/
- Current-meta sanity check (community, patch 1.14, directional):
  https://statz.gg/predecessor/hero-tier-list
- SPA version retirement / canonical entry:
  https://www.siteimprove.com/blog/manage-redirects-during-website-migration/ ,
  https://www.stephanspencer.com/redirects-and-seo-best-practice/

*(Coverage flags from research: u.gg / Mobalytics article pages / MOBAFire return 403
to automated fetch — claims above rest on reachable pages and verbatim search-result
titles. The exact per-Eternal minor option names are not publicly tabulated; the
2×(1-of-3) structure is officially confirmed. Tier-list placements are community, not
official.)*
