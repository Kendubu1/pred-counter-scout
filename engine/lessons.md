
## 2026-06-13: eternal scaling answers + the generic line retired

- "Does it account for the scaling?" — yes, by construction: per-level
  terms (Krix +1% max health per level → +18% eHP at the checkpoint),
  per-minute expected-value accruals (Lotus's random 2-minute buffs),
  and build-relative multipliers (Demiurge's 12% on item stats) are all
  realized at the evaluation minute. Worth restating on demand because
  the page shows only the resulting deltas.
- "Field evidence only — not in our kit math yet" was two problems:
  a display bug (the page matched only the top-3 modeled Eternals, so a
  modeled one ranked 4th claimed to be unmodeled) and a vagueness bug
  (the registry has SPECIFIC reasons — Exarch buffs the heal target,
  Aion is an economy effect). Artifacts now emit every ranked Eternal
  with deltas or its precise reason, and the page prints the reason.
  A generic disclaimer is a smell: if the system knows why, say why.
