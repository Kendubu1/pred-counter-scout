// Deterministic mobile/consistency audit for the v6 UI — the objective bracket
// for the UI-review loop (the analog of copy-verify in the copy loop). It parses
// the three v6 pages and checks cross-page invariants a human can't eyeball
// reliably: shared design tokens, one container width, one breakpoint scheme,
// base-reset parity, a readable mobile body font, and touch-target sizing. It
// also `node --check`s every inline <script>. It is the loop's "compiler": an
// authored fix is only acceptable if the HARD invariants pass here.
//
//   npm run ui:audit            # write data/aggregates/ui-audit.json + print PASS/FAIL
//   exit code 0 = all HARD invariants pass; 1 = a hard invariant failed.
//
// Rubric (grounded in 2026 guidance — see docs/agent-loops.md "UI review loop"):
//   - Touch targets: WCAG 2.5.8 (AA) floor 24x24 CSS px; Apple HIG 44pt / Material
//     48dp are the real targets. We flag interactive controls whose mobile height
//     is under ~40px with no min-height.
//   - Mobile body text: keep >= 15px (16-20px ideal); never shrink below 14px.
//   - One shared set of design tokens, container widths, and breakpoints across
//     all pages — drift is the root of "inconsistent on mobile".

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
// The audit targets one UI dir at a time. Default is the frozen-live ui/v6 — its
// 11 invariants must stay green and are NOT changed here. UI_DIR=ui/v0 audits the
// staging copy and ADDS the v0-only Senior-UX invariants (single-legend /
// reduced-motion / above-fold-primary, see docs/ux-rubric.md) without touching
// the v6 contract.
const UI_DIR = process.env.UI_DIR ?? 'ui/v6';
const TARGET_V0 = UI_DIR === 'ui/v0';
const PAGES = ['index.html', 'coach.html', 'squad.html', 'about.html'];
const pagePath = (p: string) => path.join(ROOT, UI_DIR, p);
const AUDIT_OUT = TARGET_V0 ? 'data/aggregates/ui-audit-v0.json' : 'data/aggregates/ui-audit.json';

const MOBILE_FONT_FLOOR = 14;     // px — below this, mobile body text is too small
const TOUCH_MIN = 40;             // px — flag interactive controls shorter than this on mobile
const ROOT_FONT = 16;             // px per rem (browser default; body sets no html font-size)

interface Finding { check: string; severity: 'high' | 'med' | 'low'; page?: string; detail: string }

function styleOf(html: string): string {
  const m = html.match(/<style>([\s\S]*?)<\/style>/);
  return m ? m[1]! : '';
}
function scripts(html: string): string[] {
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!).filter((s) => s.trim());
}
function rootTokens(css: string): Record<string, string> {
  const block = css.match(/:root\s*\{([\s\S]*?)\}/);
  const out: Record<string, string> = {};
  if (!block) return out;
  for (const m of block[1]!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}
function breakpoints(css: string): number[] {
  return [...new Set([...css.matchAll(/@media[^{]*max-width\s*:\s*(\d+)px/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
}
// First declaration of `prop` inside the first rule block whose selector list
// contains exactly `selector` (word-boundaried).
function ruleProp(css: string, selector: string, prop: string): string | null {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[,}])\\s*${esc}\\s*\\{([^}]*)\\}`, 'm');
  const m = css.match(re);
  if (!m) return null;
  const pm = m[2]!.match(new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([^;]+)`));
  return pm ? pm[1]!.trim() : null;
}
// Body font-size declared inside the first `max-width:<=600px` media block.
function mobileBodyFontPx(css: string): number | null {
  for (const m of css.matchAll(/@media[^{]*max-width\s*:\s*(\d+)px[^{]*\{/g)) {
    if (Number(m[1]) > 600) continue;
    const start = m.index! + m[0].length;
    let depth = 1, i = start;
    for (; i < css.length && depth > 0; i++) { if (css[i] === '{') depth++; else if (css[i] === '}') depth--; }
    const body = css.slice(start, i);
    const fm = body.match(/(?:^|[;{]|\s)body\s*\{[^}]*font-size\s*:\s*([\d.]+)px/);
    if (fm) return Number(fm[1]);
  }
  return null;
}
// Concatenated bodies of all `max-width:<=600px` media blocks (flat rules).
function mobileBlocks(css: string): string {
  let out = '';
  for (const m of css.matchAll(/@media[^{]*max-width\s*:\s*(\d+)px[^{]*\{/g)) {
    if (Number(m[1]) > 600) continue;
    const start = m.index! + m[0].length;
    let depth = 1, i = start;
    for (; i < css.length && depth > 0; i++) { if (css[i] === '{') depth++; else if (css[i] === '}') depth--; }
    out += css.slice(start, i) + '\n';
  }
  return out;
}
// Selectors given an explicit min-height >= TOUCH_MIN on mobile (a valid tap-area fix).
function touchFixed(css: string): Set<string> {
  const fixed = new Set<string>();
  const blocks = mobileBlocks(css).replace(/\/\*[\s\S]*?\*\//g, ''); // drop comments so the first grouped selector isn't glued to one
  for (const m of blocks.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const mh = m[2]!.match(/min-height\s*:\s*([\d.]+)px/);
    if (mh && Number(mh[1]) >= TOUCH_MIN) for (const sel of m[1]!.split(',')) fixed.add(sel.trim());
  }
  return fixed;
}
// CSS with comments and all at-rule blocks (@media/@supports/@keyframes) removed,
// leaving only base rules — so a type-scale scan sees default sizing, not the
// mobile shrink overrides.
function baseRules(css: string): string {
  const s = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let out = '', i = 0;
  while (i < s.length) {
    if (s[i] === '@') {
      const b = s.indexOf('{', i);
      if (b === -1) { out += s.slice(i); break; }
      let depth = 1, j = b + 1;
      for (; j < s.length && depth > 0; j++) { if (s[j] === '{') depth++; else if (s[j] === '}') depth--; }
      i = j;
    } else { out += s[i]; i++; }
  }
  return out;
}
function pxOf(v: string | null): number | null {
  if (!v) return null;
  const px = v.match(/([\d.]+)px/); if (px) return Number(px[1]);
  const rem = v.match(/([\d.]+)rem/); if (rem) return Number(rem[1]) * ROOT_FONT;
  return null;
}
// Rough rendered height of a control from its padding + one text line.
function controlHeight(css: string, selector: string, mobile = false): number | null {
  const pad = ruleProp(css, selector, 'padding');
  const fs = ruleProp(css, selector, 'font-size');
  if (!pad) return null;
  const parts = pad.split(/\s+/).map((p) => pxOf(p) ?? 0);
  const top = parts[0] ?? 0;
  const bottom = parts.length >= 3 ? (parts[2] ?? top) : top;
  const line = (pxOf(fs) ?? (mobile ? 13.5 : 15)) * 1.2;
  const border = (ruleProp(css, selector, 'border') || '').includes('1px') ? 2 : 0;
  return Math.round(top + bottom + line + border);
}

function main() {
  const findings: Finding[] = [];
  const htmls = Object.fromEntries(PAGES.map((p) => [p, readFileSync(pagePath(p), 'utf8')]));
  const csss = Object.fromEntries(PAGES.map((p) => [p, styleOf(htmls[p]!)]));

  let hardFail = false;
  const hard = (f: Finding) => { hardFail = true; findings.push(f); };

  // 1) Shared design tokens — every page's :root must carry the same tokens+values.
  const tokenMaps = Object.fromEntries(PAGES.map((p) => [p, rootTokens(csss[p]!)]));
  const allTokens = new Set(PAGES.flatMap((p) => Object.keys(tokenMaps[p]!)));
  for (const tok of allTokens) {
    const vals = PAGES.map((p) => tokenMaps[p]![tok]);
    const present = vals.filter(Boolean);
    if (present.length !== PAGES.length) {
      findings.push({ check: 'tokens', severity: 'low', detail: `token ${tok} missing on ${PAGES.filter((p) => !tokenMaps[p]![tok]).join(', ')}` });
    } else if (new Set(present).size > 1) {
      hard({ check: 'tokens', severity: 'high', detail: `token ${tok} drifts: ${PAGES.map((p) => `${p}=${tokenMaps[p]![tok]}`).join(' / ')}` });
    }
  }

  // 2) One container width — .wrap max-width must match across pages.
  const widths = Object.fromEntries(PAGES.map((p) => [p, ruleProp(csss[p]!, '.wrap', 'max-width')]));
  if (new Set(Object.values(widths).filter(Boolean)).size > 1) {
    hard({ check: 'container-width', severity: 'high', detail: `.wrap max-width differs: ${PAGES.map((p) => `${p}=${widths[p]}`).join(' / ')}` });
  }
  const tops = Object.fromEntries(PAGES.map((p) => [p, ruleProp(csss[p]!, '.top-inner', 'max-width')]));
  if (new Set(Object.values(tops).filter(Boolean)).size > 1) {
    findings.push({ check: 'container-width', severity: 'med', detail: `.top-inner max-width differs: ${PAGES.map((p) => `${p}=${tops[p]}`).join(' / ')}` });
  }

  // 3) One breakpoint scheme — the primary mobile breakpoint must be shared, and
  //    no page should reflow at a width another page ignores.
  const bps = Object.fromEntries(PAGES.map((p) => [p, breakpoints(csss[p]!)]));
  const primary = new Set(PAGES.map((p) => (bps[p]!.includes(600) ? 600 : bps[p]![0])));
  if (primary.size > 1) {
    findings.push({ check: 'breakpoints', severity: 'med', detail: `primary mobile breakpoint differs: ${PAGES.map((p) => `${p}=[${bps[p]!.join(',')}]`).join(' / ')}` });
  }

  // 4) Base-reset parity — every page needs box-sizing + a button appearance reset
  //    so controls render identically.
  for (const p of PAGES) {
    if (!/box-sizing\s*:\s*border-box/.test(csss[p]!)) hard({ check: 'reset', severity: 'high', page: p, detail: 'missing box-sizing:border-box reset' });
    const hasButtonReset = /button\s*\{[^}]*appearance\s*:\s*none/.test(csss[p]!) || /\.[\w-]+\s*\{[^}]*-webkit-appearance\s*:\s*none/.test(csss[p]!);
    if (!hasButtonReset) findings.push({ check: 'reset', severity: 'low', page: p, detail: 'no button/appearance reset — native controls may look off' });
  }

  // 5) Readable, consistent mobile body text.
  const mbf = Object.fromEntries(PAGES.map((p) => [p, mobileBodyFontPx(csss[p]!)]));
  for (const p of PAGES) {
    const f = mbf[p];
    if (f != null && f < MOBILE_FONT_FLOOR) findings.push({ check: 'mobile-font', severity: 'med', page: p, detail: `mobile body font ${f}px is below the ${MOBILE_FONT_FLOOR}px readability floor` });
  }
  const effective = PAGES.map((p) => mbf[p] ?? 15); // index sets none -> inherits 15
  if (new Set(effective).size > 1) {
    findings.push({ check: 'mobile-font', severity: 'med', detail: `mobile body font differs across pages: ${PAGES.map((p) => `${p}=${mbf[p] ?? '15(inherited)'}`).join(' / ')}` });
  }

  // 6) Touch targets — interactive controls shorter than ~40px on mobile.
  const interactive = ['.navlink', '.snpill', '.htab', '.rolebar button', '.seg', '.pick', '.ghostbtn', '.ptoggle', '.backrow button', '.echip'];
  for (const p of PAGES) {
    const fixed = touchFixed(csss[p]!);
    for (const sel of interactive) {
      if (!new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(csss[p]!)) continue;
      if (fixed.has(sel)) continue; // explicit mobile min-height >= TOUCH_MIN satisfies the tap area
      const h = controlHeight(csss[p]!, sel, true);
      if (h != null && h < TOUCH_MIN) findings.push({ check: 'touch-target', severity: 'med', page: p, detail: `${sel} ≈${h}px tall (< ${TOUCH_MIN}px; WCAG floor 24, target 44) — needs min-height or padding on mobile` });
    }
  }

  // 6b) Cross-page touch consistency — a control type present on multiple pages
  //     must get the same mobile tap treatment everywhere (caught by the judge:
  //     a control comfortably tappable on one page but cramped on another).
  for (const sel of interactive) {
    const present = PAGES.filter((p) => new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(csss[p]!));
    if (present.length < 2) continue;
    const fixedOn = present.filter((p) => touchFixed(csss[p]!).has(sel));
    if (fixedOn.length && fixedOn.length < present.length) {
      findings.push({ check: 'touch-consistency', severity: 'med', detail: `${sel} gets a 44px mobile tap area on ${fixedOn.join('/')} but not on ${present.filter((p) => !fixedOn.includes(p)).join('/')}` });
    }
  }

  // 6c) Sub-nav pill legibility — the always-present .snpill label must stay
  //     readable on phone (the judge flagged ~11px pills under the floor).
  const PILL_FLOOR = 11;
  for (const p of PAGES) {
    const fs = pxOf(ruleProp(mobileBlocks(csss[p]!).replace(/\/\*[\s\S]*?\*\//g, ''), '.snpill', 'font-size')
      ?? ruleProp(csss[p]!, '.snpill', 'font-size'));
    if (fs != null && fs < PILL_FLOOR) findings.push({ check: 'pill-font', severity: 'low', page: p, detail: `.snpill label ≈${fs.toFixed(1)}px on mobile (< ${PILL_FLOOR}px) — bump font-size` });
  }

  // 6d) Type scale — body/callout copy must not be the LARGEST text on the page
  //     (inverted hierarchy reads as "oversized / wall of text"). Anything over
  //     1rem is reserved for headings (h1-h6) and short numeric/emphasis bits
  //     (allowlisted). This is the check the first design review lacked — the
  //     Sim Build tip (.coach) was 1.04rem, larger than the page's reading size.
  const TYPE_MAX_REM = 1.0;
  const TYPE_ALLOW = new Set(['.verdict', '.ledg .lv', '.ipop .ihead b']); // short callouts / big numbers, not paragraphs
  for (const p of PAGES) {
    for (const m of baseRules(csss[p]!).matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const sel = m[1]!.trim().replace(/\s+/g, ' ');
      if (!sel.startsWith('.') || /(^|[\s,>~+])h[1-6]\b/.test(sel) || sel.includes(',')) continue; // headings + grouped rules out
      const fm = m[2]!.match(/font-size\s*:\s*([\d.]+)rem/);
      if (!fm) continue;
      const rem = Number(fm[1]);
      if (rem > TYPE_MAX_REM && !TYPE_ALLOW.has(sel)) {
        findings.push({ check: 'type-scale', severity: 'med', page: p, detail: `${sel} font-size ${rem}rem (> ${TYPE_MAX_REM}rem) — larger than the page's reading scale; oversized for body/callout copy. Reserve >1rem for headings/numbers.` });
      }
    }
  }

  // 7) Viewport meta.
  for (const p of PAGES) {
    if (!/name="viewport"[^>]*width=device-width/.test(htmls[p]!)) hard({ check: 'viewport', severity: 'high', page: p, detail: 'missing/!width=device-width viewport meta' });
  }

  // 8) Inline <script> syntax via node --check.
  for (const p of PAGES) {
    scripts(htmls[p]!).forEach((src, i) => {
      const tmp = path.join(os.tmpdir(), `uiaudit-${p}-${i}.mjs`);
      writeFileSync(tmp, src);
      try { execFileSync('node', ['--check', tmp], { stdio: 'pipe' }); }
      catch (e) { hard({ check: 'script-syntax', severity: 'high', page: p, detail: `inline script #${i} fails node --check: ${(e as { stderr?: Buffer }).stderr?.toString().split('\n')[0] ?? e}` }); }
    });
  }

  // 9) v0-only Senior-UX invariants (R1/R3/R4 in docs/ux-rubric.md). These run
  //    ONLY for ui/v0 so the frozen v6 contract is unchanged. They encode the
  //    redundancy / overstimulation / above-the-fold lessons into the bracket so
  //    a regression can't slip back in silently.
  if (TARGET_V0) {
    for (const p of PAGES) {
      const html = htmls[p]!, css = csss[p]!;
      // R3 single-legend: the combined win%/verdict legend was duplicated in the
      // lane panel AND the meta board. These phrases occur only in that legend
      // paragraph (never in a per-row tag), so >1 means the redundancy is back.
      for (const sig of ['whether to pick it', '52%+']) {
        const n = html.split(sig).length - 1;
        if (n > 1) hard({ check: 'single-legend', severity: 'high', page: p, detail: `legend phrase "${sig}" appears ${n}× — collapse the duplicated win%/verdict legends into ONE shared on-demand legend` });
      }
      // R3 THEORY: one canonical definition, reused everywhere (not bespoke per
      // badge). The distinctive phrase must appear at most once in source.
      const theory = html.split('not yet measured in-game').length - 1;
      if (theory > 1) hard({ check: 'single-legend', severity: 'high', page: p, detail: `THEORY definition string appears ${theory}× — route every THEORY badge through one canonical constant` });
      // R4 reduced-motion: a page with transitions/animations must disable them
      // under prefers-reduced-motion (overstimulation / accessibility).
      if (/(?:^|[;{\s])(?:transition|animation)\s*:/.test(css) && !/prefers-reduced-motion\s*:\s*reduce/.test(css)) {
        hard({ check: 'reduced-motion', severity: 'high', page: p, detail: 'has transitions/animations but no @media (prefers-reduced-motion:reduce) to disable them' });
      }
      // R1 above-fold-primary (soft until stable): on the landing page the
      // pick/counter affordance must precede the meta board + full hero grid, and
      // those browse zones must sit behind a .browse-head divider.
      if (/id="metaboard"/.test(html) && /id="heroGrid"/.test(html)) {
        const iMode = html.search(/id="landMode"/);
        const iMeta = html.search(/id="metaboard"/);
        const iGrid = html.search(/id="heroGrid"/);
        if (iMode < 0 || iMode > iMeta || iMode > iGrid) findings.push({ check: 'above-fold-primary', severity: 'med', page: p, detail: 'meta board / hero grid render before the pick/counter affordance — demote them below the primary action' });
        if (!/browse-head/.test(html)) findings.push({ check: 'above-fold-primary', severity: 'med', page: p, detail: 'no .browse-head divider gating the meta board / full grid as "browse" zones' });
      }
    }
  }

  // Score: fraction of (page x check-family) cells that are clean. Used by the
  // loop history / convergence gate.
  const FAMILIES = ['tokens', 'container-width', 'breakpoints', 'reset', 'mobile-font', 'touch-target', 'touch-consistency', 'pill-font', 'type-scale', 'viewport', 'script-syntax',
    ...(TARGET_V0 ? ['single-legend', 'reduced-motion', 'above-fold-primary'] : [])];
  const cells = FAMILIES.length * PAGES.length;
  const dirty = new Set(findings.map((f) => `${f.check}:${f.page ?? 'all'}`)).size;
  const score = Math.max(0, Math.round((1 - dirty / cells) * 1000) / 1000);

  const report = {
    generatedAt: new Date().toISOString(),
    target: UI_DIR,
    pages: PAGES,
    rubric: { touchTargetMinPx: TOUCH_MIN, wcagFloorPx: 24, mobileFontFloorPx: MOBILE_FONT_FLOOR },
    facts: {
      containerWidth: widths, topInnerWidth: tops, breakpoints: bps,
      mobileBodyFontPx: mbf, tokenCount: Object.fromEntries(PAGES.map((p) => [p, Object.keys(tokenMaps[p]!).length])),
    },
    hardFail, findingCount: findings.length, score,
    findings,
  };
  writeFileSync(path.join(ROOT, AUDIT_OUT), JSON.stringify(report, null, 1));

  // --record: append this run as a loop round so the convergence gate
  // (LOOP_HISTORY=data/aggregates/ui-review-history.json npm run review:loop:gate)
  // can see the trajectory. agreementRate = objective consistency score;
  // flaggedLines = audit findings; judgeFlags carries the independent judge's
  // residual count for that round (passed in via JUDGE_FLAGS).
  if (process.argv.includes('--record')) {
    // Mirror the copy loop: the deterministic bracket here is (ui-audit hard
    // invariants + ui-render no-overflow); the convergence signal is the
    // INDEPENDENT judge's residual flag count over the rendered surfaces
    // (JUDGE_FLAGS / REVIEW_UNITS). agreementRate falls out of the judge, not
    // the objective score (which is recorded alongside as auditScore).
    const judgeFlags = Number(process.env.JUDGE_FLAGS ?? 0);
    const units = Number(process.env.REVIEW_UNITS ?? 12);
    const agreementRate = Math.round((1 - judgeFlags / units) * 1000) / 1000;
    const histPath = path.join(ROOT, TARGET_V0 ? 'data/aggregates/ux-v0-history.json' : 'data/aggregates/ui-review-history.json');
    const hist = existsSync(histPath) ? (JSON.parse(readFileSync(histPath, 'utf8')) as { rounds: unknown[] }) : { rounds: [] };
    hist.rounds.push({
      round: hist.rounds.length + 1, at: new Date().toISOString(),
      agreementRate, flaggedLines: judgeFlags, auditScore: score, hardFail,
      applied: Number(process.env.FIXES_APPLIED ?? 0),
    });
    writeFileSync(histPath, JSON.stringify(hist, null, 1));
    console.log(`[loop] UI round ${hist.rounds.length} recorded (agreement ${(agreementRate * 100).toFixed(1)}%, ${judgeFlags} judge flags, audit ${(score * 100).toFixed(1)}%) -> data/aggregates/ui-review-history.json`);
  }

  const bySev = (s: string) => findings.filter((f) => f.severity === s).length;
  console.log(`\nUI audit [${UI_DIR}]: ${findings.length} findings (${bySev('high')} high, ${bySev('med')} med, ${bySev('low')} low); consistency score ${(score * 100).toFixed(1)}% -> ${AUDIT_OUT}`);
  for (const f of findings.filter((f) => f.severity !== 'low')) console.log(`  [${f.severity}] ${f.check}${f.page ? ` (${f.page})` : ''}: ${f.detail}`);
  console.log(hardFail ? '\nHARD INVARIANT FAILED — fix before this round counts as converged.' : '\nAll hard invariants pass.');
  process.exit(hardFail ? 1 : 0);
}

main();
