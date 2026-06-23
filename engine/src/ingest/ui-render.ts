// Playwright render bracket for the v6 UI-review loop. Serves the repo over HTTP
// (the pages fetch ../../data/* so they need a real origin), loads every mobile
// surface at phone + desktop widths, and asserts the strongest objective mobile
// signal: NO HORIZONTAL OVERFLOW (scrollWidth must not exceed the viewport).
// Captures a screenshot per surface/width so the independent judge can SEE the
// layout. Writes data/aggregates/ui-render.json; non-zero exit if any phone
// surface overflows.
//
//   npm run ui:render            # screenshots -> docs/reviews/v6/shots/, report
//
// Surfaces cover the landing grid, a data-rich hero page, the coach report, and
// the squad planner — the four places "rich infusion" most stresses small screens.

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SHOTS = path.join(ROOT, 'docs/reviews/v6/shots');

const SURFACES = [
  { id: 'landing', url: '/ui/v6/index.html' },
  { id: 'hero', url: '/ui/v6/index.html?hero=countess&role=midlane' },
  { id: 'hero-sparrow', url: '/ui/v6/index.html?hero=sparrow&role=carry' },
  { id: 'coach', url: '/ui/v6/coach.html' },
  { id: 'squad', url: '/ui/v6/squad.html' },
  { id: 'about', url: '/ui/v6/about.html' },
];
const WIDTHS = [360, 390, 1024]; // phone (small), phone (modern), desktop control
const MIME: Record<string, string> = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg' };

function serve(): Promise<{ port: number; close: () => void }> {
  const server = createServer((req, res) => {
    try {
      const url = decodeURIComponent((req.url || '/').split('?')[0]!);
      const fp = path.join(ROOT, url);
      if (!fp.startsWith(ROOT) || !existsSync(fp)) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(fp)] ?? 'application/octet-stream' });
      res.end(readFileSync(fp));
    } catch { res.writeHead(500); res.end('err'); }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const port = (server.address() as { port: number }).port;
    resolve({ port, close: () => server.close() });
  }));
}

async function main() {
  // Lazy import so `npm run ui:audit` (no browser) is unaffected if playwright is absent.
  const { chromium } = await import('playwright');
  mkdirSync(SHOTS, { recursive: true });
  const { port, close } = await serve();
  const browser = await chromium.launch();
  const results: { surface: string; width: number; scrollWidth: number; clientWidth: number; overflow: number; shot: string }[] = [];
  let phoneOverflow = 0;

  try {
    for (const w of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 });
      for (const s of SURFACES) {
        const page = await ctx.newPage();
        await page.goto(`http://127.0.0.1:${port}${s.url}`, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(500);
        const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
        const overflow = Math.max(0, m.sw - m.cw);
        const shot = `${s.id}-${w}.png`;
        await page.screenshot({ path: path.join(SHOTS, shot), fullPage: true }).catch(() => {});
        // Above-the-fold, real-scale capture on phone widths so the judge can see
        // typographic detail (a single oversized block is invisible in a 6000px-tall
        // full-page shot scaled to fit). This closes the gap that let the Sim Build
        // tip's 1.04rem text through the first design review.
        if (w < 600) await page.screenshot({ path: path.join(SHOTS, `${s.id}-${w}-top.png`), fullPage: false }).catch(() => {});
        // Real-scale element shot of the Sim Build tip (.coach) — the block the
        // maintainer flagged as oversized. Captured directly so its size/density is
        // visible regardless of how far down the page it sits.
        if (w < 600) { const tip = await page.$('.coach'); if (tip) await tip.screenshot({ path: path.join(SHOTS, `${s.id}-${w}-simtip.png`) }).catch(() => {}); }
        results.push({ surface: s.id, width: w, scrollWidth: m.sw, clientWidth: m.cw, overflow, shot });
        if (w < 600 && overflow > 1) phoneOverflow++;
        await page.close();
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    close();
  }

  const offenders = results.filter((r) => r.width < 600 && r.overflow > 1);
  writeFileSync(path.join(ROOT, 'data/aggregates/ui-render.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    shotsDir: 'docs/reviews/v6/shots',
    widths: WIDTHS, surfaces: SURFACES.map((s) => s.id),
    phoneOverflowCount: phoneOverflow,
    results,
  }, null, 1));

  console.log(`\nUI render: ${results.length} captures -> docs/reviews/v6/shots/ ; ${phoneOverflow} phone overflow(s)`);
  for (const o of offenders) console.log(`  OVERFLOW ${o.surface} @ ${o.width}px: content ${o.scrollWidth}px > viewport ${o.clientWidth}px (+${o.overflow})`);
  process.exit(phoneOverflow ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
