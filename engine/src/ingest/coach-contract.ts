import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectReviewScope, validateCoachContract, validatePublication } from '../coach-contract.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const pg = path.join(root, 'data/postgame');
const all = readdirSync(pg).filter(n => n.endsWith('.json')).map(n => JSON.parse(readFileSync(path.join(pg, n), 'utf8'))).filter(f => f.matchId);
const games = selectReviewScope(all, (process.env.COACH_GAMES ?? '').split(',').map(s => s.trim()).filter(Boolean));
for (const f of games) validateCoachContract(root, f);
if (process.argv.includes('--publish')) {
  const report = JSON.parse(readFileSync(path.join(root, 'data/aggregates/coach-critique.json'), 'utf8'));
  validatePublication(games, report);
  const indexPath = path.join(pg, 'index.json');
  const index = JSON.parse(readFileSync(indexPath, 'utf8'));
  for (const f of games) {
    const row = index.matches.find((m: any) => m.matchId === f.matchId);
    if (!row) throw new Error(`Missing index entry: ${f.matchId}`);
    row.hasCoaching = true;
  }
  writeFileSync(indexPath, JSON.stringify(index, null, 1) + '\n');
}
console.log(`Coach contract passed for ${games.length} match(es)`);
