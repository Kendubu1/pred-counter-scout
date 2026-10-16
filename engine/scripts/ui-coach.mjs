import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
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

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
 browser = await chromium.launch({executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH});
 const page = await browser.newPage({viewport:{width:1280,height:1000}});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 await page.goto(origin+'/ui/v6/coach.html');
 await page.waitForSelector('.player-advice');
 for (const id of ['7f2d94e6-5d00-4927-9818-ee86d6f6349f','23397aba-0764-47df-b109-3ed18579b802']) {
  await page.evaluate(async id=>{document.querySelector('#pgview').innerHTML=pgReview(await (await fetch('../../data/postgame/'+id+'.json')).json());},id);
  assert.equal(await page.locator('.player-advice').count(),5);
  assert.equal(await page.locator('.plobby .vline').count(),0);
  assert.equal(await page.locator('[data-et-slug]').count(),0);
  assert.equal(await page.locator('.player-build[open]').count(),0);
  const text=await page.locator('.plobby').allTextContents();
  assert(!text.some(t=>t.includes('off-list:')||t.includes('winning core')));
 }
 await page.evaluate(async()=>{
  const f=await (await fetch('../../data/postgame/7f2d94e6-5d00-4927-9818-ee86d6f6349f.json')).json();
  const pid=f.players.find(p=>p.us).pid;
  f.coaching.microReads[pid].change='<img src=x onerror="window.coachInjected=true">';
  document.querySelector('#pgview').innerHTML=pgReview(f);
 });
 assert.equal(await page.evaluate(()=>!!window.coachInjected),false);
 assert((await page.locator('.player-next').first().textContent()).includes('<img'));
 await page.evaluate(async()=>{
  const f=await (await fetch('../../data/postgame/7f2d94e6-5d00-4927-9818-ee86d6f6349f.json')).json();
  delete f.coaching.playerReviewVersion;
  document.querySelector('#pgview').innerHTML=pgReview(f);
 });
 assert.equal(await page.locator('.player-advice').count(),0);
 assert.equal(await page.getByText('This older player review has not been checked against the updated evidence rules.',{exact:true}).count(),5);
 await page.evaluate(async()=>{document.querySelector('#pgview').innerHTML=pgReview(await (await fetch('../../data/postgame/7f2d94e6-5d00-4927-9818-ee86d6f6349f.json')).json());});
 assert.equal(await page.locator('.player-next').filter({hasText:'No individual correction supported'}).count(),2);
 for(const width of [1280,390]) {
  await page.setViewportSize({width,height:1000});
  await page.locator('.plobby').first().scrollIntoViewIfNeeded();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'horizontal overflow');
  if(process.env.COACH_SCREENSHOT_DIR) await page.screenshot({path:path.join(process.env.COACH_SCREENSHOT_DIR,`coach-players-${width}.png`)});
 }
 assert.deepEqual(errors,[]);
 console.log('Coach browser checks passed: two reviewed matches, legacy fallback, no forced correction, escaped prose, desktop/mobile.');
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
