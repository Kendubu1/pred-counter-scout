/* Site-wide switch for the experimental kit-math simulator's output.
 * While the sim is being polished, everything it produces (sim picks, the
 * experimental build tab, kit-math matchups, "sim agrees" notes, sim math
 * disclosures) stays hidden. Flip SIM_DEFAULT to true to bring it all back.
 *
 * Preview without shipping: open any page with ?sim=1 (remembered in this
 * browser until ?sim=0). Load this synchronously in <head>, before page scripts:
 *   <script src="sim-flag.js"></script>
 * Pages read window.SIM_ON; static markup can carry class="sim-only". */
(function () {
  const SIM_DEFAULT = false;
  let on = SIM_DEFAULT;
  try {
    const q = new URLSearchParams(location.search).get('sim');
    if (q === '1') localStorage.setItem('simPreview', '1');
    else if (q === '0') localStorage.removeItem('simPreview');
    if (localStorage.getItem('simPreview') === '1') on = true;
  } catch (e) { /* storage blocked: fall back to the default */ }
  window.SIM_ON = on;
  document.documentElement.dataset.sim = on ? 'on' : 'off';
  const st = document.createElement('style');
  st.textContent = 'html[data-sim="off"] .sim-only { display:none !important; }';
  document.head.appendChild(st);
})();
