# Predecessor Scout

**A free counter-pick, matchup, and build education tool for [Predecessor](https://www.predecessorgame.com/).**

🔗 **Try it:** [https://kendubu1.github.io/Pred-Scout/ui/v2/](https://kendubu1.github.io/Pred-Scout/ui/v2/)

☕ **Support:** [Buy Me a Coffee](https://buymeacoffee.com/saint_kendrick)

📝 **Feedback:** [Google Form](https://forms.gle/hS9bXZvqiGFruSjy5)

## Why This Exists

every stat site tells you WHAT to build and WHO to pick but never WHY.

"Riktor counters Kallari 57% win rate." ok cool but why? what do I actually do in that matchup? when do I engage? what do I build different?

I came into Predecessor fresh after my Paragon buddies put me on. 400+ hours later, still Gold 1, and the learning curve is steep. most tools just throw stats at you without explaining anything. console players can't alt-tab during draft to look stuff up. pred.gg's counter page has been broken.

this isn't meant to replace pred.gg. it supplements it by going deeper into the WHY behind counters, builds, matchups, augments, and team comp.

## What It Does (The Gap This Fills)

### counters that explain WHY, not just who
every other tool says "pick Riktor into Kallari." we tell you WHY: his CC catches her out of stealth and he's too tanky to burst. every counter comes with reasoning you can actually use in game.

### Build Lab catches your mistakes
slot items in and get real feedback:
- stacking Tainted items? anti-heal passive doesn't stack, you're wasting gold
- lifesteal on a mage? that only heals from basic attacks
- crit with no attack speed? you're not proccing those crits
- wrong pen type? physical pen doesn't help your magical abilities
- Serrated Blade tip if you just need cheap anti-heal without committing to a full Tainted item

### tap anything to learn
see "Burst Mage" or "Sustain Fighter" on a hero and don't know what it means? tap it. popup with explanation, counter tips, and every hero with that tag. same for items, augments, crests. education built into the tool, not a separate wiki.

### mobile first for console
built FOR the draft screen on your phone. not a responsive afterthought. no app install, no login, just open the link. if you play console and can't alt-tab, this is for you.

### augment scouting
see what augments the enemy might pick and how they change the matchup. a hero's base kit tells one story but augments can flip what they do entirely.

### draft helper with team analysis
plug in your team and the enemy team. get counter suggestions with kit-aware reasoning. progressive analysis as you fill slots. enemy team scouting with threat breakdowns.

## Under the Hood

### Tagging Engine
every hero has a hand-curated trait profile. not just scraped and dumped. automated ability parsing gets you 80% there but the last 20% needs human review. traits include:

- **heal/shield subtypes**: self_heal, ally_heal, self_shield, ally_shield (not just "has healing")
- **combat patterns**: on_hit, as_steroid, aoe, cc, mobility, execute, stealth, global, dot
- **archetype derivation**: traits + stats combine to generate tags like Burst Mage, Sustain Fighter, CC Tank

### Augment Classification
all 147 augments manually classified with trait tags and counter tips. each augment cross-referenced against the base ability it modifies because the description alone isn't enough context.

### Item Classification
all 188 T2 and T3 items manually classified with:
- identity tags (anti-heal, pen types, armor types, sustain types, crit, on-hit, execute, etc.)
- buy tips (when to build it)
- counter tips (how to play against it)
- 48 crests classified separately with evolution paths

### Counter Why Engine
counter picks don't just show win rates. generates hero-specific reasoning based on stat mismatches, trait interactions, and heal/shield awareness.

### Scoring
transparent. pure win rate with 20-match minimum. no black box ML, no hidden weights.

## Things to Be Aware Of

- **CC dominates the counter data.** thats not a bug. CC is king in Predecessor
- **tags are hand-curated, not perfect.** 49 heroes + 147 augments + 188 items is a lot to classify solo. if something's wrong, tell me
- **all-ranks data.** a Gold counter might not work in Diamond. rank filtering is on the roadmap
- **some sample sizes are thin** on niche role picks. 20-match minimum helps but its not bulletproof
- **augments can shift everything.** we account for it but some interactions are complex

## The Data

- **49 heroes** with role-specific matchup data
- **188 items** manually classified (every T2 + T3)
- **48 crests** classified with evolution paths
- **147 augments** manually tagged with counter tips
- **202 item images**, 145 augment icons, 48 crest icons, 49 hero portraits
- updated per patch from public match data via [pred.gg](https://pred.gg)

## Links

- [Predecessor Scout](https://kendubu1.github.io/Pred-Scout/ui/v2/) - main tool
- [Team Lab](https://kendubu1.github.io/Pred-Scout/ui/team-lab.html) - team comp builder
- [Buy Me a Coffee](https://buymeacoffee.com/saint_kendrick) - support the project
- [Feedback Form](https://forms.gle/hS9bXZvqiGFruSjy5) - tell me what sucks
- [YouTube](https://www.youtube.com/@saint_kendrick) - gaming content

---

Built by [@saint_kendrick](https://www.youtube.com/@saint_kendrick). Not affiliated with Omeda Studios.
