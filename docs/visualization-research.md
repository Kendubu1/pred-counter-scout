# Research-project visualization: making the build engine's reasoning *visible*

A design doc for an interactive, hostable visualization of Predecessor
Scout's math and reasoning. The goal: let someone *see* why a build is
recommended — the chain from a hero's abilities, through item effects and
the simulator, to objectives and matchup verdicts — the way good data-science
explainers make a model legible instead of a black box.

Status: backlog / research concept (2026-06-13). Nothing here ships into the
main site yet; this is a standalone research piece for the personal website.

---

## 1. What we already have to draw from (all static JSON, zero API at view time)

- `data/artifacts/<hero>.json` — per hero: the chosen build (6 items with spike
  minutes), the objective vector (burst / 10s / 20s / auto-DPS / EHP / heal),
  the Eternal + augment rankings with sim deltas, meta builds with
  agree/swap reasoning, matchup checkpoints.
- `data/artifacts/matchup-matrix.json` — all 1,326 hero pairs × 6 minute
  checkpoints, win/even/loss codes. A natural heatmap / adjacency matrix.
- `engine/fixtures/effects.json` + `augments.json` — the typed effect graph:
  every modeled item/eternal/augment as primitives (on_hit, damage_amp,
  ramp_to_stat, …) feeding the sim.
- `data/aggregates/*` — skill orders, field winrates, augment/eternal/crest
  evidence, ability tips.

The key insight for the viz: **the engine is already a graph.** Hero kit →
abilities (with ranks/cooldowns) → + items (stats + effect primitives) →
simulator (mitigation, rotation, EHP) → objective scores → build choice →
matchup verdicts. We just never *drew* it.

---

## 2. Five visualization concepts (ranked by "wow" ÷ effort)

### A. The reasoning graph — node-link, force-directed *(flagship)*
A live node graph for one hero's build decision:
`Abilities → Items → Effect primitives → Objectives → Build`.
Nodes sized by contribution; edges weighted by how much each item/effect
moves each objective (we can compute this: re-run the sim leaving one item
out, the delta is the edge weight — a Shapley-ish attribution). Hovering an
objective lights up the items driving it; hovering an item shows its effect
primitives and which objectives they feed. This directly answers "why this
item?" visually — and would have made the Plasma-Blade-vs-Necrosis gap
*obvious* (Necrosis's edge only touches the ult-damage node; Plasma Blade's
ramp_to_stat fans into every auto-attack objective).
- **Framework:** React + **React Flow** (clean node/edge UX, handles, minimap)
  or **D3-force** for a more organic physics feel. Cytoscape.js if we want
  graph-theory layouts.

### B. The Sankey of damage → objectives
A Sankey diagram: flows start at stat sources (base power, each item's
power/crit/pen, each effect proc) and flow through the mitigation/rotation
math into the objective totals. Width = damage contributed. Makes "where does
the 20-second number come from" a single readable picture, and exposes how
much of a build's output is flat stats vs passives vs procs.
- **Framework:** D3 Sankey, or **Plotly** (`go.Sankey`) if Python.

### C. The matchup matrix as an interactive heatmap + chord
The 52×52 matrix as a heatmap (green=favored, red=unfavored), reorderable by
lane / by sim-strength, with a minute-slider that animates the verdict
evolving from minute 5 → 30 (watch scaling heroes flip from red to green).
A chord-diagram alt view shows a lane's internal pecking order. This is the
"strongest in fights on paper" board made spatial.
- **Framework:** D3 (heatmap + chord), or **Observable Plot** for the heatmap
  with far less code; **Plotly**/`imshow` in Python.

### D. The build-spike timeline
A horizontal timeline (minutes 0–35) showing each item completing at its gold
spike, with the objective curves (burst, EHP) rising as items come online —
and the enemy's curve overlaid so the kill-window crossover is visible. Scrub
the timeline to see the build "power up."
- **Framework:** D3 / Observable Plot; **Plotly** animated frames in Python.

### E. The effect-coverage treemap (the "what we model" honesty map)
A treemap of all items grouped by effect archetype (ramping, spellblade,
on-hit, conditional-amp, …), colored modeled vs honestly-unmodeled, sized by
meta pick-frequency. Makes the modeling frontier — and the THEORY honesty —
a single glanceable picture. Doubles as a roadmap for item 11.
- **Framework:** D3 treemap or **Plotly** treemap/icicle.

---

## 3. Recommended stack for a hostable research piece

**Primary: a static React + D3/React-Flow site (Vite build), deployed to any
static host** (GitHub Pages / Netlify / your site). Matches the existing
zero-API, static-JSON architecture — the viz fetches the same committed
artifacts. No server, no cost, embeddable.

- **React Flow** for concept A (the flagship reasoning graph).
- **Observable Plot** or **D3** for B–E (Plot for speed, D3 where we need
  bespoke interactions like the animated matrix).
- **Framer Motion** for the transitions that make it feel alive.

**Alternative (faster to prototype, Python): Observable notebooks** (literally
made for this — D3 + reactive cells, publishable as a standalone page) or a
**Streamlit / Plotly Dash** app if you'd rather a Python data-science feel
(but that needs a running server, so less ideal for "host on my site").

My pick: **Observable notebook(s) for rapid prototyping each concept**, then
port the best one or two (A and C) into a small **React + React-Flow/D3**
static bundle for the polished, self-hosted research page.

---

## 4. A precompute step the engine should expose

To draw concept A honestly we need **per-item, per-objective attribution**,
not just the final build. Add an engine export (`npm run explain -- <hero>`)
that, for the chosen build, leaves each item out one at a time and records the
objective deltas — producing an `explain/<hero>.json` of
`{ item → { objective → contribution } }` edges. That file *is* the graph the
viz renders, and it keeps the "every number is computed, nothing is vibes"
honesty: the edges are real re-simulations, not hand-drawn.

---

## 5. Phased plan

1. **Engine:** `npm run explain` → per-hero attribution JSON (the graph data).
2. **Prototype** concepts A and C as Observable notebooks against committed data.
3. **Polish** the reasoning graph (A) into a React + React-Flow static page;
   add the animated matchup matrix (C) as a second view.
4. **Frame it** as a research write-up: "How a MOBA build engine reasons —
   and how to make a sim legible." THEORY labeling and the unmodeled-effects
   honesty become a *feature* of the story (a model that shows its own edges).
5. **Host** the static bundle on the personal site; link from the build lab.

The throughline: every other tool shows you *a* build. This would show you the
engine *thinking* — the nodes, the weights, the trade-offs — which is exactly
the research-project angle worth publishing.
EOF
