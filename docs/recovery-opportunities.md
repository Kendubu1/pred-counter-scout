# Recovery audit: practical Scout and Coach milestones

Reviewed 2026-11-14 against current main and existing private recovery summaries.
Recovered bytes are not proof of runtime behavior, active mode selection, or observed player execution.

## Completed in this pass

- Display GENESIS_CORE as Shaper in Coach timelines, legends and historical prose, including Standard and Lean. Keep raw event IDs and the map key `genesis` unchanged. Base Core remains a separate objective.
- Save standard-table timing evidence in `data/game-data/objective-timing-evidence.json`. These are configuration values, deliberately not enabled as live availability logic.
- Preserve original extracted assets and decoded bodies privately. The committed evidence contains only selected scalar facts and limitations.

## Ordered milestones

| Milestone | Evidence already available | Work still needed | Completion criterion |
| --- | --- | --- | --- |
| 1. Reliable objective clock | Standard table: Fang 300s/285s; Mini 420s/360s; Orb transition 1200s; Seedling 240s/240s; Shaper transition 900s, respawn 360s. `native-override-config-review.json` records mode substitutions. | Resolve active config selection, native timer origin, replacement behavior and attackable animation delay. River interval must not be assumed death-relative. | Patch/mode-bound clock with separate first-spawn, respawn and replacement semantics; fixtures cover both replacement pairs. Until then show configuration evidence only. |
| 2. Objective clear accuracy | `objectives.ts` already estimates clears. Camp/world assets and curves exist privately. | Replace calibration's unverified Fangtooth 2400 HP, 30/30 armor and 90 contact DPS. Recover level-bound health/armor first; validate attack cadence separately. | Verified health/armor profiles feed the existing simulator. Incoming damage and safe-solo claims remain provisional until attack behavior is checked. The 25-second feasibility cutoff remains a heuristic. |
| 3. Single-target item ordering | `effects.json`, `item-effect-model.md`, native traces, diagnostic `malice-replay.ts`. Vanquisher aggregate correction already shipped. | Shared event ordering for Combustion eligibility/shared cooldown, Sky Splitter current-health/floor order, Malice depletion/recharge and intermediate-hit execute. | Production uses the verified event path; regressions demonstrate interaction ordering and explain ranking changes. Diagnostic replay alone does not satisfy this milestone. |
| 4. Multi-target build value | `projectile-item-client-review.json` and `projectile-targeting-review.json`: Scattershot secondary-target exclusion and Onixian distance/scaling bindings. | Verify collision, crit/lifesteal and downstream on-hit behavior before including populated-scene procs. | Explicit isolated-target versus nearby-target scenarios, with range assumptions visible. No automatic full splash credit in duels. |
| 5. Conditional matchup coaching | Passive inventory, Knell native effect review and controlled stack modeling; Belica target/actor traces. | Feed concise mechanics conditions into both coach variants, tied to recorded enemy heroes/items. Complete lifecycle gaps before numerical recommendations. | Useful conditional advice about activation/counters without alleging missed CC, cancelled ultimates, positioning or proc uptime absent telemetry. |

## What decompiling can and cannot answer

It can recover what activates an effect, target filters, scaling, cooldowns, and curve/effect bindings. It cannot establish whether a player actually landed a skill, had vision, communicated a gank, or could safely contest an objective. Those need match events, positions/casts, or replay evidence.

Keep a compact evidence trail per integrated mechanic: source build/hash, recovered value, behavior trace, production consumer and gameplay calibration. Existing native reviews are build-bound; current match patch must not silently inherit their certification.

## Do not repeat completed work

Vanquisher's unconditional aggregate bonus was corrected. Energized StacksOnHit binding is recovered, while effective grants and cadence remain separate questions. Momentum's movement-grant primitive exists. Knell controlled-stack effects exist; full stolen-defense lifecycle remains incomplete. Some old recovery summaries predate these advances.

## Private evidence locations

The sibling workspace contains `objective-curves-decoded-private/ct_GameModes-curves.json`, `objective-timers-decoded-private/`, `all-effect-summary-private.json`, `trigger-summary-private.json`, and Belica target/actor traces. Do not commit their decoded bodies. The curve parser consumed the complete row stream and checked its end marker; that validates parsing, not active server configuration.

Official naming cross-check: the [Shaper introduction](https://www.predecessorgame.com/es-MX/news/patch-notes/v1-8-patch-notes) describes its Seedling replacement at 15 minutes. The [1.18 notes](https://www.predecessorgame.com/en-US/news/patch-notes/PatchNotes_1.18) use Genesis Core for the same replacement in Overclocked; mode-specific reduced timings must not overwrite the standard table.
