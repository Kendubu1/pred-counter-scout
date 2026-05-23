#!/usr/bin/env node
// Apply patch digests to hero state and report who needs updating.
//
//   node scripts/apply-patch.js [maxVersion]
//
// Reads every data/patches/*.json digest in ascending version order plus
// data/game-data/hero-profiles.json, then writes
// data/game-data/hero-patch-state.json keyed by slug.
//
// Patches STACK: later patches layer on top of earlier ones, and when a hero
// appears in more than one patch the most recent trend/notes win (e.g. a hero
// buffed in 1.14 then nerfed in the 1.14.1 hotfix ends up nerfed). Pass an
// optional maxVersion to stop stacking at a given patch. Top-level patch notes
// (global/items/source) reflect the most recent applied patch.
//
// The report lists buffed/nerfed heroes, trend flips between patches, heroes
// flagged for manual review (a digest trait hint the curated profile lacks),
// and digest slugs that don't exist in hero-profiles.json.
//
// To onboard a new patch: add data/patches/<version>.json in the same shape,
// then re-run this script.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PATCH_DIR = path.join(ROOT, 'data', 'patches');
const PROFILES = path.join(ROOT, 'data', 'game-data', 'hero-profiles.json');
const OUT = path.join(ROOT, 'data', 'game-data', 'hero-patch-state.json');

function fail(msg) { console.error('✗ ' + msg); process.exit(1); }

function listVersions() {
  if (!fs.existsSync(PATCH_DIR)) fail(`No patch directory at ${PATCH_DIR}`);
  return fs.readdirSync(PATCH_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace(/\.json$/, ''))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function main() {
  const maxVersion = process.argv[2];
  let versions = listVersions();
  if (!versions.length) fail('No patch files found');
  if (maxVersion) {
    if (!versions.includes(maxVersion)) fail(`Patch digest not found: ${maxVersion}`);
    versions = versions.filter(v => v.localeCompare(maxVersion, undefined, { numeric: true }) <= 0);
  }

  const profiles = JSON.parse(fs.readFileSync(PROFILES, 'utf8'));
  const bySlug = Object.fromEntries(profiles.map(p => [p.slug, p]));

  const heroes = {};      // slug -> latest entry (later patches overwrite)
  const flips = [];       // { slug, from, fromPatch, to, toPatch }
  const missing = {};     // slug -> first patch version it was missing in
  let last = null;

  for (const version of versions) {
    const digest = JSON.parse(fs.readFileSync(path.join(PATCH_DIR, `${version}.json`), 'utf8'));
    last = digest;

    for (const h of (digest.heroes || [])) {
      if (!bySlug[h.slug]) {
        if (!(h.slug in missing)) missing[h.slug] = version;
        continue;
      }

      const prev = heroes[h.slug];
      if (prev && prev.trend !== h.trend) {
        flips.push({ slug: h.slug, from: prev.trend, fromPatch: prev.patch, to: h.trend, toPatch: version });
      }

      // Flag for review when a digest trait hint isn't in the curated profile
      // yet — a signal the kit synergy data is stale.
      const have = new Set(bySlug[h.slug].baseTraits || []);
      const reviewReasons = (h.traitHints || [])
        .filter(t => !have.has(t))
        .map(t => `consider adding trait: ${t}`);

      heroes[h.slug] = {
        patch: version,
        trend: h.trend,
        changes: h.changes || [],
        reviewNeeded: reviewReasons.length > 0,
        reviewReasons,
      };
    }
  }

  const latest = versions[versions.length - 1];
  const out = {
    patch: latest,
    appliedPatches: versions,
    generated: new Date().toISOString(),
    source: last.source || null,
    global: last.global || [],
    items: last.items || [],
    heroes,
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');

  // ── Report ──
  const buffed = [], nerfed = [], mixed = [], review = [];
  for (const [slug, v] of Object.entries(heroes)) {
    if (v.trend === 'buff') buffed.push(slug);
    else if (v.trend === 'nerf') nerfed.push(slug);
    else mixed.push(slug);
    if (v.reviewNeeded) review.push({ slug, reasons: v.reviewReasons });
  }

  const line = '─'.repeat(52);
  console.log(`\n${line}\n  Patch state — stacked ${versions.join(' + ')}\n${line}`);
  console.log(`  Heroes annotated : ${Object.keys(heroes).length}`);
  console.log(`  Buffed (${buffed.length}): ${buffed.join(', ') || '—'}`);
  console.log(`  Nerfed (${nerfed.length}): ${nerfed.join(', ') || '—'}`);
  if (mixed.length) console.log(`  Mixed/Other (${mixed.length}): ${mixed.join(', ')}`);

  if (flips.length) {
    console.log(`\n  ↺ Trend flips across patches (${flips.length}):`);
    flips.forEach(f => console.log(`     - ${f.slug}: ${f.from} (${f.fromPatch}) -> ${f.to} (${f.toPatch})`));
  }

  console.log(`\n  ⚠ Needs manual review (${review.length}):`);
  if (review.length) review.forEach(r => console.log(`     - ${r.slug}: ${r.reasons.join('; ')}`));
  else console.log('     none');

  const missingSlugs = Object.keys(missing);
  if (missingSlugs.length) {
    console.log(`\n  ✗ Digest slugs not found in hero-profiles.json (${missingSlugs.length}):`);
    missingSlugs.forEach(s => console.log(`     - ${s} (first seen in ${missing[s]})`));
  }

  console.log(`\n  Wrote: ${path.relative(ROOT, OUT)}\n`);
}

main();
