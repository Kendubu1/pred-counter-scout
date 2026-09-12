# Player guides digest (pred.gg/guides)

A deep scrub of every community guide on https://pred.gg/guides — 19 guides,
all patch v1.16.4, read 2026-09-08. The point is not the individual builds
(our artifacts pipeline generates those from data); it is how the game's own
players **reason, prioritize, and talk** — so the coach speaks their language
and grades against their yardsticks.

**Companion archive.** `docs/guide-learnings.md` is the per-guide record:
one entry for every guide in the 1.16/1.15/1.14 families (190 entries)
carrying each author's explicit lessons verbatim, with a cross-cutting
synthesis up top. This digest stays the thematic summary; the archive is
where a specific guide's teaching lives.

**Provenance rule.** Everything here is either **VERIFIED** (cross-checked
against our own 99 committed films or the omeda catalog) or **SOURCED**
(guide-author claim we cannot check — treat as THEORY). Either way this
digest supplies *concepts and vocabulary only*: a coaching review still cites
numbers exclusively from that game's facts file, never from this document.

Sources — current patch (all 19 v1.16.4 guides): Peter Weeber (hybrid-Eternal
series for Boris/Grux/Rampage, the Iggy & Scorch jungle macro guide),
CarlDanger (Skylar, TwinBlast, Eden, The Fey, Sparrow, Gadget, Legion),
PB 4ND JAM (Yin, Kwang, Serath, Kallari, Feng Mao jungle), Ryuzumei (Grux
bruiser, TwinBlast), user-bb3c1ef5 (Serath). Archive pass (§6, most-viewed
per patch family, 1.15 back to 0.16): Ryuzumei (Adele support), Olli Kahn
(Ikra mid), PopHero234 (Greystone offlane), Bruhsarion (Crunch jungle),
BlueElliott (Aurora offlane), PB 4ND JAM (Rumble Rampage; Shinbi
offlane/jungle — the site's most-read guide, 5,505 views), Y0urDrunkUncle
(Eden), Gerolly (Zarus offlane), Klingklang5000 (Muriel "Hegemony"),
Krillari (Yin), Armageddon (Morigesh), aanilonred (Serath jungle, Master
elo).

## 1. The objective clock (the macro layer players plan around)

The deepest guides structure the ENTIRE game around objective respawns, not
around kills. Cross-checked against `timeline.majors` in our 99 films:

| Objective | Guide claim | Our films | Status |
|---|---|---|---|
| River buffs | rotate continuously | first take median min 3, ~1-min cadence | VERIFIED |
| Seedlings | farmed between windows | first ~4–5, ~3-min cadence | VERIFIED |
| Fangtooth | spawns 5:00, ~5-min cycle | earliest take min 5, median gap 6 | VERIFIED |
| Mini Prime ("Mini Orb") | 7:00 / 13:00 / 19:00 | earliest take min 8, median gap 7 | VERIFIED |
| Orb Prime | spawns 20:00 | earliest take min 21 | VERIFIED |
| Primal Fangtooth | replaces Fangtooth from 20:00 | earliest take min 21 | VERIFIED |

Guide-sourced practice built on that clock (SOURCED, but consistent across
authors):

- **Fangtooth stacks are a race.** Each kill is a permanent team-wide damage
  buff (cited as 2%/4%/8% by the third — magnitudes unverified). Players
  treat the **third Fangtooth (~15:00)** as a named, non-negotiable power
  spike: "your number #1 priority no exceptions." A team-wide damage lead
  from ~15 on is a citable *why* when our films show a 3–0 Fangtooth count.
- **Mini Prime is for converting, not holding.** The buff "melts plated
  towers"; the play is take-then-push immediately ("Giga Push"), and dying
  with the buff is acceptable *if* it took towers or forced a cross-map
  reaction. Grade Mini Prime takes by what fell in the next window, not by
  the take itself.
- **Deward before every objective attempt** is standard practice; junglers
  buy a Sentry on the first recall (~0:40). Vision work is scheduled around
  the clock, not ad hoc.
- **Objective trading is legitimate.** Enemy committed to Fangtooth → take
  Mini Prime or steal camps, and vice versa; "giving up the first fangtooth
  is totally fine if you use that time to steal farm and build a lead."

## 2. Jungle yardsticks (how junglers judge themselves)

From the Yin, Iggy & Scorch, and Rampage guides — the roles our films grade
most often and understand least:

- **Ganks are a byproduct of map control, not the job.** "Forced early ganks
  waste time"; a successful gank is judged by the gold/objective it converted,
  not by the kill. The corollary the guides own openly: early farm discipline
  over teammate pings — "the comical cries of your teammates don't matter."
- **Clear efficiency is a studied skill**: dragging camps to chain them with
  zero downtime (passive uptime), spacing ability procs across a clear,
  cycling the blue buff early on mana-hungry kits. A jungler behind in farm
  with no invade pressure against them made an efficiency error, not a luck
  error.
- **Invade windows are read off the clock**: enemy jungler committed to
  Fangtooth, dead, or showing on the map = their camps are free.
- **Farm-dependent junglers void the plan by dying early** — "this entire
  gameplan bursts into flames if you die early." An early jungle death costs
  the timed objective schedule, not just the death timer.

Coaching implication: grade a jungler on clear tempo, on invade/objective
windows hit or missed, and on what ganks *converted* — never on gank count.
A jungler farming through a lost skirmish can be the right call if the next
objective window justified it; our films can check whether it did.

## 3. Build reasoning in the wild (the buildReads grammar, confirmed)

Community guides already reason exactly the way our buildReads teach —
gained-vs-gave-up, stated conditionally:

- **The situational-swap grammar**: *{default} → {swap} when {condition}*.
  Universal instances, near-verbatim across authors: a cleanse item
  (Liberator et al.) over the damage opener "against powerful CC" (appears
  in almost every carry guide); the anti-heal (Tainted) piece swapped in
  "against heavy healing and sustain"; Megacosm "against frontlines stacking
  health"; the last slot flexed to Unbroken Will / Legacy / Salvation into
  heavy-CC comps. A build review that names the condition the swap answers
  is speaking the players' native grammar.
- **Threshold building**: attack-speed caps (460%, or 420% + a steroid) are
  explicit build *targets*; 100% crit completion and CS-gated stacking items
  (150 CS to turn on Bone Collector) define stated "weak until / unstoppable
  after" curves. Players think in thresholds, not stat totals.
- **Fight-length reasoning**: burst mitigation vs lifesteal chosen by
  expected fight duration — "Equinox 4th if I expect to get bursted, Onixian
  Quiver 4th if I expect a longer fight." "Short trades vs extended contact"
  is a trade-off axis players already use — our Eternal reads that end on it
  land on prepared ground.
- **Order is reasoned, not just contents**: component-first sequencing keeps
  the early game playable while rushing a scaling core ("Physical Power
  components first, delaying Magic Power items until Typhoon comes online").
  A review can fault sequencing, not only the missing item.
- **Greed is stated as conditional**: "This is the optimal go-to build, but
  you need to be ahead — if you fall behind you need to change." Guides
  license the coach to call a greedy build wrong *for that game state*
  without calling it wrong in general.

## 4. Eternal reasoning in the wild

- **Fit-first, mechanism-named**: "Wind-Rider is super important on Serath
  because both her Q and E proc it"; Terror is "the key to success" because
  it lets the hero tank camps the kit otherwise can't. The argument is
  which kit mechanic feeds the blessing — exactly our buildReads eternal
  contract.
- **Trade-offs are stated bluntly**: "Do NOT go Broken Wings — the movespeed
  from your Q is super important for disengaging"; Nihil's mana burn is
  openly dead against manaless heroes (Akeron, Eden, Khaimera, Scarlett).
  Naming what a loadout *doesn't* do is normal guide practice, not rudeness.
- **Loadouts carry execution cost**: the hybrid-Eternal series tiers all 16
  Eternals beginner→master — the same stats are worth less in harder hands.
- **Eternals shape the opening, not just combat**: Demonic Bargain grants
  level-1 starter items plus gold at 7 and 13 — an economy pick with zero
  combat text. Loadout reads may be about tempo, not damage.

## 5. Vocabulary (current-patch player speech)

Terms the guides use without explanation — safe in reviews because players
already own them: *power farm, invade, deward, cleanse, pen, on-hit, spike,
snowball, flex slot, camp dragging, win condition, giga push, bursted vs the
long fight*. Note what's absent: no analytics jargon, no ledger metaphors —
guide prose is blunt, mechanical, and always names the condition ("against
powerful CC") rather than the abstraction. The readability contract
(coaching-methodology §4) already points the same way; this is field
confirmation.

## 6. The archive pass (older patches, most-read guides)

A second sweep (2026-09-08, same session) worked backwards from patch 1.15
through the 0.16 era, taking each patch family's most-viewed guides via the
site's own popularity ranking — 13 more guides, including the most-read
guide on the site (PB 4ND JAM's Shinbi offlane/jungle, 5,505 views, v1.11)
and the deep offlane/support material the current-patch listing lacked.
**Provenance:** every item name, number, and build in these is patch-stale
by definition; only the reasoning patterns below travel. Read for concepts:

**Offlane yardsticks** (Aurora v1.14, Zarus v1.12, Shinbi v1.11, Greystone
v1.15):

- The lane splits by state, and the guides coach each state separately:
  *winning* = "poke until you see fit to dash in" when the wave advantage
  exists, then "look to roam when the wave is pushed — your CC makes you
  extremely valuable in fights across the map"; *losing* = farm safely,
  prioritize warding against ganks, follow roams or split-push. Grading an
  offlaner means first asking which state they were in.
- Trades are coached around resource ticks, not bravado: "let [the DoT
  passive] tick in short trades, punish when the enemy overextends."
- The known failure mode is external: "get camped by their jungler and
  watch your duo lane still lose" — the answer is defensive itemization,
  aggressive warding, and patience, which matches our rule that offlane
  deaths pre-10 weigh heavier than missed farm.
- The kill pattern has a name: land the ultimate "to burn enemy Blink,"
  then re-engage on the dead escape. Escapes-forced is a real intermediate
  result between poke and kill.

**Support yardsticks** (Muriel v1.11 "Hegemony", Adele v1.15, Rampage
support v1.16):

- There are two live schools, and guides argue them openly: traditional
  peel/shield-power support versus damage-scaling support ("Magical Power
  has way more multipliers than Heal & Shield Power — do the math"). A
  support's build is a stance choice, not a default; a review can name
  which stance the loadout took and judge it against the game.
- "Frequency is king": uptime beats one big moment — an effect "you can
  use only once every minute is no augment at all." Same logic players
  apply to ult usage.
- Shields are coached as *preemptive*, not reactive — "shield allies
  before expected damage rather than reacting."
- Itemization is carry-specific: the same support swaps items depending on
  which carry they protect. Support reads should name who the loadout
  serves.

**Carry & mechanics literacy** (Eden v1.13, Yin v1.5, Serath v0.18,
Rampage v1.13):

- "The worst case scenario for Eden is getting caught in a CC" — the
  carry's own guides grade themselves on caught-out deaths, exactly our
  `fights.caughtOut` yardstick.
- Players study frame-level mechanics as normal practice: animation
  canceling, auto-attack-reset weaving ("Attack → ability → Attack"),
  passive-stack upkeep between camps ("kite the buff between camps to keep
  8 stacks"), and stat caps to the percent ("346% attack speed, 1% off the
  melee cap"). Execution vocabulary in reviews can assume this literacy.
- Two mechanics players quote that our sim does not model: slow stacking
  is not additive (strongest slow + 5% per extra source), and anti-heal
  sources don't stack multiplicatively — yet dual anti-heal is still
  justified when one vector doesn't apply (an on-hit anti-heal never
  touches a hero who won't get autoed). SOURCED, not verified.
- Authors publish first-clear benchmarks to the second (camp starts at
  2:45–2:53; a 2:25 first clear called out as "insane") — jungle clear
  tempo is a measured, comparable stat in the players' own culture.

**Matchup grammar, deepened.** The best archive guides sort matchups into
favorable / even / difficult buckets and attach the *mechanic* that decides
each: "Kwang's Blade Tether blocks dash abilities — wait for blade recall
before committing"; "Murdock outranges the poke — stay behind the minion
wave and roam for value instead." Hard counters get item pivots stated as
rules ("vs Countess: rush Tainted Blade first item"). This is the fullest
form of the swap grammar: condition → mechanism → response.

**Splitpushing has its own doctrine** (splitpush 101, 824 views — the
catalog's one pure-macro guide): proxfarm mid+offlane waves behind the
tier-1 BEFORE the objective window; the stay/join rule is numeric — keep
splitting while 2+ enemies commit to stopping you (that's the 4v3), and
"if you're late for splitpush → teamfight" voids the play; sustain off
nearby camps instead of recalling; it only works as synchronized team
action. A film where our splitter held a side lane while we fought 4v5
can now be graded both ways: did the split hold 2+, and did we convert
the man-advantage?

**Support economy and the third school.** "As support, most games you'll
only get up to 3 to 4 items" — judge a support build by its first three
slots, not its six-item dream; even skill-justified greed caps at 3
offensive items. Beyond peel vs damage-scaling there is a third stance:
the entry facilitator ("blink into the middle of the enemy team… be the
flashbang for your entry team"), whose lane job is "pressure enough to be
the target." Support skill expression includes counter-CC — canceling a
channeled hook or mesmerize with your own CC is peel.

**Accountability lines players write themselves**: "Fangtooth killer! You
are the Jungler. When Fangtooth gets into enemy hands, it's your fault";
a roam "only benefits allies with available abilities"; a build that
can't hold its own benchmark ("stay above 450 Magical Power or better
play Belica") indicts the pick, not the pilot. Blunt house style has deep
community precedent.

**Win-condition builds are named as such.** The most-read guide on the
site opens "The main idea of this build is to have high base health and
use World Breaker" and then does the math at three checkpoints. Players
respect a build organized around one scaling engine — a buildRead that
names the engine ("this build's engine is X; everything else feeds it")
speaks that culture.

## 7. What this changes for the coach

Enforceable versions live in `docs/coaching-methodology.md` §3–4 and the
agent specs; in short: causation lines may lean on the objective clock
(which Fangtooth/Prime window a fight sat in, what a Mini Prime take did or
didn't convert); junglers are graded on the §2 yardsticks and offlane/
support/carry on the §6 ones (winning-vs-losing lane state first, support
stance named, preemptive-vs-reactive peel, caught-out deaths as the carry's
own metric); buildReads keep using the swap grammar, the threshold and
fight-length axes, and may name a build's scaling engine; magnitudes from
this digest (Fangtooth stack %s, slow-stacking math, clear benchmarks) are
THEORY and never appear as numbers in a review.
