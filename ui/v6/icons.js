/* Pred Scout brand icon set — clean inline SVGs matching the compass/crystal
 * brand (white line + accent-purple fill). Single source of truth; themeable
 * via currentColor + var(--accent). Load with <script defer src="icons.js">
 * before any script that calls BrandIcons.svg(name).
 *
 * Names follow the brand asset table:
 *   counter-pick · matchup · build · patch-strategy · scout · team-comp
 *   role-path · eternal-augment · meta-guide · power-spike · weakness-counter
 *   tap-to-learn
 * Exact art can drop-in replace these later 1:1 by name. */
(function () {
  // Each entry is the inner markup of a 24x24 icon. `currentColor` draws the
  // line; elements with class="a" (fill) / "as" (stroke) take the accent.
  const P = {
    // crosshair on a target — reads cleanly at 15px where crossed-swords turned
    // to mush; "lock onto / counter their pick".
    'counter-pick':
      '<circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="1.9"/>' +
      '<g stroke="currentColor" stroke-width="1.9" stroke-linecap="round">' +
      '<path d="M12 1.8v4.2M12 18v4.2M1.8 12h4.2M18 12h4.2"/></g>' +
      '<circle cx="12" cy="12" r="2.5" class="a" stroke="none"/>',
    'matchup':
      '<path d="M12 3l7 2.5v5c0 4.5-3 7.8-7 9.5V3z" class="a"/>' +
      '<path d="M12 3L5 5.5v5c0 4.5 3 7.8 7 9.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>' +
      '<path d="M12 3v17" stroke="currentColor" stroke-width="1.4"/>',
    'build':
      '<g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M6 8.5V7a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v1.5"/>' +
      '<rect x="4" y="8.5" width="16" height="12" rx="2.5"/></g>' +
      '<rect x="9.5" y="12" width="5" height="5.5" rx="1" class="a"/>',
    // pennant flag on a pole — a solid, legible "plan / how to play the patch"
    // mark; the old dashed path read as scattered dots at small sizes.
    'patch-strategy':
      '<path d="M6 21V3.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>' +
      '<path d="M7 4h11l-3 3.5L18 11H7z" class="a" stroke="none"/>' +
      '<circle cx="6" cy="21" r="1.7" fill="currentColor"/>',
    'scout':
      '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>' +
      '<path d="M12 8.5l2.5 3.5L12 15.5 9.5 12z" class="a"/>',
    'team-comp':
      '<circle cx="7" cy="8.5" r="2.6" fill="currentColor"/><path d="M2.5 19c0-3 2-4.5 4.5-4.5S11.5 16 11.5 19" fill="currentColor"/>' +
      '<circle cx="17" cy="8.5" r="2.6" fill="currentColor"/><path d="M12.5 19c0-3 2-4.5 4.5-4.5S21.5 16 21.5 19" fill="currentColor"/>' +
      '<circle cx="12" cy="7" r="3" class="a"/><path d="M6.5 20c0-3.3 2.4-5.2 5.5-5.2S17.5 16.7 17.5 20z" class="a"/>',
    'role-path':
      '<g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 6v3M12 9c0 2-5 1-5 4M12 9c0 2 5 1 5 4"/></g>' +
      '<rect x="9.5" y="2.5" width="5" height="5" rx="1.2" class="a"/>' +
      '<circle cx="7" cy="16.5" r="2.2" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="17" cy="16.5" r="2.2" fill="none" stroke="currentColor" stroke-width="1.9"/>',
    'eternal-augment':
      '<path d="M12 2l6 8-6 12-6-12z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<path d="M6 10h12" stroke="currentColor" stroke-width="1.3"/>' +
      '<path d="M12 10l6 0-6 12z" class="a"/>',
    'meta-guide':
      '<circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="1.9"/>' +
      '<path d="M12 7l2.4 5L12 17l-2.4-5z" class="a"/>' +
      '<circle cx="12" cy="12" r="1.1" fill="currentColor"/>',
    'power-spike':
      '<g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 3v14M12 3l-2.2 2.4M12 3l2.2 2.4"/><path d="M10 20h4"/></g>' +
      '<path class="as" d="M6 12V7M6 7l-1.6 1.8M6 7l1.6 1.8M18 12V7M18 7l-1.6 1.8M18 7l1.6 1.8" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
    'weakness-counter':
      '<path d="M12 3l7 2.5v5c0 4.5-3 7.8-7 9.5-4-1.7-7-5-7-9.5v-5z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>' +
      '<path d="M13 6l-3 5h3l-2 5" fill="none" class="as" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
    'tap-to-learn':
      '<path d="M10 11V6.5a1.6 1.6 0 0 1 3.2 0V12l2.6.9a2 2 0 0 1 1.3 2.4l-.8 3.1a2.4 2.4 0 0 1-2.3 1.6H11a2.4 2.4 0 0 1-2-1l-3-4.2a1.5 1.5 0 0 1 2.2-2L10 14" fill="currentColor"/>' +
      '<path d="M6 7a4 4 0 0 1 8 0" fill="none" class="as" stroke-width="1.6" stroke-linecap="round"/>',
    // ── lane marks: line-only (currentColor), so they sit grey beside a lane
    // name and brighten with the selected state. Role, not map position —
    // carry and support share a lane on the map.
    // offlane — a shield: the solo bruiser/tank lane
    'lane-offlane':
      '<path d="M12 3l7 2.6v5.2c0 4.4-2.9 7.7-7 9.2-4.1-1.5-7-4.8-7-9.2V5.6z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
    // jungle — a leaf with its vein
    'lane-jungle':
      '<g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19C5 10.5 10.5 5 19 5c0 8.5-5.5 14-14 14z"/><path d="M5 19l8-8"/></g>',
    // midlane — a four-point spark: the mage lane
    'lane-midlane':
      '<path d="M12 3.5l2.1 6.4 6.4 2.1-6.4 2.1-2.1 6.4-2.1-6.4-6.4-2.1 6.4-2.1z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
    // carry — a drawn bow with its arrow: ranged damage
    'lane-carry':
      '<g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3.5c6.5 3 6.5 14 0 17"/><path d="M8 3.5v17"/><path d="M4 12h15"/><path d="M16 9l3 3-3 3"/></g>',
    // support — a heart: heals, shields, peel
    'lane-support':
      '<path d="M12 19.5s-7-4.3-7-9.7A3.9 3.9 0 0 1 12 7.4a3.9 3.9 0 0 1 7 2.4c0 5.4-7 9.7-7 9.7z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  };

  const svg = (name, size) => {
    const inner = P[name];
    if (!inner) return '';
    const s = size || 20;
    return `<svg class="bic" width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${inner}</svg>`;
  };

  // Inject the shared theming CSS once.
  if (typeof document !== 'undefined' && !document.getElementById('bic-style')) {
    const st = document.createElement('style');
    st.id = 'bic-style';
    st.textContent =
      '.bic{flex:none;vertical-align:-.18em}.lane-ic{display:inline-flex;width:1em;height:1em;vertical-align:-.15em}.lane-ic .bic{vertical-align:0;width:1em;height:1em}'+
      '.bic .a{fill:var(--accent,#6c5ce7)}.bic .as{stroke:var(--accent,#6c5ce7)}' +
      '.wordmark{display:inline-flex;align-items:center;gap:.5rem}.wordmark img{display:block}';
    (document.head || document.documentElement).appendChild(st);
  }

  // Hydrate any <span data-bic="name" [data-bic-size="20"]> in static markup.
  const hydrate = (root) => {
    (root || document).querySelectorAll('[data-bic]:not([data-bic-done])').forEach((el) => {
      const m = svg(el.getAttribute('data-bic'), Number(el.getAttribute('data-bic-size')) || undefined);
      if (m) { el.innerHTML = m; el.setAttribute('data-bic-done', '1'); }
    });
  };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => hydrate());
    else hydrate();
    // Pages render most markup after their data loads, so also fill any
    // [data-bic] placeholder added later (lane marks in rendered lists).
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver((muts) => {
        if (muts.some((m) => m.addedNodes.length)) hydrate();
      }).observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  // Lane mark for a role key (carry/jungle/midlane/offlane/support); '' for anything else.
  const lane = (role, size) => svg('lane-' + String(role || '').toLowerCase(), size || 16);

  window.BrandIcons = { svg, lane, names: Object.keys(P), hydrate };
})();
