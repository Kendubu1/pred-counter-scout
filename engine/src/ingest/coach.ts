// Personal coach report (data/artifacts/coach.json, ui/v6/coach.html).
//   npm run coach -- <player-uuid>
// All logic lives in playerProfile.ts, shared with squad.ts.

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasCredentials } from './predgg.js';
import { analyzeProfile, buildCoachReport, pullProfile } from './playerProfile.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

async function main() {
  const uuid = process.argv[2];
  if (!uuid) { console.error('usage: npm run coach -- <player-uuid>'); process.exit(1); }
  if (!hasCredentials()) { console.error('needs PREDGG_CLIENT_ID/SECRET in env'); process.exit(1); }
  const raw = await pullProfile(uuid);
  const report = buildCoachReport(analyzeProfile(uuid, raw), raw.lastPlayedAt);
  const file = path.join(ROOT, 'data/artifacts/coach.json');
  writeFileSync(file, JSON.stringify(report, null, 1));
  console.log(`coach report for ${report.player.name} -> ${file}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
