// Refresh ONLY the topPlayers block of data/artifacts/meta.json from the
// pred.gg split leaderboard (needs PREDGG creds), leaving every other field
// and timestamp untouched — the full `npm run artifacts` rebuild takes ~25 min
// for what is a ~10-query pull. `npm run topplayers`.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasCredentials, topPlayersPerLane } from './predgg.js';

const metaPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../data/artifacts/meta.json');
if (!hasCredentials()) { console.error('PREDGG_CLIENT_ID/SECRET not in env; nothing refreshed'); process.exit(1); }
const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
const topPlayers = await topPlayersPerLane(5);
meta.topPlayers = topPlayers;
meta.topPlayersNote = 'current ranked split leaderboard via the pred.gg API (favRole filter); hero = their most-played ranked hero in that lane; VP = victory points';
writeFileSync(metaPath, JSON.stringify(meta, null, 1));
for (const [lane, ps] of Object.entries(topPlayers ?? {})) console.log(lane, ps.map((p) => `#${p.ranking} ${p.name} ${p.heroSlug}`).join(' | '));
