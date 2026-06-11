# Lessons

Append-only. One entry per backlog item or significant finding.

## 2026-06-11: Item effect schema (backlog item 1)

- Tag-stripped effect text loses which stat a "(+X%)" scales from; the
  stat is in the surrounding markup tag (AttackDamageText vs
  AbilityPowerText vs an icon id). Curate from raw markup, never from
  cleaned text. This disambiguated Deathstalker's Onslaught: attack speed
  equal to 100% of physical penetration, a real cross-stat conversion.
- About 60% of effect targets were cleanly encodable from stated numbers;
  the rest are stack-cadence, positioning, or RNG dependent. Declaring
  them kind:"unmodeled" with a note costs nothing and keeps the registry
  honest; 5 of 12 Eternal majors are in that bucket pending telemetry.
- Marginal-gain ranking surfaces real time dynamics: Vesh's per-minute
  scaling overtakes Demiurge for Gideon around minute 14. Eternal advice
  must be game-time-aware, which no winrate table could express.
- First ranking pass put Krix (+18% eHP) above damage Eternals for a
  ranged mage; survivability weights need kit-context discounting. Coach
  sanity checks on real output catch what unit tests do not.

## 2026-06-11: Engine v0.1 (simulator, search, harness)

- The owned ability scrape has holes: 33/49 heroes had castable slots with
  no damage entries (Crunch's whole kit, Murdock's Buckshot). Structured
  data that looks complete is not; always run a coverage census before
  trusting a source.
- omeda.city `/heroes.json` closed the base-stat gap in one shot: 18-level
  arrays for health, armor, attack speed, mana, base AD, for all 52 heroes.
  Check the sanctioned API for a field before designing a workaround.
- The match feed is oldest-first by default. The "null enrichment on fresh
  matches" finding from earlier research was wrong: those were 2022 matches
  that predate the fields. Matches 1h old are fully enriched. Probes beat
  assumptions; keep `npm run probe` alive.

## 2026-06-11: Patch-currency validation

- The owned hero-abilities.json and items.json are pre-1.14 despite
  commits titled "Apply 1.14.4 patch" (those only updated digests/meta).
  69 ability damage values and 183 cooldowns drifted. Lesson: a commit
  message saying a patch was applied is not evidence the numbers moved;
  validate against an independent source or the patch digest itself.
- Patch digests stating exact values (Void Breach "85-225 -> 95-235") are
  gold for arbitration: they let a test pin source currency permanently.
- Conclusions are patch-sensitive even when the math is right: the 1.14
  global cooldown increase moved Gideon's haste-vs-power crossover from
  10s to ~15s. Tests should assert monotone invariants, not conclusions;
  conclusions get named "golden" gates that a human reviews when they fire.
