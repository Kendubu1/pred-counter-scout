# Coach audit — the last ten ranked reviews (2026-09-08 → 2026-09-19)

Read of the ten most recent ranked films the squad coach authored
(`data/postgame/*.json` `coaching` blocks), the engine passes that feed it
(`engine/src/skirmishes.ts`, `postgame.ts`, `ingest/postgame-macro.ts`), the
critic history, and outside sources on support grading and blunt coaching.
Purpose: name the biases, the repeated takes, the support misread the
maintainer suspected, and what a blunter, better-balanced coach looks like.

Games: 3a95c5eb (L), 25e1a1e9 (W), bd1fb456 (W), d7df2dda (L), e3f01cb9 (W),
cef7a113 (W), 405cb99a (L), dc93b56f (W), a2e3206d (W), bf93f598 (L).
Mr_Meat31 played support in 7 of the 10.

## 1. Headline findings

1. **Support is misread, and it is mechanical, not stylistic.** Three engine
   facts conspire: fight presence counts only killers and victims (assists
   are invisible), the "support lane" verdict is a 1v1 kill-window sim of
   support-vs-support, and the engine has no model for support Eternals so
   it recommends a damage major to every enchanter. The coach narrates all
   three as truths about the game. Section 2.
2. **Every review is the same review.** Ten games, one skeleton: lane
   reads → fight list → "cashed N of M won fights" → ward count → "get the
   ahead lane to rotate" as next game's focus. Section 3.
3. **It grades the model, not the game.** Thirty mentions of the paper read
   ("theirs all game"), seventy-two of the meta core, fifty-two of "the
   trade-off". Section 4.
4. **The blunt-voice contract is signed but not honored.** Forty-one hedges
   across ten reviews, eleven "mixed" verdicts, zero throws called throws,
   zero rankings, zero cross-game memory. Section 5.
5. **Too long in the wrong places.** ~2,300 words per review; 44% of it is
   build/Eternal "why" prose that is near-identical game to game. Section 6.
6. **First drafts are error-heavy; the critic is load-bearing.** September
   first-round agreement rates: 30%, 41%, 33%, 15%, 63%, 48%. False stats
   ("Kira led the team in kills" when Boris did) reach the draft every game.
   Section 4.6.

## 2. The support misread

### 2.1 Fight presence ignores assists

`engine/src/skirmishes.ts:23` documents `ourHeroes` as "heroes involved per
side (killer or victim)". The macro pass (`skirmishMacro`, lines 131–137)
builds the participant set the same way, then marks every alive
non-participant `absent`. A support whose whole job is to be in the fight
without taking the kill is therefore "absent" by construction.

| game | support | K/D/A | kill participation | in fights by kill/death | flagged absent | verdict mood |
|---|---|---|---|---|---|---|
| bd1fb456 | Phase | 0/1/14 | 82% | 1 of 6 | 5 | steady |
| a2e3206d | Phase | 1/3/28 | 76% | 3 of 14 | 11 | strong |
| bf93f598 | Phase | 4/1/12 | 59% | 4 of 14 | 9 | pinned |
| 405cb99a | Muriel (random) | 1/7/11 | 57% | 7 of 15 | 8 | exposed |
| 25e1a1e9 | Maco | 5/1/13 | 56% | 3 of 11 | 8 | pos |
| d7df2dda | Dekker (random) | 1/5/8 | 53% | 5 of 11 | 6 | steady |
| e3f01cb9 | Maco | 6/3/11 | 52% | 8 of 15 | 7 | mixed |
| cef7a113 | Phase | 0/2/12 | 48% | 2 of 9 | 7 | pinned |
| 3a95c5eb | Maco | 1/4/5 | 32% | 4 of 11 | 7 | mixed |
| dc93b56f | Phase (random) | 0/0/4 | 13% | 0 of 9 | 9 | absent |

Across the ten games the support is flagged absent 77 times, the most of
any role (offlane 72, midlane 47, jungle 47, carry 38). cef7a113 is the
clearest casualty: Phase had 48% kill participation, the most healing and
wards on the roster, and the review says "marked pinned in a losing lane and
absent from most of the team's tracked fights" with mood `pinned`. The
dc93b56f headline, "built without the support ever joining a fight", is the
one case where the numbers might back it (13% participation), and even there
the claim rests on the same broken proxy.

The pred.gg `heroKills` query the film pulls (`ingest/predgg-match.ts:21`)
requests killer and victim only. Whether the schema exposes assisting
players is unverified; that is the first thing to check. If it does not,
end-of-game assists still bound the error: a player with A assists cannot be
"absent" from more than (fights − A − K − D) of them.

One caveat cuts the other way. Predecessor credits an assist only for
damage dealt within 12 seconds of the kill (predecessor.wiki.gg/Elimination);
a heal or shield that wins the fight earns nothing. So even assist-aware
presence undercounts pure healers, and kill participation is a floor for a
Muriel or Narbash, never a ceiling. The coach must treat a low-participation
healer as "unknown", not "absent".

### 2.2 The "support lane" is a 1v1 sim

`postgame.ts:9`: "matchup edges are our own sim's kill-window verdicts."
The support row is Phase-vs-Muriel, Maco-vs-Riktor, as a 1v1 kill window.
An enchanter loses a 1v1 kill window to almost anything, so the support
lane reads "theirs all game" in 8 of 10 films regardless of what the duo
lane did. `laneStateAt` (skirmishes.ts:110–116) then maps that string to
`losing`, which is what produces "alive but losing lane and pinned — this
was the wrong fight to start" in the macro notes, and from there "pinned"
verdicts and "get X out of a losing lane" as next-game focus.

The duo lane is a 2v2 (the methodology doc says so, §3 "Lane identities").
The coach never once reads carry+support against carry+support. It does have
the pieces: the carry's verdict, first blood side, the first Fangtooth, the
duo's deaths before minute 10. The engine also already mines true duo-lane
records (lessons.md 2026-06-13); none of that reaches the film.

The coach then narrates the sim as fact: "lost the support lane to Muriel the
entire game", "the support lane against Lt. Belica was lost the whole game".
Under the honesty contract that is a THEORY verdict presented as an outcome.

### 2.3 Support Eternals are unmodeled, so every enchanter gets Vesh

`data/artifacts/{maco,phase,muriel}.json` `eternals.unmodeled` lists Marrow,
Nihil, Aion, Exarch, Weald, Rust, Pilow, Satariel, which is the support
half of the catalog. The modeled top pick for all three is Vesh, an
ability-DoT major. The coach then writes a fresh rationalization each game:
"fits a link-and-buff support" (bd1fb456), "adds a damage-over-time tick…
suits a support who spent the game pinned" (bf93f598), and for Muriel in
405cb99a it recommends the DoT major and in the next sentence says the build
lacked heal-and-shield amplification. Only 25e1a1e9 broke the pattern and
named Exarch, which means the author ignored the engine that time.

The repo's own committed field evidence contradicts the pick
(`data/aggregates/predgg-augments.json`, ranked, pred.gg, 2026-07-06):

| hero (support) | Exarch picks / winrate | Vesh picks / winrate |
|---|---|---|
| Phase | 6,892 / 53.6% | 317 / 48.9% |
| Maco | 1,628 / 48.3% | 124 / 54.0% |
| Muriel | 2,760 / 51.9% | 71 / 39.4% |

Exarch is the support major by a factor of ten to forty; the engine cannot
score it, so it never appears. A "why this loadout fits" paragraph written
around an Eternal the engine cannot score, against evidence the site already
holds, is filler with a confidence problem. The honest line is one sentence:
the engine does not model support Eternals; the field runs Exarch.

### 2.4 The yardstick the coach claims versus the one it uses

The agent spec says supports are graded on map presence and peel. The
fields available are wards placed/destroyed, assists, healing, mitigated,
damage taken. No ward timing, no crowd control landed, no shields. So the
review says "support is not graded on the kill line" and then quotes the
KDA in the support verdict in 8 of 10 games (31 KDA phrasings across
support verdicts). In 405cb99a it compares Muriel's healing to Akeron's
self-heal and Khaimera's passive as if they were the same stat.

What the feed can support, and the coach does not compute: kill
participation share, assist share of team kills, wards per minute against
the enemy support, wards destroyed, deaths before minute 10, how often the
support died first in a fight (the kill stream gives this), and whether the
carry died in fights the support was in.

### 2.5 The support build read is one paragraph, reused

Five of the seven Mr_Meat31 support reviews carry the same build paragraph:
skipped Enra's Blessing, which "shields an ally the instant they get locked
down". True each time and useless by the third repetition. The maintainer's
own lesson from June ("one true problem repeated across every surface reads
as nagging", lessons.md 2026-06-18) applies.

### 2.6 A preference leak that the rules forbid

`postgame.ts:632` computes `draftNote` from `roleFit.concern` ("3 of five
queued off a bottom-two lane: Mr_Meat31 (support→offlane) …") and
`ui/v6/coach.html:845` renders it on the page. That is exactly the
"play your best role" coaching the critic's rule (a) bans. It leaked into
copy at least once past the critic: 25e1a1e9, "The role itself was a stretch
too — his tracked best fit is carry, not jungle, a gap of 6.6 wins per 100
games". The `[off bottom-two lane]` tag in the critic's own SOURCE printer
(`coach-critique.ts:47`) invites it.

## 3. Repeated takes (counts across the ten reviews)

| take | mentions | games | note |
|---|---|---|---|
| "cashed" won fights / 90-second conversion | 20 + 13 | 10 | headline of 5 reviews, `whatWorked` of 4 |
| alive-and-ahead never rotated / absent | 22 | 6 | next-game focus in 6 of 10 |
| lane read "theirs/ours all game/early" | 30 | 6 | 15 in one review (405cb99a) |
| "caught alone" / solo catch | 48 | 8 | |
| death "fed"/"directly preceded" an objective | 21 | 9 | |
| no armor / no magic resist vs 3-of-5 comp | 16 | 6 | flagged for two or three players per game |
| winning core / meta core | 72 | 10 | |
| "the trade" / "trades away" / trade-off | 52 | 10 | every Eternal read |
| Demiurge / Vesh / Krix / Vermis | 27 / 19 / 9 / 8 | | Eternal reads are boilerplate |
| "This is theoretical, the feed doesn't record the Eternal" | 15 | 3 | five times per review |
| "clearest strength" / "one throughline" / "the one gap" | 20 | 9 | |
| "the shape worth repeating" | 9 | 8 | |
| em-dashes | 102 | | 39 in one review; the readability rule caps one per sentence, and 3a95c5eb still shipped with 39 |

The skeleton is identical in all ten `team` paragraphs: lane reads,
chronological fight list with scores, conversion tally, ward tally,
one-sentence focus. The moments are always three fights described as
"won X-Y at Z, then the objective fell / didn't". The verdicts are stat
restatements with a mood label.

Some of this repetition is the pipeline's fault, not the author's: the
facts file hands the coach `matchupItemFlags` for every player, a
`conversion` block, an `absent[]` list per fight, and a winning core per
player, and the spec tells it to use all of them. Ten games later that is
the same ten sentences.

## 4. Biases

### 4.1 Paper-read anchoring
The sim verdict leads the per-player line in 8 of 10 reviews ("in a lane
that read theirs all game…"). When output contradicts the read, the coach
reconciles them ("on paper X, but the box score said otherwise") instead of
dropping the read. The reader is being told about the model.

### 4.2 Meta-core conformity
Every build is measured against the pred.gg winning core with its winrate,
including builds that won the game: Kira's 12/1 (bd1fb456) still "skipped
the winning core entirely", GRIM.exe's 39,871 damage (bf93f598) still
"kept only Plasma Blade". The site's own engine philosophy is off-meta
proof; the coach's is conformity.

### 4.3 Post-hoc death cost
`deathCosts` marks any death within 90 seconds of an enemy objective. The
coach reads every one as causation: "seven of his nine deaths were followed
by a lost tower or objective". A death in a lost 5v5 near Orb Prime and a
solo catch are the same sentence.

### 4.4 Result anchoring
Verdict moods in wins: strong 8, dominant 2, commanding 1, pos 2, good 1.
In losses: rough, costly, exposed, outdueled, absent, pinned, missing. The
same flag gets opposite verdicts by result: Greystone with no armor against
a three-physical comp in a win is "and it still didn't matter"
(dc93b56f); Countess with the same flag in a loss is "exposed" (bf93f598).
The coach is grading the scoreboard and back-filling reasons.

### 4.5 Rotation bias, all roles
Because "absent" means "not a killer or victim", the offlane is flagged 72
times and told to rotate from a won lane while the digest the coach is
told to use says the offlane is an island. A rotation call needs the wave
state and the distance, which the feed does not have; the spec says to
say so, the reviews say "a shove-and-rotate flips the numbers" instead.

### 4.6 First-draft accuracy
Critic rounds 25–35 (September) flagged 19, 11, 16, 18, 7, 5, 13, 6, 14,
23, 10 lines out of 27–31 per game. The 3a95c5eb draft had Kira leading the
team in kills (Boris did), a kill on Dekker that was on Wraith, and an
objective tally that contradicted the next sentence. The independent critic
is the accuracy layer; the author is not. That is the design, but it means
any push toward a rawer voice must ship with the critic, never around it.

### 4.7 Hedging
Forty-one hedges in ten reviews: "arguably", "likely mattered", "might have
mattered", "a defensible pickup", "a reasonable bet", "worth carrying
forward". The blunt contract says a grounded verdict gets no apology; the
copy apologizes in every buildRead.

## 5. Personality: why it reads flat, and what blunt looks like here

What the reviews never do: rank the roster; say who won or lost the game
for the team; call a throw a throw; name a pattern across games
(Mr_Meat31 appears in 8 of 10 films, Goldilocks/Xeebs/Willy in 7, and no
review references any other game); have an opinion the numbers forced;
use humor. Every verdict is a stat restatement with a label, and "mixed"
is the label 11 times.

The house style already permits bluntness with two receipts. The gap is
lexicon and shape, not permission. Rewrites from these films, same facts:

- 3a95c5eb, Iggy & Scorch, current: "Won the mid lane against Wraith the
  whole game and still finished zero kills across seven deaths, with only
  two items done by the 27-minute mark. Several of those deaths fed a
  Fangtooth or Orb Prime soon after — a favored lane that never turned
  into pressure." Blunt: "Mid was ours on paper all game and produced
  0/7 with two items at 27 minutes. That is not a lost lane, that is a
  donated one. Three of those deaths handed over a Fangtooth or the Orb
  Prime. Lowest grade on the roster."
- dc93b56f, Khaimera, current: "…two of them caught alone outside any
  team fight, at 7.7 to The Fey and 16.7 to Boris, a pattern worth fixing
  even in a blowout win." Blunt: "Seven deaths in an 8-0 tower stomp.
  Two were solo, in the enemy jungle, with no objective up. The other
  four lanes were so far ahead it did not matter. Against a team that
  can punish, it does."
- 405cb99a, team focus, current: "Building around the enemy's fed carry
  earlier is the one thing to fix next game." Blunt: "Legion killed four
  of us sixteen times and two of five bought armor. The fix is not
  subtle."
- cef7a113, Phase, current (the misread): "marked pinned in a losing lane
  and absent from most of the team's tracked fights." Corrected and
  blunt: "Zero kills, two deaths, twelve assists on twenty-five team
  kills, most heals and most wards on the roster. Nothing to fix here;
  the fights we lost at 20 and 22 were three-man fights taken while the
  offlane farmed a won lane."

Devices that make blunt land rather than roast, drawn from the coaches
competitive players actually rate (research in §7):

1. **A verdict in the first sentence, then the receipts.** Not the
   receipts building to a verdict.
2. **Roster ranking every game.** "Won it for us / carried their weight /
   cost us" with one line each. Players read their own line first and the
   ranking second; a ranking is the bluntest honest thing a stats coach can
   say.
3. **Name the pattern across games.** "Third film in a row with a solo
   death before minute 8" is blunter and more useful than any single-game
   verdict, and the pipeline has the films. The methodology already lists
   cross-game focus as its biggest structural gap.
4. **Plain words for plain facts.** "Threw", "donated", "griefed the
   objective", "free kill", "coin-flip fight", "farmed while the team
   fought". All describe decisions, none describe the person.
5. **One joke per review, at the decision.** Humor about the play, never
   the player, and never in a loss-streak session.
6. **No hedges.** If the receipts are in the file, say it; if not, ask the
   question form. Delete "arguably", "likely", "defensible", "reasonable".
7. **"Unhinged" has a floor.** The line between blunt and abuse is the
   existing rule: pattern and decision, never skill ceiling, intent, or
   insult. Tilt-aware tone on loss-streak nights stays.

## 6. Verbosity: where the words go

| section | avg words | visible by default on coach.html |
|---|---|---|
| headline | 28 | yes |
| team | 262 | collapsed (rule: open only if ≤220 chars, so never) |
| whatShiftedIt | 82 | yes |
| whatWorked | 50 | yes |
| perPlayer (5 lines) | 456 | yes |
| verdicts (5) | 206 | yes |
| moments (3–7 calls) | 194 | yes |
| buildReads (5 × build + eternal) | 1,004 | collapsed |
| **total** | **2,282** | ~1,000 visible |

The build/Eternal "why" layer is 44% of every review and the least varied
part of it. Per-player lines at ~90 words each are three sentences of
receipts before any verdict. The verdict lines, which should be the
scannable layer, average 40 words and repeat the perPlayer line.

A better balance for competitive readers (research §7): three tiers with
hard budgets.

- **Tier 0, ten seconds:** headline verdict (≤20 words), one fix (≤20
  words), roster ranking with a one-line grade each (≤15 words per player).
- **Tier 1, one minute:** three moments (≤40 words each), what shifted it
  (≤50), what worked (≤30).
- **Tier 2, on demand:** per-player receipts (≤60 words), build read (≤50,
  only when the build differs from the meta core AND the difference had a
  fight to show for it), Eternal read (one sentence, omitted entirely when
  the engine cannot model the role's Eternals), the full team story.

That lands near 900 words total, with the blunt layer on top and the
teaching layer underneath, instead of the reverse.

## 7. What the outside sources say

Support grading (Predecessor sources):

- Assists require damage within 12 seconds of the kill; healing, shielding
  and crowd control earn none (predecessor.wiki.gg/Elimination). Kill
  participation therefore measures CC/engage supports well and healers
  badly. Nothing on pred.gg or omeda computes a support-specific score;
  the only role-specific scoreboard column is wards placed/destroyed.
- The role's job per the wiki and creator guides: Solstone vision, the
  Fangtooth ward by ~4:30 and duo priority at the 5:00 spawn, roam
  mid-game toward the winning lane and ward on the way, peel with CC, and
  stay with the team late. Stats that carry that: wards placed and
  destroyed, deaths (a support death is nearly always positional or a
  lost duo), damage taken relative to the carry for tank supports,
  participation for CC supports, and a low-normal gold share. Stats that
  mislead: KDA, hero damage, and any "support vs support" lane read; the
  duo's differential at 10 is the proxy sources use instead.
- Support Eternals in the field (our committed pred.gg evidence, ranked,
  1.15): Exarch 31% of support picks, Krix 24% (tanks), Vesh 16% at 47.8%,
  Lotus 7.8% at 53.1%, Aion 7%. Healers and shielders run Exarch; tanks
  run Krix/Idrisil; mage-supports run Vesh/Aion. The 1.16 additions
  (Pilow, Satariel, Weald, Knell) are absent from the snapshot.

Blunt coaching that lands (practitioner and research sources):

- LS (Inven interview): "Sometimes you have to be harsh… rattle their core
  so they can break a habit." Harshness is tolerated because the analysis
  underneath it is deep and the aim is understanding, not orders.
- cvMax (Esports Insider, May 2026): "You are the ace of making us lose"
  drew fire because it was a ranking without a receipt. The test the
  piece applies: harsh words work when they create clarity,
  accountability and urgency, and fail when the player is left humiliated.
- BSJ's review template: top three mistakes and strengths, phrased as
  questions, one high-impact issue followed up next session.
- Pro-sport coaching study (PMC7522355): two or three points maximum per
  review ("throw ten tennis balls, they catch two or three"); deliver
  right before the next session.
- Tilt study (CHI 2021, 95 LoL players): players tilt from teammates far
  more than opponents, and the harshest reactions are aimed at
  themselves; believing a habit is fixable predicts constructive coping.
  A review that pins a loss on one squad member is the tilt trigger; one
  that names a fixable pattern supports the frame that helps.
- Radical Candor: challenge directly and care personally; challenge
  without care is "obnoxious aggression". Practitioner guides agree harsh
  feedback is useful when specific, pattern-focused and paired with a
  concrete next step.

Length and format:

- Next Level Esports: "Full game. 12 mistakes. 1 hour later. Players nod.
  Nothing sticks. Pick 1 moment." One or two goals per review.
- Mobalytics post-game opens with three questions (what went well, what
  caused the loss, what to improve first) and pushes one focus area per
  session; its GPI is eight dimensions as a shape, not prose.
- Senpai.gg users called generic stat tags a commodity and asked for
  decision-level context ("stay in lane or help a teammate").
- Nielsen Norman: 79% of readers scan; inverted pyramid, one idea per
  paragraph, half the words.

Sources: predecessor.wiki.gg (Elimination, Gameplay, Fangtooth, Eternals);
predecessorgame.com patch notes 1.16; pred.gg match pages; predbuilds.com
eternals; gameskeys.net support guide; victoryview.gg on kill
participation vs damage; invenglobal.com LS interview; esportsinsider.com
cvMax piece (2026-05); bsjdota.com coaching and review template;
pmc.ncbi.nlm.nih.gov/articles/PMC7522355; dl.acm.org/10.1145/3411764.3445143;
radicalcandor.com; bettergamer.com VOD-review guide; nextlevelesports.com
VOD-review guide; mobalytics.gg/gpi; news.ycombinator.com/item?id=28145998;
nngroup.com how-users-read-on-the-web.

## 8. Recommendations, in order

Engine, deterministic (fixes the misread at the source, and the critic then
enforces it for free):

1. **Assist-aware fight presence.** Check the pred.gg `heroKills` schema for
   assisting players; if present, add them to the participant set. If not,
   bound the flag: a player is never marked absent from more fights than
   (fights − kills − deaths − assists), and supports are never "absent" from
   a fight their carry was in. Add `participation` (K+A over team kills) to
   every player and print it in the SOURCE. Files: `skirmishes.ts`
   (`skirmishMacro`), `ingest/predgg-match.ts`, `postgame.ts`.
2. **Duo-lane read.** Replace the support row's 1v1 sim with a duo verdict
   (carry+support versus carry+support: the carry's kill-window plus first
   blood side, first Fangtooth side, duo deaths before minute 10). Until
   then, `laneStateAt` for role `support` returns the carry's state, and
   the support's own 1v1 line is dropped from the SOURCE. Files:
   `postgame.ts` lanes, `skirmishes.ts:110`.
3. **Support Eternals.** When a hero-role's modeled top pick has `ehpPct: 0`
   and the role is support, emit `eternals.top = []` with a note that the
   support majors are unmodeled; the coach writes one sentence, not a
   paragraph. Longer term, curate Marrow/Nihil/Aion/Exarch/Weald/Rust/
   Pilow/Satariel into `effects.json`. Files: `artifacts.ts`, `eternals.ts`.
4. **Support yardstick block** in the facts file: participation, assist
   share, wards per minute vs enemy support, wards destroyed, deaths before
   10, died-first count, carry deaths with/without the support present.
   File: `ingest/postgame-fights.ts` or a new `postgame:support` pass.
5. **Remove the preference leak.** Drop `draftNote`/`roleFit.concern` from
   the coach page and from the critic SOURCE printer. Files:
   `ui/v6/coach.html:845`, `ingest/coach-critique.ts:47`.
6. **Cross-game memory.** A `focus` field carried into the next film's
   SOURCE, plus each squad member's last three films' verdict labels and
   caught-out counts, so the coach can say "third game in a row". This is
   the methodology's own top backlog item.
7. **Death-cost precision.** Split `deathCosts` into solo-death-before-
   objective and died-in-lost-fight-before-objective; only the first is a
   personal receipt.

Coach agent (`.claude/agents/pred-scout-coach.md`):

8. **Shape:** verdict first, receipts second, in every field. Add a
   `ranking` field (ordered pids with a ≤15-word grade). Word budgets per
   field as in §6.
9. **Lexicon:** allow "threw / donated / griefed / free kill / coin-flip /
   farmed while we fought"; ban the hedge list; ban "the shape worth
   repeating", "clearest strength", "one throughline"; "cashed" once per
   review; "on paper" once per review; the Eternal disclaimer never (the UI
   already labels the row THEORY).
10. **Result-blind grading:** the same flag gets the same verdict in a win.
    A stomp with seven deaths is still seven deaths.
11. **Build reads only where the build had a fight to show for it**; skip
    the read when the build matched the core or the game did not test it.
12. **Support rule, explicit:** never quote a support's K/D in the verdict;
    grade on participation, first-death share, wards, carry safety; never
    call a support "pinned" or "absent" from the 1v1 sim.

Critic agent (`pred-scout-coach-critic.md`):

13. New flag (h) **role misread**: a support graded on the 1v1 lane read or
    KDA, an "absent" claim for a player with assists in that fight window,
    an Eternal rationalization for an unmodeled loadout.
14. Flag hedges on grounded verdicts as (g), and ban the three stock
    phrases by name.

UI (`ui/v6/coach.html`):

15. Render the ranking as Tier 0 above the headline; open the team read
    when it is under the new budget; move buildReads under a single
    "teaching" disclosure per player rather than two.

## 9. Status

2026-09-21: engine items 1 (presence is `unproven` for any player with
assists; supports never read from the 1v1 sim), 3 (one-line unmodeled
support Eternal read), 5 (preference leak out of the SOURCE and copy), 6
(PREVIOUS FILMS block for callbacks) plus the interrogation window fix;
coach items 8–12 and critic items 13–14 in the agent specs; the ranking
block on the coach page; the ten films re-authored and critiqued.

2026-09-22: items 2 (duo-lane 2v2 read in `interrogation.duoLane`), 4
(support yardstick block in `interrogation.support`), 7 (death-cost `solo`
split), the `draftNote` render removed, fight labels naming who took the
prize, the kit anti-heal line reading the counter-build count, and a third
critic round applying the side corrections; the two films the automation
added were re-authored under the contract. Still open: the per-fight
assist schema check on pred.gg (needs credentials) and Baron Valmont's
icon (same).
