import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const pg = await b.newPage();
const errs = [];
pg.on('pageerror', (e) => errs.push(String(e)));
// roster → first member report
await pg.goto('http://localhost:8901/ui/v6/coach.html', { waitUntil: 'networkidle' });
const memberHref = await pg.$eval('a.rost', (a) => a.getAttribute('href')).catch(() => null);
if (memberHref) {
  await pg.goto('http://localhost:8901/ui/v6/' + memberHref, { waitUntil: 'networkidle' });
  await pg.waitForTimeout(1200);
}
const body = await pg.evaluate(() => document.body.innerText);
const secondPerson = (body.match(/\b(you|your|you're|yours)\b/gi) || []);
console.log('page errors:', errs.length, errs.slice(0, 2));
console.log('member page second-person hits:', secondPerson.length, secondPerson.slice(0, 6));
console.log('has film room header:', /film room/i.test(body));
await b.close();
