# Practice-mode calibration checklist

Five unverified constants remain (ultRankLevels was verified from data
on 2026-06-12; crit multiplier and bonus-only scaling now carry strong
data evidence but want a 10-minute confirmation; the MITIGATION
measurement is now the highest priority because live data hints armor
may be worth less than the assumed formula says). Six constants
originally gated the engine's confidence at THEORY. Each
section says what to do in game, what to write down, and where the value
goes in `engine/fixtures/calibration.json`. After editing the fixture, run
`cd engine && npm test`: the harness re-checks everything and the
unverified-constants warning shrinks automatically.

Total time: roughly 60 to 90 minutes in practice mode. Bring this file.

## 1. mitigation (the armor formula)

What to verify: damage taken = raw x 100 / (100 + armor).

How:
1. Pick Gideon, no items, level 1. Void Breach rank 1 deals a flat 95
   magical (current patch, zero MP).
2. Hit an enemy bot hero whose magical armor you know from the base-stat
   table (`data/omeda/heroes.json`, `base_stats.magical_armor[level-1]`;
   for example Riktor level 1 has a known value). Read the actual damage
   number shown.
3. Compute factor = observed / 95. Check whether factor = 100/(100+armor).
4. Repeat at two more armor values (let the bot level, or pick a tankier
   bot) so the formula is confirmed at 3 points, not fit to 1.

Record: the (armor, observed damage) pairs. If the formula holds, set
`constants.mitigation.verified: true` and put the pairs + date in `source`.
If it does not hold, write the observed pairs into source anyway and leave
verified false; we will fit the real curve.

## 2. abilityHaste (cooldown formula)

What to verify: cooldown = base x 100 / (100 + AH).

How:
1. Same Gideon. Note Void Breach rank 1 base cooldown (11s current patch).
2. Buy one item with ability haste only (e.g. 20 AH). Read the cooldown
   the ability UI now shows, or stopwatch it.
3. Expected if formula holds: 11 x 100/120 = 9.17s.
4. Repeat at a higher AH total (e.g. 60+): expected 11 x 100/160 = 6.88s.

Record: (AH, observed cooldown) pairs into `constants.abilityHaste.source`,
flip verified when it matches at both points.

## 3. critMultiplier

What to verify: the damage multiplier of a critical strike (assumed 1.75).

How:
1. Ranged carry (Murdock or Sparrow), level 1, no items: basic-attack a
   bot, note the non-crit number N.
2. Buy crit-chance items to a high crit total; keep attacking until crits
   appear; note the crit number C against the SAME target at the same
   level (do not level up between steps; armor changes with level).
   Important: buy items with crit chance but no physical power if
   possible, or recompute N with the new power first (hit until you see
   a non-crit).
3. Multiplier = C / N (non-crit with same items).

Record: N, C, and the ratio in `constants.critMultiplier.source`; set
`value` to the measured ratio and flip verified.

## 4. attackSpeedFormula

What to verify: attacks/sec = base_attack_speed[level] x (1 + item_AS/100).

How:
1. Murdock level 1. Base attacks/sec from the table
   (`base_stats.attack_speed[0]`). Count attacks over 20 seconds on a
   target (phone timer; count swings, divide by 20). Should match the
   table value.
2. Buy +attack speed items totalling a known percent (e.g. +50). Count
   again over 20s. Expected: base x 1.5.

Record: both counts in `constants.attackSpeedFormula.source`; flip
verified if they match within counting error (~5%).

## 5. abilityScalingUsesBonusPowerOnly

What to verify: a "(+70%)" ability ratio applies to item-granted power
only, not base power. (Heroes have base physical power that grows with
level; whether ratios read it matters a lot for physical casters.)

How:
1. Pick a PHYSICAL-scaling caster (Grux: Crush). Level 1, no items.
   If the ability tooltip/damage equals the listed rank-1 base value
   exactly, base power is NOT included (bonus-only confirmed at point 1).
2. Buy one physical power item with a known amount (e.g. +45). The damage
   should rise by exactly ratio x 45 if bonus-only, or by ratio x (45 +
   base AD) if total-power (it will be obvious; base AD at level 1 is
   ~60).

Record: both observations in
`constants.abilityScalingUsesBonusPowerOnly.source`; set `value`
accordingly (true = bonus-only) and flip verified.

## 6. ultRankLevels — DONE (verified from data, 2026-06-12)

Verified without practice mode: pred.gg's in-game recommended skill
orders place ultimate points at levels 6/11/16 across heroes. Skip this
one.

## ~~6. ultRankLevels~~ (original instructions, no longer needed)

What to verify: ultimates can be ranked at levels 6 / 11 / 16 (assumed).

How: in any practice game, level up and note the exact levels at which
the ult accepts a skill point (first, second, third rank).

Record: the three levels in `constants.ultRankLevels.value`; flip
verified.

## 7. attackSpeedCap (added 2026-06-12 — the Deathstalker finding)

What to verify: whether attacks/sec stops scaling at some cap. The sim
currently has NO cap, and pen-stacked Deathstalker builds (Onslaught
converts total flat pen to attack speed) reach 3.5+ attacks/sec — which
the field refuses to play (0.6% median play rate, negative win deltas).

How:
1. Murdock, practice mode. Buy attack-speed items past +150% total
   (Deathstalker + Sky Splitter + Necrosis works).
2. Count attacks over 20s at +100%, +150%, and max purchasable AS.
3. If counts stop rising, the plateau is the cap.

Record: the (AS%, attacks/sec) pairs in `constants.attackSpeedCap.source`;
set `value` to the cap (attacks/sec) and flip verified. If there is
genuinely no cap, set value to null, verified true, and the sim stands.

## Optional, cannot be measured in practice mode

Level-by-minute table (`checkpoints.table[].level`, currently provisional):
the match feed has no level timeline. If you want this measured, note the
scoreboard level at minutes 5/10/15/20/25/30 across a few of your own
real matches (any mode counts roughly; pvp preferred) and we will replace
the provisional levels. Otherwise it stays flagged.

## After measuring

1. Edit `engine/fixtures/calibration.json`: set each measured `value` /
   `formula`, flip `verified: true`, and put the raw observations and the
   date in `source` (the harness requires a non-trivial source string).
2. `cd engine && npm test` must stay green; the fixture-hygiene tests
   will confirm.
3. Commit. Outputs that depended on the constants upgrade from THEORY
   automatically in the CLI banner.
