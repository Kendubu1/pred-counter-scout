// Empirical head-to-head matchup winrates from pred.gg — the ground truth the
// counter list ranks by, with our kill-window sim as the validation layer.
//
//   RANKED_ONLY=1 npm run matchups     # pull all heroes' same-role matchups
//
// One matchupStatistic query per hero (53 total, sequential + delay) returns
// every opponent at once. Pairs are DIRECTED ("a|b" = a's winrate into b) and
// kept at n >= MIN_GAMES. Scope: RANKED, current patch family (same version
// pinning as buildstats). NOTE: the query needs the pred.gg Application's
// statistics scope — the default client-credentials token gets Forbidden.
//
// The pass also writes a `validation` block comparing each evidenced pair with
// the committed sim matrix (data/artifacts/matchup-matrix.json): the sim's net
// kill-window verdict vs the field's winrate. That number is the calibration
// read the sim's THEORY label has been waiting for — computed here, zero extra
// API, refreshed with every pull.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gql, hasCredentials, currentVersion } from './predgg.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(ROOT, 'data/aggregates/predgg-matchups.json');
const MIN_GAMES = 20;

interface Row { matchupHero: { slug: string } | null; winrate: number; matchesPlayed: number; firstTowerTimeDiff: number | null }

async function main() {
  if (!hasCredentials()) { console.error('needs PREDGG_CLIENT_ID/SECRET in env'); process.exit(1); }
  let filter = 'gameModes:[RANKED]';
  let scope = 'RANKED, all versions';
  if (process.env.RANKED_ONLY) {
    const v = await currentVersion();
    filter = `gameModes:[RANKED], versions:[${v.ids.map((i) => `"${i}"`).join(', ')}]`;
    scope = `RANKED only, patch ${v.name} (pred.gg version ids ${v.ids.join('+')})`;
  }
  console.log(`scope: ${scope}`);

  const index = JSON.parse(readFileSync(path.join(ROOT, 'data/artifacts/index.json'), 'utf8')) as { heroes: { slug: string }[] };
  const pairs: Record<string, { wr: number; n: number; towerDiff: number | null }> = {};
  let ok = 0, failed = 0;
  for (const { slug } of index.heroes) {
    try {
      const d = await gql<{ hero: { matchupStatistic: { results: Row[] } } }>(
        `{ hero(by:{slug:"${slug}"}){ matchupStatistic(metric: WINRATE, sameRole: true, filter:{ ${filter} }){ results { matchupHero { slug } winrate matchesPlayed firstTowerTimeDiff } } } }`);
      for (const r of d.hero?.matchupStatistic?.results ?? []) {
        if (!r.matchupHero?.slug || r.matchesPlayed < MIN_GAMES) continue;
        pairs[`${slug}|${r.matchupHero.slug}`] = {
          wr: Math.round(r.winrate * 1000) / 10,
          n: r.matchesPlayed,
          towerDiff: r.firstTowerTimeDiff != null ? Math.round(r.firstTowerTimeDiff) : null,
        };
      }
      ok++;
      process.stdout.write('.');
    } catch (e) { failed++; process.stdout.write('x'); if (failed === 1) console.error(`\nfirst failure (${slug}): ${(e as Error).message}`); }
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!ok) { console.error('\nno heroes succeeded — is the statistics scope enabled on the pred.gg Application?'); process.exit(1); }

  // ── validation: sim kill-window verdict vs the field, per evidenced pair.
  // Sim "calls it" when its net checkpoint score is nonzero; the field "calls
  // it" when the winrate clears 52% either way. Agreement is measured only
  // where BOTH commit — lopsided-vs-even pairs are reported separately.
  let both = 0, agree = 0, simEven = 0, fieldEven = 0;
  try {
    const mx = JSON.parse(readFileSync(path.join(ROOT, 'data/artifacts/matchup-matrix.json'), 'utf8')) as { pairs: Record<string, string> };
    const cps = (a: string, b: string): number | null => {
      const fwd = mx.pairs[`${a}|${b}`];
      if (fwd != null) return [...fwd].reduce((s, c) => s + (c === 'y' ? 1 : c === 'e' ? -1 : 0), 0);
      const rev = mx.pairs[`${b}|${a}`];
      if (rev != null) return -[...rev].reduce((s, c) => s + (c === 'y' ? 1 : c === 'e' ? -1 : 0), 0);
      return null;
    };
    for (const [key, p] of Object.entries(pairs)) {
      const [a, b] = key.split('|');
      const s = cps(a!, b!);
      if (s == null) continue;
      const fieldCall = p.wr >= 52 ? 1 : p.wr <= 48 ? -1 : 0;
      const simCall = s > 0 ? 1 : s < 0 ? -1 : 0;
      if (!fieldCall) { fieldEven++; continue; }
      if (!simCall) { simEven++; continue; }
      both++;
      if (fieldCall === simCall) agree++;
    }
  } catch { /* no matrix — skip validation */ }

  writeFileSync(OUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: `pred.gg matchupStatistic (metric WINRATE, sameRole; ${scope}); directed pairs "a|b" = a's winrate into b, n >= ${MIN_GAMES} games`,
    note: 'EMPIRICAL head-to-head lane records — the counter list ranks by these where present; the kill-window sim is the fallback and the validation layer',
    validation: both
      ? { pairsCompared: both, simAgrees: agree, agreementRate: Math.round((agree / both) * 1000) / 10, simSaidEven: simEven, fieldSaidEven: fieldEven, method: 'sim net kill-window verdict vs field winrate, counted only where both sides commit (field >=52% or <=48%, sim net != 0)' }
      : null,
    pairs,
  }, null, 1));
  console.log(`\n${Object.keys(pairs).length} evidenced pairs from ${ok} heroes (${failed} failed) -> ${OUT}`);
  if (both) console.log(`validation: sim agrees with the field on ${agree}/${both} committed pairs (${Math.round((agree / both) * 1000) / 10}%)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
