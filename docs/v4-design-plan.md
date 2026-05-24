# Predecessor Scout — v4 Design Plan
### Theory-craft & learning first, win-rate second (or not at all)

> Status: proposal for discussion. Nothing here is built yet. This plan assesses
> the future direction for the next version and the data/agent work it needs.

---

## 1. The thesis

Today's app answers *"what do people pick and how often does it win?"* Every other
tool answers that too. The bet for v4 is to answer the question nobody does well:

**"Why is this good for *this* hero, and how do I build around *its kit* instead of copying the herd?"**

A pre-match companion that:
- shows who's strong / weak **this patch** (and why),
- gets you up to speed on a hero's **kit** fast,
- recommends a build **aligned to that hero's attributes and abilities** — not the most-played build,
- flags **items that are over/under-tuned** this patch,
- and explains all of it in **plain language**, with an expandable **"why"** grounded in the hero, its abilities, or its role.

This pivot also resolves the **data-sourcing problem** (Pred.GG pushback): the
value moves off scraped win-rate stats and onto kit reasoning we already own.

---

## 2. The match-start flow (the product)

The whole experience is framed around the 30–60s before/at champ select.

1. **Meta snapshot — "who's hot, who's not."**
   Strong / weak picks this patch, sourced from **patch notes** (buffs/nerfs) +
   the expert agent's read — *not* scraped win rates. We already generate this
   from `data/patches/<ver>.json` → `hero-patch-state.json`.

2. **Learn a hero fast.**
   Pick a hero → a tight, plain-language kit summary: what each ability does,
   the core combo, the power spike, the obvious weakness. We already have the
   raw kit (`hero-abilities.json`) and the curated tactical notes + trait
   sources (`hero-tips.json`).

3. **Kit-aligned build (the differentiator).**
   A build derived from the hero's **scaling profile** (attributes + ability
   scaling + traits) and **item stats** — "this fits *your* kit," explicitly
   contrasted with "what everyone runs." No win-rate dependency (see §6).

4. **Item watch — "what's broken right now."**
   Items that are over/under-tuned this patch, from **patch-note item changes**
   + agent assessment, with a plain explanation of *why* it's strong.

5. **Off-role survival (the competitive hook).**
   Ranked has no true role queue, so players get **auto-filled off-role**
   constantly. *"Filled to a role you don't main? Here's how to play this hero
   there — combo, kit-build, and what to avoid — in 20 seconds."* This serves
   the climber crowd by addressing the part of the ranked slog we can actually
   touch. (We do **not** try to fix matchmaking, role queue, or population —
   those are Omeda's; see the assessment appendix.)

Every recommendation in steps 1–5 uses the same **suggestion + why** pattern (§3).

---

## 3. The "suggestion + why" UX pattern

The core interaction. Each card shows a **concise suggestion** by default, and a
collapsed **"Why?"** the user can expand. The explanation is selectable by basis:

```
┌────────────────────────────────────────────┐
│ Build: Magical pen + ability haste core     │
│ ▸ Why?                                       │
└────────────────────────────────────────────┘
        ↓ (expanded)
┌────────────────────────────────────────────┐
│ Why this build?            [Hero][Ability][Role] │
│ Ability ▸ Peekaboo! and Knock, Knock! scale  │
│ 55–110% Magical Power, so MP + pen does more │
│ than raw attack damage here.                  │
└────────────────────────────────────────────┘
```

**Data shape** for any recommendation:

```jsonc
{
  "suggestion": "Magical pen + ability haste core",
  "why": {
    "hero":     "Wraith is a burst hybrid that wants to one-shot from range.",
    "abilities": ["Peekaboo! scales 55% MP", "Knock, Knock! scales 65% MP + lifesteals"],
    "role":     "As a carry you spike on items — prioritize the power that scales your abilities."
  }
}
```

This shape is generated once per patch by the agent (§5) and rendered statically.

---

## 4. Data model: what we keep, drop, and need

### 4a. Keep — the kit/content layer (owned, defensible, no scraping)
| Source | What it gives us |
|---|---|
| `hero-profiles.json` | attributes (AP/MP/DUR/MOB 0–10), `baseTraits`, roles, damageType, classes |
| `hero-abilities.json` | full kits: ability text, **damage entries with scaling % + damage type**, cooldowns, cc, effects |
| `items.json` | **280 items with raw `data.stats`** (power, pen, haste, mana, etc.), price, rarity, slot, effects |
| `eternals.json` | the 12 Eternals (major + minors), fit weights |
| `hero-tips.json` | curated tactical notes + trait→ability sourcing |
| `data/patches/<ver>.json` → `hero-patch-state.json` | **patch-note digest** (buffs/nerfs) — meta movers, *from notes not stats* |
| engines | matchup (trait-based), combo, ability-interactions, support-synergy, eternals |

This layer already supports steps 2 (learn) and most of 3 (kit-aligned build) and
1 (meta movers). It is the foundation.

### 4b. Drop — the scraped win-rate layer
`data/<version>/<slug>.json` per-role:
`buildTabs` (items + **winRate** + matches), `augments`/`crests` winRate,
`counters` (hero + **winRate** + matches), `skillPriority`. **This is the
Pred.GG-derived data.** v4 stops depending on it as the backbone.

### 4c. Gaps to fill (the user's "not sure the data model supports this")
1. **Per-hero scaling profile** — derive from `hero-abilities` damage entries
   (which abilities scale on AP vs MP, how hard) + attributes. *Computable, not
   currently stored.*
2. **Item tags / role fit** — classify each item by what kit it serves (burst,
   on-hit, tank, sustain, anti-heal…). Partly inferable from `data.stats` +
   effects; needs a curated/generated tag layer.
3. **Kit-aligned build output** — `{suggestion, why}` per hero/role (§6).
4. **Meta read & item watch** — `{tier, why}` per hero and `{item, status, why}`
   per patch, driven by patch notes + agent (§5).
5. **The "why" copy** for every recommendation — the agent's job (§5).

None of these require scraped stats. (3)–(5) are **generated content**, which is
where the expert agent comes in.

---

## 5. The "Scout Brain" — a per-patch expert agent

The user's instinct is right: getting the explanations and meta reads good at
scale needs an **LLM that genuinely understands Predecessor and is refreshed
every patch**. Design it as a **build-time content pipeline**, not a live
runtime service — the site stays a static, free, no-API page; the agent runs
when a patch drops and writes JSON the site reads.

> Note: "trains on each patch" = re-running generation with **updated context**
> (patch notes + current kit/item data + a curated rubric), *not* fine-tuning a
> model. In-context is cheaper, faster, controllable, and good enough. Fine-tuning
> stays a future option if quality demands it.

### Inputs (per run)
- **Knowledge base / rubric** (versioned, hand-curated once, edited rarely):
  Pred mechanics — role definitions, itemization rules, damage-type math,
  what stats matter for which archetypes, common combos. This is what makes the
  agent "know Pred."
- **Patch notes digest** for the new patch (`data/patches/<ver>.json`).
- **Current kit + item data** (`hero-abilities`, `hero-profiles`, `items`).

### Generation (multi-pass, the "LLM review" the user wants)
For each hero/role and each item:
1. **Draft** the suggestion + why from the inputs.
2. **Challenge** — a self-critique pass: *is this accurate to the kit? specific,
   not generic? does the cited scaling actually exist in the ability data?*
   (Same approach that worked for the hero tactical notes.)
3. **Ground-check** against structured data (e.g. verify a cited "55% MP scaling"
   exists in `hero-abilities`), flag mismatches.
4. **Finalize** → structured JSON.

### Outputs (consumed by the static UI)
- `meta-read.json` — `{ slug: { tier, why } }`
- `kit-builds.json` — `{ slug: { role: { items[], suggestion, why{hero,abilities,role} } } }`
- `item-watch.json` — `{ slug: { status, why } }` for over/under-tuned items
- extends the existing `hero-tips.json` pattern

### Cadence & review
- Triggered per patch (same moment we already update `data/patches/<ver>.json`).
- Optional **human review gate** before publish (diff the generated JSON).
- Reproducible: re-runnable script; could be the Claude API generator we
  discussed, or run in-session like the hero notes.

---

## 6. The kit-aligned build engine (no win rates)

This is the heart of the differentiator and is fully computable from owned data.

**Inputs per hero:** scaling profile (which abilities scale AP vs MP and how
hard, from `hero-abilities`), attributes (AP/MP/DUR/MOB), `baseTraits`
(lifesteal, on_hit, crit, cc…), damageType.

**Scoring:** rank items (`items.json` `data.stats` + effects) by fit to the
profile — e.g. a magical-scaling burst hero favors Magical Power / Magical Pen /
Ability Haste; an on-hit/crit carry favors attack speed / crit / on-hit; a
lifesteal kit favors omnivamp. Eternals slot in via the existing eternals-engine
fit weights.

**Output:** a recommended core + situational items, each with the **why**
(deterministic part: "this stat scales your X"), optionally polished into plain
language by the agent. Explicitly framed as *"built for your kit"* and, where
useful, contrasted with the popular build.

The deterministic scoring is verifiable (fits the "transparent, no black box"
ethos); the agent only adds the plain-language *why*.

---

## 7. Data-sourcing strategy (Pred.GG pushback)

**Confirmed:** Omeda Studios ships an **official Public API**, built *in collaboration
with community developers*, exposing hero stats (filterable by patch window + game
mode), match data, and player search. This is the sanctioned source and the clean
fix for the scraping problem. (See assessment appendix; Omeda.city is built on it.)

- **Stop depending on scraped Pred.GG win-rate data** as the backbone (§4b).
- **Move any retained stats to the official Omeda Public API** (or Omeda.city's
  API), with attribution and within its terms.
- **Meta read & item watch** come from **official patch notes** + agent — a
  defensible, first-party-input source.
- **Kit & item facts** are game content (defensible), already in-repo.
- Going to the official API isn't just a data fix — it's a **trust/marketing win**
  ("built on the official API, by the community, for the community"). Consider a
  quiet credit/note to the Pred.GG dev and applying to Omeda's community-tool
  spotlight.

---

## 8. Phased roadmap

**Phase 0 — decide & verify.** Confirm: cut WR entirely vs keep a sanctioned
secondary (now via the **official Omeda Public API** — confirmed to exist); pick
the agent runtime (in-session vs Claude API script).

**Phase 1 — kit-aligned build engine (deterministic).** Build the scaling-profile
+ item-fit scorer from owned data. Ship "build for your kit" with deterministic
whys. *No agent, no scraping — provable value immediately.*

**Phase 2 — the "why" UX pattern + off-role survival.** Suggestion + expandable
Hero/Ability/Role explanation across builds, counters, meta. Reuse the
`hero-tips.json` shape. Add the **off-role survival** view (§2.5) — it's mostly a
role-filtered presentation of the Phase 1 kit build + per-role tactical notes.

**Phase 3 — Scout Brain v1.** Per-patch agent generating meta-read, item-watch,
and the plain-language whys; multi-pass review; structured JSON outputs.

**Phase 4 — retire the scraped layer.** Remove `data/<version>/*` WR dependency;
counters become trait/kit-reasoned (matchup-engine already leans this way).

**Phase 5 — v4 visual design.** Apply the chosen new look (the esports direction
or another) to these screens.

---

## 9. Open questions

1. **Win rates:** cut entirely, or keep a thin sanctioned-source layer as a
   secondary signal?
2. ~~**Sanctioned data:** is there an acceptable API?~~ **Resolved:** an
   **official Omeda Public API** exists (built with community devs). Remaining
   sub-question: read its specific terms before shipping on it.
3. **Agent runtime:** in-session generation (no infra) vs a re-runnable Claude
   API script (needs API key) for per-patch refresh?
4. **Human review gate:** publish agent output automatically, or diff-and-approve
   each patch?
5. **Counters without WR:** are trait/kit-reasoned counters enough, or do users
   expect a head-to-head number?
6. **Build comparison:** do we still *show* the popular build to contrast against
   our kit build (useful teaching), even if we de-emphasize its win rate?

---

## 10. Risks

- **Credibility:** dropping "data-backed %s" removes a trust hook for some users.
  Mitigation: the transparent, verifiable kit reasoning *is* the new trust hook.
- **Agent accuracy:** wrong advice shown at draft is worse than none. Mitigation:
  ground-check pass + optional human gate + deterministic core for builds.
- **Maintenance:** per-patch agent runs must be cheap and reliable, or content
  rots. Mitigation: reproducible pipeline tied to the existing patch workflow.
- **Scope:** this is a multi-phase rebuild. Mitigation: Phase 1 delivers the
  differentiator with owned data alone, before any agent or redesign.

---

## Appendix A — Market & Community Assessment (May 2026)

*Senior-designer + senior-marketer read on the live game, to honestly gauge
whether we're actually helping the community.*

### Methodology / sourcing
Reddit was **not** "empty" — r/PredecessorGame is active; the search tool simply
didn't surface reddit links (indexing quirk) and direct reddit fetches are blocked
in our environment. Real player voice was taken from **Steam Community
discussions** + **official Omeda posts** (which quote community feedback) +
**player-count data** + the maintainer's firsthand play. Forum/Reddit complaints
are treated as **vocal-minority signal** and triangulated against player-count
trends and Omeda's own admissions, *not* taken at face value.

### State of the game
Niche but alive, not booming: ~1.7k–3k concurrent on Steam (all-time peak ~7,248),
**+55% month-over-month**, ~16.9k reviews "Mostly Positive," 1–2M owners, plus a
meaningful console/PS base (cross-platform). Omeda's stated 2026 priorities: a
"seriously satisfying" *strategic* MOBA, iconic heroes, an action-focused
perspective — and they **publicly admit drifting from player feedback after 1.8**;
2026 is a declared "Game Health" year. → Treat this as a **passion/community play,
not a big-TAM play.**

### What players actually gripe about
- **Pace too fast / "brawly"** — not enough laning/farming/out-thinking (Omeda
  slowed it in 1.9).
- **Balance** — caster/tank damage, Argus oppressive early, Rampage too durable +
  damaging, ranged heroes oppressive in offlane.
- **Onboarding is brutal** (genre-wide *and* an Omeda weak spot — only a basic
  tutorial exists).
- **Itemization confusion** — community guides/videos exist precisely because the
  game doesn't teach it.

### Competitive / ranked = a slog
- **No true role queue** — you pick a role in draft, but duplicates are *randomly
  reassigned* → constant **off-role** games. Loudest competitive gripe.
- **Queue dodging** is rampant (knock-on effect).
- **Solo-queue matchmaking is poor** — skill mismatches, "rare to get a balanced
  game," largely because the **active pool is small** (you can't matchmake well
  with ~2–3k online).
- **Off-hours: "can't get a match at all."** Plus smurf suspicion in placements,
  surrender-rule / match-length complaints, and a perception that **Omeda ignores
  sub-diamond feedback**.

### Tool landscape (our competition)
**Omeda.city** (stats/builds — the big reference, on the official API), **Pred.GG**
(build guides — the dev we upset), **predecessor.pro** (match browser + beginner
guide), **PredCompanion** (mobile). They are all **"what to build" stat tools**;
almost nobody does **"why," taught in plain language** → that is our lane.

### Designer verdict
The v4 thesis maps directly onto the #1 unmet need (learning / itemization /
matchups, plus the console "can't alt-tab" problem). The WR-copy build/counter
features are a worse Omeda.city — drop that fight. Keep the experience dead-simple
and fast for the learner segment.

### Marketer verdict
- The **scraping incident is a brand risk** in a small, tight community where devs
  and creators all talk. For a community-first brand, that matters.
- **Differentiate on teaching:** *"Every Pred tool tells you what to build — we
  teach you why, and how to build for your hero's kit, not the herd."*
- **Timing favors us:** Omeda's 2026 narrative is strategy + game health + "we
  drifted from feedback." A tool that helps players *learn and think* fits that
  story — useful for pitching Omeda and creators.
- **Distribution:** Discord / Reddit / YouTube, Omeda's community-tool spotlight,
  and educator/creator partnerships (e.g. NightShade's itemization content).

### Are we actually helping the community? (honest)
**Potentially yes — but not yet at our best.** The learning/"why" gap is real and
underserved, and it aligns with the game's biggest weakness (onboarding/retention)
and Omeda's own 2026 direction. Two things currently undercut it: (1) the scraping
approach *hurt* community trust, and (2) the WR-copy features merely duplicate
existing tools. The pivot — teach the why, build around the kit, source from the
official API, serve both the **learner** and the **off-role climber** — is what
makes us genuinely, distinctively helpful.

### Sources
- Predecessor — Steam Charts: https://steamcharts.com/app/961200
- Predecessor on Steam (reviews): https://store.steampowered.com/app/961200/Predecessor/
- Omeda dev diary "2025 and Beyond": https://www.predecessorgame.com/en-US/news/dev-diary/Predecessor_2025_and_beyond
- "Standard & Ranked Direction in 1.9 and Beyond": https://www.predecessorgame.com/en-US/news/notices/standard-and-ranked-direction-in-1-9-and-beyond
- Official Public API: https://www.predecessorgame.com/en-US/news/notices/public-api
- Omeda.city (community stats + API): https://omeda.city/
- Steam discussions (matchmaking / solo-queue / role queue): https://steamcommunity.com/app/961200/discussions/
- pred.gg: https://pred.gg/guides · predecessor.pro: https://predecessor.pro/
