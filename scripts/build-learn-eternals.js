#!/usr/bin/env node
// Build the "Learn Eternals" page (static HTML) from the committed Eternals
// catalog. Zero-API, regenerable.
//
//   node scripts/build-learn-eternals.js
//
// Reads data/game-data/eternals.json, writes ui/learn-eternals.html.
//
// WHY THIS IS GENERATED: the previous page was hand-written at patch 1.16 and
// rotted exactly the way lessons.md warns about — it still shipped the
// "satatriel" typo, pointed at an image that never existed, and described a
// patch three releases old. A page describing owned data that no script writes
// will always drift; this one is rebuilt from the catalog instead.
//
// The page is a RENDERING of already-authored, already-verified catalog fields
// (major text, minor descriptions, recommend.note, counterTip). It invents no
// new claims and no numbers — per the copy policy in CLAUDE.md, new Eternal
// copy belongs to the pred-scout-coach agent, not to this generator.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/game-data/eternals.json'), 'utf8'));

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── Playstyle tags, derived from the catalog's own `fit` weights rather than
// hand-assigned, so a future fit change re-tags the page automatically. Each
// playstyle sums the weights of the traits that feed it; a tag sticks when it
// clears the threshold, and every Eternal keeps at least its strongest tag so
// nothing can fall off the board.
const PLAYSTYLES = [
  { id: 'autos',   label: 'I auto-attack',       hint: 'Your damage comes out of basic attacks.',           traits: ['on_hit', 'crit'] },
  { id: 'spells',  label: 'I cast abilities',    hint: 'You poke, burst or damage over time with spells.',  traits: ['dot', 'aoe', 'poke', 'burst'] },
  { id: 'dive',    label: 'I dive and duel',     hint: 'You start fights and win them one-on-one.',         traits: ['dueling', 'dive', 'mobility'] },
  { id: 'tank',    label: 'I hold the front',    hint: 'You get hit on purpose and need to survive it.',    traits: ['cc', 'shield', 'self_shield'], attrs: ['durability'] },
  { id: 'allies',  label: 'I keep allies alive', hint: 'You heal, shield or empower other people.',         traits: ['ally_heal', 'enchant'] },
  { id: 'sustain', label: 'I heal off damage',   hint: 'You stay in fights by draining what you hit.',      traits: ['lifesteal', 'sustain', 'self_heal', 'healing'] },
  { id: 'scale',   label: 'I scale late',        hint: 'You trade an early lull for a stronger late game.', traits: ['scaling', 'stacking'] },
  { id: 'flex',    label: 'I want a bit of everything', hint: 'No strong lean — it suits most kits.',       traits: [] },
];
const THRESHOLD = 0.3;

// Score a playstyle by the STRONGEST trait feeding it, never the sum. Summing
// rewarded playstyles simply for listing more traits: it read Knell — an
// on-hit armour-shred Eternal — as a spell playstyle, because four small
// ability traits outweighed its single larger on_hit weight.
function tagsFor(e) {
  const f = e.fit || {};
  const traits = f.traits || {};
  const attrs = f.attrs || {};
  const scored = PLAYSTYLES.filter((p) => p.id !== 'flex').map((p) => {
    const vals = (p.traits || []).map((t) => traits[t] || 0)
      .concat((p.attrs || []).map((t) => Math.max(0, attrs[t] || 0)));
    return { id: p.id, label: p.label, score: vals.length ? Math.max.apply(null, vals) : 0 };
  }).sort((a, b) => b.score - a.score);
  const kept = scored.filter((s) => s.score >= THRESHOLD);
  // An Eternal with no weight anywhere near the bar has no real lean stored.
  // Say that, rather than promoting its loudest rounding error into a claim —
  // that is how Lotus, an adaptive random-buff Eternal, came out tagged "dive".
  if (!kept.length) {
    const flex = PLAYSTYLES.find((p) => p.id === 'flex');
    return [{ id: flex.id, label: flex.label, score: 0 }];
  }
  return kept.slice(0, 3);
}

const ROLE_LABEL = { midlane: 'Midlane', offlane: 'Offlane', carry: 'Carry', jungle: 'Jungle', support: 'Support' };
function topRoles(e) {
  const roles = (e.fit && e.fit.roles) || {};
  return Object.entries(roles).sort((a, b) => b[1] - a[1]).slice(0, 2)
    .map(([r]) => ROLE_LABEL[r] || r);
}

function minorRow(m, recommended) {
  const on = recommended.has(m.name);
  return `<li class="le-minor${on ? ' rec' : ''}">
            <span class="lm-name">${esc(m.name)}${on ? ' <span class="lm-pick">picked</span>' : ''}</span>
            <span class="lm-desc">${esc(m.desc)}</span>
          </li>`;
}

function card(e) {
  const tags = tagsFor(e);
  const rec = new Set((e.recommend && e.recommend.default) || []);
  const roles = topRoles(e);
  return `
      <article class="le-card" id="et-${esc(e.id)}" data-styles="${tags.map((t) => t.id).join(' ')}">
        <header class="le-card-head">
          <img class="le-card-icon" src="img/eternals/${esc(e.id)}.webp" alt="" loading="lazy" onerror="this.style.display='none'">
          <div class="lh-text">
            <h3>${esc(e.name)}</h3>
            <span class="le-arch">${esc(e.archetype || '')}</span>
          </div>
          ${roles.length ? `<span class="le-roles">${roles.map(esc).join(' · ')}</span>` : ''}
        </header>

        ${tags.length ? `<div class="le-tags">${tags.map((t) => `<span class="le-tag" data-style="${t.id}">${esc(t.label)}</span>`).join('')}</div>` : ''}

        <div class="le-major"><span class="k">Major blessing — always on</span>${esc(e.major)}</div>

        ${e.recommend && e.recommend.note ? `<div class="le-pick"><b>Why you'd take it</b> ${esc(e.recommend.note)}</div>` : ''}

        <details class="le-slots">
          <summary>The two minor slots — pick one from each<span class="chev">▾</span></summary>
          <div class="le-slot">
            <b>Slot 1</b>
            <ul>${(e.minorSlot1 || []).map((m) => minorRow(m, rec)).join('')}</ul>
          </div>
          <div class="le-slot">
            <b>Slot 2</b>
            <ul>${(e.minorSlot2 || []).map((m) => minorRow(m, rec)).join('')}</ul>
          </div>
          ${rec.size ? `<p class="le-recnote">“Picked” marks this project's default pair for the Eternal. Open a hero in the tool for a pick tuned to that hero and role.</p>` : ''}
        </details>

        ${e.counterTip ? `<div class="le-counter"><b>Playing against it</b> ${esc(e.counterTip)}</div>` : ''}
        ${e.nameNote ? `<p class="le-namenote">${esc(e.nameNote)}</p>` : ''}
      </article>`;
}

const eternals = cat.eternals.slice().sort((a, b) => a.name.localeCompare(b.name));
const disc = (cat.valueDiscrepancies && cat.valueDiscrepancies.entries) || [];

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Learn Eternals — Pred Scout</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="style.css">
  <style>
    .le-wrap { max-width: 920px; margin: 0 auto; }
    .le-lead { color: var(--text-1); font-size: 0.95rem; line-height: 1.6; margin-bottom: 1.2rem; max-width: 70ch; }
    .le-h2 { font-size: 1.05rem; font-weight: 700; color: var(--text-0); margin: 2rem 0 0.85rem;
      display: flex; align-items: center; gap: 0.5rem; }
    .le-h2 .bar { width: 3px; height: 1.1em; background: var(--accent); border-radius: 2px; }
    .le-facts { display: grid; gap: 0.6rem; }
    @media (min-width: 620px) { .le-facts { grid-template-columns: 1fr 1fr; } }
    .le-fact { background: var(--bg-1); border: 1px solid var(--border); border-radius: var(--radius); padding: 0.8rem 0.9rem; }
    .le-fact b { color: var(--text-0); font-size: 0.9rem; }
    .le-fact p { color: var(--text-1); font-size: 0.85rem; line-height: 1.5; margin: 0.2rem 0 0; }

    /* Playstyle chips: they SORT the grid, they never hide a card. */
    .le-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.5rem; }
    .le-chip { font: inherit; font-size: 0.78rem; font-weight: 600; cursor: pointer; color: var(--text-1);
      background: transparent; border: 1px solid var(--border); border-radius: 999px;
      padding: 0.35rem 0.8rem; min-height: 40px; display: inline-flex; align-items: center; }
    .le-chip:hover { border-color: var(--accent); color: var(--text-0); }
    .le-chip.active { border-color: var(--accent); background: var(--bg-2); color: var(--text-0);
      box-shadow: 0 0 0 1px var(--accent) inset; }
    .le-chiphint { font-size: 0.75rem; color: var(--text-2); margin: 0 0 1rem; }

    .le-cards { display: grid; gap: 0.8rem; }
    @media (min-width: 720px) { .le-cards { grid-template-columns: 1fr 1fr; } }
    .le-card { background: var(--bg-1); border: 1px solid var(--border); border-radius: var(--radius);
      padding: 0.95rem; scroll-margin-top: 90px; display: flex; flex-direction: column; }
    .le-card.match { border-color: var(--accent); }
    .le-card-head { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.55rem; }
    .le-card-icon { width: 40px; height: 40px; border-radius: 8px; object-fit: cover;
      border: 1px solid var(--border); flex-shrink: 0; background: var(--bg-3); }
    .lh-text { min-width: 0; }
    .lh-text h3 { font-size: 1rem; font-weight: 700; color: var(--text-0); margin: 0; }
    .le-arch { font-size: 0.72rem; color: var(--text-2); }
    .le-roles { margin-left: auto; font-size: 0.7rem; color: var(--text-2); white-space: nowrap; flex-shrink: 0; }
    .le-tags { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.6rem; }
    .le-tag { font-size: 0.68rem; font-weight: 600; color: var(--accent);
      background: var(--accent-dim); border-radius: 999px; padding: 0.15rem 0.5rem; }
    .le-major { font-size: 0.84rem; color: var(--text-1); line-height: 1.5; margin-bottom: 0.55rem; }
    .le-major .k { display: block; color: var(--text-2); font-weight: 700; text-transform: uppercase;
      font-size: 0.64rem; letter-spacing: 0.05em; margin-bottom: 0.2rem; }
    .le-pick { font-size: 0.85rem; line-height: 1.55; color: var(--text-1); background: var(--bg-2);
      border-radius: 8px; padding: 0.55rem 0.7rem; margin-bottom: 0.55rem; }
    .le-pick b { color: var(--green); }
    .le-slots { margin-bottom: 0.55rem; }
    .le-slots summary { cursor: pointer; font-size: 0.78rem; font-weight: 600; color: var(--text-2);
      list-style: none; padding: 0.4rem 0; display: flex; align-items: center; gap: 0.3rem; min-height: 40px; }
    .le-slots summary::-webkit-details-marker { display: none; }
    .le-slots summary:hover { color: var(--text-0); }
    .le-slots[open] summary .chev { transform: rotate(180deg); }
    .le-slots .chev { transition: transform 0.15s; }
    .le-slot { margin-bottom: 0.5rem; }
    .le-slot > b { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-2); }
    .le-slot ul { list-style: none; padding: 0; margin: 0.25rem 0 0; }
    .le-minor { font-size: 0.78rem; line-height: 1.45; color: var(--text-2); padding: 0.3rem 0 0.3rem 0.6rem;
      border-left: 2px solid var(--border); margin-bottom: 0.25rem; }
    .le-minor.rec { border-left-color: var(--green); }
    .lm-name { display: block; font-weight: 700; color: var(--text-1); }
    .lm-pick { font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
      color: var(--green); background: var(--green-dim, rgba(0,196,140,0.16)); border-radius: 999px;
      padding: 0.05rem 0.4rem; margin-left: 0.3rem; }
    .le-recnote { font-size: 0.7rem; color: var(--text-2); margin: 0.3rem 0 0; }
    .le-counter { font-size: 0.78rem; color: var(--text-2); line-height: 1.5; border-top: 1px dashed var(--border);
      padding-top: 0.5rem; margin-top: auto; }
    .le-counter b { color: var(--text-1); display: block; font-size: 0.66rem; text-transform: uppercase;
      letter-spacing: 0.05em; margin-bottom: 0.15rem; }
    .le-namenote { font-size: 0.7rem; color: var(--text-2); font-style: italic; margin: 0.5rem 0 0; }
    .le-cta { margin-top: 2.2rem; background: var(--accent-dim);
      border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent); border-radius: var(--radius);
      padding: 1.1rem 1.2rem; text-align: center; }
    .le-cta p { color: var(--text-1); font-size: 0.92rem; margin: 0 0 0.7rem; }
    .le-cta a.btn { display: inline-block; background: var(--accent); color: #fff; font-weight: 600;
      font-size: 0.9rem; padding: 0.5rem 1.1rem; border-radius: 8px; text-decoration: none; }
    .le-foot { margin-top: 1.6rem; border-top: 1px solid var(--border); padding-top: 0.9rem;
      font-size: 0.75rem; color: var(--text-2); line-height: 1.6; }
    .le-foot code { font-size: 0.72rem; }
    html { scroll-behavior: smooth; }
    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      *, *::before, *::after { transition: none !important; }
    }
  </style>
</head>
<body>
  <header>
    <div class="header-inner">
      <a class="logo" href="v6/" style="text-decoration:none;color:inherit;display:inline-flex;align-items:center;gap:.45rem"><img src="img/brand/logo.svg" alt="" width="24" height="24"> Pred Scout</a>
      <div class="header-links">
        <a href="v6/" class="header-link">Pick &amp; Build</a>
        <a href="v6/squad.html" class="header-link">Pre-Game</a>
        <a href="v6/coach.html" class="header-link">Coach</a>
      </div>
    </div>
  </header>

  <main id="app">
    <div class="le-wrap">
      <h1 style="margin-bottom:0.3rem">Learn Eternals</h1>
      <p class="le-lead">An Eternal is a blessing you lock in before the match starts. There are ${eternals.length} of them, and
        the choice can look like a wall of text. The short version: each one rewards a different way of playing.
        Pick the one that matches how you already fight, then use its two minor slots to lean further in.</p>

      <h2 class="le-h2"><span class="bar"></span>How the picks work</h2>
      <div class="le-facts">
        <div class="le-fact"><b>Three choices, not one</b><p>You get the Eternal's <b>Major blessing</b>, which is always on, plus <b>one minor from each of two slots</b> (three options in each).</p></div>
        <div class="le-fact"><b>Chosen before the match</b><p>Set in the draft or loadout screen. The blessings come online at level ${esc(cat.system.unlockLevel)}.</p></div>
        <div class="le-fact"><b>Saved per hero and role</b><p>Your pick sticks to that hero in that role, and you can change it any time.</p></div>
        <div class="le-fact"><b>Chosen by kit fit, not win rate</b><p>Per-Eternal win rates are not published to us, so everything here is about how an effect matches a kit — never a field result.</p></div>
      </div>

      <h2 class="le-h2"><span class="bar"></span>Find yours by playstyle</h2>
      <div class="le-chips" role="group" aria-label="Sort Eternals by playstyle">
        ${PLAYSTYLES.map((p) => `<button class="le-chip" data-style="${p.id}" aria-pressed="false" title="${esc(p.hint)}">${esc(p.label)}</button>`).join('\n        ')}
      </div>
      <p class="le-chiphint">Tap a playstyle to bring the Eternals that suit it to the top. Nothing is hidden, and an
        Eternal can suit more than one.</p>

      <div class="le-cards" id="leGrid">
        ${eternals.map(card).join('\n')}
      </div>

      <div class="le-cta">
        <p>Not sure which fits the hero you actually play? Open that hero in the tool — the <b>Eternals tab ranks the majors on that hero's own build</b> and shows its reasoning.</p>
        <a class="btn" href="v6/">Open Pred Scout</a>
      </div>

      <div class="le-foot">
        Generated from <code>data/game-data/eternals.json</code> (patch ${esc(cat.patch)}, updated ${esc(cat.updated)}) by
        <code>scripts/build-learn-eternals.js</code>. Playstyle tags are derived from each Eternal's stored fit weights,
        not hand-assigned. Major and minor text carries every stated change through patch ${esc(cat.patch)}.
        ${disc.length ? `<br><br><b>${disc.length} value${disc.length === 1 ? '' : 's'} corrected against the patch notes:</b> ${
          disc.map((d) => `${esc(d.target)} (we held “${esc(d.ourStoredValue)}”)`).join('; ')}.` : ''}
        <br><br>Per-Eternal win-rate statistics sit behind an operator-managed scope, so this is kit-synergy guidance
        rather than field data.
      </div>
    </div>
  </main>

  <script>
  // Playstyle chips: clicking one lifts the Eternals tagged with that playstyle
  // to the top of the grid and outlines them. This SORTS, it never filters —
  // the same convention the patch pages use, so nothing ever disappears on a
  // player who is browsing. Clicking the active chip again restores the
  // alphabetical order the page ships in (stamped as data-oi).
  (function () {
    var grid = document.getElementById('leGrid');
    var btns = [].slice.call(document.querySelectorAll('.le-chip'));
    if (!grid || !btns.length) return;
    var cards = [].slice.call(grid.children);
    cards.forEach(function (el, i) { el.dataset.oi = i; });
    function apply(sel) {
      cards.slice()
        .sort(function (a, b) {
          var am = sel && (a.dataset.styles || '').split(' ').indexOf(sel) > -1 ? 0 : 1;
          var bm = sel && (b.dataset.styles || '').split(' ').indexOf(sel) > -1 ? 0 : 1;
          return am - bm || (+a.dataset.oi - +b.dataset.oi);
        })
        .forEach(function (el) { grid.appendChild(el); });
      cards.forEach(function (el) {
        el.classList.toggle('match', !!sel && (el.dataset.styles || '').split(' ').indexOf(sel) > -1);
      });
      btns.forEach(function (b) {
        var on = b.dataset.style === sel;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    var current = null;
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        current = current === b.dataset.style ? null : b.dataset.style;
        apply(current);
      });
    });
  })();
  </script>
  <script defer src="v6/icons.js"></script>
</body>
</html>
`;

const out = path.join(ROOT, 'ui/learn-eternals.html');
fs.writeFileSync(out, html);
const tagCount = eternals.reduce((a, e) => a + tagsFor(e).length, 0);
console.log(`Wrote ${out} — ${eternals.length} Eternals, ${tagCount} playstyle tags, patch ${cat.patch}`);
