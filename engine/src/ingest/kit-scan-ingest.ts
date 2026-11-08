// npm run kit:scan:ingest — zero-API. Folds the agent kit scan
// (engine/copy-tasks/kit-scan-*.json; each agent checked a group of heroes'
// parsed kit and coaching profile against the current catalog text) into:
//   data/game-data/kit-index-review.json   per-ability corrections, keyed by catalog text hash
//   data/game-data/kit-profiles.json        the corrected / new coaching profiles
// then rebuild with `npm run kit:index`. Entries are validated: unknown CC or
// mobility words, a stale text hash, or a profile with missing fields or an em
// dash are rejected and listed, never written.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const TASKS = path.join(ROOT, 'engine/copy-tasks');
const REVIEW = path.join(ROOT, 'data/game-data/kit-index-review.json');
const PROFILES = path.join(ROOT, 'data/game-data/kit-profiles.json');
const HARD = new Set(['stun', 'root', 'knockup', 'knockback', 'pull', 'suppress', 'silence', 'fear', 'charm', 'sleep', 'blind', 'banish', 'ground', 'disable']);
const SOFT = new Set(['slow', 'tether']);
const MOB = new Set(['dash', 'blink', 'leap', 'teleport']);
const BOOL = ['unstoppable', 'stealth', 'heal', 'shield', 'cleanse'];
const FIELDS = ['archetype', 'combo', 'winCondition', 'powerSpike', 'passive', 'playWith', 'playAgainst', 'waveClear', 'dive', 'scaling'];
const ENUM: Record<string, string[]> = { powerSpike: ['early', 'mid', 'late'], scaling: ['early', 'mid', 'late'], waveClear: ['low', 'med', 'high'], dive: ['low', 'med', 'high'] };

function main() {
  const idx = JSON.parse(readFileSync(path.join(ROOT, 'data/game-data/kit-index.json'), 'utf8')).heroes as Record<string, { textHash: string; abilities: { key: string }[] }>;
  const review = existsSync(REVIEW) ? JSON.parse(readFileSync(REVIEW, 'utf8')) : { note: '', heroes: {} };
  const prof = JSON.parse(readFileSync(PROFILES, 'utf8'));
  const today = new Date().toISOString().slice(0, 10);
  const rejected: string[] = [];
  let kitFixes = 0, profiles = 0;
  for (const f of readdirSync(TASKS).filter((x) => /^kit-scan-\d+\.json$/.test(x)).sort()) {
    const scan = JSON.parse(readFileSync(path.join(TASKS, f), 'utf8')) as Record<string, any>;
    for (const [slug, e] of Object.entries(scan)) {
      const cur = idx[slug];
      if (!cur) { rejected.push(`${slug}: not a catalog hero`); continue; }
      if (e.textHash !== cur.textHash) { rejected.push(`${slug}: text hash ${e.textHash} is stale (now ${cur.textHash})`); continue; }
      const keys = new Set(cur.abilities.map((a) => a.key));
      const abilities: Record<string, any> = {};
      let ok = true;
      for (const [key, c] of Object.entries((e.abilities ?? {}) as Record<string, any>)) {
        if (!keys.has(key)) { rejected.push(`${slug}.${key}: no such ability key`); ok = false; continue; }
        const bad = [...(c.hard ?? []).filter((x: string) => !HARD.has(x)), ...(c.soft ?? []).filter((x: string) => !SOFT.has(x)), ...(c.mobility ?? []).filter((x: string) => !MOB.has(x))];
        if (bad.length) { rejected.push(`${slug}.${key}: unknown ${bad.join(', ')}`); ok = false; continue; }
        if (BOOL.some((b) => b in c && typeof c[b] !== 'boolean') || ('hardSec' in c && c.hardSec !== null && typeof c.hardSec !== 'number')) { rejected.push(`${slug}.${key}: bad field type`); ok = false; continue; }
        abilities[key] = c; kitFixes++;
      }
      if (!ok) continue;
      review.heroes[slug] = { textHash: cur.textHash, reviewedAt: today, abilities, ...(e.note ? { note: e.note } : {}) };
      const p = e.profile ?? {};
      const missing = FIELDS.filter((k) => typeof p[k] !== 'string' || !p[k].trim());
      const badEnum = Object.entries(ENUM).filter(([k, v]) => !v.includes(p[k])).map(([k]) => k);
      if (missing.length || badEnum.length || FIELDS.some((k) => /—/.test(p[k] ?? ''))) { rejected.push(`${slug}: profile ${[...missing.map((m) => `missing ${m}`), ...badEnum.map((b) => `bad ${b}`), 'or em dash'].join(', ')}`); continue; }
      prof.heroes[slug] = Object.fromEntries(FIELDS.map((k) => [k, p[k].trim()]));
      profiles++;
    }
  }
  review.note = 'Agent kit scan: per-ability corrections to the parsed kit (engine/src/kit-index.ts), each checked against the catalog ability text whose hash is stored; npm run kit:index applies an entry only while the hash still matches.';
  writeFileSync(REVIEW, JSON.stringify(review, null, 1) + '\n');
  prof.generatedAt = today;
  prof.source = 'Agent kit scan grounded in the current catalog ability text (data/catalog/heroes.json, pred.gg); first pass 2026-06-18 from hero-abilities.json.';
  prof.heroes = Object.fromEntries(Object.entries(prof.heroes).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(PROFILES, JSON.stringify(prof, null, 1) + '\n');
  console.log(`kit scan: ${Object.keys(review.heroes).length} heroes reviewed, ${kitFixes} ability corrections, ${profiles} profiles written; rejected ${rejected.length}${rejected.length ? ':\n  ' + rejected.join('\n  ') : ''}`);
}

main();
