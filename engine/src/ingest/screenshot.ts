// Visual smoke test: serve the repo root, render Build Lab pages, save
// screenshots to /tmp/v6-shots/. Used for design review and regression.
//   npx tsx src/ingest/screenshot.ts [hero-slug]

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = '/tmp/v6-shots';
const MIME: Record<string, string> = {
  '.html': 'text/html', '.json': 'application/json', '.webp': 'image/webp',
  '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://x');
    let p = path.join(ROOT, decodeURIComponent(url.pathname));
    if (p.endsWith('/')) p += 'index.html';
    const body = await readFile(p);
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('nope');
  }
});

async function main() {
  mkdirSync(OUT, { recursive: true });
  await new Promise<void>((r) => server.listen(8901, r));
  const slug = process.argv[2] ?? 'gideon';
  const browser = await chromium.launch();
  for (const [label, viewport] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }]] as const) {
    const page = await browser.newPage({ viewport });
    await page.goto(`http://localhost:8901/ui/v6/`);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/landing-${label}.png`, fullPage: false });
    await page.goto(`http://localhost:8901/ui/v6/?hero=${slug}`);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/${slug}-${label}.png`, fullPage: true });
    await page.close();
  }
  await browser.close();
  server.close();
  console.log(`screenshots -> ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
