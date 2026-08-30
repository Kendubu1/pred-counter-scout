# Coaching methodology basis

Research-backed basis for the post-game coach (`pred-scout-coach`) and its
critic. Compiled 2026-08-29 from three research tracks: (1) how professional
MOBA coaches actually run reviews, (2) the academic/data-science literature on
MOBA win factors, and (3) the Predecessor-specific strategy canon. Every
principle is stated in a form the coach can apply to the postgame facts files
(`data/postgame/<id>.json`) — kill streams clustered into skirmishes with macro
reads, fight economics, objective timelines, lane verdicts, builds and spike
minutes. The coach cannot watch video; anything that needs video is out of
scope by design.

Provenance labels used below:

- **VERIFIED** — checkable against our own committed data/engine.
- **SOURCED** — external number/claim with a citation; not re-verified against
  our snapshots. Do not quote SOURCED numbers in coaching output; use them only
  to shape emphasis and phrasing (the honesty contract already forbids citing
  numbers absent from the facts file).
- **THEORY** — reasonable transfer from another MOBA; may not hold in
  Predecessor.

## 1. How real coaches review a game (methodology)

Distilled from pro LoL/Dota coaching practice (BSJ's replay-review template,
wecoach/lolcoach VOD-review guides, LS interviews, MonteCristo's CLG journaling
regime), coaching-course curricula (British Esports Coach Development
Framework, Pearson/BTEC esports HNs, NASEF), and sports-science frameworks the
esports literature actually uses (Ericsson's deliberate-practice criteria,
Whitmore's GROW model, Weldon Green's tilt management).

1. **Fixed review skeleton, chronological.** Draft/comp → lane phase →
   mid-game objectives → the fights that decided it → action plan. (BSJ's
   template is exactly this; our `coaching` block already approximates it:
   `headline` ≈ summary, `team` ≈ narrative, `whatShiftedIt` ≈ key moments.)
2. **Cap the findings.** 3–5 key moments per review, ONE improvement theme.
   Coaches explicitly reject fix-everything reviews ("one theme per session,
   e.g. 'late rotations'"). A review that lists every mistake teaches none.
3. **Deaths-first triage.** For each death (cluster): (a) was the *decision*
   avoidable given numbers/vision/objective state, (b) what did it cost, (c)
   is it a pattern across games. Our `fights.caughtOut`, `fights.deathCosts`
   and skirmish `macro` blocks are precisely this triage, computed.
4. **Decision before execution.** Classify each mistake as macro (decision:
   fight selection, timing, numbers, rotation) or micro (execution) — and
   judge the decision first. A stats-only coach can *prove* decision errors
   (fight taken 4v5, fight taken 3 items down) but only guess at execution
   errors; it must lean on the former and stay humble about the latter.
5. **Question-led phrasing (Socratic).** Pro coaches ask "what was the win
   condition of that fight?" rather than "that fight was bad". The strongest
   written form: pose the question the coach would ask, then answer it from
   the data, explaining the mechanism, not just the verdict.
6. **End with 1–3 checkable next-game goals** — and grade them next review.
   Ericsson's deliberate-practice criteria (clear intention, individually
   actionable, immediate feedback, repetition, progression) and MonteCristo's
   player journaling both reduce to: carry a focus point across games and
   report the trend. This is the single biggest structural gap in our current
   coaching output (each review is an island).
7. **One evidenced strength per review.** BSJ logs successful decisions
   alongside errors; not a mechanical praise sandwich — a real one (the best
   conversion, the fight entered 5v4, the cross-map trade that worked).
8. **Never blame teammates** (solo-queue canon: "only your own mistakes").
   Our squad reviews are whole-team, so the transfer is: allies' failures are
   *context* ("the fight was 4v5 because X was dead — the call, not the
   caught player, is the coaching point"), which the macro reads already
   encode. Blame the decision, not the body.
9. **Role-normalize every judgement.** The performance-indexing literature
   (Sharpe et al. 2026; PandaSkill) is blunt: role-blind stat judgement is a
   credibility-killing error. A support graded on farm or a carry on wards is
   wrong; a support in min 0–10 is graded on map presence (Predecessor canon:
   "support has the most map influence in the first ten minutes").
10. **Tilt-aware tone and session hygiene.** Weldon Green's rules (2-game
    blocks, stop when unhappy with your play, don't chase losses) are the
    evidence-based session advice; distributed practice beats massed play
    (PLOS ONE 2022). When the film set shows a same-night loss streak with
    degrading numbers, the right coaching is "stop earlier", not a deeper
    autopsy of game four.
11. **Which games deserve the deep review**: losses that felt fine (hidden
    recurring mistakes) and close wins (unclear contribution) — not stomps
    either way. Useful for prioritizing critic rounds across a film backlog.
12. **Don't fabricate long-horizon training plans.** A 2024 scoping review
    found *no* published esports periodization evidence. Per-game focus
    points are where the methodology is real; season plans are not.

## 2. What the data literature says to weight (academic)

Ranked by strength of evidence; each mapped to our fields.

1. **Advantage trajectory beats end-state.** Win prediction from live data
   hits ~93% by late game using team *differentials* (gold/XP/death diffs)
   (Yang et al. 2016; Akhmedov & Phan 2021; MOBA-Slice 2018). The narrative
   spine of a review is *where the advantage curve inflected* — which is what
   `whatShiftedIt` + the skirmish stream give us. Kills/first blood dominate
   early prediction; objectives/structures dominate late (Junior & Campelo
   2023) → stage the attribution: lane-phase feedback is about kills/leads,
   late feedback is about objective conversion.
2. **Structures are the closest proxy for winning.** The strongest
   coach-validated outcome model used towers+inhibitors alone (95.8%
   classification, Novak et al. 2020, LoL Worlds) — better than KDA or gold.
   "Won fights but took no towers" is a first-class headline finding
   (`fights.conversion` + `timeline.towers`).
3. **Fight entry conditions predict matches.** Encounter detection research
   (Schubert/Drachen/Mahlmann 2016) and combat-pattern mining (Yang et al.
   FDG 2014) show numbers-parity at fight start, kill order and the
   *sequence* of fight results predict the match beyond raw kills. Our
   skirmish `macro.ourAlive/theirAlive` is exactly the validated feature —
   the literature says keep leading with it.
4. **Death context, not death count.** Deaths are predictable from state
   (Time to Die 1/2); the actionable subset is isolated deaths
   (`fights.caughtOut`), deaths before objective spawns
   (`fights.deathCosts`), and repeat patterns. Raw death totals are noise.
5. **Tactical awareness outweighs mechanics at every level a text coach can
   see** (Xia et al. 2019: tactical indicators explain outcomes more than
   operational skill; expertise research shows mechanical gaps are invisible
   in aggregate stats) → the coach should say "the call", "the timing",
   "the rotation" and almost never "the mechanics".
6. **Mobility/rotations scale with skill tier** (Drachen et al. 2014:
   zone-changes and coordinated spread separate novices from pros). Our
   `macro.absent[]`/`crossMap[]` reads are the no-video proxy.
7. **Plan-before-fight communication predicts team skill** (Bisberg et al.
   CSCW 2025: better teams talk *before* battles) → "call it before the
   spawn, not during" is grounded advice for a 5-stack.
8. **Comeback framing.** Don't declare a game dead early; bounty/shutdown
   economics quantify comeback windows (MDPI Electronics 2025). If the facts
   show a swing back, credit the mechanism.

SOURCED calibration anchors (LoL, for emphasis only — never quote in output):
first blood ≈69% win, first tower ≈70%, tower+dragon ≈80%; GD@15 +1.5k ≈70%.
Predecessor equivalents are unmeasured; if we ever want them, they must be
estimated from our own match feed, not borrowed (candidate backlog item:
first-Fangtooth and first-Orb-Prime win% from the omeda feed).

## 3. Predecessor-specific canon (vocabulary + priority rules)

From predecessor.wiki.gg (June 2026 revisions), EarlyGuides, GamerDiscovery,
Omeda Creator Guild content (the "Mechanical Masterclass" macro/micro series,
duo-lane and offlane guides, viewer VOD reviews), and the transferable
Smite-conquest canon (SMITEFire). Paragon-era and pre-1.0 sources were
excluded. All specific numbers here are SOURCED unless our data verifies them.

**Objective spine.** Fangtooth (spawns ~5:00, respawns ~4:45 — SOURCED) gives
*permanent, stacking, team-wide* buffs; after the third kill it becomes Primal
Fangtooth (a teamfight execute-damage buff). Orb Prime (Mini Prime from ~7:00;
full Orb Prime from ~20:00 — SOURCED) is the game-ending *siege* buff
(Enhanced Recall, armor, minion mitigation) and dies with its holder. Smite
transfer: Fangtooth ≈ Gold Fury, Orb Prime ≈ Fire Giant — but Fangtooth's
permanent stacks have NO Smite analog: it is a snowballing race, track it as a
count, not a one-off prize (THEORY where our timeline doesn't carry stacks).

**Lane identities** (Creator Guild + Smite canon, consistent across sources):

- *Offlane is an island*: safe farm under tower beats winning lane; a dead
  offlaner opens the river to the enemy jungler → weight offlane deaths
  pre-10 heavier than missed farm.
- *Midlane is the rotation hub*: graded on shove-and-rotate, not on
  outfarming; the roam trigger is a crashed wave, not a clock.
- *Duo lane is a 2v2 + the Fangtooth gate*: the duo that wins the 2v2
  usually converts first Fangtooth; the support, once the carry is safe, is
  the first roamer and is graded min 0–10 on map presence, not KDA.
- *Jungle*: camps level on a timer (clear tempo matters); take buffs before
  rotating, not at route start; objective *trading* is canon — enemy on
  Fangtooth → take Mini Prime, and vice versa.

**Wave grammar** transfers whole from LoL/Smite: freeze (deny + gank setup),
slow-push (build a crash before an objective spawn), crash (buy the recall/
ward/rotate window). Rotating off an un-pushed wave "costs the lane twice".

**Death timers** scale with level to ~40s+ late (SOURCED, v1.6 moved the late
multiplier to 30:00) → any late death near a Prime/Primal window hands the
objective over; say so explicitly when `deathCosts` shows it.

**Priority rules the coach applies to our fields** (each maps to computed
facts, so the honesty contract holds):

| # | Rule | Fields |
|---|------|--------|
| 1 | Won fight → conversion within the death-timer window (objective, tower, or crash); flag the misses | `fights.conversion` |
| 2 | Fangtooth/Prime fights are the fights that matter; name who won them and what fell after | `skirmishes[].tag=game-defining`, `nearObjective`, `timeline.majors` |
| 3 | A fight entered down bodies is a tempo/call error, not a matchup error | `skirmishes[].macro` |
| 4 | Empty kills: a won trade not followed by any gain is chasing; overstay dives after won trades are the classic low-MMR death | `skirmishes[].tag=bad-trade`, kill stream |
| 5 | Caught-out deaths (outside any fight) are the cheapest coaching wins — name the habit | `fights.caughtOut` |
| 6 | Deaths that directly preceded an enemy major/tower are what deaths COST; cite these over death counts | `fights.deathCosts` |
| 7 | Fights taken items-down are timing errors; fight on your spike, not theirs | `fights.itemGap`, `players[].spikes` |
| 8 | Role-normalize: support ≈ map presence and peel, offlane ≈ survival, mid ≈ rotations, carry ≈ farm-to-damage, jungle ≈ tempo + objective trading | `players[].role`, `lanes[]` |
| 9 | Absent-but-ahead is the rotation lesson; absent-and-pinned means the fight was the wrong call | `skirmishes[].macro.absent[]` |
| 10 | A lost fight that bought a cross-map prize is a trade, not a throw | `skirmishes[].macro.crossMap[]` |

**Known gaps in our data vs the canon** (candidate engine work, in rough value
order): Fangtooth stack counts per team (if the API exposes per-objective
kills over time we already have `timeline.majors` — verify granularity);
ward/vision timeline vs the "Fangtooth ward by 4:30" rule (`wardsPlaced` is
end-of-game only); wave-state at rotation time (likely never available —
grade rotations by fight presence instead, which we do); death-timer window
math on `deathCosts` (durationMin + level would let us say "a ~40s death");
first-Fangtooth/first-Prime win% measured from our own feed.

## 4. The interrogation (causation checklist) and the voice

**Causation rule: no observation without its why.** Every claim in a review
must sit in a cause chain the facts support — "we lost" is not analysis,
"their 23m Fangtooth fell with all five of us alive" is. The checklist below
is the set of questions a human coach asks of the footage; each is mapped to
what our feed can actually answer. The coach answers every answerable one per
game (in the narrative or the interrogation block) and NEVER fakes the rest.

| # | Coach's question | Answerable? | From |
|---|------------------|-------------|------|
| 1 | Did a laner lose their matchup or throw it? | YES | `lanes[].verdict/predggMatchup` (the paper read) vs K/D, gold, build vs winning core (the output) |
| 2 | Was each player warding? | PARTIAL — totals only | `players[].wardsPlaced/wardsDestroyed`; team ward war us-vs-them; no placement times/spots |
| 3 | Were river buffs and seedlings taken? | YES | `timeline.majors` RIVER/SEEDLING events carry a side — control share is computable |
| 4 | Where were jungle & support when an objective fell? | PARTIAL | kill stream: who was DEAD in the prior 45–60s of each enemy major; nobody-dead ⇒ conceded uncontested (an awareness/rotation read, THEORY) |
| 5 | Did mid/ahead lanes have the wave to rotate? | PROXY | `skirmishes[].macro.absent[]` with lane state (ahead ⇒ shove was available) — wave position itself is not in the feed |
| 6 | Was the offlane supported when pushed early? | PARTIAL | early ganks/deaths by lane side from the kill stream + `caughtOut`; jungler proximity is not in the feed |
| 7 | Was a won fight converted? | YES | `fights.conversion` |
| 8 | What did each death cost? | YES | `fights.deathCosts`, `caughtOut` |
| 9 | Were fights taken on spikes/items? | YES (modeled) | `fights.itemGap`, `players[].spikes` — THEORY label |
| 10 | Teleport windows, wave states, positions between kills | NO | not in the feed — say so, never guess |

Engine work this implies (backlog): a deterministic `postgame:interrogate`
pass writing per-game answers for rows 1–4 (vision war, river/seedling
control share, per-enemy-major cause chain with an `uncontested` flag,
lane paper-vs-output deltas) so the coach cites them instead of re-deriving.

**The blunt-voice contract (added 2026-08-29, at the maintainer's ask).**
Hardheaded players tune out soft feedback; the coach is allowed — expected —
to be blunt. Blunt is a claim about a decision, priced: it is not rudeness.

- **Blunt with receipts:** a blunt verdict ("that favored lane was given
  away", "five alive and zero contest — that's a map-awareness problem, not
  a numbers problem") requires at least TWO facts from the file behind it.
  No receipts ⇒ no verdict — soften to the question form.
- **Attack the pattern, not the person:** "three solo catches in fog is not
  bad luck three times" is coaching; "he's bad" is not. Never mock, never
  speculate about intent or skill ceiling.
- **Randoms get the same standard:** name their impact factually (a thrown
  favored lane, two wards from a carry) because the squad plans around it —
  it is context and drafting/adaptation material, not an insult ledger.
- **Never side names:** team lines say "we/our/the team" and "they/them" —
  never the map side names dawn/dusk (internal data, not squad-facing voice;
  caught live in the 697fb953 review, 2026-08-30).
- **The existing rules still bind:** third person always, no preference
  coaching, no invented numbers, and the tilt exception (a loss-streak
  night gets a shorter, session-hygiene review, not a harsher one).
- **A minute is not a receipt.** Never cite a bare timestamp: every minute
  travels with the event it names — the fight and its score, the objective
  at stake, the death it priced ("absent from the 0–3 at their Fangtooth
  (20.5)", never "absent at 20.5"). A number without context reads as
  noise to the player it's aimed at and gets tuned out with the rest.
- **Bluntest where the evidence is hardest:** conceded-uncontested
  objectives, thrown favored lanes, ward-war routs, and won-fights-cashed
  gaps are where the blunt register belongs, because the numbers carry it.

## 5. What changed because of this research

Encoded into `.claude/agents/pred-scout-coach.md` (methodology section) and
`.claude/agents/pred-scout-coach-critic.md` (new flaggable issues):

- The review skeleton and the 3–5-moment cap.
- Deaths-first triage order and decision-vs-execution labelling (macro
  claims provable from facts; execution claims hedged or dropped).
- Question-led phrasing as the preferred form for `whatShiftedIt`.
- One evidenced strength per review; structures/conversion elevated to
  headline material.
- Role-normalized judgement as a critic-flaggable error.
- The Predecessor priority rules table above as the coach's rulebook.
- Next-game focus point: each review's `team` line may close with ONE
  focus for the next game, grounded in that game's facts.
- The interrogation checklist (§4) and the blunt-voice contract (§4) —
  causation-complete answers where the feed reaches, honesty where it
  doesn't, blunt verdicts only with receipts.
- Per-player VERDICT: every player in the lobby — squad and randoms alike —
  gets ONE unique labeled line, positive or negative, under their build and
  Eternal reads. Candidate `coaching.verdicts` field for the pipeline so the
  coach authors it per game alongside `perPlayer`. (Cross-game
  trend-grading needs pipeline support — see backlog note below.)

Deliberately NOT adopted: long-horizon training plans (no evidence base),
mechanical/execution critique (invisible to a stats coach), borrowed LoL
calibration constants (must be measured from our own feed first).

Backlog candidates surfaced (not started): a `focus` field in the coaching
block carried across a squad's consecutive films so reviews grade the
previous focus point; measured Predecessor objective win-rate anchors;
death-timer cost annotation in `postgame:fights`.

## 6. Sources

Coaching practice & courses: BSJ replay-review template
(bsjdota.com/blog/dota-2-replay-review-template) and match-analysis guide;
wecoach.gg VOD-review guide; lolcoach.academy; LS coaching interview
(invenglobal.com); replays.lol replay-review method; Mobalytics replay/death
analysis and Dunning-Kruger guides; esportsheaven replay-analysis guide;
British Esports Coach Development Framework (britishesports.org); Pearson ×
British Esports BTEC HNs; NASEF × Skillshot coaching certification; Frontiers
in Psychology 2023 esports-coaching framework (Ericsson criteria);
Performance Consultants (GROW); Weldon Green tilt interviews
(esportsedition.com); MonteCristo CLG journaling (Leaguepedia/grokipedia).

Academic: Yang, Qin & Lei 2016 (arXiv:1701.03162); Akhmedov & Phan 2021
(arXiv:2106.01782); Junior & Campelo 2023 (arXiv:2309.02449); Novak et al.
2020 (IJSSC, 10.1177/1747954120932853); Xia, Wang & Zhou 2019 (Games and
Culture); MOBA-Slice 2018 (arXiv:1807.08360); Schubert, Drachen & Mahlmann
2016 (MIT Sloan); Yang, Harrison & Roberts FDG 2014; Time to Die 1/2
(arXiv:1906.03939; MLWA 2023); Ke et al. IEEE CoG 2022; Drachen et al. 2014
(arXiv:1603.07738); Bisberg et al. CSCW 2025; Sharpe et al. 2026 performance
indexing; Action2Score 2022 (arXiv:2207.10297); PandaSkill 2025
(arXiv:2501.10049); Tencent HMS AAAI 2019 (arXiv:1812.07887); JueWu-SL;
Crafting Champions CHI 2025 (10.1145/3706598.3713141, paywalled — 112h of
elite LoL coaching coded into 3 activities/18 events, worth acquiring);
esports periodization scoping review (arXiv:2409.19180); PLOS ONE 2018
time-on-task & 2022 distributed practice; MDPI Electronics 2025 comeback
prediction; Mobalytics/Pinnacle/Kim Analytics objective-win% anchors.

Predecessor & Smite: predecessor.wiki.gg (Fangtooth, Orb_Prime, Sanctuary,
Respawning — June 2026 revisions); earlyguides.com/predecessor;
gamerdiscovery.com jungle guide; Omeda Creator Guild
(predecessorgame.com/en-US/creator-guild); "Mechanical Masterclass" macro/
micro series and duo-lane/offlane guides (YouTube — titles/metadata only,
transcripts unavailable); metafy.gg/predecessor (paid 1-on-1 coaching);
v1.6 patch notes (death timers); SMITEFire Overarching Conquest Guide;
SMITE 2 wiki Conquest. Pre-1.0/Paragon-era sources excluded as outdated.
