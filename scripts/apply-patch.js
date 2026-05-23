#!/usr/bin/env node
// Apply a patch digest to hero state and report who needs updating.
//
//   node scripts/apply-patch.js [version]   (default: latest under data/patches)
//
// Reads data/patches/<version>.json (a structured capture of the patch notes)
// and data/game-data/hero-profiles.json, then writes
// data/game-data/hero-patch-state.json keyed by slug, and prints a report of:
//   - buffed / nerfed heroes this patch
//   - heroes flagged for manual review (a change implies a trait/attribute
//     edit the curated profile doesn't reflect yet, or a slug mismatch)
//
// To onboard a new patch: copy the notes into data/patches/<version>.json in
// the same shape, then re-run this script.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PATCH_DIR = path.join(ROOT, 'data', 'patches');
const PROFILES = path.join(ROOT, 'data', 'game-data', 'hero-profiles.json');
const OUT = path.join(ROOT, 'data', 'game-data', 'hero-patch-state.json');

function fail(msg) { console.error('✗ ' + msg); process.exit(1); }

function resolveVersion(arg) {
  if (arg) return arg;
  if (!fs.existsSync(PATCH_DIR)) fail(`No patch directory at ${PATCH_DIR}`);
  const versions = fs.readdirSync(PATCH_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace(/\.json$/, ''))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!versions.length) fail('No patch files found');
  return versions[versions.length - 1];
}

function main() {
  const version = resolveVersion(process.argv[2]);
  const patchPath = path.join(PATCH_DIR, `${version}.json`);
  if (!fs.existsSync(patchPath)) fail(`Patch digest not found: ${patchPath}`);

  const digest = JSON.parse(fs.readFileSync(patchPath, 'utf8'));
  const profiles = JSON.parse(fs.readFileSync(PROFILES, 'utf8'));
  const bySlug = Object.fromEntries(profiles.map(p => [p.slug, p]));

  const heroes = {};
  const buffed = [], nerfed = [], mixed = [], review = [], missing = [];

  for (const h of (digest.heroes || [])) {
    const profile = bySlug[h.slug];
    if (!profile) { missing.push(h.slug); continue; }

    // A change is flagged for review when the digest hints a trait the curated
    // profile doesn't have yet — that's a signal the kit synergy data is stale.
    const have = new Set(profile.baseTraits || []);
    const missingTraits = (h.traitHints || []).filter(t => !have.has(t));
    const reviewReasons = missingTraits.map(t => `consider adding trait: ${t}`);
    const reviewNeeded = reviewReasons.length > 0;

    heroes[h.slug] = {
      patch: version,
      trend: h.trend,
      changes: h.changes || [],
      reviewNeeded,
      reviewReasons,
    };

    if (h.trend === 'buff') buffed.push(h.slug);
    else if (h.trend === 'nerf') nerfed.push(h.slug);
    else mixed.push(h.slug);
    if (reviewNeeded) review.push({ slug: h.slug, reasons: reviewReasons });
  }

  const out = {
    patch: version,
    generated: new Date().toISOString(),
    source: digest.source || null,
    global: digest.global || [],
    items: digest.items || [],
    heroes,
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');

  // ── Report ──
  const line = '─'.repeat(52);
  console.log(`\n${line}\n  Patch ${version} applied to hero state\n${line}`);
  console.log(`  Heroes annotated : ${Object.keys(heroes).length}`);
  console.log(`  Buffed (${buffed.length}): ${buffed.join(', ') || '—'}`);
  console.log(`  Nerfed (${nerfed.length}): ${nerfed.join(', ') || '—'}`);
  if (mixed.length) console.log(`  Mixed/Other (${mixed.length}): ${mixed.join(', ')}`);

  console.log(`\n  ⚠ Needs manual review (${review.length}):`);
  if (review.length) {
    review.forEach(r => console.log(`     - ${r.slug}: ${r.reasons.join('; ')}`));
  } else {
    console.log('     none');
  }

  if (missing.length) {
    console.log(`\n  ✗ Digest slugs not found in hero-profiles.json (${missing.length}):`);
    console.log(`     ${missing.join(', ')}`);
  }

  console.log(`\n  Wrote: ${path.relative(ROOT, OUT)}\n`);
}

main();
