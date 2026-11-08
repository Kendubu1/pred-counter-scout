---
name: team-playbook
description: Coach a Predecessor team's synergy from its five kits — who opens a fight, which crowd control chains next, where the damage lands, who peels the carry, and which enemy abilities to bait out first. Use for a draft or lobby ("we have Steel, Kaelen, Renna… vs …, how do we play this?"), for a reviewed game's plays, or when writing coach copy about engagements. Grounded in the scanned kit index; never invent ability effects.
---

# Team playbook (Predecessor Scout)

1. **Get the facts, don't recall them.** From `engine/`:
   - Any two lineups: `npm run playbook -- "<5 heroes>" vs "<5 heroes>"` (names or slugs, in
     offlane jungle midlane carry support order). Add `--json` for the full kit per hero.
   - A reviewed game: read `film.playbook`, `film.kitRead`, `film.teamComp` in `data/postgame/<id>.json`.
   The output comes from `data/game-data/kit-index.json` (CC, durations, AoE, mobility,
   unstoppable, all agent-scanned against the current catalog text) and the reviewed role tags
   (`data/game-data/role-tags.json`). Rules: `engine/src/playbook.ts`.

2. **Coach the plan in this order:**
   - **Opener**: the tank / engage hero's area CC (only tank or engage heroes go in first; a peel
     hero's save, such as Muriel's Reversal of Fortune, is never an opener). If the playbook says
     there is no opener, say so first: the team should play for picks or counter-engage.
   - **Chain**: the next hard CC lands as the previous one ends (use the stated durations), so the
     enemy is never free; spread the CC instead of stacking it on the same second.
   - **Payoff**: the burst / control / dps damage goes in during the lockdown, area damage on a
     grouped enemy.
   - **Peel**: who holds their CC for the enemy divers on our carry.
   - **Bait or wait out**: their longest area CC and anything unstoppable; fight after it is spent.

3. **Honesty rules.** Name only abilities and effects that appear in the playbook or the kit
   index. Durations and AoE come from the kit text; whether a team can actually land a combo
   depends on positioning and timing the data cannot see, so frame plays as a plan ("open with…",
   "hold … for …"), never as what happened. Win-rate claims about comps come only from
   `data/aggregates/team-comp-report.json` (tanks, CC gap, divers), never from memory.

4. **Keep it short.** One line per step, hero then ability then why. A draft answer is: the shape
   (tags and CC count each side), the teamfight play, the pick play, who peels whom, and the two
   enemy abilities to bait first.
