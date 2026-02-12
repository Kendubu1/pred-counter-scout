# Data Audit Report — 2026-02-08

## Summary
- **48 hero JSON files** scraped from pred.gg (patch 1.11.2)
- **5 roles**: offlane, jungle, midlane, carry, support
- All heroes have builds, augments, crests, skill orders, and items ✅
- All heroes have matchup/counter data ✅ (stored as `strongAgainst`/`weakAgainst`)
- **0 missing sections** (except 1 empty items list)

---

## 📛 Hero Name Issues (16 heroes)
The GQL API returns internal codenames for these heroes. Need to fix at scraper level.

| File | Current Name | Correct Name | Issue |
|------|-------------|-------------|-------|
| akeron.json | DemonKing | Akeron | codename |
| argus.json | Emerald | Argus | codename |
| bayle.json | Cryptmaker | Bayle | codename |
| eden.json | Mech | Eden | codename |
| feng-mao.json | FengMao | Feng Mao | formatting |
| grim-exe.json | GRIMexe | GRIM.exe | formatting |
| iggy-scorch.json | IggyScorch | Iggy & Scorch | formatting |
| kira.json | Huntress | Kira | codename |
| lt-belica.json | LtBelica | Lt. Belica | formatting |
| maco.json | Swiftpaw | Maco | codename |
| mourn.json | Wood | Mourn | codename |
| renna.json | Bright | Renna | codename |
| skylar.json | Boost | Skylar | codename |
| twinblast.json | TwinBlast | TwinBlast | ok (official) |
| yurei.json | Tidebinder | Yurei | codename |
| zarus.json | Lizard | Zarus | codename |

## 🎯 Counter/Matchup Data
- Counter hero names are **mostly clean** — use real names already
- Only `TwinBlast` appears without a space (26 occurrences), which is the official spelling
- All 49 expected heroes appear as counter references ✅
- **Data stored inconsistently**: 9 heroes use `counters[]`, 39 use `strongAgainst[]` + `weakAgainst[]`
- `strongAgainst` and `weakAgainst` contain **identical data** (same heroes, same win rates) — parser bug where regex matches the same data twice from `body.innerText`

## 📊 Low Sample Size Roles
These hero/role combos have <20 total matches — data may be unreliable:

| Hero/Role | Matches |
|-----------|---------|
| gadget/offlane | 18 |
| gideon/carry | 15 |
| kira/offlane | 18 |
| muriel/midlane | 16 |

## 🏗️ Build Tab Names
55 unique build archetypes found. All look legitimate (On-Hit, Crit/Burst, Pen/Sustain, etc.). No class labels or garbage. "Area Damage" appears 5 times — valid build archetype.

## 💎 Augments & Crests
- 143 unique augment names — all look correct
- 29 unique crest names — all look correct
- No empty/garbage names detected

## 🔧 Items
- All item names look valid
- **Avg buy time** is populated for some items but shows as `avgBuyTime` in the JSON (UI reads `avgTime` → mismatch, needs UI or parser fix)
- Items appear per-slot with duplicates across slots (e.g., "Draconum" at 3 different buy times) — this is expected (same item bought at different stages)

---

## Recommended Parser Fixes
1. **Name mapping**: Add slug→name lookup table in parser/scraper to fix codenames at source
2. **Counter dedup**: `parseCountersPage()` regex matches same data twice → fix to only match each hero once
3. **Normalize counter output**: Always output a single `counters[]` array instead of split strong/weak
4. **Item time field**: Rename `avgBuyTime` → `avgTime` for consistency with UI, or fix UI to read `avgBuyTime`
5. **heroes.json index**: Write index AFTER all heroes are scraped, not during/before
