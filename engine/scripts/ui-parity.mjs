// Offline browser integration: committed sources -> actual app renderers.
// Run after artifacts and scripts/build-learn-eternals.js. No external API calls.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import '../../ui/v6/game-text.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => JSON.parse(readFileSync(path.join(root, p), 'utf8'));
const heroes = read('data/catalog/heroes.json');
const items = read('data/catalog/items.json');
const augments = read('data/aggregates/predgg-augments.json').catalog;
const eternals = read('data/game-data/eternals.json').eternals;
const mime = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const target = path.resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
  if (!target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' });
    res.end(readFileSync(target));
  } catch { res.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
const errors = [], checks = [], screenshots = [];
const origin = `http://127.0.0.1:${server.address().port}`;
try {
  browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', (e) => errors.push(e.message));
  // The production UI must run entirely from committed files.
  await page.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.goto(`${origin}/ui/index.html`);
  await page.waitForURL('**/ui/v6/');
  await page.waitForFunction(() => document.querySelector('#allHeroes summary')?.textContent.includes('55'));
  checks.push('Root redirects to v6; all 55 heroes available');
  assert.match(await page.locator('#patchPill').getAttribute('title'), /not a live match-data refresh/);
  await page.goto(`${origin}/ui/v2/index.html`);
  await page.waitForURL('**/ui/v6/');
  checks.push('Legacy v2 entry redirects to v6');
  await page.goto(`${origin}/ui/v6/index.html?hero=murdock&role=carry`);
  await page.locator('[data-tab="learn"]').click();
  await page.waitForSelector('#tabLearn .abil');
  assert.match(await page.locator('#tabLearn').innerText(), /Physical Power/);
  assert.match(await page.locator('#tabLearn').innerText(), /catalog ability data, patch 1.17.2/);
  const shots = process.env.UI_PARITY_SHOTS;
  if (shots) {
    mkdirSync(shots, { recursive: true });
    const shot = path.join(shots, 'murdock-learn.png');
    await page.screenshot({ path: shot, fullPage: true }); screenshots.push(shot);
  }
  // Every hero uses the real Learn renderer and its own built artifact.
  let augmentCount = 0;
  for (const hero of heroes) {
    const artifact = read(`data/artifacts/${hero.slug}.json`);
    const result = await page.evaluate(async ({ artifact }) => {
      const panel = document.createElement('section');
      panel.innerHTML = await window.eval('renderLearn')(artifact);
      return { count: panel.querySelectorAll('.abil:not([data-augment-id])').length, text: panel.textContent, augments: [...panel.querySelectorAll('[data-augment-id]')].map((el) => ({ id: el.dataset.augmentId, text: el.textContent })) };
    }, { artifact });
    assert.equal(result.count, hero.abilities.length, hero.slug);
    const expectedAugments = Object.entries(augments).filter(([, a]) => a.hero === hero.slug);
    assert.equal(result.augments.length, expectedAugments.length, `${hero.slug}: missing augment`);
    for (const [id, a] of expectedAugments) {
      assert.ok(result.augments.find((x) => x.id === id)?.text.includes(a.name), `${hero.slug}: ${a.name}`);
      assert.ok(result.augments.find((x) => x.id === id)?.text.includes(GameText.plain(a.description)), `${hero.slug}: stale augment ${a.name}`);
    }
    augmentCount += result.augments.length;
    for (const ability of hero.abilities) {
      assert.ok(result.text.includes(ability.display_name), `${hero.slug}/${ability.key}`);
      assert.ok(result.text.includes(GameText.plain(ability.menu_description || ability.game_description)), `${hero.slug}/${ability.key}: stale description`);
    }
  }
  assert.equal(augmentCount, 189);
  checks.push('All 55 hero kits and 189 hero augments render their catalog descriptions');
  for (const item of items) {
    const result = await page.evaluate(async (slug) => {
      await window.eval('showItem')(slug);
      const dialog = document.querySelector('.ipop');
      const text = dialog?.textContent || '';
      dialog?.querySelector('.iclose').click();
      return { text, stats: dialog ? dialog.querySelectorAll('.istats .v').length : 0 };
    }, item.slug);
    assert.equal(result.stats, Object.values(item.stats || {}).filter(Boolean).length, `${item.slug}: hidden catalog stat`);
    const text = result.text;
    assert.ok(text.includes(item.display_name), item.slug);
    if (item.slug === 'spectral-schematics') {
      assert.match(text, /What the simulator does not fully count/);
      assert.match(text, /one proc per reviewed root\/stun cast/);
      assert.match(text, /Displacement-only, empowered, stacked and stance-dependent CC are not credited/);
    }
    if (item.slug === 'absolution') {
      assert.match(text, /Tenacity\s*\+25/);
      assert.match(text, /On being Immobilized:/);
      assert.doesNotMatch(text, /Tenacity\s*\+75/);
      assert.doesNotMatch(text, /\{Activations\}/);
    }
    for (const effect of item.effects || []) {
      if (GameText.hasEffectDescription(effect)) assert.ok(text.includes(GameText.plain(effect.menu_description || effect.game_description)), `${item.slug}: stale effect`);
      if (effect.condition && (effect.menu_description || effect.game_description)) {
        const condition = effect.condition.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        assert.ok(text.includes(condition), `${item.slug}: missing trigger ${condition}`);
      }
    }
  }
  checks.push('All 270 item dialogs retain every nonzero stat and effect condition; Absolution shows 25 tenacity');
  checks.push('Spectral Schematics dialog exposes partial trigger coverage');
  if (shots) {
    await page.evaluate(() => window.eval('showItem')('spectral-schematics'));
    await page.locator('.ipop details summary').click();
    const shot = path.join(shots, 'spectral-schematics.png');
    await page.screenshot({ path: shot }); screenshots.push(shot);
    await page.locator('.iclose').click();
  }
  await page.evaluate(() => window.eval('showItem')('absolution'));
  if (shots) {
    const shot = path.join(shots, 'absolution.png');
    await page.screenshot({ path: shot }); screenshots.push(shot);
  }
  await page.locator('.iclose').click();
  for (const width of [360, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `hero overflow at ${width}`);
  }
  checks.push('Murdock Learn page fits 360, 390 and 1280px widths');
  await page.goto(`${origin}/ui/learn-eternals.html`);
  assert.equal(await page.locator('.le-card').count(), 16);
  for (const eternal of eternals) {
    const card = page.locator(`#et-${eternal.id}`);
    const text = await card.textContent();
    assert.ok(text.includes(eternal.major), `${eternal.id}: stale major`);
    for (const slot of ['minorSlot1', 'minorSlot2']) {
      for (const minor of eternal[slot]) assert.ok(text.includes(minor.desc), `${eternal.id}/${minor.name}: stale minor`);
    }
  }
  checks.push('All 16 Eternal majors and 96 minor descriptions match the shared source');
  assert.equal(errors.length, 0, errors.join('\n'));
  writeFileSync(path.join(root, 'data/aggregates/ui-parity.json'), JSON.stringify({
    checkedAt: new Date().toISOString(), status: 'passed', checks,
    counts: { heroes: heroes.length, items: items.length, eternals: eternals.length, minors: 96, augments: augmentCount },
    limitations: 'Checks local rendered source parity, not gameplay accuracy or public deployment. Source audit remains partial; combat results remain THEORY.',
  }, null, 1) + '\n');
  console.log(JSON.stringify({ checks, screenshots }));
} catch (e) {
  errors.push(e.message);
  writeFileSync(path.join(root, 'data/aggregates/ui-parity.json'), JSON.stringify({ checkedAt: new Date().toISOString(), status: 'failed', checks, errors }, null, 1) + '\n');
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
if (errors.length) throw new Error(errors.join('\n'));
